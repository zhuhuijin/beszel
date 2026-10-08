# Beszel

Beszel 是一个轻量级服务器监控平台，提供 Docker 统计、历史数据和告警功能。

它拥有友好的 Web 界面，配置简单，开箱即用。支持自动备份、多用户、OAuth 认证和 API 访问。

[![agent Docker Image Size](https://img.shields.io/docker/image-size/henrygd/beszel-agent/latest?logo=docker&label=agent%20image%20size)](https://hub.docker.com/r/henrygd/beszel-agent)
[![hub Docker Image Size](https://img.shields.io/docker/image-size/henrygd/beszel/latest?logo=docker&label=hub%20image%20size)](https://hub.docker.com/r/henrygd/beszel)
[![MIT license](https://img.shields.io/github/license/henrygd/beszel?color=%239944ee)](https://github.com/henrygd/beszel/blob/main/LICENSE)
[![Crowdin](https://badges.crowdin.net/beszel/localized.svg)](https://crowdin.com/project/beszel)

![Beszel 仪表盘与系统页面的并排截图。仪表盘展示多个已连接系统的指标，系统页面展示单个系统的详细指标。](https://henrygd-assets.b-cdn.net/beszel/screenshot-new.png)

## 功能特性

- **轻量级**：比主流方案更小巧、资源占用更低。
- **简单易用**：安装简单，几乎无需手动配置。
- **告警**：支持为绝大多数指标配置告警，并支持多种通知服务。
- **Docker 统计**：记录每个容器的 CPU、内存和网络使用历史。
- **网络监控**：直接从 Agent 监控响应时间与网络中断。
- **S.M.A.R.T.**：磁盘健康数据与硬盘故障通知。
- **多用户**：用户管理各自的系统，管理员可跨用户共享系统。
- **OAuth / OIDC**：支持多种 OAuth2 提供商，可禁用密码登录。
- **自动备份**：保存到磁盘或 S3 兼容存储并从中恢复；另支持无持久化容器的外部存储定时备份（见下文[外部存储备份与恢复](#无持久化容器部署外部存储备份与恢复)）。
<!-- - **REST API**：在你自己的脚本和应用中使用或更新数据。 -->

## 架构

Beszel 由两个主要组件构成：**Hub（中心端）** 和 **Agent（代理端）**。

- **Hub**：基于 [PocketBase](https://pocketbase.io/) 构建的 Web 应用，提供用于查看和管理已连接系统的仪表盘。
- **Agent**：运行在每个需要监控的系统上，将系统指标传输给 Hub。

## 快速开始

[快速入门指南](https://beszel.dev/guide/getting-started)及其他文档可在官网 [beszel.dev](https://beszel.dev) 查看，几分钟内即可完成部署。

## 无持久化容器部署：外部存储备份与恢复

当 Hub 运行在**无法挂载持久化卷**的容器中时（每次重建容器本地数据即丢失），可启用外部存储备份：按 cron 计划把数据目录快照同步到外部存储，并在每次启动时自动从远端恢复最新备份。用户、系统、告警配置、统计数据以及 SSH 私钥（`id_ed25519`）都会保留。

- **备份内容**：`data.db`（通过 `VACUUM INTO` 生成的一致性快照，包含 WAL 中已提交的写入）、`id_ed25519`（SSH 私钥）、`config.yml`（如存在），打包为 tar.gz。
- **备份文件名**：`hub-<UTC时间戳>.tar.gz`，字典序即时间序。
- **数据丢失窗口**：等于 cron 间隔（默认 10 分钟）。

### 支持的存储类型

| TYPE | 说明 |
|---|---|
| `s3` | 兼容 AWS S3 / Cloudflare R2 / MinIO / 阿里云 OSS / 腾讯云 COS 等 S3 协议存储 |
| `gdrive` | Google Drive（需一次性 OAuth 授权获取 refresh token） |
| `box` | Box（推荐 Client Credentials 认证，凭证静态可长期使用） |

### 配置变量

**通用变量：**

| 变量 | 默认值 | 说明 |
|---|---|---|
| `BESZEL_HUB_BACKUP_TYPE` | 空（关闭） | 存储类型：`s3` / `gdrive` / `box` |
| `BESZEL_HUB_BACKUP_CRON` | `*/10 * * * *` | cron 表达式（5 字段，同 PocketBase 调度器） |
| `BESZEL_HUB_BACKUP_KEEP` | `10` | 远端保留的备份份数，超出自动清理最旧 |
| `BESZEL_HUB_BACKUP_PATH` | `beszel-hub` | s3 对象 key 前缀（gdrive / box 使用 FOLDER_ID，忽略此项） |
| `BESZEL_HUB_BACKUP_RESTORE` | `auto` | `auto`：本地无 data.db 才恢复；`always`：强制用远端覆盖本地（回滚用）；`off`：禁用恢复 |

**`s3` 类型：**

| 变量 | 说明 |
|---|---|
| `BESZEL_HUB_BACKUP_S3_ENDPOINT` | 自定义端点。AWS 官方留空；R2 填 `https://<账户ID>.r2.cloudflarestorage.com`；MinIO/OSS/COS 填各自端点 |
| `BESZEL_HUB_BACKUP_S3_REGION` | 区域。R2 用 `auto`；留空默认 `us-east-1` |
| `BESZEL_HUB_BACKUP_S3_BUCKET` | 存储桶（必填） |
| `BESZEL_HUB_BACKUP_S3_ACCESS_KEY_ID` | Access Key（必填） |
| `BESZEL_HUB_BACKUP_S3_SECRET_ACCESS_KEY` | Secret Key（必填） |

**`gdrive` 类型：**

| 变量 | 说明 |
|---|---|
| `BESZEL_HUB_BACKUP_GDRIVE_CLIENT_ID` | OAuth 客户端 ID（必填） |
| `BESZEL_HUB_BACKUP_GDRIVE_CLIENT_SECRET` | OAuth 客户端密钥（必填） |
| `BESZEL_HUB_BACKUP_GDRIVE_REFRESH_TOKEN` | refresh token（必填，获取方式见下文） |
| `BESZEL_HUB_BACKUP_GDRIVE_FOLDER_ID` | 目标文件夹 ID，留空表示"我的云端硬盘"根目录 |

**`box` 类型：**

| 变量 | 说明 |
|---|---|
| `BESZEL_HUB_BACKUP_BOX_CLIENT_ID` | 应用 Client ID（必填） |
| `BESZEL_HUB_BACKUP_BOX_CLIENT_SECRET` | 应用 Client Secret（必填） |
| `BESZEL_HUB_BACKUP_BOX_REFRESH_TOKEN` | 可选。提供时使用标准用户 OAuth（Box 的 refresh token 会轮换，仅适合有本地持久化的部署） |
| `BESZEL_HUB_BACKUP_BOX_FOLDER_ID` | 目标文件夹 ID，留空表示根目录（`0`） |

### 使用示例

```yaml
services:
  beszel:
    image: henrygd/beszel   # 或自行构建的镜像
    restart: unless-stopped
    ports:
      - "8090:8090"
    environment:
      # 以 Cloudflare R2 为例（其他 S3 兼容存储换 ENDPOINT 即可）
      - BESZEL_HUB_BACKUP_TYPE=s3
      - BESZEL_HUB_BACKUP_S3_ENDPOINT=https://<账户ID>.r2.cloudflarestorage.com
      - BESZEL_HUB_BACKUP_S3_REGION=auto
      - BESZEL_HUB_BACKUP_S3_BUCKET=my-bucket
      - BESZEL_HUB_BACKUP_S3_ACCESS_KEY_ID=xxx
      - BESZEL_HUB_BACKUP_S3_SECRET_ACCESS_KEY=xxx
      # 可选：备份计划与保留策略
      - BESZEL_HUB_BACKUP_CRON=*/10 * * * *
      - BESZEL_HUB_BACKUP_KEEP=10
```

### 启动与恢复行为

| 本地 data.db | 远端备份 | 启动时行为 |
|---|---|---|
| 无 | 有 | 下载最新备份，解压后正常启动 |
| 无 | 无（可访问但为空） | 视为首次部署，全新初始化 |
| 有 | 无 | 跳过恢复，直接使用本地数据 |
| 有 | 有 | 跳过恢复（本地优先：本地要么刚恢复过、要么比远端新） |
| 无 | **不可达** | **拒绝启动**——避免空库启动后被下一轮备份覆盖远端有效数据 |

运行期间备份上传失败只记录告警日志，不影响监控服务；下一轮 cron 自动重试。

### 获取 GDrive / Box 凭证

**Google Drive（一次性）：**

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建 OAuth 客户端（桌面应用类型），获得 Client ID / Secret；或直接使用 [OAuth Playground](https://developers.google.com/oauthplayground)（设置中勾选使用自己的凭证）。
2. 以 `https://www.googleapis.com/auth/drive.file` scope 完成授权。
3. 将得到的 refresh token 填入 `BESZEL_HUB_BACKUP_GDRIVE_REFRESH_TOKEN`。Google 的 refresh token 不会轮换，可长期使用。

**Box（推荐 Client Credentials 模式）：**

1. 在 [Box Developer Console](https://app.box.com/developers/console) 创建 Custom App，认证方式选择 **Server Auth (Client Credentials Grant)**。
2. 将 Client ID / Client Secret 填入对应环境变量即可，无需 refresh token。
3. 可选：在 Box 中把服务账号邀请为目标文件夹协作者，便于在网页端查看备份文件。

## 截图

![仪表盘](https://beszel.dev/image/dashboard.png)
![系统页面](https://beszel.dev/image/system-full.png)
![通知设置](https://beszel.dev/image/settings-notifications.png)

## 支持的指标

- **CPU 使用率** —— 宿主机与 Docker / Podman 容器。
- **内存使用** —— 宿主机与容器，含 swap 与 ZFS ARC。
- **磁盘使用** —— 宿主机，支持多分区、多设备。
- **磁盘 I/O** —— 宿主机，支持多分区、多设备。
- **网络流量** —— 宿主机与容器。
- **负载均值** —— 宿主机。
- **温度** —— 宿主机传感器。
- **风扇转速** —— 宿主机传感器（Linux，通过 `/sys/class/hwmon`）。
- **GPU 使用率 / 功耗** —— Nvidia、AMD 与 Intel。
- **电池电量** —— 宿主机及部分外设。
- **容器** —— 所有运行中 Docker / Podman 容器的状态与指标。
- **S.M.A.R.T.** —— 宿主机磁盘健康（可用时包含 eMMC 磨损/EOL 与 Linux mdraid 阵列健康状态，基于 sysfs）。
- **ZFS** —— 存储池容量、使用率、健康状态、I/O 吞吐、scrub 状态及各数据集用量。

## 帮助与讨论

提交新 Issue 或 Discussion 前，请先搜索已有的 Issue 和 Discussion。我会尽力回复，但不一定能及时处理。

#### Bug 报告与功能请求

请发布在 [GitHub issues](https://github.com/henrygd/beszel/issues)。

#### 支持与一般讨论

请发布在 [GitHub discussions](https://github.com/henrygd/beszel/discussions) 或社区运营的 [Matrix 房间](https://matrix.to/#/#beszel:matrix.org)：`#beszel:matrix.org`。

## 许可证

Beszel 基于 MIT 许可证发布，详见 [LICENSE](LICENSE) 文件。
