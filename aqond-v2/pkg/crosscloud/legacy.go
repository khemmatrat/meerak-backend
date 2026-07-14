// Package crosscloud — HTTP/Redis bridges between Cloud 1 (Kong), Cloud 2 (legacy meerak), Cloud 3 (v2).
package crosscloud

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
)

// LegacyBase returns Kong loopback (preferred) or direct Cloud 2 backend URL.
func LegacyBase() string {
	if u := strings.TrimSpace(config.Get("KONG_INTERNAL_URL", "")); u != "" {
		return strings.TrimRight(u, "/")
	}
	if u := strings.TrimSpace(config.Get("CLOUD2_BACKEND_URL", "")); u != "" {
		return strings.TrimRight(u, "/")
	}
	return strings.TrimRight(config.Get("MEERAK_BACKEND_URL", "http://host.docker.internal:3001"), "/")
}

// GetJSON performs GET {base}{path} and decodes JSON into out (map or slice target).
func GetJSON(ctx context.Context, path string, headers map[string]string, out any) error {
	base := LegacyBase()
	if base == "" {
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+path, nil)
	if err != nil {
		return err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return &HTTPError{Status: resp.StatusCode, Body: string(b)}
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// PostJSON performs POST {base}{path} with JSON body; ignores response body on 2xx.
func PostJSON(ctx context.Context, path string, headers map[string]string, body any) (int, error) {
	base := LegacyBase()
	if base == "" {
		return 0, fmt.Errorf("legacy base url not configured")
	}
	b, err := json.Marshal(body)
	if err != nil {
		return 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+path, strings.NewReader(string(b)))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(resp.Body)
	return resp.StatusCode, nil
}

// ForwardOrderToV1Match posts order.ready payload to legacy MatchJob (Cloud 2 via Kong loopback).
func ForwardOrderToV1Match(ctx context.Context, ev OrderReadyEvent) (int, error) {
	return PostJSON(ctx, "/api/jobs/match", map[string]string{
		"X-Aqond-Region": "TH",
	}, map[string]any{
		"order_id":     ev.OrderID,
		"merchant_id":  ev.MerchantID,
		"buyer_id":     ev.BuyerID,
		"job_type":     ev.JobType,
		"amount_micro": ev.AmountMicro,
		"pickup":       map[string]float64{"lat": ev.PickupLat, "lng": ev.PickupLng},
		"dropoff":      map[string]float64{"lat": ev.DropoffLat, "lng": ev.DropoffLng},
		"source":       "aqond-v2-dispatch",
	})
}

type HTTPError struct {
	Status int
	Body   string
}

func (e *HTTPError) Error() string {
	return http.StatusText(e.Status) + ": " + e.Body
}

// FetchAdsSearchPromo loads sponsored placement from legacy /api/ads/placements/search.
func FetchAdsSearchPromo(ctx context.Context, sessionID, authBearer string) map[string]any {
	headers := map[string]string{"X-Session-Id": sessionID}
	if authBearer != "" {
		headers["Authorization"] = authBearer
	}
	var out map[string]any
	if err := GetJSON(ctx, "/api/ads/placements/search", headers, &out); err != nil || out == nil {
		return nil
	}
	return out
}
