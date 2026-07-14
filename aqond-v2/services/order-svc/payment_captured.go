package main

import (
	"encoding/json"
	"net/http"
)

type paymentCapturedBody struct {
	OrderID       string `json:"order_id"`
	IntentID      string `json:"intent_id"`
	ProviderRef   string `json:"provider_ref"`
	TransactionID string `json:"transaction_id"`
	AmountMicro   int64  `json:"amount_micro"`
}

func (a *orderApp) paymentCaptured(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body paymentCapturedBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	orderID := body.OrderID
	if orderID == "" && body.IntentID != "" {
		_ = a.writePool.QueryRow(ctx, `
			SELECT id FROM commerce.orders
			WHERE metadata->>'intent_id' = $1
			ORDER BY created_at DESC LIMIT 1`, body.IntentID).Scan(&orderID)
	}
	if orderID == "" {
		http.Error(w, "order_not_found", http.StatusNotFound)
		return
	}
	patch, _ := json.Marshal(map[string]any{
		"payment_status":       "paid",
		"payso_reference_id":   body.ProviderRef,
		"payso_transaction_id": body.TransactionID,
		"paid_amount_micro":    body.AmountMicro,
	})
	tag, err := a.writePool.Exec(ctx, `
		UPDATE commerce.orders
		SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
		WHERE id = $1 AND COALESCE(metadata->>'payment_status','') != 'paid'`,
		orderID, string(patch))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonOK(w, map[string]any{"ok": true, "order_id": orderID, "duplicate": true})
		return
	}
	var buyerID string
	_ = a.writePool.QueryRow(ctx, `SELECT buyer_id FROM commerce.orders WHERE id=$1`, orderID).Scan(&buyerID)
	if buyerID != "" {
		a.notifyOrderPaid(r.Context(), buyerID, orderID, body.ProviderRef)
	}
	jsonOK(w, map[string]any{"ok": true, "order_id": orderID, "payment_status": "paid"})
}
