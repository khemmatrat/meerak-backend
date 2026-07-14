package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
)

func (a *app) notifyURL() string {
	url := strings.TrimRight(os.Getenv("NOTIFICATION_URL"), "/")
	if url == "" {
		url = "http://notification-svc:8131"
	}
	return url
}

func (a *app) notifyUser(ctx context.Context, userID, templateKey string, payload map[string]string) {
	if userID == "" || userID == "*" {
		return
	}
	for _, ch := range []string{"push", "line"} {
		body, _ := json.Marshal(map[string]any{
			"recipient_id":    userID,
			"region":          "TH",
			"locale":          "th-TH",
			"channel":         ch,
			"template_key":    templateKey,
			"payload":         payload,
			"consent_purpose": "transactional",
		})
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.notifyURL()+"/v1/notify", bytes.NewReader(body))
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := a.http.Do(req)
		if err != nil {
			continue
		}
		resp.Body.Close()
	}
}

func (a *app) merchantOwnerID(ctx context.Context, merchantID string) string {
	var owner string
	_ = a.pool.QueryRow(ctx, `SELECT owner_id FROM commerce.merchant_shops WHERE id=$1`, merchantID).Scan(&owner)
	if owner == "*" || owner == "" {
		return ""
	}
	return owner
}

func (a *app) riderUserID(ctx context.Context, riderID string) string {
	if riderID == "" {
		return ""
	}
	var uid string
	_ = a.pool.QueryRow(ctx, `SELECT COALESCE(user_id,'') FROM commerce.dispatch_riders WHERE id=$1`, riderID).Scan(&uid)
	return uid
}

func (a *app) notifyPayload(j jobRow) map[string]string {
	return map[string]string{
		"order_id":      j.OrderID,
		"merchant_name": j.MerchantName,
		"url":           "/m/food/track/" + j.OrderID,
	}
}

func (a *app) riderJobPayload(j jobRow) map[string]string {
	p := a.notifyPayload(j)
	p["url"] = "/m/rider/jobs"
	return p
}

func (a *app) firePhaseNotifications(ctx context.Context, j jobRow, phase string) {
	payload := a.notifyPayload(j)
	switch phase {
	case "finding_rider":
		a.notifyUser(ctx, j.BuyerID, "dispatch_job_created", payload)
		a.broadcastRiderJobAvailable(ctx, j)
	case "merchant_preparing":
		a.notifyUser(ctx, j.BuyerID, "merchant_preparing", payload)
	case "food_ready":
		a.notifyUser(ctx, j.BuyerID, "food_ready", payload)
		if j.RiderID == "" {
			a.broadcastRiderJobAvailable(ctx, j)
		}
	case "rider_assigned":
		a.notifyUser(ctx, j.BuyerID, "rider_assigned", payload)
		if uid := a.riderUserID(ctx, j.RiderID); uid != "" {
			a.notifyUser(ctx, uid, "rider_new_job", a.riderJobPayload(j))
		}
	case "pending_accept":
		if uid := a.riderUserID(ctx, j.RiderID); uid != "" {
			a.notifyUser(ctx, uid, "rider_new_job", a.riderJobPayload(j))
		}
	case "rider_picked_up":
		a.notifyUser(ctx, j.BuyerID, "rider_picked_up", payload)
	case "en_route":
		a.notifyUser(ctx, j.BuyerID, "rider_en_route", payload)
	case "arrived", "approaching":
		a.notifyUser(ctx, j.BuyerID, "rider_arrived", payload)
	case "rider_completed", "review_pending", "completed":
		a.notifyUser(ctx, j.BuyerID, "order_delivered", payload)
	}
}

func (a *app) broadcastRiderJobAvailable(ctx context.Context, j jobRow) {
	rows, err := a.pool.Query(ctx, `
		SELECT COALESCE(user_id,'') FROM commerce.dispatch_riders
		WHERE active=TRUE AND suspended=FALSE AND COALESCE(user_id,'') <> ''`)
	if err != nil {
		return
	}
	defer rows.Close()
	payload := a.riderJobPayload(j)
	for rows.Next() {
		var uid string
		if rows.Scan(&uid) == nil && uid != "" && uid != j.RiderID {
			a.notifyUser(ctx, uid, "rider_new_job", payload)
		}
	}
}

func fulfillmentToPhase(f string) string {
	switch f {
	case "preparing":
		return "merchant_preparing"
	case "ready":
		return "food_ready"
	case "shipped":
		return "rider_picked_up"
	case "accepted":
		return "finding_rider"
	default:
		return ""
	}
}
