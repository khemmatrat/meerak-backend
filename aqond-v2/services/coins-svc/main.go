// coins-svc implements Epoch 11 P211: EXP-COINS earn, spend, wallet + currency pref.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync/atomic"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool *pgxpool.Pool
}

var (
	mEarn  atomic.Int64
	mSpend atomic.Int64
)

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{pool: pool}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/coins", a.wallet)
	mux.HandleFunc("/v1/coins/earn", a.earn)
	mux.HandleFunc("/v1/coins/spend", a.spend)
	mux.HandleFunc("/v1/coins/ledger", a.ledger)

	port := config.Int("PORT", 8139)
	log.Printf("coins-svc :%d p211", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "coins-svc", "p211": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_coins_earn_total %d\n", mEarn.Load())
	fmt.Fprintf(w, "aqond_coins_spend_total %d\n", mSpend.Load())
}

func (a *app) ensureWallet(ctx context.Context, userID string) error {
	_, err := a.pool.Exec(ctx, `INSERT INTO commerce.coin_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, userID)
	return err
}

func (a *app) wallet(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	_ = a.ensureWallet(ctx, userID)
	var balance, earned int
	var currency string
	err := a.pool.QueryRow(ctx, `SELECT balance, lifetime_earned, currency_pref FROM commerce.coin_wallets WHERE user_id=$1`, userID).
		Scan(&balance, &earned, &currency)
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{"user_id": userID, "balance": balance, "lifetime_earned": earned, "currency": currency})
}

func (a *app) earn(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID string `json:"user_id"`
		Amount int    `json:"amount"`
		Reason string `json:"reason"`
		RefID  string `json:"ref_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == "" || body.Amount <= 0 {
		http.Error(w, "user_id and positive amount required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	_ = a.ensureWallet(ctx, body.UserID)
	id := ulid.New()
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `
		UPDATE commerce.coin_wallets SET balance=balance+$2, lifetime_earned=lifetime_earned+$2, updated_at=NOW()
		WHERE user_id=$1`, body.UserID, body.Amount)
	if err != nil {
		httpErr(w, err)
		return
	}
	_, err = tx.Exec(ctx, `INSERT INTO commerce.coin_ledger (id, user_id, delta, reason, ref_id) VALUES ($1,$2,$3,$4,$5)`,
		id, body.UserID, body.Amount, body.Reason, body.RefID)
	if err != nil {
		httpErr(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		httpErr(w, err)
		return
	}
	mEarn.Add(1)
	jsonOK(w, map[string]any{"earned": body.Amount, "ledger_id": id})
}

func (a *app) spend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID string `json:"user_id"`
		Amount int    `json:"amount"`
		Reason string `json:"reason"`
		RefID  string `json:"ref_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == "" || body.Amount <= 0 {
		http.Error(w, "user_id and positive amount required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var balance int
	err := a.pool.QueryRow(ctx, `SELECT balance FROM commerce.coin_wallets WHERE user_id=$1`, body.UserID).Scan(&balance)
	if err == pgx.ErrNoRows || balance < body.Amount {
		http.Error(w, "insufficient_coins", http.StatusPaymentRequired)
		return
	}
	id := ulid.New()
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `UPDATE commerce.coin_wallets SET balance=balance-$2, updated_at=NOW() WHERE user_id=$1`, body.UserID, body.Amount)
	if err != nil {
		httpErr(w, err)
		return
	}
	_, err = tx.Exec(ctx, `INSERT INTO commerce.coin_ledger (id, user_id, delta, reason, ref_id) VALUES ($1,$2,$3,$4,$5)`,
		id, body.UserID, -body.Amount, body.Reason, body.RefID)
	if err != nil {
		httpErr(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		httpErr(w, err)
		return
	}
	mSpend.Add(1)
	jsonOK(w, map[string]any{"spent": body.Amount, "ledger_id": id})
}

func (a *app) ledger(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, delta, reason, ref_id, created_at FROM commerce.coin_ledger
		WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, userID)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, reason, ref string
		var delta int
		var created any
		if rows.Scan(&id, &delta, &reason, &ref, &created) == nil {
			out = append(out, map[string]any{"id": id, "delta": delta, "reason": reason, "ref_id": ref, "created_at": created})
		}
	}
	jsonOK(w, map[string]any{"user_id": userID, "entries": out})
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
