package alerts

import (
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// notificationStrings holds the localized text used in alert notifications
// (email / webhook messages). English output must stay byte-identical to the
// pre-i18n strings so existing tests keep passing; other languages may reorder
// arguments with explicit indexes (e.g. %[2]s) or use %.2[3]f for precision.
type notificationStrings struct {
	viewSystem string // "View %s"

	// threshold alerts (alerts_system.go)
	aboveThreshold string // "%s %s above threshold"
	belowThreshold string // "%s %s below threshold"
	averagedBody   string // "%s averaged %.2f%s for the previous %v %s."
	minutesLabel   func(min uint8) string
	highestSensor  string // "Highest sensor %s"
	diskUsageOf    string // "Usage of %s"
	zfsPoolUsageOf string // "Usage of storage pool %s"
	// localized display names for alert.name values; non-nil switches
	// alertDisplayName/diskUsageDescriptor to the localized behavior
	alertNames map[string]string

	// status alerts
	connectionUp   string // "Connection to %s is up ✅"
	connectionDown string // "Connection to %s is down 🔴"

	// container health alerts
	containersHealthy   string // "%s containers are healthy ✅"
	unhealthyContainer  string // "Unhealthy container %s on %s 🔴"
	unhealthyContainers string // "%d unhealthy containers on %s 🔴"
	unhealthyList       string // "Unhealthy: %s"
	containerLogs       string // "\n\n%s logs:\n```"
	moreUnhealthy       string // "\n\n(+%d more unhealthy container(s), logs omitted)"
	truncatedSuffix     string // "\n…(truncated)"

	// systemd alerts (emoji appended by the sender)
	failedServicesTitle    string // "Failed services on %s"
	failedServicesBody     string // "%s on %s: %s"
	failedServiceCount     func(count int) string
	servicesRecoveredTitle string // "Services recovered on %s"
	noFailedServices       string // "No services are in the failed state on %s."
	andMoreServices        string // "%s and %d more"

	// SMART alerts
	smartTitle       string // "SMART %s on %s: %s %s"
	smartBodyModel   string // "Disk %s (%s) SMART status changed to %s"
	smartBody        string // "Disk %s SMART status changed to %s"
	smartStateLabels map[string]string

	// ZFS pool alerts
	poolTitle        string // "Storage pool %s on %s: %s"
	poolFirstSeen    string // "Storage pool %s (%s) was first observed as %s"
	poolHealthChange string // "Storage pool %s (%s) health changed from %s to %s"
	poolHealthLabels map[string]string

	// network monitor alerts
	netLossTitle      string // "Network monitor loss on %s: %s"
	netRecoveredTitle string // "Network monitor recovered on %s: %s"
	netLossBody       string // "%s on %s: loss over the past hour is %.2f%%, which exceeds the %.2f%% threshold."
	netRecoveredBody  string // "%s on %s: loss over the past hour is %.2f%%, which is at or below the %.2f%% threshold."

	// test notification
	testTitle   string // "Test Alert"
	testMessage string // "This is a notification from Beszel."
	viewBeszel  string // "View Beszel"
}

var notificationCatalog = map[string]notificationStrings{
	"en": enNotificationStrings(),
	"zh": zhNotificationStrings(),
}

func notificationStringsFor(lang string) notificationStrings {
	if localized, ok := notificationCatalog[lang]; ok {
		return localized
	}
	return notificationCatalog["en"]
}
// userNotificationLang returns the notification language for a user based on the
// lang saved in their user_settings record. Falls back to English.
func userNotificationLang(app core.App, userID string) string {
	if userID == "" {
		return "en"
	}
	record, err := app.FindFirstRecordByFilter("user_settings", "user={:user}", dbx.Params{"user": userID})
	if err != nil {
		return "en"
	}
	var settings struct {
		Lang string `json:"lang"`
	}
	if err := record.UnmarshalJSONField("settings", &settings); err != nil {
		return "en"
	}
	return notificationLang(settings.Lang)
}

// notificationLang maps a language code to a supported notification language.
// All Chinese variants share the zh catalog for now.
func notificationLang(lang string) string {
	switch strings.ToLower(strings.TrimSpace(lang)) {
	case "zh", "zh-cn", "zh-sg", "zh-my", "zh-hk", "zh-mo", "zh-tw", "zh-hans", "zh-hant":
		return "zh"
	default:
		return "en"
	}
}

// poolHealth returns the localized ZFS pool health state for notifications
// (English keeps the raw state value, e.g. "DEGRADED").
func (s notificationStrings) poolHealth(health string) string {
	if label, ok := s.poolHealthLabels[health]; ok {
		return label
	}
	return health
}

// alertDisplayName returns the localized name for a system alert (after the
// Disk/LoadAvg renames). English keeps the original lowercasing behavior.
func (s notificationStrings) alertDisplayName(name string) string {
	if s.alertNames != nil {
		if localized, ok := s.alertNames[name]; ok {
			return localized
		}
		return name
	}
	if name != "CPU" && name != "GPU" && !strings.HasPrefix(name, "CPU") {
		return strings.ToLower(name)
	}
	return name
}

// diskUsageDescriptor formats a disk alert descriptor from its raw key
// ("root", a partition/mount name, or "zfs:<pool>").
func (s notificationStrings) diskUsageDescriptor(key string) string {
	if s.alertNames != nil {
		if poolName, ok := strings.CutPrefix(key, "zfs:"); ok {
			return fmt.Sprintf(s.zfsPoolUsageOf, poolName)
		}
		return fmt.Sprintf(s.diskUsageOf, key)
	}
	return diskAlertDescriptor(key)
}

func enNotificationStrings() notificationStrings {
	return notificationStrings{
		viewSystem: "View %s",

		aboveThreshold: "%s %s above threshold",
		belowThreshold: "%s %s below threshold",
		averagedBody:   "%s averaged %.2f%s for the previous %v %s.",
		minutesLabel: func(min uint8) string {
			if min > 1 {
				return "minutes"
			}
			return "minute"
		},
		highestSensor:  "Highest sensor %s",
		diskUsageOf:    "Usage of %s",
		zfsPoolUsageOf: "Usage of storage pool %s",

		connectionUp:   "Connection to %s is up ✅",
		connectionDown: "Connection to %s is down 🔴",

		containersHealthy:   "%s containers are healthy ✅",
		unhealthyContainer:  "Unhealthy container %s on %s 🔴",
		unhealthyContainers: "%d unhealthy containers on %s 🔴",
		unhealthyList:       "Unhealthy: %s",
		containerLogs:       "\n\n%s logs:\n```",
		moreUnhealthy:       "\n\n(+%d more unhealthy container(s), logs omitted)",
		truncatedSuffix:     "\n…(truncated)",

		failedServicesTitle:    "Failed services on %s",
		failedServicesBody:     "%s on %s: %s",
		failedServiceCount:     failedServiceCountEn,
		servicesRecoveredTitle: "Services recovered on %s",
		noFailedServices:       "No services are in the failed state on %s.",
		andMoreServices:        "%s and %d more",

		smartTitle:       "SMART %s on %s: %s %s",
		smartBodyModel:   "Disk %s (%s) SMART status changed to %s",
		smartBody:        "Disk %s SMART status changed to %s",

		poolTitle:        "Storage pool %s on %s: %s",
		poolFirstSeen:    "Storage pool %s (%s) was first observed as %s",
		poolHealthChange: "Storage pool %s (%s) health changed from %s to %s",

		netLossTitle:      "Network monitor loss on %s: %s",
		netRecoveredTitle: "Network monitor recovered on %s: %s",
		netLossBody:       "%s on %s: loss over the past hour is %.2f%%, which exceeds the %.2f%% threshold.",
		netRecoveredBody:  "%s on %s: loss over the past hour is %.2f%%, which is at or below the %.2f%% threshold.",

		testTitle:   "Test Alert",
		testMessage: "This is a notification from Beszel.",
		viewBeszel:  "View Beszel",
	}
}

// failedServiceCountEn returns "1 failed service" or "%d failed services".
func failedServiceCountEn(count int) string {
	if count == 1 {
		return "1 failed service"
	}
	return fmt.Sprintf("%d failed services", count)
}

func zhNotificationStrings() notificationStrings {
	return notificationStrings{
		viewSystem: "查看 %s",

		aboveThreshold: "%[1]s %[2]s高于阈值",
		belowThreshold: "%[1]s %[2]s低于阈值",
		averagedBody:   "%[1]s过去 %[4]v %[5]s平均 %.2[2]f%[3]s。",
		minutesLabel: func(min uint8) string {
			return "分钟"
		},
		highestSensor: "最高传感器 %s",
		alertNames: map[string]string{
			"CPU":            "CPU",
			"GPU":            "GPU",
			"Memory":         "内存",
			"Bandwidth":      "带宽",
			"Disk usage":     "磁盘使用率",
			"Temperature":    "温度",
			"Battery":        "电量",
			"CPU I/O Wait":   "CPU I/O 等待",
			"CPU Steal Time": "CPU Steal 时间",
			"1m Load":        "1分钟负载",
			"5m Load":        "5分钟负载",
			"15m Load":       "15分钟负载",
		},
		zfsPoolUsageOf: "存储池 %s 使用率",
		diskUsageOf:    "%s 使用率",

		connectionUp:   "与 %s 的连接已恢复 ✅",
		connectionDown: "与 %s 的连接已断开 🔴",

		containersHealthy:   "%s 的容器运行正常 ✅",
		unhealthyContainer:  "%[2]s 上的容器 %[1]s 不健康 🔴",
		unhealthyContainers: "%[2]s 上有 %[1]d 个不健康容器 🔴",
		unhealthyList:       "不健康容器:%s",
		containerLogs:       "\n\n%s 日志:\n```",
		moreUnhealthy:       "\n\n(+其余 %[1]d 个不健康容器,日志省略)",
		truncatedSuffix:     "\n…(已截断)",

		failedServicesTitle:    "%s 存在失败的服务",
		failedServicesBody:     "%[2]s 上有 %[1]s:%[3]s",
		failedServiceCount:     func(count int) string { return fmt.Sprintf("%d 个失败的服务", count) },
		servicesRecoveredTitle: "%s 服务已恢复",
		noFailedServices:       "%s 上没有处于失败状态的服务。",
		andMoreServices:        "%s 等 %d 个",

		smartTitle:     "SMART %s:%s 上的 %s %s",
		smartBodyModel: "磁盘 %s(%s)SMART 状态变更为 %s",
		smartBody:      "磁盘 %s SMART 状态变更为 %s",
		smartStateLabels: map[string]string{
			"PASSED":  "通过",
			"WARNING": "警告",
			"FAILED":  "故障",
		},

		poolTitle:        "存储池 %[3]s(%[2]s)%[1]s",
		poolFirstSeen:    "存储池 %[1]s(%[2]s)首次检测为 %[3]s",
		poolHealthChange: "存储池 %[1]s(%[2]s)健康状态从 %[3]s 变更为 %[4]s",
		poolHealthLabels: map[string]string{
			"ONLINE":    "在线",
			"DEGRADED":  "已降级",
			"FAULTED":   "故障",
			"OFFLINE":   "离线",
			"UNAVAIL":   "不可用",
			"REMOVED":   "已移除",
			"SUSPENDED": "已挂起",
		},

		netLossTitle:      "网络监控丢包:%[2]s 上的 %[3]s",
		netRecoveredTitle: "网络监控恢复:%[2]s 上的 %[3]s",
		netLossBody:       "%[1]s(%[2]s)过去一小时的丢包率为 %.2[3]f%%,超过 %.2[4]f%% 的阈值。",
		netRecoveredBody:  "%[1]s(%[2]s)过去一小时的丢包率为 %.2[3]f%%,已不超过 %.2[4]f%% 的阈值。",

		testTitle:   "测试告警",
		testMessage: "这是来自 Beszel 的测试通知。",
		viewBeszel:  "查看 Beszel",
	}
}
