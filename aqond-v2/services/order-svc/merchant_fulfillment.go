package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/ulid"
)

// Merchant fulfillment workflow (Phase 2).
var fulfillmentTransitions = map[string][]string{
	"pending_accept": {"accepted", "rejected"},
	"pending_ship":   {"accepted", "rejected"},
	"accepted":       {"preparing", "rejected"},
	"preparing":      {"ready", "rejected"},
	"ready":          {"shipped", "rejected"},
	"shipped":        {"delivered"},
	"delivered":      {},
	"rejected":       {},
}

func canTransition(from, to string) bool {
	if from == to {
		return true
	}
	allowed, ok := fulfillmentTransitions[from]
	if !ok {
		allowed = fulfillmentTransitions["pending_ship"]
	}
	for _, s := range allowed {
		if s == to {
			return true
		}
	}
	return false
}

func (a *orderApp) listMerchantOrders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		http.Error(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	limit := config.Int("MERCHANT_ORDER_LIMIT", 50)
	rows, err := a.readPool.Query(r.Context(), `
		SELECT id, buyer_id, status, fulfillment_status, amount_micro, created_at, metadata
		FROM commerce.orders
		WHERE merchant_id=$1 AND status NOT IN ('rejected','cancelled')
		ORDER BY created_at DESC LIMIT $2`, merchantID, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	orders := []map[string]any{}
	for rows.Next() {
		var id, buyerID, status, fulfillment string
		var amount int64
		var created any
		var meta []byte
		if rows.Scan(&id, &buyerID, &status, &fulfillment, &amount, &created, &meta) == nil {
			o := flattenOrderFromMeta(id, status, amount, created, meta)
			o["buyer_id"] = buyerID
			o["fulfillment_status"] = fulfillment
			orders = append(orders, o)
		}
	}
	jsonOK(w, map[string]any{"merchant_id": merchantID, "orders": orders, "count": len(orders)})
}

func (a *orderApp) orderSubroutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/orders/")
	if path == "" {
		http.NotFound(w, r)
		return
	}
	if path == "merchant" {
		a.listMerchantOrders(w, r)
		return
	}
	if strings.HasSuffix(path, "/fulfillment") {
		orderID := strings.TrimSuffix(path, "/fulfillment")
		if r.Method == http.MethodPost || r.Method == http.MethodPatch {
			a.updateFulfillment(w, r, orderID)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	a.getOrderDetail(w, r, path)
}

func (a *orderApp) updateFulfillment(w http.ResponseWriter, r *http.Request, orderID string) {
	var body struct {
		Status     string `json:"status"`
		Note       string `json:"note"`
		Actor      string `json:"actor"`
		TrackingNo string `json:"tracking_no"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Status == "" {
		http.Error(w, "status required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var curStatus, fulfillment, merchantID string
	var meta []byte
	err := a.writePool.QueryRow(ctx, `
		SELECT status, fulfillment_status, merchant_id, metadata
		FROM commerce.orders WHERE id=$1`, orderID).
		Scan(&curStatus, &fulfillment, &merchantID, &meta)
	if err != nil {
		http.Error(w, "order_not_found", http.StatusNotFound)
		return
	}
	if curStatus == "rejected" || curStatus == "cancelled" {
		http.Error(w, "order_closed", http.StatusConflict)
		return
	}
	from := fulfillment
	if from == "" {
		from = "pending_accept"
	}
	if !canTransition(from, body.Status) {
		http.Error(w, fmt.Sprintf("invalid_transition:%s->%s", from, body.Status), http.StatusConflict)
		return
	}

	metaPatch := map[string]any{
		"fulfillment_updated_at": time.Now().UTC().Format(time.RFC3339),
		"fulfillment_actor":        body.Actor,
	}
	if body.TrackingNo != "" {
		metaPatch["tracking_no"] = body.TrackingNo
	}
	if body.Note != "" {
		metaPatch["fulfillment_note"] = body.Note
	}
	patchJSON, _ := json.Marshal(metaPatch)

	orderStatus := curStatus
	if body.Status == "rejected" {
		orderStatus = "cancelled"
	}

	_, err = a.writePool.Exec(ctx, `
		UPDATE commerce.orders
		SET fulfillment_status=$2, status=$3, metadata = metadata || $4::jsonb, updated_at=NOW()
		WHERE id=$1`,
		orderID, body.Status, orderStatus, patchJSON)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	evID := ulid.New()
	_, _ = a.writePool.Exec(ctx, `
		INSERT INTO commerce.fulfillment_events (id, order_id, status, note)
		VALUES ($1,$2,$3,$4)`, evID, orderID, body.Status, body.Note)

	if body.Status == "delivered" {
		a.onOrderDelivered(ctx, orderID, meta)
	}

	jsonOK(w, map[string]any{
		"order_id": orderID, "fulfillment_status": body.Status, "status": orderStatus, "updated": true,
	})
}

func (a *orderApp) onOrderDelivered(ctx context.Context, orderID string, meta []byte) {
	var md map[string]any
	_ = json.Unmarshal(meta, &md)
	intentID, _ := md["intent_id"].(string)
	method, _ := md["payment_method"].(string)
	if method == "" {
		method, _ = md["method"].(string)
	}
	if intentID == "" || method != "cod" {
		return
	}
	paymentURL := config.Get("PAYMENT_SERVICE_URL", "http://payment-svc:8120")
	payload, _ := json.Marshal(map[string]any{
		"intent_id":       intentID,
		"event":           "cod_delivered",
		"idempotency_key": "cod-del-" + orderID,
	})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, paymentURL+"/v1/webhooks/cod", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	res, err := a.httpClient.Do(req)
	if err != nil {
		return
	}
	res.Body.Close()
}
