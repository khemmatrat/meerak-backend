package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/aqond/aqond-v2/pkg/config"
)

func (a *orderApp) notifyDual(ctx context.Context, recipientID, templateKey string, payload map[string]string) {
	if recipientID == "" || recipientID == "*" {
		return
	}
	base := strings.TrimRight(config.Get("NOTIFICATION_URL", "http://notification-svc:8131"), "/")
	for _, ch := range []string{"push", "line"} {
		body, _ := json.Marshal(map[string]any{
			"recipient_id":    recipientID,
			"region":          "TH",
			"locale":          "th-TH",
			"channel":         ch,
			"template_key":    templateKey,
			"payload":         payload,
			"consent_purpose": "transactional",
		})
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/v1/notify", bytes.NewReader(body))
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := a.httpClient.Do(req)
		if err != nil {
			log.Printf("notify %s %s err: %v", templateKey, ch, err)
			continue
		}
		resp.Body.Close()
	}
}

func (a *orderApp) merchantOwnerID(ctx context.Context, merchantID string) string {
	var owner string
	_ = a.writePool.QueryRow(ctx, `SELECT owner_id FROM commerce.merchant_shops WHERE id=$1`, merchantID).Scan(&owner)
	if owner == "*" || owner == "" {
		return ""
	}
	return owner
}

func (a *orderApp) notifyMerchantNewOrder(ctx context.Context, merchantID, orderID, merchantName string) {
	owner := a.merchantOwnerID(ctx, merchantID)
	if owner == "" {
		return
	}
	payload := map[string]string{
		"order_id":      orderID,
		"merchant_name": merchantName,
		"url":           "/m/merchant/orders",
	}
	a.notifyDual(ctx, owner, "merchant_new_order", payload)
}

func (a *orderApp) notifyOrderPaid(ctx context.Context, buyerID, orderID, paysoRef string) {
	payload := map[string]string{
		"order_id":           orderID,
		"payso_reference_id": paysoRef,
		"url":                "/m/orders",
	}
	a.notifyDual(ctx, buyerID, "order_paid", payload)
}
