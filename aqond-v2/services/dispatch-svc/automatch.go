package main

import (
	"context"
	"encoding/json"
	"os"
)

func (a *app) loadActiveRiders(ctx context.Context) []riderRow {
	rows, err := a.pool.Query(ctx, `
		SELECT id, display_name, phone, vehicle, plate, rating, review_count, grade,
		       lat, lng, load_count,
		       COALESCE(kyc_status, 'pending'), COALESCE(suspended, FALSE)
		FROM commerce.dispatch_riders
		WHERE active=TRUE AND COALESCE(suspended, FALSE)=FALSE`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []riderRow
	for rows.Next() {
		var r riderRow
		r.MaxLoad = 3
		if rows.Scan(&r.ID, &r.DisplayName, &r.Phone, &r.Vehicle, &r.Plate, &r.Rating, &r.ReviewCount,
			&r.Grade, &r.Lat, &r.Lng, &r.LoadCount, &r.KycStatus, &r.Suspended) == nil {
			out = append(out, r)
		}
	}
	return out
}

func (a *app) autoMatchJob(ctx context.Context, jobID string, pickupLat, pickupLng float64) {
	a.autoMatchJobExcluding(ctx, jobID, pickupLat, pickupLng, "")
}

func (a *app) autoMatchJobExcluding(ctx context.Context, jobID string, pickupLat, pickupLng float64, excludeRiderID string) {
	if os.Getenv("DISPATCH_AUTO_MATCH") == "0" {
		return
	}
	if sequentialOfferEnabled() {
		a.startSequentialOffer(ctx, jobID, excludeRiderID)
		return
	}
	a.legacyAutoMatchJob(ctx, jobID, pickupLat, pickupLng, excludeRiderID)
}

func (a *app) legacyAutoMatchJob(ctx context.Context, jobID string, pickupLat, pickupLng float64, excludeRiderID string) {
	j, _ := a.loadJob(ctx, jobID)
	if j.ID == "" {
		j.PickupLat = pickupLat
		j.PickupLng = pickupLng
	}
	riders := a.loadActiveRiders(ctx)
	if excludeRiderID != "" {
		filtered := riders[:0]
		for _, r := range riders {
			if r.ID != excludeRiderID {
				filtered = append(filtered, r)
			}
		}
		riders = filtered
	}
	riderID, _ := a.pickBestRiderWithRadiusExpand(ctx, riders, j)
	if riderID == "" {
		a.logEvent(ctx, jobID, "finding_rider", "system", "no_rider_in_radius", nil, nil)
		return
	}
	_ = a.assignPendingOffer(ctx, jobID, riderID)
}

func (a *app) pushTracking(ctx context.Context, orderID string) {
	j, err := a.loadJobByOrder(ctx, orderID)
	if err != nil {
		return
	}
	rider, _ := a.loadRider(ctx, j.RiderID)
	hasReview, _ := a.hasReview(ctx, orderID)
	chats, _ := a.loadChat(ctx, orderID)
	view := buildTrackingView(j, rider, hasReview, chats)
	payload := map[string]any{"type": "update", "order_id": orderID, "tracking": view}
	raw, _ := json.Marshal(payload)
	a.wsHub.broadcast(orderID, raw)
	a.publishTrackUpdate(ctx, orderID, payload)
}
