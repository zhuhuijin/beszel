package backup

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// Snapshot 生成数据目录的一致性快照（tar.gz 字节流）。
// data.db 通过 VACUUM INTO 导出——在线安全、包含 WAL 中已提交的写入；
// id_ed25519（SSH 私钥）与 config.yml 直接复制。
func Snapshot(app core.App) ([]byte, error) {
	dataDir := app.DataDir()
	tmpDir, err := os.MkdirTemp("", "beszel-snapshot-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmpDir)

	// VACUUM INTO 要求目标文件不存在（MkdirTemp 保证），单引号需转义
	snapPath := filepath.Join(tmpDir, "data.db")
	if _, err := app.DB().NewQuery(
		"VACUUM INTO '" + strings.ReplaceAll(snapPath, "'", "''") + "'",
	).Execute(); err != nil {
		return nil, fmt.Errorf("生成数据库快照: %w", err)
	}

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	files := []struct{ path, name string }{
		{snapPath, "data.db"},
		{filepath.Join(dataDir, "id_ed25519"), "id_ed25519"},
		{filepath.Join(dataDir, "config.yml"), "config.yml"},
	}
	for _, f := range files {
		if _, err := os.Stat(f.path); err != nil {
			continue // config.yml 等可选文件
		}
		if err := tarAppend(tw, f.path, f.name); err != nil {
			return nil, err
		}
	}
	if err := tw.Close(); err != nil {
		return nil, err
	}
	if err := gz.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// tarAppend 把单个文件写入 tar 流，保留权限位（私钥为 0600）。
func tarAppend(tw *tar.Writer, path, name string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if err := tw.WriteHeader(&tar.Header{
		Name:    name,
		Mode:    int64(info.Mode().Perm()),
		Size:    info.Size(),
		ModTime: info.ModTime(),
	}); err != nil {
		return err
	}
	_, err = io.Copy(tw, f)
	return err
}

// Extract 把快照解压到 dir。含路径穿越防护，只接受普通文件并保留权限位。
func Extract(r io.Reader, dir string) error {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return fmt.Errorf("读取 gzip: %w", err)
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if hdr.Typeflag != tar.TypeReg {
			continue // 跳过目录与其他类型
		}
		name := filepath.Clean(hdr.Name)
		if filepath.IsAbs(name) || name == ".." || strings.HasPrefix(name, ".."+string(filepath.Separator)) {
			continue // 拒绝路径穿越
		}
		target := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		mode := os.FileMode(hdr.Mode)
		if mode == 0 {
			mode = 0o600
		}
		if err := writeTarFile(target, tr, mode); err != nil {
			return err
		}
	}
}

// writeTarFile 流式写出一个 tar 成员到目标文件。
func writeTarFile(target string, r io.Reader, mode os.FileMode) error {
	f, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, r)
	return err
}
