package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/outbox"
	"github.com/aqond/aqond-v2/pkg/region"
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type intent struct {
	ID                 string         `json:"id"`
	OrderID            string         `json:"order_id"`
	MerchantID         string         `json:"merchant_id"`
	BuyerID            string         `json:"buyer_id"`
	ShardKey           string         `json:"shard_key"`
	Region             string         `json:"region"`
	Provider           string         `json:"provider"`
	Method             string         `json:"method"`
	Status             string         `json:"status"`
	AmountMicro        int64          `json:"amount_micro"`
	CapturedMicro      int64          `json:"captured_micro"`
	RefundedMicro      int64          `json:"refunded_micro"`
	Currency           string         `json:"currency"`
	SettlementCurrency string         `json:"settlement_currency"`
	FXRate             float64        `json:"fx_rate"`
	RiskScore          int            `json:"risk_score"`
	Requires3DS        bool           `json:"requires_3ds"`
	ProviderRef        string         `json:"provider_ref"`
	TokenRef           string         `json:"token_ref"`
	IdempotencyKey     string         `json:"idempotency_key"`
	Metadata           map[string]any `json:"metadata"`
}

func (i *intent) metadataString(key string) string {
	if i.Metadata == nil {
		return ""
	}
	if v, ok := i.Metadata[key].(string); ok {
		return v
	}
	return ""
}

type app struct {
	pool   *pgxpool.Pool
	router *shard.Router
	region *region.Router
}

var (
	mIntents   atomic.Int64
	mCaptured  atomic.Int64
	mRefunded  atomic.Int64
	mBlocked   atomic.Int64
	mChallenge atomic.Int64
	mPayouts   atomic.Int64
)

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{
		pool:   pool,
		router: shard.NewRouter(config.Int("SHARD_COUNT", 1)),
		region: region.NewRouter(),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/intents", a.createIntent)
	mux.HandleFunc("/v1/intents/get", a.getIntent)
	mux.HandleFunc("/v1/intents/authorize", a.authorize)
	mux.HandleFunc("/v1/intents/capture", a.capture)
	mux.HandleFunc("/v1/refund", a.refund)
	mux.HandleFunc("/v1/disputes", a.dispute)
	mux.HandleFunc("/v1/payouts", a.payout)
	mux.HandleFunc("/v1/settlements/ingest", a.ingestSettlement)
	mux.HandleFunc("/v1/fx/rate", a.fxRate)
	mux.HandleFunc("/v1/fraud/score", a.fraudScoreHTTP)
	mux.HandleFunc("/v1/intents/inquire", a.inquireIntent)
	mux.HandleFunc("/v1/webhooks/payso", a.paysoWebhook)
	mux.HandleFunc("/v1/webhooks/", a.webhook)

	port := config.Int("PORT", 8120)
	log.Printf("payment-svc :%d p81-p90", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "payment-svc", "p81": true, "p90": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_payment_intents_total %d\n", mIntents.Load())
	fmt.Fprintf(w, "aqond_payment_captured_total %d\n", mCaptured.Load())
	fmt.Fprintf(w, "aqond_payment_refunded_total %d\n", mRefunded.Load())
	fmt.Fprintf(w, "aqond_payment_fraud_blocked_total %d\n", mBlocked.Load())
	fmt.Fprintf(w, "aqond_payment_fraud_challenge_total %d\n", mChallenge.Load())
	fmt.Fprintf(w, "aqond_payment_payouts_total %d\n", mPayouts.Load())
}

// P81/P82/P89: create a payment intent (idempotent) + score fraud at create time.
func (a *app) createIntent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		OrderID        string         `json:"order_id"`
		MerchantID     string         `json:"merchant_id"`
		BuyerID        string         `json:"buyer_id"`
		Method         string         `json:"method"`
		AmountMicro    int64          `json:"amount_micro"`
		Currency       string         `json:"currency"`
		IdempotencyKey string         `json:"idempotency_key"`
		Device         string         `json:"device"`
		IP             string         `json:"ip"`
		Metadata       map[string]any `json:"metadata"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.MerchantID == "" || body.BuyerID == "" || body.IdempotencyKey == "" {
		http.Error(w, "merchant_id, buyer_id, idempotency_key required", http.StatusBadRequest)
		return
	}
	if body.Method == "" {
		body.Method = "card"
	}
	if body.Currency == "" {
		body.Currency = "THB"
	}
	prov, err := providerFor(body.Method)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	sk := a.router.ShardKey(body.MerchantID)
	reg := a.region.FromRequest(r)

	// idempotent return
	if existing, ok := a.findByIdem(ctx, sk, body.IdempotencyKey); ok {
		jsonOK(w, map[string]any{"intent": existing, "idempotent": true})
		return
	}

	// settlement currency + FX snapshot (P88)
	settleCcy := config.Get("SETTLEMENT_CURRENCY", "THB")
	fx := a.latestFX(ctx, body.Currency, settleCcy)

	// fraud score at authorize-time decision (P89)
	score, decision, signals := scoreFraud(body.BuyerID, body.AmountMicro, body.Device, body.IP, body.Method)

	in := &intent{
		ID: ulid.New(), OrderID: body.OrderID, MerchantID: body.MerchantID, BuyerID: body.BuyerID,
		ShardKey: sk, Region: reg, Provider: prov.Name(), Method: body.Method, Status: "created",
		AmountMicro: body.AmountMicro, Currency: body.Currency, SettlementCurrency: settleCcy,
		FXRate: fx, RiskScore: score, Requires3DS: decision == "challenge",
		IdempotencyKey: body.IdempotencyKey, Metadata: body.Metadata,
	}

	_, err = a.pool.Exec(ctx, `
		INSERT INTO commerce.payment_intents
		  (id, order_id, merchant_id, buyer_id, shard_key, region, provider, method, status,
		   amount_micro, currency, settlement_currency, fx_rate, risk_score, requires_3ds, idempotency_key, metadata)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'created',$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
		in.ID, nullable(in.OrderID), in.MerchantID, in.BuyerID, sk, reg, in.Provider, in.Method,
		in.AmountMicro, in.Currency, settleCcy, fx, score, in.Requires3DS, in.IdempotencyKey, mustJSON(in.Metadata))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.recordFraud(ctx, in, decision, signals)
	a.logEvent(ctx, in, "intent.created", 0, "")
	_ = outbox.Insert(ctx, a.pool, outbox.Event{
		AggregateType: "payment", AggregateID: in.ID, EventType: "payments.intent_created", ShardKey: sk,
		Payload: map[string]any{"order_id": in.OrderID, "amount_micro": in.AmountMicro, "method": in.Method, "risk": score},
	})
	mIntents.Add(1)
	if decision == "block" {
		mBlocked.Add(1)
	} else if decision == "challenge" {
		mChallenge.Add(1)
	}
	jsonOK(w, map[string]any{"intent": in, "fraud_decision": decision})
}

// P81/P83/P89: authorize via provider; blocked by fraud or 3DS step-up.
func (a *app) authorize(w http.ResponseWriter, r *http.Request) {
	id := bodyID(r)
	in, err := a.loadIntent(r.Context(), id)
	if err != nil {
		http.Error(w, "intent_not_found", http.StatusNotFound)
		return
	}
	if in.Status != "created" {
		jsonOK(w, map[string]any{"intent": in, "noop": true})
		return
	}
	if in.RiskScore >= config.Int("FRAUD_BLOCK_THRESHOLD", 85) && config.Get("FRAUD_ENFORCE", "1") == "1" {
		mBlocked.Add(1)
		a.transition(r.Context(), in, "failed", "fraud.blocked", 0, "")
		http.Error(w, "payment_blocked_fraud", http.StatusPaymentRequired)
		return
	}
	prov, _ := providerFor(in.Method)
	res, err := prov.Authorize(in)
	if err != nil {
		a.transition(r.Context(), in, "failed", "authorize.failed", 0, "")
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	in.ProviderRef = res.ProviderRef
	in.TokenRef = res.TokenRef
	in.Requires3DS = res.Requires3DS
	meta := in.Metadata
	if meta == nil {
		meta = map[string]any{}
	}
	if res.QRCodeURL != "" {
		meta["qr_code_url"] = res.QRCodeURL
		meta["payso_reference_id"] = res.ProviderRef
	}
	metaJSON := mustJSON(meta)
	_, _ = a.pool.Exec(r.Context(), `
		UPDATE commerce.payment_intents SET status='authorized', provider_ref=$2, token_ref=$3, requires_3ds=$4, metadata=$5::jsonb, updated_at=NOW()
		WHERE id=$1`, in.ID, res.ProviderRef, nullable(res.TokenRef), res.Requires3DS, metaJSON)
	in.Status = "authorized"
	in.Metadata = meta
	a.logEvent(r.Context(), in, "authorized", in.AmountMicro, res.ProviderRef)
	_ = outbox.Insert(r.Context(), a.pool, outbox.Event{
		AggregateType: "payment", AggregateID: in.ID, EventType: "payments.authorized", ShardKey: in.ShardKey,
		Payload: map[string]any{"order_id": in.OrderID, "provider_ref": res.ProviderRef, "requires_3ds": res.Requires3DS},
	})
	jsonOK(w, map[string]any{
		"intent": in, "redirect_url": res.RedirectURL, "qr_code_url": res.QRCodeURL,
		"payso_reference_id": res.ProviderRef,
	})
}

// P81: capture funds (COD captures on courier webhook instead).
func (a *app) capture(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IntentID    string `json:"intent_id"`
		AmountMicro int64  `json:"amount_micro"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	in, err := a.loadIntent(r.Context(), body.IntentID)
	if err != nil {
		http.Error(w, "intent_not_found", http.StatusNotFound)
		return
	}
	if in.Status != "authorized" {
		http.Error(w, "intent_not_authorized", http.StatusConflict)
		return
	}
	amt := body.AmountMicro
	if amt <= 0 || amt > in.AmountMicro {
		amt = in.AmountMicro
	}
	prov, _ := providerFor(in.Method)
	ref, err := prov.Capture(in, amt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	_, _ = a.pool.Exec(r.Context(), `
		UPDATE commerce.payment_intents SET status='captured', captured_micro=$2, provider_ref=$3, updated_at=NOW()
		WHERE id=$1`, in.ID, amt, ref)
	in.Status, in.CapturedMicro = "captured", amt
	a.logEvent(r.Context(), in, "captured", amt, ref)
	_ = outbox.Insert(r.Context(), a.pool, outbox.Event{
		AggregateType: "payment", AggregateID: in.ID, EventType: "payments.captured", ShardKey: in.ShardKey,
		Payload: map[string]any{"order_id": in.OrderID, "amount_micro": amt, "settlement_currency": in.SettlementCurrency, "fx_rate": in.FXRate},
	})
	mCaptured.Add(1)
	jsonOK(w, map[string]any{"intent": in, "provider_ref": ref})
}

// P85: refunds (full/partial) + dispute-driven refunds.
func (a *app) refund(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IntentID       string `json:"intent_id"`
		AmountMicro    int64  `json:"amount_micro"`
		Reason         string `json:"reason"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	in, err := a.loadIntent(r.Context(), body.IntentID)
	if err != nil {
		http.Error(w, "intent_not_found", http.StatusNotFound)
		return
	}
	if in.Status != "captured" && in.Status != "partially_refunded" {
		http.Error(w, "intent_not_refundable", http.StatusConflict)
		return
	}
	amt := body.AmountMicro
	remaining := in.CapturedMicro - in.RefundedMicro
	if amt <= 0 || amt > remaining {
		amt = remaining
	}
	if body.IdempotencyKey == "" {
		body.IdempotencyKey = "refund-" + in.ID + "-" + ulid.New()
	}
	refID := ulid.New()
	_, err = a.pool.Exec(r.Context(), `
		INSERT INTO commerce.refunds (id, intent_id, order_id, merchant_id, shard_key, amount_micro, currency, reason, status, idempotency_key)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'succeeded',$9)
		ON CONFLICT (shard_key, idempotency_key) DO NOTHING`,
		refID, in.ID, nullable(in.OrderID), in.MerchantID, in.ShardKey, amt, in.Currency, body.Reason, body.IdempotencyKey)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	newRefunded := in.RefundedMicro + amt
	status := "partially_refunded"
	if newRefunded >= in.CapturedMicro {
		status = "refunded"
	}
	_, _ = a.pool.Exec(r.Context(), `
		UPDATE commerce.payment_intents SET refunded_micro=$2, status=$3, updated_at=NOW() WHERE id=$1`,
		in.ID, newRefunded, status)
	in.RefundedMicro, in.Status = newRefunded, status
	a.logEvent(r.Context(), in, "refunded", amt, refID)
	_ = outbox.Insert(r.Context(), a.pool, outbox.Event{
		AggregateType: "payment", AggregateID: in.ID, EventType: "payments.refunded", ShardKey: in.ShardKey,
		Payload: map[string]any{"order_id": in.OrderID, "amount_micro": amt, "refund_id": refID},
	})
	mRefunded.Add(1)
	jsonOK(w, map[string]any{"refund_id": refID, "intent": in})
}

// P85: open/transition disputes & chargebacks.
func (a *app) dispute(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IntentID   string         `json:"intent_id"`
		ReasonCode string         `json:"reason_code"`
		Action     string         `json:"action"` // open|submit_evidence|win|lose
		Evidence   map[string]any `json:"evidence"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	in, err := a.loadIntent(r.Context(), body.IntentID)
	if err != nil {
		http.Error(w, "intent_not_found", http.StatusNotFound)
		return
	}
	ctx := r.Context()
	switch body.Action {
	case "", "open":
		id := ulid.New()
		_, err = a.pool.Exec(ctx, `
			INSERT INTO commerce.disputes (id, intent_id, order_id, merchant_id, shard_key, amount_micro, status, reason_code, due_at)
			VALUES ($1,$2,$3,$4,$5,$6,'opened',$7,$8)`,
			id, in.ID, nullable(in.OrderID), in.MerchantID, in.ShardKey, in.CapturedMicro, body.ReasonCode, time.Now().Add(7*24*time.Hour))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = outbox.Insert(ctx, a.pool, outbox.Event{AggregateType: "payment", AggregateID: id, EventType: "payments.dispute_opened", ShardKey: in.ShardKey, Payload: map[string]any{"intent_id": in.ID}})
		jsonOK(w, map[string]any{"dispute_id": id, "status": "opened"})
	case "submit_evidence":
		_, _ = a.pool.Exec(ctx, `UPDATE commerce.disputes SET status='evidence_submitted', evidence=$2::jsonb, updated_at=NOW() WHERE intent_id=$1`, in.ID, mustJSON(body.Evidence))
		jsonOK(w, map[string]any{"status": "evidence_submitted"})
	case "win", "lose":
		st := "won"
		if body.Action == "lose" {
			st = "lost"
		}
		_, _ = a.pool.Exec(ctx, `UPDATE commerce.disputes SET status=$2, updated_at=NOW() WHERE intent_id=$1`, in.ID, st)
		jsonOK(w, map[string]any{"status": st})
	default:
		http.Error(w, "unknown action", http.StatusBadRequest)
	}
}

// P86: schedule a merchant payout (idempotent), held for unverified sellers.
func (a *app) payout(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MerchantID     string `json:"merchant_id"`
		AmountMicro    int64  `json:"amount_micro"`
		Currency       string `json:"currency"`
		IdempotencyKey string `json:"idempotency_key"`
		KYCVerified    bool   `json:"kyc_verified"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.MerchantID == "" || body.IdempotencyKey == "" {
		http.Error(w, "merchant_id and idempotency_key required", http.StatusBadRequest)
		return
	}
	if body.Currency == "" {
		body.Currency = "THB"
	}
	minPayout := int64(config.Int("MIN_PAYOUT_MICRO", 10_000_000))
	status, hold := "scheduled", ""
	if !body.KYCVerified {
		status, hold = "held", "kyc_unverified"
	} else if body.AmountMicro < minPayout {
		status, hold = "held", "below_minimum"
	}
	sk := a.router.ShardKey(body.MerchantID)
	id := ulid.New()
	_, err := a.pool.Exec(r.Context(), `
		INSERT INTO commerce.payouts (id, merchant_id, shard_key, region, amount_micro, currency, status, hold_reason, idempotency_key)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (shard_key, idempotency_key) DO NOTHING`,
		id, body.MerchantID, sk, a.router.HomeRegion(body.MerchantID), body.AmountMicro, body.Currency, status, nullable(hold), body.IdempotencyKey)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	mPayouts.Add(1)
	jsonOK(w, map[string]any{"payout_id": id, "status": status, "hold_reason": hold})
}

// P87: ingest a PSP settlement file and reconcile against intents.
func (a *app) ingestSettlement(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Provider string `json:"provider"`
		Date     string `json:"settlement_date"`
		Currency string `json:"currency"`
		Lines    []struct {
			IntentID    string `json:"intent_id"`
			ProviderRef string `json:"provider_ref"`
			AmountMicro int64  `json:"amount_micro"`
			FeeMicro    int64  `json:"fee_micro"`
		} `json:"lines"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Currency == "" {
		body.Currency = "THB"
	}
	if body.Date == "" {
		body.Date = time.Now().Format("2006-01-02")
	}
	ctx := r.Context()
	sid := ulid.New()
	var gross, fee int64
	var matched, exceptions int
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.settlements (id, provider, settlement_date, currency, status)
		VALUES ($1,$2,$3,$4,'ingested')
		ON CONFLICT (provider, settlement_date, currency) DO UPDATE SET status='ingested'
		RETURNING id`, sid, body.Provider, body.Date, body.Currency)
	for _, ln := range body.Lines {
		gross += ln.AmountMicro
		fee += ln.FeeMicro
		match := "unmatched"
		var capMicro int64
		err := a.pool.QueryRow(ctx, `SELECT captured_micro FROM commerce.payment_intents WHERE id=$1`, ln.IntentID).Scan(&capMicro)
		if err == nil {
			if capMicro == ln.AmountMicro {
				match = "matched"
				matched++
			} else {
				match = "mismatch"
				exceptions++
			}
		} else {
			exceptions++
		}
		_, _ = a.pool.Exec(ctx, `
			INSERT INTO commerce.settlement_lines (id, settlement_id, intent_id, provider_ref, amount_micro, fee_micro, match_status)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			ulid.New(), sid, nullable(ln.IntentID), nullable(ln.ProviderRef), ln.AmountMicro, ln.FeeMicro, match)
	}
	st := "matched"
	if exceptions > 0 {
		st = "exceptions"
	}
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.settlements SET gross_micro=$2, fee_micro=$3, net_micro=$4, status=$5 WHERE id=$1`,
		sid, gross, fee, gross-fee, st)
	jsonOK(w, map[string]any{"settlement_id": sid, "matched": matched, "exceptions": exceptions, "net_micro": gross - fee})
}

// P88: record / read FX rate snapshots.
func (a *app) fxRate(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method == http.MethodPost {
		var body struct {
			Base  string  `json:"base_currency"`
			Quote string  `json:"quote_currency"`
			Rate  float64 `json:"rate"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_, err := a.pool.Exec(ctx, `INSERT INTO commerce.fx_rates (base_currency, quote_currency, rate) VALUES ($1,$2,$3)`,
			body.Base, body.Quote, body.Rate)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		jsonOK(w, map[string]any{"recorded": true})
		return
	}
	base := r.URL.Query().Get("base")
	quote := r.URL.Query().Get("quote")
	jsonOK(w, map[string]any{"base": base, "quote": quote, "rate": a.latestFX(ctx, base, quote)})
}

func (a *app) fraudScoreHTTP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		BuyerID     string `json:"buyer_id"`
		AmountMicro int64  `json:"amount_micro"`
		Device      string `json:"device"`
		IP          string `json:"ip"`
		Method      string `json:"method"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	score, decision, signals := scoreFraud(body.BuyerID, body.AmountMicro, body.Device, body.IP, body.Method)
	jsonOK(w, map[string]any{"score": score, "decision": decision, "signals": signals})
}

// P82: provider webhook (e.g. COD courier confirmation -> capture). Idempotent.
func (a *app) webhook(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IntentID       string `json:"intent_id"`
		Event          string `json:"event"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	in, err := a.loadIntent(r.Context(), body.IntentID)
	if err != nil {
		http.Error(w, "intent_not_found", http.StatusNotFound)
		return
	}
	if body.IdempotencyKey == "" {
		body.IdempotencyKey = "wh-" + in.ID + "-" + body.Event
	}
	// idempotency via payment_events unique (shard_key, idempotency_key)
	tag, _ := a.pool.Exec(r.Context(), `
		INSERT INTO commerce.payment_events (id, intent_id, shard_key, event_type, idempotency_key)
		VALUES ($1,$2,$3,$4,$5) ON CONFLICT (shard_key, idempotency_key) DO NOTHING`,
		ulid.New(), in.ID, in.ShardKey, "webhook."+body.Event, body.IdempotencyKey)
	if tag.RowsAffected() == 0 {
		jsonOK(w, map[string]any{"duplicate": true})
		return
	}
	if body.Event == "cod_delivered" && in.Status == "authorized" {
		prov, _ := providerFor(in.Method)
		ref, _ := prov.Capture(in, in.AmountMicro)
		_, _ = a.pool.Exec(r.Context(), `UPDATE commerce.payment_intents SET status='captured', captured_micro=amount_micro, provider_ref=$2, updated_at=NOW() WHERE id=$1`, in.ID, ref)
		_ = outbox.Insert(r.Context(), a.pool, outbox.Event{AggregateType: "payment", AggregateID: in.ID, EventType: "payments.captured", ShardKey: in.ShardKey, Payload: map[string]any{"order_id": in.OrderID, "amount_micro": in.AmountMicro, "via": "cod"}})
		mCaptured.Add(1)
	}
	jsonOK(w, map[string]any{"processed": true})
}

func (a *app) getIntent(w http.ResponseWriter, r *http.Request) {
	in, err := a.loadIntent(r.Context(), r.URL.Query().Get("id"))
	if err != nil {
		http.Error(w, "intent_not_found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{"intent": in})
}

// ---- helpers ----

func (a *app) loadIntent(ctx context.Context, id string) (*intent, error) {
	if id == "" {
		return nil, fmt.Errorf("empty id")
	}
	in := &intent{}
	var meta []byte
	err := a.pool.QueryRow(ctx, `
		SELECT id, coalesce(order_id,''), merchant_id, buyer_id, shard_key, region, provider, method, status,
		       amount_micro, captured_micro, refunded_micro, currency, settlement_currency, fx_rate, risk_score,
		       requires_3ds, coalesce(provider_ref,''), coalesce(token_ref,''), idempotency_key, metadata
		FROM commerce.payment_intents WHERE id=$1`, id).
		Scan(&in.ID, &in.OrderID, &in.MerchantID, &in.BuyerID, &in.ShardKey, &in.Region, &in.Provider, &in.Method, &in.Status,
			&in.AmountMicro, &in.CapturedMicro, &in.RefundedMicro, &in.Currency, &in.SettlementCurrency, &in.FXRate, &in.RiskScore,
			&in.Requires3DS, &in.ProviderRef, &in.TokenRef, &in.IdempotencyKey, &meta)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(meta, &in.Metadata)
	return in, nil
}

func (a *app) findByIdem(ctx context.Context, sk, idem string) (*intent, bool) {
	var id string
	err := a.pool.QueryRow(ctx, `SELECT id FROM commerce.payment_intents WHERE shard_key=$1 AND idempotency_key=$2`, sk, idem).Scan(&id)
	if err != nil {
		return nil, false
	}
	in, err := a.loadIntent(ctx, id)
	return in, err == nil
}

func (a *app) transition(ctx context.Context, in *intent, status, event string, amt int64, ref string) {
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.payment_intents SET status=$2, updated_at=NOW() WHERE id=$1`, in.ID, status)
	in.Status = status
	a.logEvent(ctx, in, event, amt, ref)
}

func (a *app) logEvent(ctx context.Context, in *intent, event string, amt int64, ref string) {
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.payment_events (id, intent_id, shard_key, event_type, amount_micro, provider_ref, idempotency_key)
		VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (shard_key, idempotency_key) DO NOTHING`,
		ulid.New(), in.ID, in.ShardKey, event, amt, nullable(ref), in.ID+"-"+event+"-"+ulid.New())
}

func (a *app) recordFraud(ctx context.Context, in *intent, decision string, signals map[string]any) {
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.payment_fraud_signals (id, intent_id, buyer_id, shard_key, score, decision, signals)
		VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
		ulid.New(), in.ID, in.BuyerID, in.ShardKey, in.RiskScore, decision, mustJSON(signals))
}

func (a *app) latestFX(ctx context.Context, base, quote string) float64 {
	if base == "" || quote == "" || base == quote {
		return 1
	}
	var rate float64
	err := a.pool.QueryRow(ctx, `
		SELECT rate FROM commerce.fx_rates WHERE base_currency=$1 AND quote_currency=$2 ORDER BY captured_at DESC LIMIT 1`,
		base, quote).Scan(&rate)
	if err != nil || rate == 0 {
		return 1
	}
	return rate
}

func bodyID(r *http.Request) string {
	var body struct {
		IntentID string `json:"intent_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	return body.IntentID
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func mustJSON(v any) string {
	if v == nil {
		return "{}"
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

var _ = pgx.ErrNoRows
