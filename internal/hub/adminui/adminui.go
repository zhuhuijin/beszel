// Package adminui registers a Chinese localization extension for the PocketBase superuser UI (/_/).
package adminui

import (
	"embed"

	"github.com/pocketbase/pocketbase/core"
)

//go:embed main.js
var files embed.FS

// Register appends the localization extension so the admin UI auto-loads its main.js
// via /_/extensions.js. Translation is applied at runtime by the script itself.
func Register(se *core.ServeEvent) {
	se.UIExtensions = append(se.UIExtensions, core.UIExtension{
		Name: "zh-admin",
		FS:   files,
	})
	// PocketBase serves /_/extensions.js with a 14-day immutable-style Cache-Control,
	// which would keep browsers on a stale dictionary after an upgrade. Setting the
	// header first works because the built-in middleware only sets it when empty.
	se.Router.BindFunc(func(e *core.RequestEvent) error {
		if e.Request.URL.Path == "/_/extensions.js" {
			e.Response.Header().Set("Cache-Control", "no-cache")
		}
		return e.Next()
	})
}
