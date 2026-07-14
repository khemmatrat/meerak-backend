package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/outbox"
	"github.com/aqond/aqond-v2/pkg/ulid"
)

// finalizePaysoCapture marks intent captured after PaySo confirms payment.
func (a *app) finalizePaysoCapture(ctx context.Context, in *intent, providerRef, txnID, source string) error {
	if in.Status == "captured" || in.Status == "refunded" || in.Status == "partially_refunded" {
		return nil
	}
	if in.Status != "authorized" {
		return fmt.Errorf("intent_not_authorized")
	}
	amt := in.AmountMicro
	_, _ = a.pool.Exec(ctx, `
		UPDATE commerce.payment_intents SET status='captured', captured_micro=$2, provider_ref=$3,
		  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('payso_transaction_id', $4::text, 'capture_source', $5::text),
		  updated_at=NOW()
		WHERE id=$1`, in.ID, amt, providerRef, txnID, source)
	in.Status, in.CapturedMicro, in.ProviderRef = "captured", amt, providerRef
	a.logEvent(ctx, in, "captured", amt, txnID)
	_ = outbox.Insert(ctx, a.pool, outbox.Event{
		AggregateType: "payment", AggregateID: in.ID, EventType: "payments.captured", ShardKey: in.ShardKey,
		Payload: map[string]any{"order_id": in.OrderID, "amount_micro": amt, "via": source, "provider_ref": providerRef},
	})
	mCaptured.Add(1)
	a.notifyOrderPaid(ctx, in, txnID)
	return nil
}

func (a *app) notifyOrderPaid(ctx context.Context, in *intent, txnID string) {
	orderURL := strings.TrimSpace(config.Get("ORDER_SERVICE_URL", ""))
	if orderURL == "" || in.OrderID == "" {
		return
	}
	payload, _ := json.Marshal(map[string]any{
		"intent_id": in.ID, "order_id": in.OrderID, "provider_ref": in.ProviderRef,
		"transaction_id": txnID, "amount_micro": in.AmountMicro,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, orderURL+"/v1/orders/payment-captured", bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("order payment-captured notify failed intent=%s: %v", in.ID, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("order payment-captured notify %d intent=%s: %s", resp.StatusCode, in.ID, string(b))
	}
}

func (a *app) loadIntentByPaysoRef(ctx context.Context, ref string) (*intent, error) {
	if ref == "" {
		return nil, fmt.Errorf("empty ref")
	}
	var id string
	err := a.pool.QueryRow(ctx, `
		SELECT id FROM commerce.payment_intents
		WHERE provider_ref = $1 OR metadata->>'payso_reference_id' = $1
		ORDER BY created_at DESC LIMIT 1`, ref).Scan(&id)
	if err != nil {
		return nil, err
	}
	return a.loadIntent(ctx, id)
}

func (a *app) tryInquireAndCapture(ctx context.Context, in *intent) (bool, string, error) {
	if !isPaysoEnabled() || in.Method != "promptpay" {
		return false, "", fmt.Errorf("not_payso")
	}
	if in.Status == "captured" {
		return true, in.ProviderRef, nil
	}
	ref := in.ProviderRef
	if ref == "" {
		ref = in.metadataString("payso_reference_id")
	}
	inquiry := queryPaysoDepositStatus(loadPaysoConfig(), ref)
	if !inquiry.Paid {
		return false, inquiry.Status, nil
	}
	txn := inquiry.TransactionID
	if txn == "" {
		txn = "payso_" + ref
	}
	if err := a.finalizePaysoCapture(ctx, in, ref, txn, "inquiry"); err != nil {
		return false, inquiry.Status, err
	}
	return true, inquiry.Status, nil
}

func (a *app) inquireIntent(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		id = r.URL.Query().Get("intent_id")
	}
	if id == "" {
		http.Error(w, "intent_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	in, err := a.loadIntent(ctx, id)
	if err != nil {
		http.Error(w, "intent_not_found", http.StatusNotFound)
		return
	}
	paid, status, err := a.tryInquireAndCapture(ctx, in)
	resp := map[string]any{
		"intent_id": in.ID, "status": in.Status, "paid": paid || in.Status == "captured",
		"payso_status": status, "provider_ref": in.ProviderRef,
	}
	if err != nil && !paid {
		resp["error"] = err.Error()
	}
	jsonOK(w, resp)
}

func escrowCutoverFrozen() bool {
	v := strings.TrimSpace(strings.ToLower(config.Get("ESCROW_CUTOVER_FREEZE", "")))
	return v == "1" || v == "true" || v == "yes"
}

func (a *app) paysoWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if escrowCutoverFrozen() {
		http.Error(w, "escrow_cutover_freeze", http.StatusServiceUnavailable)
		return
	}
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "read_body_failed", http.StatusBadRequest)
		return
	}
	hasSecret := strings.TrimSpace(config.Get("PAYSO_WEBHOOK_SECRET", "")) != ""
	if !hasSecret {
		http.Error(w, "webhook_secret_not_configured", http.StatusServiceUnavailable)
		return
	}
	sigOK := verifyPaysoWebhookSignature(raw, r.Header)
	payload, err := parsePaysoWebhookPayload(raw)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !sigOK {
		http.Error(w, "invalid_signature", http.StatusForbidden)
		return
	}
	if payload.ReferenceID == "" {
		jsonOK(w, map[string]any{"ok": true, "ignored": "missing_reference_id"})
		return
	}
	ctx := r.Context()
	in, err := a.loadIntentByPaysoRef(ctx, payload.ReferenceID)
	if err != nil {
		jsonOK(w, map[string]any{"ok": true, "ignored": "intent_not_found"})
		return
	}
	idemKey := "payso-wh-" + payload.ReferenceID
	if payload.TransactionID != "" {
		idemKey += "-" + payload.TransactionID
	}
	tag, _ := a.pool.Exec(ctx, `
		INSERT INTO commerce.payment_events (id, intent_id, shard_key, event_type, idempotency_key, provider_ref)
		VALUES ($1,$2,$3,'webhook.payso',$4,$5) ON CONFLICT (shard_key, idempotency_key) DO NOTHING`,
		ulid.New(), in.ID, in.ShardKey, idemKey, payload.ReferenceID)
	if tag.RowsAffected() == 0 {
		jsonOK(w, map[string]any{"ok": true, "duplicate": true, "intent_id": in.ID})
		return
	}
	if paysoFailureStatus(payload.Status) {
		jsonOK(w, map[string]any{"ok": true, "ignored": "failure_status", "status": payload.Status})
		return
	}
	if !paysoSuccessStatus(payload.Status) && payload.Amount <= 0 {
		jsonOK(w, map[string]any{"ok": true, "ignored": "status_pending", "status": payload.Status})
		return
	}
	txn := payload.TransactionID
	if txn == "" {
		txn = "payso_" + payload.ReferenceID
	}
	if err := a.finalizePaysoCapture(ctx, in, payload.ReferenceID, txn, "webhook"); err != nil {
		log.Printf("payso webhook capture failed ref=%s: %v", payload.ReferenceID, err)
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	jsonOK(w, map[string]any{"ok": true, "processed": true, "intent_id": in.ID, "order_id": in.OrderID})
}
