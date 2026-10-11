//go:build testing

package systems

import (
	"testing"

	"github.com/henrygd/beszel/internal/entities/system"
	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCumulativeNetworkTotals(t *testing.T) {
	getInfo := func(t *testing.T, app core.App, systemId string) system.Info {
		t.Helper()
		record, err := app.FindRecordById("systems", systemId)
		require.NoError(t, err)
		var info system.Info
		require.NoError(t, record.UnmarshalJSONField("info", &info))
		return info
	}

	t.Run("seeds from first snapshot and accumulates deltas", func(t *testing.T) {
		sys, app := newTestSystemWithHub(t)

		// first poll: total is seeded from the raw NIC counters
		_, err := sys.CreateRecords(&system.CombinedData{Stats: system.Stats{NetIOTotal: [2]uint64{1000, 2000}}})
		require.NoError(t, err)
		info := getInfo(t, app, sys.Id)
		assert.Equal(t, [2]uint64{1000, 2000}, info.NetTotal)
		assert.Equal(t, [2]uint64{1000, 2000}, info.NetTotalLast)

		// counters grew: only the delta is added
		_, err = sys.CreateRecords(&system.CombinedData{Stats: system.Stats{NetIOTotal: [2]uint64{1500, 2600}}})
		require.NoError(t, err)
		info = getInfo(t, app, sys.Id)
		assert.Equal(t, [2]uint64{1500, 2600}, info.NetTotal)

		// reboot: counters reset, current values counted as a fresh delta
		_, err = sys.CreateRecords(&system.CombinedData{Stats: system.Stats{NetIOTotal: [2]uint64{100, 200}}})
		require.NoError(t, err)
		info = getInfo(t, app, sys.Id)
		assert.Equal(t, [2]uint64{1600, 2800}, info.NetTotal)

		// identical snapshot: no double counting
		_, err = sys.CreateRecords(&system.CombinedData{Stats: system.Stats{NetIOTotal: [2]uint64{100, 200}}})
		require.NoError(t, err)
		info = getInfo(t, app, sys.Id)
		assert.Equal(t, [2]uint64{1600, 2800}, info.NetTotal)
	})

	t.Run("legacy agent without counters leaves totals unchanged", func(t *testing.T) {
		sys, app := newTestSystemWithHub(t)

		_, err := sys.CreateRecords(&system.CombinedData{Stats: system.Stats{NetIOTotal: [2]uint64{500, 500}}})
		require.NoError(t, err)

		// old agents never report NetIOTotal (all zeros); totals must not grow
		_, err = sys.CreateRecords(&system.CombinedData{})
		require.NoError(t, err)
		info := getInfo(t, app, sys.Id)
		assert.Equal(t, [2]uint64{500, 500}, info.NetTotal)
	})

	t.Run("pausing preserves cumulative totals", func(t *testing.T) {
		sys, app := newTestSystemWithHub(t)

		_, err := sys.CreateRecords(&system.CombinedData{Stats: system.Stats{NetIOTotal: [2]uint64{1000, 2000}}})
		require.NoError(t, err)

		record, err := app.FindRecordById("systems", sys.Id)
		require.NoError(t, err)
		record.Set("status", paused)
		require.NoError(t, sys.manager.onRecordUpdate(&core.RecordEvent{Record: record}))

		var info system.Info
		require.NoError(t, record.UnmarshalJSONField("info", &info))
		assert.Equal(t, [2]uint64{1000, 2000}, info.NetTotal)
		assert.Equal(t, [2]uint64{1000, 2000}, info.NetTotalLast)
	})
}
