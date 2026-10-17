package systems

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// Ensures the manual flag survives a fresh record load from the DB, so hub
// restarts don't re-geocode manually placed systems.
func TestLocationMapReadsManualFlag(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	collection, err := app.FindCachedCollectionByNameOrId("systems")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("name", "test")
	record.Set("location", map[string]any{"manual": true, "lat": 1.5, "lng": 2.5, "cc": "DE"})
	if err := app.SaveNoValidate(record); err != nil {
		t.Fatal(err)
	}
	loaded, err := app.FindRecordById("systems", record.Id)
	if err != nil {
		t.Fatal(err)
	}

	location := locationMap(loaded)
	if location == nil {
		t.Fatal("locationMap returned nil")
	}
	if manual, _ := location["manual"].(bool); !manual {
		t.Fatalf("expected manual=true, got %#v", location)
	}
}
