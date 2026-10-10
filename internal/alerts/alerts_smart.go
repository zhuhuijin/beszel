package alerts

import (
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// handleSmartDeviceAlert sends alerts when a SMART device state worsens into WARNING/FAILED.
// This is automatic and does not require user opt-in.
func (am *AlertManager) handleSmartDeviceAlert(e *core.RecordEvent) error {
	oldState := e.Record.Original().GetString("state")
	newState := e.Record.GetString("state")

	if !shouldSendSmartDeviceAlert(oldState, newState) {
		return e.Next()
	}

	systemID := e.Record.GetString("system")
	if systemID == "" {
		return e.Next()
	}

	// Fetch the system record to get the name and users
	systemRecord, err := e.App.FindRecordById("systems", systemID)
	if err != nil {
		e.App.Logger().Error("Failed to find system for SMART alert", "err", err, "systemID", systemID)
		return e.Next()
	}

	systemName := systemRecord.GetString("name")
	deviceName := e.Record.GetString("name")
	model := e.Record.GetString("model")
	emoji := smartStateEmoji(newState)

	// Get users associated with the system
	userIDs := systemRecord.GetStringSlice("users")
	if len(userIDs) == 0 {
		return e.Next()
	}

	// Send alert to each user
	for _, userID := range userIDs {
		s := notificationStringsFor(userNotificationLang(e.App, userID))
		statusLabel := s.smartStateLabel(newState)

		// Build alert message
		title := fmt.Sprintf(s.smartTitle, statusLabel, systemName, deviceName, emoji)
		var message string
		if model != "" {
			message = fmt.Sprintf(s.smartBodyModel, deviceName, model, s.smartStateName(newState))
		} else {
			message = fmt.Sprintf(s.smartBody, deviceName, s.smartStateName(newState))
		}

		if err := am.SendAlert(AlertMessageData{
			UserID:   userID,
			SystemID: systemID,
			Title:    title,
			Message:  message,
			Link:     am.hub.MakeLink("system", systemID),
			LinkText: fmt.Sprintf(s.viewSystem, systemName),
		}); err != nil {
			e.App.Logger().Error("Failed to send SMART alert", "err", err, "userID", userID)
		}
	}

	return e.Next()
}

func shouldSendSmartDeviceAlert(oldState, newState string) bool {
	oldSeverity := smartStateSeverity(oldState)
	newSeverity := smartStateSeverity(newState)

	// Ignore unknown states and recoveries; only alert on worsening transitions
	// from known-good/degraded states into WARNING/FAILED.
	return oldSeverity >= 1 && newSeverity > oldSeverity
}

func smartStateSeverity(state string) int {
	switch state {
	case "PASSED":
		return 1
	case "WARNING":
		return 2
	case "FAILED":
		return 3
	default:
		return 0
	}
}

func smartStateEmoji(state string) string {
	switch state {
	case "WARNING":
		return "\U0001F7E0"
	default:
		return "\U0001F534"
	}
}

// smartStateLabel returns the localized SMART state label used in alert titles.
// English keeps the original behavior: "failure" for FAILED, lowercase otherwise.
func (s notificationStrings) smartStateLabel(state string) string {
	if s.smartStateLabels != nil {
		if label, ok := s.smartStateLabels[state]; ok {
			return label
		}
		return strings.ToLower(state)
	}
	if state == "FAILED" {
		return "failure"
	}
	return strings.ToLower(state)
}

// smartStateName returns the localized SMART state for alert bodies.
// English keeps the raw state value.
func (s notificationStrings) smartStateName(state string) string {
	if label, ok := s.smartStateLabels[state]; ok {
		return label
	}
	return state
}
