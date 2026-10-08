// Package backup 为无法持久化存储的部署（如不可挂载卷的容器）提供数据备份能力：
// 按 cron 计划把数据目录快照（VACUUM INTO 一致性快照 + tar.gz）同步到外部存储，
// 并在启动时从远端恢复最新备份。
//
// 支持的存储类型（BESZEL_HUB_BACKUP_TYPE）：
//   - s3     —— 兼容 AWS S3 / Cloudflare R2 / MinIO / 阿里云 OSS / 腾讯云 COS
//   - gdrive —— Google Drive（需要一次性 OAuth 授权获得的 refresh token）
//   - box    —— Box（推荐 Client Credentials 认证，见 storage_box.go）
//
// 通用环境变量：
//
//	BESZEL_HUB_BACKUP_TYPE   存储类型，留空（默认）即关闭备份功能
//	BESZEL_HUB_BACKUP_CRON   cron 表达式，默认 "*/10 * * * *"（每 10 分钟）
//	BESZEL_HUB_BACKUP_KEEP   远端保留份数，默认 10
//	BESZEL_HUB_BACKUP_PATH   s3 对象 key 前缀，默认 "beszel-hub"（gdrive/box 用 FOLDER_ID，忽略此项）
//	BESZEL_HUB_BACKUP_RESTORE auto（默认，本地无 data.db 才恢复）/ always（强制恢复，用于回滚）/ off
package backup

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// 支持的存储类型
const (
	TypeS3     = "s3"
	TypeGDrive = "gdrive"
	TypeBox    = "box"
)

const (
	envPrefix = "BESZEL_HUB_BACKUP"

	// DefaultCron 默认每 10 分钟备份一次。
	DefaultCron = "*/10 * * * *"
	// DefaultKeep 默认远端保留 10 份。
	DefaultKeep = 10
	// DefaultPath s3 默认对象前缀。
	DefaultPath = "beszel-hub"
)

// Config 汇总备份相关的环境变量配置。
type Config struct {
	Type    string // 存储类型：s3 / gdrive / box
	Cron    string // cron 表达式（5 字段，同 PocketBase 调度器）
	Keep    int    // 远端保留的备份份数
	Restore string // auto / always / off
	Path    string // s3 对象 key 前缀

	S3Endpoint        string // 留空表示 AWS 官方；R2/MinIO/OSS/COS 填各自端点
	S3Region          string // R2 用 auto；留空默认 us-east-1
	S3Bucket          string
	S3AccessKeyID     string
	S3SecretAccessKey string

	GDriveClientID     string
	GDriveClientSecret string
	GDriveRefreshToken string
	GDriveFolderID     string // 留空表示我的云端硬盘根目录

	BoxClientID     string
	BoxClientSecret string
	BoxRefreshToken string // 可选；提供时使用标准用户 OAuth（见 storage_box.go 的说明）
	BoxFolderID     string // 留空表示根目录 "0"
}

// env 读取 BESZEL_HUB_BACKUP_<name> 环境变量。
func env(name string) string {
	return os.Getenv(envPrefix + "_" + name)
}

// Parse 从环境变量解析备份配置。
func Parse() Config {
	cfg := Config{
		Type:    strings.ToLower(strings.TrimSpace(env("TYPE"))),
		Cron:    strings.TrimSpace(env("CRON")),
		Keep:    DefaultKeep,
		Restore: strings.ToLower(strings.TrimSpace(env("RESTORE"))),
		Path:    strings.TrimSpace(env("PATH")),

		S3Endpoint:        strings.TrimSpace(env("S3_ENDPOINT")),
		S3Region:          strings.TrimSpace(env("S3_REGION")),
		S3Bucket:          strings.TrimSpace(env("S3_BUCKET")),
		S3AccessKeyID:     strings.TrimSpace(env("S3_ACCESS_KEY_ID")),
		S3SecretAccessKey: strings.TrimSpace(env("S3_SECRET_ACCESS_KEY")),

		GDriveClientID:     strings.TrimSpace(env("GDRIVE_CLIENT_ID")),
		GDriveClientSecret: strings.TrimSpace(env("GDRIVE_CLIENT_SECRET")),
		GDriveRefreshToken: strings.TrimSpace(env("GDRIVE_REFRESH_TOKEN")),
		GDriveFolderID:     strings.TrimSpace(env("GDRIVE_FOLDER_ID")),

		BoxClientID:     strings.TrimSpace(env("BOX_CLIENT_ID")),
		BoxClientSecret: strings.TrimSpace(env("BOX_CLIENT_SECRET")),
		BoxRefreshToken: strings.TrimSpace(env("BOX_REFRESH_TOKEN")),
		BoxFolderID:     strings.TrimSpace(env("BOX_FOLDER_ID")),
	}
	if cfg.Cron == "" {
		cfg.Cron = DefaultCron
	}
	if cfg.Path == "" {
		cfg.Path = DefaultPath
	}
	if cfg.Restore == "" {
		cfg.Restore = "auto"
	}
	if raw := strings.TrimSpace(env("KEEP")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			cfg.Keep = n
		}
	}
	return cfg
}

// Enabled 表示是否配置了外部存储（即启用备份）。
func (c Config) Enabled() bool { return c.Type != "" }

// NewStorage 按类型构造外部存储客户端，并校验必填参数。
func (c Config) NewStorage(ctx context.Context) (Storage, error) {
	switch c.Type {
	case TypeS3:
		return newS3Storage(c)
	case TypeGDrive:
		return newGDriveStorage(ctx, c)
	case TypeBox:
		return newBoxStorage(ctx, c)
	default:
		return nil, fmt.Errorf("不支持的 BESZEL_HUB_BACKUP_TYPE: %q（可选 %s / %s / %s）", c.Type, TypeS3, TypeGDrive, TypeBox)
	}
}
