package backup

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// MaybeRestore 在 PocketBase 初始化之前调用，按配置从远端恢复最新备份：
//
//	RESTORE=auto（默认） 本地无 data.db 时才恢复；本地已有则跳过（本地优先，
//	                     因为本地要么是刚恢复的、要么比远端新）
//	RESTORE=always      强制用远端最新备份覆盖本地（回滚用）
//	RESTORE=off         跳过恢复
//
// 本地无数据库而远端又不可达时返回错误，调用方应终止启动——
// 否则空库启动后，下一轮定时备份会用空数据覆盖远端的有效备份。
func MaybeRestore(dataDir string, cfg Config) error {
	if !cfg.Enabled() || cfg.Restore == "off" {
		return nil
	}
	if cfg.Restore == "auto" {
		if _, err := os.Stat(filepath.Join(dataDir, "data.db")); err == nil {
			slog.Info("本地数据库已存在，跳过恢复", "dir", dataDir)
			return nil
		}
	} else if _, err := os.Stat(filepath.Join(dataDir, "data.db")); err == nil {
		slog.Warn("RESTORE=always，将用远端最新备份覆盖本地数据库", "dir", dataDir)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	st, err := cfg.NewStorage(ctx)
	if err != nil {
		return err
	}
	names, err := st.List(ctx)
	if err != nil {
		return fmt.Errorf("读取远端备份列表失败（为避免空库覆盖远端数据，本次拒绝启动）: %w", err)
	}
	if len(names) == 0 {
		slog.Info("远端暂无备份，将全新初始化", "type", cfg.Type)
		return nil
	}
	// List 返回升序且文件名含 UTC 时间戳，末位即最新
	latest := names[len(names)-1]
	slog.Info("正在从远端恢复备份", "type", cfg.Type, "file", latest)
	rc, err := st.Get(ctx, latest)
	if err != nil {
		return err
	}
	defer rc.Close()
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return err
	}
	if err := Extract(rc, dataDir); err != nil {
		return fmt.Errorf("解压备份 %s: %w", latest, err)
	}
	slog.Info("备份恢复完成", "dir", dataDir, "file", latest)
	return nil
}

// RunBackup 生成快照并上传到远端，随后按 Keep 清理旧备份。
// 由 cron 触发；任何失败只记录日志，不影响主服务。
func RunBackup(app core.App, st Storage, keep int) {
	data, err := Snapshot(app)
	if err != nil {
		slog.Error("备份：生成快照失败", "err", err)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	name := backupName()
	if err := st.Put(ctx, name, data); err != nil {
		slog.Error("备份：上传失败", "file", name, "err", err)
		return
	}
	slog.Info("备份已上传", "file", name, "bytes", len(data))
	names, err := st.List(ctx)
	if err != nil {
		slog.Warn("备份：获取远端列表失败，跳过清理", "err", err)
		return
	}
	if len(names) <= keep {
		return
	}
	for _, old := range names[:len(names)-keep] {
		if err := st.Delete(ctx, old); err != nil {
			slog.Warn("备份：删除旧备份失败", "file", old, "err", err)
		}
	}
}

// Register 解析配置并把备份任务挂到 PocketBase 的 cron 调度器上。
// 在 OnServe 阶段（registerCronJobs）调用；未配置外部存储时为空操作。
func Register(app core.App) error {
	cfg := Parse()
	if !cfg.Enabled() {
		return nil
	}
	st, err := cfg.NewStorage(context.Background())
	if err != nil {
		return err
	}
	// CRON 表达式非法时 MustAdd 会 panic，启动即失败并暴露配置错误
	app.Cron().MustAdd("external backup", cfg.Cron, func() {
		RunBackup(app, st, cfg.Keep)
	})
	slog.Info("外部存储备份已启用", "type", cfg.Type, "cron", cfg.Cron, "keep", cfg.Keep)
	return nil
}
