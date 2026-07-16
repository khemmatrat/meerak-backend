package main

import (
	"context"
	"math"
	"os"
	"strconv"
	"strings"
)

// Strategy B candidate filter + progressive radius expand (3 → 5 → 8 km default).
// Weights stay in dispatch_score.go (provisional env defaults).

func dispatchRadiusStepsKm() []float64 {
	raw := strings.TrimSpace(os.Getenv("DISPATCH_RADIUS_STEPS_KM"))
	if raw == "" {
		return []float64{3, 5, 8}
	}
	parts := strings.Split(raw, ",")
	out := make([]float64, 0, len(parts))
	for _, p := range parts {
		if n, err := strconv.ParseFloat(strings.TrimSpace(p), 64); err == nil && n > 0 {
			out = append(out, n)
		}
	}
	if len(out) == 0 {
		return []float64{3, 5, 8}
	}
	return out
}

func tierCodLimitMicro(grade string) int64 {
	switch strings.ToLower(strings.TrimSpace(grade)) {
	case "platinum":
		return 2_000_000 // 20,000 THB provisional cap
	case "gold":
		return 1_000_000
	case "silver":
		return 500_000
	default:
		return 200_000
	}
}

func riderDistanceKm(r riderRow, lat, lng float64) float64 {
	if r.Lat == nil || r.Lng == nil {
		return 999
	}
	return haversineKm(lat, lng, *r.Lat, *r.Lng)
}

func isCodJob(j jobRow) bool {
	pm := strings.ToLower(strings.TrimSpace(j.PaymentMethod))
	return pm == "cod" || pm == ""
}

func (a *app) riderCodOutstandingMicro(ctx context.Context, riderID string) int64 {
	var out int64
	err := a.pool.QueryRow(ctx, `
		SELECT COALESCE(outstanding_micro, 0)::bigint
		  FROM commerce.rider_cod_accounts
		 WHERE rider_id = $1`, riderID).Scan(&out)
	if err != nil {
		return 0
	}
	return out
}

func (a *app) riderEligibleForJob(ctx context.Context, r riderRow, j jobRow, maxRadiusKm float64) bool {
	if r.Suspended {
		return false
	}
	ks := strings.ToLower(strings.TrimSpace(r.KycStatus))
	if ks != "" && ks != "approved" && ks != "verified" {
		return false
	}
	if r.LoadCount >= r.MaxLoad && r.MaxLoad > 0 {
		return false
	}
	if riderDistanceKm(r, j.PickupLat, j.PickupLng) > maxRadiusKm {
		return false
	}
	if isCodJob(j) && j.AmountMicro > 0 {
		limit := tierCodLimitMicro(r.Grade)
		outstanding := a.riderCodOutstandingMicro(ctx, r.ID)
		if outstanding+ j.AmountMicro > limit {
			return false
		}
	}
	return true
}

func (a *app) filterCandidates(ctx context.Context, riders []riderRow, j jobRow, maxRadiusKm float64) []riderRow {
	out := make([]riderRow, 0, len(riders))
	for _, r := range riders {
		if a.riderEligibleForJob(ctx, r, j, maxRadiusKm) {
			out = append(out, r)
		}
	}
	return out
}

func pickBestRiderForJob(riders []riderRow, lat, lng float64) string {
	if len(riders) == 0 {
		return ""
	}
	return pickBestRider(riders, lat, lng)
}

// pickBestRiderWithRadiusExpand tries DISPATCH_RADIUS_STEPS_KM in order.
func (a *app) pickBestRiderWithRadiusExpand(ctx context.Context, riders []riderRow, j jobRow) (string, float64) {
	steps := dispatchRadiusStepsKm()
	var bestID string
	var usedRadius float64
	for _, radius := range steps {
		candidates := a.filterCandidates(ctx, riders, j, radius)
		if len(candidates) == 0 {
			continue
		}
		id := pickBestRiderForJob(candidates, j.PickupLat, j.PickupLng)
		if id != "" {
			return id, radius
		}
	}
	// Last resort: score all riders ignoring radius (edge case: no GPS / sparse zone).
	if len(riders) > 0 && bestID == "" {
		id := pickBestRiderForJob(riders, j.PickupLat, j.PickupLng)
		if id != "" {
			return id, steps[len(steps)-1]
		}
	}
	return "", usedRadius
}

func directionScore(riderHeading float64, pickupLat, pickupLng, dropLat, dropLng float64) float64 {
	if math.IsNaN(riderHeading) || riderHeading < 0 {
		return 0.5
	}
	dLon := (dropLng - pickupLng) * math.Pi / 180
	dLat := (dropLat - pickupLat) * math.Pi / 180
	bearing := math.Atan2(dLon, dLat) * 180 / math.Pi
	if bearing < 0 {
		bearing += 360
	}
	diff := math.Abs(bearing-riderHeading) 
	diff = math.Mod(diff, 360)
	if diff > 180 {
		diff = 360 - diff
	}
	return 1.0 - (diff / 180.0)
}
