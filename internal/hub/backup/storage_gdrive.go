package backup

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"time"

	"golang.org/x/oauth2"
)

// gdriveEndpoint 为 Google OAuth2 端点（手写而非引入 x/oauth2/google 子包）。
var gdriveEndpoint = oauth2.Endpoint{
	AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
	TokenURL: "https://oauth2.googleapis.com/token",
}

// gdriveStorage 通过 Drive API v3 存取备份。
//
// Google 的 refresh token 不会轮换（除非用户手动撤销），可长期使用，适合
// 无持久化容器。获取方式（一次性）：
//  1. 在 https://console.cloud.google.com/ 创建 OAuth 客户端（桌面应用），
//     得到 CLIENT_ID / CLIENT_SECRET；或直接使用 https://developers.google.com/oauthplayground
//  2. 用 drive.file scope（https://www.googleapis.com/auth/drive.file）完成授权，
//     Playground 需先在设置中填入自己的 client id/secret 并勾选手动授权
//  3. 把得到的 refresh token 填入 BESZEL_HUB_BACKUP_GDRIVE_REFRESH_TOKEN
//
// 环境变量：
//
//	BESZEL_HUB_BACKUP_GDRIVE_CLIENT_ID      OAuth 客户端 ID
//	BESZEL_HUB_BACKUP_GDRIVE_CLIENT_SECRET  OAuth 客户端密钥
//	BESZEL_HUB_BACKUP_GDRIVE_REFRESH_TOKEN  refresh token
//	BESZEL_HUB_BACKUP_GDRIVE_FOLDER_ID      目标文件夹 ID，留空表示我的云端硬盘根目录
type gdriveStorage struct {
	client   *http.Client
	folderID string
}

func newGDriveStorage(ctx context.Context, cfg Config) (Storage, error) {
	if cfg.GDriveClientID == "" || cfg.GDriveClientSecret == "" || cfg.GDriveRefreshToken == "" {
		return nil, fmt.Errorf("gdrive 存储需要 BESZEL_HUB_BACKUP_GDRIVE_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN")
	}
	conf := &oauth2.Config{
		ClientID:     cfg.GDriveClientID,
		ClientSecret: cfg.GDriveClientSecret,
		Endpoint:     gdriveEndpoint,
	}
	// 仅含 refresh token 的已过期 token 会在首个请求时自动刷新并缓存
	ts := conf.TokenSource(ctx, &oauth2.Token{RefreshToken: cfg.GDriveRefreshToken, Expiry: time.Now()})
	return &gdriveStorage{
		client:   oauth2.NewClient(ctx, ts),
		folderID: cfg.GDriveFolderID,
	}, nil
}

// gdriveFile 是 Drive files 资源中关心的字段。
type gdriveFile struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// files 按名称条件查询文件；nameQuery 形如 "name contains 'hub-'" 或 "name = 'xxx'"，
// 为空表示仅按目录过滤。
func (g *gdriveStorage) files(ctx context.Context, nameQuery string) ([]gdriveFile, error) {
	q := "trashed = false"
	if g.folderID != "" {
		q += " and '" + g.folderID + "' in parents"
	}
	if nameQuery != "" {
		q += " and " + nameQuery
	}
	vals := url.Values{
		"q":        {q},
		"orderBy":  {"name"},
		"pageSize": {"100"},
		"fields":   {"files(id,name)"},
	}
	u := "https://www.googleapis.com/drive/v3/files?" + vals.Encode()
	resp, err := doReq(ctx, g.client, http.MethodGet, u, "", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out struct {
		Files []gdriveFile `json:"files"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("解析 gdrive 响应: %w", err)
	}
	return out.Files, nil
}

// fileID 按文件名精确查找文件 ID。
func (g *gdriveStorage) fileID(ctx context.Context, name string) (string, error) {
	files, err := g.files(ctx, "name = '"+name+"'")
	if err != nil {
		return "", err
	}
	if len(files) == 0 {
		return "", fmt.Errorf("gdrive 中找不到 %s", name)
	}
	return files[0].ID, nil
}

func (g *gdriveStorage) Put(ctx context.Context, name string, data []byte) error {
	// multipart/related：JSON 元数据 + 文件内容
	meta := map[string]any{"name": name}
	if g.folderID != "" {
		meta["parents"] = []string{g.folderID}
	}
	metaJSON, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	const boundary = "gc0p4Jq0M2Yt08jU534c0pBeszelGDriveUpload"
	var body []byte
	body = append(body, "--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"...)
	body = append(body, metaJSON...)
	body = append(body, "\r\n--"+boundary+"\r\nContent-Type: application/octet-stream\r\n\r\n"...)
	body = append(body, data...)
	body = append(body, "\r\n--"+boundary+"--\r\n"...)
	u := "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
	resp, err := doReq(ctx, g.client, http.MethodPost, u, "multipart/related; boundary="+boundary, body)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (g *gdriveStorage) List(ctx context.Context) ([]string, error) {
	files, err := g.files(ctx, "name contains '"+backupPrefix+"'")
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(files))
	for _, f := range files {
		if isBackup(f.Name) {
			names = append(names, f.Name)
		}
	}
	sort.Strings(names)
	return names, nil
}

func (g *gdriveStorage) Get(ctx context.Context, name string) (io.ReadCloser, error) {
	id, err := g.fileID(ctx, name)
	if err != nil {
		return nil, err
	}
	resp, err := doReq(ctx, g.client, http.MethodGet,
		"https://www.googleapis.com/drive/v3/files/"+id+"?alt=media", "", nil)
	if err != nil {
		return nil, err
	}
	return resp.Body, nil
}

func (g *gdriveStorage) Delete(ctx context.Context, name string) error {
	id, err := g.fileID(ctx, name)
	if err != nil {
		return err
	}
	resp, err := doReq(ctx, g.client, http.MethodDelete,
		"https://www.googleapis.com/drive/v3/files/"+id, "", nil)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}
