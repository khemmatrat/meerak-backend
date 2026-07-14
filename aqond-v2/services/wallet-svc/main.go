package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/outbox"
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type walletApp struct {
	pool   *pgxpool.Pool
	apiKey string
	router *shard.Router
}

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgres())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	app := &walletApp{
		pool:   pool,
		apiKey: config.Get("WALLET_API_KEY", os.Getenv("ESCROW_API_KEY")),
		router: shard.NewRouter(1),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.health)
	mux.HandleFunc("/v1/balance", app.balance)
	mux.HandleFunc("/v1/ledger", app.buyerLedger)
	mux.HandleFunc("/v1/hold", app.withAuth(app.hold))
	mux.HandleFunc("/v1/release", app.withAuth(app.release))
	mux.HandleFunc("/v1/refund", app.withAuth(app.refund))
	mux.HandleFunc("/v1/order/", app.withAuth(app.orderLedger))

	port := config.Int("PORT", 8112)
	log.Printf("wallet-svc :%d", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *walletApp) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "wallet-svc", "p14": true, "p214": true})
}

// P214: buyer balance for wallet UI (production storefront).
func (a *walletApp) balance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ownerID := r.URL.Query().Get("owner_id")
	ownerType := r.URL.Query().Get("owner_type")
	if ownerID == "" {
		http.Error(w, "owner_id required", http.StatusBadRequest)
		return
	}
	if ownerType == "" {
		ownerType = "buyer"
	}
	sk := a.router.ShardKey(ownerID)
	var balance int64
	var currency string
	err := a.pool.QueryRow(r.Context(), `
		SELECT COALESCE(w.balance_micro,0), COALESCE(w.currency,'THB')
		FROM commerce.wallets w
		WHERE w.shard_key=$1 AND w.owner_type=$2 AND w.owner_id=$3`, sk, ownerType, ownerID).
		Scan(&balance, &currency)
	if err == pgx.ErrNoRows {
		jsonOK(w, map[string]any{"owner_id": ownerID, "owner_type": ownerType, "balance_micro": 0, "currency": "THB"})
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"owner_id": ownerID, "owner_type": ownerType, "balance_micro": balance, "currency": currency})
}

func (a *walletApp) buyerLedger(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ownerID := r.URL.Query().Get("owner_id")
	if ownerID == "" {
		http.Error(w, "owner_id required", http.StatusBadRequest)
		return
	}
	sk := a.router.ShardKey(ownerID)
	rows, err := a.pool.Query(r.Context(), `
		SELECT l.id, l.entry_type, l.amount_micro, l.order_id, l.reason, l.created_at
		FROM commerce.wallet_ledger l
		JOIN commerce.wallets w ON w.id = l.wallet_id
		WHERE w.shard_key=$1 AND w.owner_id=$2
		ORDER BY l.created_at DESC LIMIT 50`, sk, ownerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	entries := []map[string]any{}
	for rows.Next() {
		var id, et, orderID string
		var amount int64
		var reason *string
		var created any
		if rows.Scan(&id, &et, &amount, &orderID, &reason, &created) == nil {
			entries = append(entries, map[string]any{"id": id, "entry_type": et, "amount_micro": amount, "order_id": orderID, "reason": reason, "created_at": created})
		}
	}
	jsonOK(w, map[string]any{"owner_id": ownerID, "entries": entries})
}

func (a *walletApp) withAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a.apiKey != "" {
			key := r.Header.Get("X-Wallet-Api-Key")
			if key == "" {
				key = r.Header.Get("X-Escrow-Api-Key")
			}
			if key != a.apiKey {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
		}
		next(w, r)
	}
}

func (a *walletApp) hold(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		OrderID        string `json:"order_id"`
		AmountMicro    int64  `json:"amount_micro"`
		MerchantID     string `json:"merchant_id"`
		BuyerID        string `json:"buyer_id"`
		IdempotencyKey string `json:"idempotency_key"`
		Actor          string `json:"actor"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.OrderID == "" || body.IdempotencyKey == "" {
		http.Error(w, "order_id and idempotency_key required", http.StatusBadRequest)
		return
	}
	if body.MerchantID == "" {
		body.MerchantID = ulid.New()
	}
	sk := a.router.ShardKey(body.MerchantID)
	wid := a.ensureWallet(r, body.MerchantID, "merchant", body.MerchantID, sk)

	entryID := ulid.New()
	var existing string
	err := a.pool.QueryRow(r.Context(), `
		SELECT id FROM commerce.wallet_ledger WHERE shard_key=$1 AND idempotency_key=$2`,
		sk, body.IdempotencyKey).Scan(&existing)
	if err == nil {
		jsonOK(w, map[string]any{"ledger": map[string]any{"id": existing, "entry_type": "HOLD", "status": "posted"}})
		return
	}
	if err != pgx.ErrNoRows {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err = a.pool.Exec(r.Context(), `
		INSERT INTO commerce.wallet_ledger (id, wallet_id, order_id, merchant_id, shard_key, entry_type, amount_micro, idempotency_key, actor)
		VALUES ($1,$2,$3,$4,$5,'HOLD',$6,$7,$8)`,
		entryID, wid, body.OrderID, body.MerchantID, sk, body.AmountMicro, body.IdempotencyKey, body.Actor)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = outbox.Insert(r.Context(), a.pool, outbox.Event{
		AggregateType: "wallet", AggregateID: entryID, EventType: "wallet.hold", ShardKey: sk,
		Payload: map[string]any{"order_id": body.OrderID, "amount_micro": body.AmountMicro},
	})

	jsonOK(w, map[string]any{"ledger": map[string]any{"id": entryID, "entry_type": "HOLD", "order_id": body.OrderID, "amount_micro": body.AmountMicro}})
}

func (a *walletApp) transition(w http.ResponseWriter, r *http.Request, entryType string) {
	var body struct {
		OrderID string `json:"order_id"`
		Reason  string `json:"reason"`
		Actor   string `json:"actor"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var holdID, merchantID, sk string
	var amount int64
	err := a.pool.QueryRow(r.Context(), `
		SELECT id, merchant_id, shard_key, amount_micro FROM commerce.wallet_ledger
		WHERE order_id=$1 AND entry_type='HOLD' ORDER BY created_at DESC LIMIT 1`, body.OrderID).
		Scan(&holdID, &merchantID, &sk, &amount)
	if err != nil {
		http.Error(w, "no_hold_found", http.StatusNotFound)
		return
	}
	entryID := ulid.New()
	idem := fmt.Sprintf("%s-%s", strings.ToLower(entryType), body.OrderID)
	_, err = a.pool.Exec(r.Context(), `
		INSERT INTO commerce.wallet_ledger (id, wallet_id, order_id, merchant_id, shard_key, entry_type, amount_micro, idempotency_key, actor, reason)
		SELECT $1, wallet_id, order_id, merchant_id, shard_key, $2, amount_micro, $3, $4, $5
		FROM commerce.wallet_ledger WHERE id=$6`,
		entryID, entryType, idem, body.Actor, body.Reason, holdID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"ledger": map[string]any{"id": entryID, "entry_type": entryType, "order_id": body.OrderID}})
}

func (a *walletApp) release(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	a.transition(w, r, "RELEASE")
}

func (a *walletApp) refund(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	a.transition(w, r, "REFUND")
}

func (a *walletApp) orderLedger(w http.ResponseWriter, r *http.Request) {
	orderID := strings.TrimPrefix(r.URL.Path, "/v1/order/")
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, entry_type, amount_micro, actor, reason, created_at FROM commerce.wallet_ledger WHERE order_id=$1 ORDER BY created_at`, orderID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	entries := []map[string]any{}
	for rows.Next() {
		var id, et, actor string
		var amount int64
		var reason *string
		var created any
		_ = rows.Scan(&id, &et, &amount, &actor, &reason, &created)
		entries = append(entries, map[string]any{"id": id, "entry_type": et, "amount_micro": amount, "actor": actor, "reason": reason})
	}
	jsonOK(w, map[string]any{"entries": entries})
}

func (a *walletApp) ensureWallet(r *http.Request, ownerID, ownerType, merchantID, sk string) string {
	var id string
	err := a.pool.QueryRow(r.Context(), `SELECT id FROM commerce.wallets WHERE shard_key=$1 AND owner_type=$2 AND owner_id=$3`, sk, ownerType, ownerID).Scan(&id)
	if err == nil {
		return id
	}
	id = ulid.New()
	_, _ = a.pool.Exec(r.Context(), `
		INSERT INTO commerce.wallets (id, owner_type, owner_id, merchant_id, shard_key) VALUES ($1,$2,$3,$4,$5)`,
		id, ownerType, ownerID, merchantID, sk)
	return id
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
