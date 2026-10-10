//go:build testing

package alerts_test

import (
	"testing"
	"testing/synctest"
	"time"

	"github.com/henrygd/beszel/internal/entities/system"
	beszelTests "github.com/henrygd/beszel/internal/tests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setUserNotificationLang saves a notification language into the user's settings.
func setUserNotificationLang(t *testing.T, hub *beszelTests.TestHub, userID, lang string) {
	t.Helper()
	userSettings, err := hub.FindFirstRecordByFilter("user_settings", "user={:user}", map[string]any{"user": userID})
	require.NoError(t, err)
	userSettings.Set("settings", map[string]any{
		"emails":   []string{"test@example.com"},
		"webhooks": []string{},
		"lang":     lang,
	})
	require.NoError(t, hub.Save(userSettings))
}

func TestChineseStatusAlertNotification(t *testing.T) {
	hub, user := beszelTests.GetHubWithUser(t)
	defer hub.Cleanup()

	setUserNotificationLang(t, hub, user.Id, "zh-CN")

	system, err := beszelTests.CreateRecord(hub, "systems", map[string]any{
		"name":   "test-system",
		"users":  []string{user.Id},
		"host":   "127.0.0.1",
		"status": "up",
	})
	assert.NoError(t, err)

	_, err = beszelTests.CreateRecord(hub, "alerts", map[string]any{
		"name":      "Status",
		"system":    system.Id,
		"user":      user.Id,
		"triggered": true,
		"min":       1,
	})
	assert.NoError(t, err)

	am := hub.AlertManager
	am.HandleStatusAlerts("up", system)

	require.EqualValues(t, 1, hub.TestMailer.TotalSend(), "should have 1 email sent")
	lastMessage := hub.TestMailer.LastMessage()
	assert.Contains(t, lastMessage.Subject, "与 test-system 的连接已恢复")
	assert.Contains(t, lastMessage.Text, "与 test-system 的连接已恢复")
}

func TestChineseSystemAlertNotification(t *testing.T) {
	fixture := newSystemAlertTestFixture(t, "CPU", 1, 50)
	defer fixture.cleanup()

	userSettingsRecords, err := fixture.hub.FindAllRecords("user_settings")
	require.NoError(t, err)
	require.NotEmpty(t, userSettingsRecords)
	setUserNotificationLang(t, fixture.hub, userSettingsRecords[0].GetString("user"), "zh-CN")

	synctest.Test(t, func(t *testing.T) {
		submitValue(fixture, t, 90.0, func(info *system.Info, _ *system.Stats, v float64) {
			info.Cpu = v
		})
		waitForSystemAlert(time.Second)

		fixture.assertTriggered(t, true, "Alert should be triggered")
		require.Equal(t, 1, fixture.hub.TestMailer.TotalSend(), "An email should have been sent")
		lastMessage := fixture.hub.TestMailer.LastMessage()
		assert.Contains(t, lastMessage.Subject, "test-system-0 CPU高于阈值")
		assert.Contains(t, lastMessage.Text, "CPU过去 1 分钟平均 90.00%")
	})
}

func TestChineseZfsPoolAlertNotification(t *testing.T) {
	hub, user := beszelTests.GetHubWithUser(t)
	defer hub.Cleanup()

	setUserNotificationLang(t, hub, user.Id, "zh-CN")

	system, err := beszelTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "test-system",
		"users": []string{user.Id},
		"host":  "127.0.0.1",
	})
	assert.NoError(t, err)

	pool, err := beszelTests.CreateRecord(hub, "zfs_pools", map[string]any{
		"system": system.Id,
		"name":   "tank",
		"health": "ONLINE",
	})
	assert.NoError(t, err)

	pool, err = hub.FindRecordById("zfs_pools", pool.Id)
	assert.NoError(t, err)
	pool.Set("health", "DEGRADED")
	assert.NoError(t, hub.Save(pool))

	time.Sleep(50 * time.Millisecond)

	require.EqualValues(t, 1, hub.TestMailer.TotalSend(), "should have 1 email sent")
	lastMessage := hub.TestMailer.LastMessage()
	assert.Contains(t, lastMessage.Subject, "存储池 tank(test-system)已降级")
	assert.Contains(t, lastMessage.Text, "健康状态从 在线 变更为 已降级")
}
