package main

import (
	"context"
	"encoding/json"
	"os"
)

func (a *app) loadActiveRiders(ctx context.Context) []riderRow {
	rows, err := a.pool.Query(ctx, `
		SELECT id, display_name, phone, vehicle, plate, rating, review_count, grade, lat, lng, load_count
		FROM commerce.dispatch_riders WHERE active=TRUE`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []riderRow
	for rows.Next() {
		var r riderRow
		if rows.Scan(&r.ID, &r.DisplayName, &r.Phone, &r.Vehicle, &r.Plate, &r.Rating, &r.ReviewCount, &r.Grade, &r.Lat, &r.Lng, &r.LoadCount) == nil {
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
	riderID := pickBestRider(riders, pickupLat, pickupLng)
	if riderID == "" {
		return
	}
	_, _ = a.pool.Exec(ctx, `
		UPDATE commerce.dispatch_jobs
		SET rider_id=$2, status='assigned', phase='pending_accept',
		    auto_assigned_at=NOW(), updated_at=NOW()
		WHERE id=$1 AND status IN ('open','assigned') AND phase IN ('finding_rider','pending_accept')`,
		jobID, riderID)
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.dispatch_riders SET load_count = load_count + 1 WHERE id=$1`, riderID)
	a.logEvent(ctx, jobID, "pending_accept", riderID, "auto_match", nil, nil)
	j, _ := a.loadJob(ctx, jobID)
	a.firePhaseNotifications(ctx, j, "pending_accept")
	a.pushTracking(ctx, j.OrderID)
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
