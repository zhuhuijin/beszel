package backup

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"sort"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/clientcredentials"
)

var boxEndpoint = oauth2.Endpoint{
	AuthURL:  "https://account.box.com/api/oauth2/authorize",
	TokenURL: "https://api.box.com/oauth2/token",
}

// boxStorage 通过 Box API v2 存取备份。
//
// 认证方式二选一（只填 CLIENT_ID / CLIENT_SECRET 时走前者）：
//   - Client Credentials（推荐）：在 Box Developer Console 创建
//     Server Auth (Client Credentials Grant) 类型的 Custom App，凭
//     CLIENT_ID + CLIENT_SECRET 静态获取服务账号令牌。令牌随取随用，
//     适合无持久化容器——Box 标准 OAuth 的 refresh token 是一次性会轮换的，
//     容器重建后会失效，Client Credentials 没有这个问题。
//   - 标准 OAuth（REFRESH_TOKEN）：与 rclone 相同的用户授权模式，但
//     refresh token 每次刷新都会轮换，只适合有本地持久化的部署。
//
// 环境变量：
//
//	BESZEL_HUB_BACKUP_BOX_CLIENT_ID      应用 Client ID
//	BESZEL_HUB_BACKUP_BOX_CLIENT_SECRET  应用 Client Secret
//	BESZEL_HUB_BACKUP_BOX_REFRESH_TOKEN  可选，标准 OAuth 模式
//	BESZEL_HUB_BACKUP_BOX_FOLDER_ID      目标文件夹 ID，留空表示根目录 "0"
type boxStorage struct {
	client   *http.Client
	folderID string
}

func newBoxStorage(ctx context.Context, cfg Config) (Storage, error) {
	if cfg.BoxClientID == "" || cfg.BoxClientSecret == "" {
		return nil, fmt.Errorf("box 存储需要 BESZEL_HUB_BACKUP_BOX_CLIENT_ID / _CLIENT_SECRET")
	}
	folder := cfg.BoxFolderID
	if folder == "" {
		folder = "0"
	}
	var client *http.Client
	if cfg.BoxRefreshToken != "" {
		conf := &oauth2.Config{
			ClientID:     cfg.BoxClientID,
			ClientSecret: cfg.BoxClientSecret,
			Endpoint:     boxEndpoint,
		}
		ts := conf.TokenSource(ctx, &oauth2.Token{RefreshToken: cfg.BoxRefreshToken, Expiry: time.Now()})
		client = oauth2.NewClient(ctx, ts)
	} else {
		conf := clientcredentials.Config{
			ClientID:     cfg.BoxClientID,
			ClientSecret: cfg.BoxClientSecret,
			TokenURL:     boxEndpoint.TokenURL,
		}
		client = conf.Client(ctx)
	}
	return &boxStorage{client: client, folderID: folder}, nil
}

// boxEntry 是文件夹条目中关心的字段。
type boxEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

// listEntries 返回目录下按名称升序的文件条目。
func (b *boxStorage) listEntries(ctx context.Context) ([]boxEntry, error) {
	vals := url.Values{
		"sort":      {"name"},
		"direction": {"ASC"},
		"limit":     {"1000"},
		"fields":    {"name,type"},
	}
	u := "https://api.box.com/2.0/folders/" + b.folderID + "/items?" + vals.Encode()
	resp, err := doReq(ctx, b.client, http.MethodGet, u, "", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out struct {
		Entries []boxEntry `json:"entries"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("解析 box 响应: %w", err)
	}
	return out.Entries, nil
}

// fileID 按文件名精确查找文件 ID。
func (b *boxStorage) fileID(ctx context.Context, name string) (string, error) {
	entries, err := b.listEntries(ctx)
	if err != nil {
		return "", err
	}
	for _, e := range entries {
		if e.Type == "file" && e.Name == name {
			return e.ID, nil
		}
	}
	return "", fmt.Errorf("box 目录中找不到 %s", name)
}

func (b *boxStorage) Put(ctx context.Context, name string, data []byte) error {
	// multipart/form-data：attributes 字段 + 文件字段
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	attrs, err := json.Marshal(map[string]any{
		"name":   name,
		"parent": map[string]string{"id": b.folderID},
	})
	if err != nil {
		return err
	}
	if err := w.WriteField("attributes", string(attrs)); err != nil {
		return err
	}
	fw, err := w.CreateFormFile("file", name)
	if err != nil {
		return err
	}
	if _, err := fw.Write(data); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	resp, err := doReq(ctx, b.client, http.MethodPost,
		"https://upload.box.com/api/2.0/files/content", w.FormDataContentType(), buf.Bytes())
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (b *boxStorage) List(ctx context.Context) ([]string, error) {
	entries, err := b.listEntries(ctx)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.Type == "file" && isBackup(e.Name) {
			names = append(names, e.Name)
		}
	}
	sort.Strings(names)
	return names, nil
}

func (b *boxStorage) Get(ctx context.Context, name string) (io.ReadCloser, error) {
	id, err := b.fileID(ctx, name)
	if err != nil {
		return nil, err
	}
	// Box 下载会 302 到 CDN，http.Client 默认自动跟随
	resp, err := doReq(ctx, b.client, http.MethodGet,
		"https://api.box.com/2.0/files/"+id+"/content", "", nil)
	if err != nil {
		return nil, err
	}
	return resp.Body, nil
}

func (b *boxStorage) Delete(ctx context.Context, name string) error {
	id, err := b.fileID(ctx, name)
	if err != nil {
		return err
	}
	resp, err := doReq(ctx, b.client, http.MethodDelete,
		"https://api.box.com/2.0/files/"+id, "", nil)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}
