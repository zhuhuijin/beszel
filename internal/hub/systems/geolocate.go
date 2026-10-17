package systems

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/henrygd/beszel/internal/hub/expirymap"
	"github.com/henrygd/beszel/internal/hub/utils"
	"github.com/pocketbase/pocketbase/core"
)

const (
	// defaultGeoURL is the free, keyless HTTPS geolocation provider used by default.
	defaultGeoURL = "https://ipwho.is/{ip}"
	// fallbackGeoURL is tried when the default provider fails (rate limit, outage).
	fallbackGeoURL = "https://freeipapi.com/api/json/{ip}"
	// geoTimeout bounds each geocoder HTTP request and DNS lookup.
	geoTimeout = 5 * time.Second
	// geoQueueSize bounds pending geocode requests; excess requests are dropped.
	geoQueueSize = 512
)

// geoRequest is a queued geocode job for a system. Either ip is provided directly
// (connection-derived) or host must be resolved first (record-derived).
type geoRequest struct {
	systemId string
	ip       string
	host     string
}

// geoQueue serializes geocode work so external providers are never burst-called.
var geoQueue = struct {
	once  sync.Once
	queue chan geoRequest
}{queue: make(chan geoRequest, geoQueueSize)}

// geolocationDisabled reports whether geolocation was turned off via env var.
func geolocationDisabled() bool {
	disabled, _ := utils.GetEnv("GEOLOCATION_DISABLED")
	return strings.EqualFold(disabled, "true")
}

// geoURL returns the configured geocoder URL template, defaulting to ipwho.is.
func geoURL() string {
	url, _ := utils.GetEnv("GEOLOCATION_URL")
	if url == "" {
		return defaultGeoURL
	}
	return url
}

// isPublicIP reports whether the IP is usable for geolocation
// (neither loopback, private, link-local, nor unspecified).
func isPublicIP(ip net.IP) bool {
	return ip != nil && !ip.IsLoopback() && !ip.IsPrivate() && !ip.IsLinkLocalUnicast() && !ip.IsUnspecified()
}

// isGeolocatable parses an IP string and reports whether it is a public address.
func isGeolocatable(ip string) bool {
	return isPublicIP(net.ParseIP(strings.TrimSpace(ip)))
}

// enqueueGeoRequest starts the worker on first use and drops requests when the queue is full.
func (sm *SystemManager) enqueueGeoRequest(request geoRequest) {
	if geolocationDisabled() {
		return
	}
	geoQueue.once.Do(func() {
		go runGeoQueue(sm.hub, sm.ctx, geoQueue.queue)
	})
	select {
	case geoQueue.queue <- request:
	default:
		slog.Debug("Geocode queue full, dropping request", "system", request.systemId)
	}
}

// runGeoQueue processes geocode requests one at a time until the app context is cancelled.
func runGeoQueue(app core.App, ctx context.Context, queue chan geoRequest) {
	resolvedHosts := expirymap.New[string](time.Hour)
	defer resolvedHosts.StopCleaner()
	for {
		select {
		case request := <-queue:
			processGeoRequest(app, request, resolvedHosts)
		case <-ctx.Done():
			return
		}
	}
}

// processGeoRequest resolves, geocodes, and persists the location for a single request.
func processGeoRequest(app core.App, request geoRequest, resolvedHosts *expirymap.ExpiryMap[string]) {
	ip := request.ip
	if ip == "" && request.host != "" {
		ip = resolveHost(request.host, resolvedHosts)
		if ip == "" {
			return
		}
	}
	if !isGeolocatable(ip) {
		return
	}
	if err := geocodeSystem(app, request.systemId, ip); err != nil {
		slog.Warn("Geocode failed", "system", request.systemId, "ip", ip, "err", err)
	}
}

// geocodeSystem skips systems that are already located at this IP or were set
// manually, then queries the geocoder and saves the resulting location.
func geocodeSystem(app core.App, systemId string, ip string) error {
	record, err := app.FindRecordById("systems", systemId)
	if err != nil {
		return err
	}
	location := locationMap(record)
	if manual, _ := location["manual"].(bool); manual {
		return nil
	}
	if previousIP, _ := location["ip"].(string); previousIP == ip && location["lat"] != nil && location["cc"] != nil {
		return nil
	}
	result, err := geocodeIP(ip)
	if err != nil {
		return err
	}
	result.city = normalizeCity(result.city)
	location["lat"] = result.lat
	location["lng"] = result.lng
	location["ip"] = ip
	if result.city != "" {
		location["city"] = result.city
	}
	if result.country != "" {
		location["country"] = result.country
	}
	if result.cc != "" {
		location["cc"] = result.cc
	}
	location["manual"] = false
	location["updated"] = time.Now().UTC().Format(time.RFC3339)
	record.Set("location", location)
	if err := app.SaveNoValidate(record); err != nil {
		slog.Warn("Failed to save system location", "system", systemId, "err", err)
		return err
	}
	slog.Info("System geocoded", "system", systemId, "ip", ip, "city", result.city, "country", result.country)
	return nil
}

// resolveHost converts a host field into a public IP, caching results for an hour.
func resolveHost(host string, resolvedHosts *expirymap.ExpiryMap[string]) string {
	host = strings.TrimSpace(host)
	if isGeolocatable(host) {
		return host
	}
	if ip, ok := resolvedHosts.GetOk(host); ok {
		return ip
	}
	ctx, cancel := context.WithTimeout(context.Background(), geoTimeout)
	defer cancel()
	addrs, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	ip := ""
	if err == nil {
		for _, addr := range addrs {
			if isPublicIP(addr.IP) {
				ip = addr.IP.String()
				break
			}
		}
	}
	resolvedHosts.Set(host, ip, time.Hour)
	return ip
}

// geoResult holds the fields persisted into the systems.location JSON field.
type geoResult struct {
	lat     float64
	lng     float64
	city    string
	country string
	cc      string
}

// geocodeIP queries the configured geolocation provider for the given IP.
// Custom GEOLOCATION_URL templates are expected to return ipwho.is-compatible JSON.
// With the default provider, a secondary free provider is tried on failure
// (rate limit, outage) so geocoding degrades gracefully.
func geocodeIP(ip string) (geoResult, error) {
	template := geoURL()
	url := strings.ReplaceAll(template, "{ip}", ip)
	result, err := fetchGeo(url)
	if err != nil && template == defaultGeoURL {
		result, err = fetchGeo(strings.ReplaceAll(fallbackGeoURL, "{ip}", ip))
	}
	return result, err
}

// fetchGeo queries one geolocation provider and normalizes the response.
// Both ipwho.is and freeipapi-style field names are accepted.
func fetchGeo(url string) (geoResult, error) {
	var result geoResult
	client := &http.Client{Timeout: geoTimeout}
	resp, err := client.Get(url)
	if err != nil {
		return result, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return result, fmt.Errorf("geocoder returned status %d", resp.StatusCode)
	}
	var body struct {
		Success     bool    `json:"success"`
		Latitude    float64 `json:"latitude"`
		Longitude   float64 `json:"longitude"`
		City        string  `json:"city"`
		Country     string  `json:"country"`
		CountryCode string  `json:"country_code"`
		CityName    string  `json:"cityName"`
		CountryName string  `json:"countryName"`
		CC2         string  `json:"countryCode"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return result, err
	}
	// ipwho.is signals failures via "success": false; treat missing coordinates as failure
	if !body.Success && body.Latitude == 0 && body.Longitude == 0 {
		return result, fmt.Errorf("geocoder could not locate ip")
	}
	city := body.City
	if city == "" || city == "-" {
		city = body.CityName
	}
	country := body.Country
	if country == "" || country == "-" {
		country = body.CountryName
	}
	cc := body.CountryCode
	if cc == "" {
		cc = body.CC2
	}
	result.lat = body.Latitude
	result.lng = body.Longitude
	result.city = city
	result.country = country
	result.cc = cc
	return result, nil
}

// normalizeCity strips provider quirks from city names so labels stay compact:
// "Munich (Moosach)" -> "Munich", "X, Region" -> "X".
func normalizeCity(city string) string {
	if idx := strings.IndexAny(city, "(,·/"); idx >= 0 {
		city = city[:idx]
	}
	return strings.TrimSpace(city)
}

// locationMap extracts the systems.location JSON field as a mutable map.
// Record.Get returns the raw JSON string on fresh loads, so it must be
// unmarshalled explicitly (a plain type assertion returns nil).
func locationMap(record *core.Record) map[string]any {
	location := map[string]any{}
	if err := record.UnmarshalJSONField("location", &location); err != nil {
		slog.Warn("Failed to unmarshal system location", "system", record.Id, "err", err)
	}
	return location
}
