package main

import (
	"math"
	"os"
	"sort"
	"strconv"
)

// Strategy B scoring weights — tunable via env (proposed defaults, not final).
// DISPATCH_W_DISTANCE, DISPATCH_W_TRAVEL, DISPATCH_W_RATING,
// DISPATCH_W_ACCEPTANCE, DISPATCH_W_DIRECTION, DISPATCH_W_LOAD
type dispatchWeights struct {
	Distance   float64
	Travel     float64
	Rating     float64
	Acceptance float64
	Direction  float64
	Load       float64
}

func envFloat(key string, def float64) float64 {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.ParseFloat(v, 64)
	if err != nil || n < 0 {
		return def
	}
	return n
}

func loadDispatchWeights() dispatchWeights {
	return dispatchWeights{
		Distance:   envFloat("DISPATCH_W_DISTANCE", 0.35),
		Travel:     envFloat("DISPATCH_W_TRAVEL", 0.20),
		Rating:     envFloat("DISPATCH_W_RATING", 0.15),
		Acceptance: envFloat("DISPATCH_W_ACCEPTANCE", 0.10),
		Direction:  envFloat("DISPATCH_W_DIRECTION", 0.10),
		Load:       envFloat("DISPATCH_W_LOAD", 0.10),
	}
}

// scoreRider returns higher = better match for pickup at (pickupLat, pickupLng).
func scoreRider(r riderRow, pickupLat, pickupLng float64, w dispatchWeights) float64 {
	distKm := 999.0
	if r.Lat != nil && r.Lng != nil {
		distKm = haversineKm(pickupLat, pickupLng, *r.Lat, *r.Lng)
	}

	// Proximity: inverse distance (Strategy B w1)
	distScore := 1.0 / (1.0 + distKm)

	// Travel time proxy without traffic API (w2) — ~30 km/h urban
	travelMin := (distKm / 30.0) * 60.0
	travelScore := 1.0 / (1.0 + travelMin/10.0)

	ratingScore := r.Rating / 5.0
	if ratingScore > 1 {
		ratingScore = 1
	}
	if ratingScore < 0 {
		ratingScore = 0
	}

	// Acceptance rate not in dispatch_riders yet — grade-based proxy (w4).
	// New/ungraded riders get a neutral default (== silver) so cold-start does not
	// starve them below bronze. Real acceptance_rate should replace this proxy later.
	acceptScore := 0.85
	switch r.Grade {
	case "platinum", "gold":
		acceptScore = 0.95
	case "silver":
		acceptScore = 0.85
	case "bronze":
		acceptScore = 0.75
	}

	// Direction alignment (w5) — placeholder until heading telemetry ships
	dirScore := 0.5

	loadPenalty := float64(r.LoadCount) * 0.12

	return w.Distance*distScore +
		w.Travel*travelScore +
		w.Rating*ratingScore +
		w.Acceptance*acceptScore +
		w.Direction*dirScore -
		w.Load*loadPenalty
}

type scoredRider struct {
	ID    string
	Score float64
	Dist  float64
}

func pickBestRiderScored(riders []riderRow, lat, lng float64) string {
	ranked := rankRidersScored(riders, lat, lng, 1)
	if len(ranked) == 0 {
		return ""
	}
	return ranked[0]
}

// rankRidersScored returns rider IDs best-first (Strategy B), capped at limit.
func rankRidersScored(riders []riderRow, lat, lng float64, limit int) []string {
	if len(riders) == 0 || limit <= 0 {
		return nil
	}
	w := loadDispatchWeights()
	scored := make([]scoredRider, 0, len(riders))
	for _, r := range riders {
		dist := 999.0
		if r.Lat != nil && r.Lng != nil {
			dist = haversineKm(lat, lng, *r.Lat, *r.Lng)
		}
		scored = append(scored, scoredRider{
			ID:    r.ID,
			Score: scoreRider(r, lat, lng, w),
			Dist:  dist,
		})
	}
	sort.Slice(scored, func(i, j int) bool {
		if math.Abs(scored[i].Score-scored[j].Score) > 0.0001 {
			return scored[i].Score > scored[j].Score
		}
		return scored[i].Dist < scored[j].Dist
	})
	out := make([]string, 0, limit)
	for i, s := range scored {
		if i >= limit {
			break
		}
		out = append(out, s.ID)
	}
	return out
}
