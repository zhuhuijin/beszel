package backup

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Storage 抽象外部备份存储。备份文件名统一为 hub-20060102-150405.tar.gz
// （UTC 时间戳，字典序即时间序）。
type Storage interface {
	// Put 上传一份备份。
	Put(ctx context.Context, name string, data []byte) error
	// List 返回远端已有的备份文件名（升序）。
	List(ctx context.Context) ([]string, error)
	// Get 下载指定备份，调用方负责关闭返回的流。
	Get(ctx context.Context, name string) (io.ReadCloser, error)
	// Delete 删除指定备份。
	Delete(ctx context.Context, name string) error
}

const (
	backupPrefix = "hub-"
	backupExt    = ".tar.gz"
)

// backupName 生成当前时间的备份文件名。
func backupName() string {
	return backupPrefix + time.Now().UTC().Format("20060102-150405") + backupExt
}

// isBackup 判断远端对象名是否为本组件产生的备份文件。
func isBackup(name string) bool {
	return strings.HasPrefix(name, backupPrefix) && strings.HasSuffix(name, backupExt)
}

// doReq 发送 HTTP 请求；非 2xx 时返回带响应摘要的错误，成功时由调用方关闭 resp.Body。
func doReq(ctx context.Context, client *http.Client, method, rawURL, contentType string, body []byte) (*http.Response, error) {
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, rdr)
	if err != nil {
		return nil, err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		resp.Body.Close()
		return nil, fmt.Errorf("%s %s: HTTP %d: %s", method, rawURL, resp.StatusCode, string(data))
	}
	return resp, nil
}
