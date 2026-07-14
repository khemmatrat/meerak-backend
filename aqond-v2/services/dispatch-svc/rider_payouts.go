package main

import (
	"encoding/json"
	"net/http"
)

func (a *app) riderEarnings(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	riderID := r.URL.Query().Get("rider_id")
	ctx := r.Context()
	if riderID == "" && userID != "" {
		_ = a.pool.QueryRow(ctx, `SELECT id FROM commerce.dispatch_riders WHERE user_id=$1 LIMIT 1`, userID).Scan(&riderID)
	}
	if riderID == "" {
		http.Error(w, "rider_id required", http.StatusBadRequest)
		return
	}
	var earningsMicro int64
	var kyc, bank string
	_ = a.pool.QueryRow(ctx, `
		SELECT earnings_micro, kyc_status, COALESCE(bank_account,'')
		FROM commerce.dispatch_riders WHERE id=$1`, riderID).Scan(&earningsMicro, &kyc, &bank)
	withdrawable, _ := a.riderWithdrawableMicro(ctx, riderID)

	rows, _ := a.pool.Query(ctx, `
		SELECT id, order_id, net_micro, created_at::text FROM commerce.rider_earnings
		WHERE rider_id=$1 ORDER BY created_at DESC LIMIT 20`, riderID)
	var history []map[string]any
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id, oid, created string
			var net int64
			if rows.Scan(&id, &oid, &net, &created) == nil {
				history = append(history, map[string]any{"id": id, "order_id": oid, "net_micro": net, "created_at": created})
			}
		}
	}

	payoutRows, _ := a.pool.Query(ctx, `
		SELECT id, amount_micro, status, payso_reference_id, created_at::text
		FROM commerce.rider_payouts WHERE rider_id=$1 ORDER BY created_at DESC LIMIT 10`, riderID)
	var payouts []map[string]any
	if payoutRows != nil {
		defer payoutRows.Close()
		for payoutRows.Next() {
			var id, st, ref, created string
			var amt int64
			if payoutRows.Scan(&id, &amt, &st, &ref, &created) == nil {
				payouts = append(payouts, map[string]any{
					"id": id, "amount_micro": amt, "status": st, "payso_reference_id": ref, "created_at": created,
				})
			}
		}
	}

	jsonOK(w, map[string]any{
		"rider_id": riderID, "earnings_micro": earningsMicro, "withdrawable_micro": withdrawable,
		"kyc_status": kyc, "bank_account": bank, "history": history, "payouts": payouts,
	})
}

func (a *app) riderWithdraw(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RiderID     string `json:"rider_id"`
		UserID      string `json:"user_id"`
		AmountMicro int64  `json:"amount_micro"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	riderID := body.RiderID
	if riderID == "" && body.UserID != "" {
		_ = a.pool.QueryRow(ctx, `SELECT id FROM commerce.dispatch_riders WHERE user_id=$1`, body.UserID).Scan(&riderID)
	}
	if riderID == "" {
		http.Error(w, "rider_id required", http.StatusBadRequest)
		return
	}
	amt := body.AmountMicro
	if amt <= 0 {
		withdrawable, _ := a.riderWithdrawableMicro(ctx, riderID)
		amt = withdrawable
	}
	payoutID, err := a.createRiderPayout(ctx, riderID, amt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, map[string]any{"ok": true, "payout_id": payoutID, "amount_micro": amt, "status": "pending"})
}

func (a *app) approveRiderPayout(w http.ResponseWriter, r *http.Request, riderID, payoutID string) {
	ctx := r.Context()
	var amountMicro int64
	var status, bank string
	err := a.pool.QueryRow(ctx, `
		SELECT amount_micro, status, bank_account FROM commerce.rider_payouts
		WHERE id=$1 AND rider_id=$2`, payoutID, riderID).Scan(&amountMicro, &status, &bank)
	if err != nil || status != "pending" {
		http.Error(w, "payout_not_found", http.StatusNotFound)
		return
	}
	amountThb := float64(amountMicro) / 100
	ref, txnID, err := sendPaysoPayout(ctx, payoutID, bank, amountThb)
	if err != nil {
		_, _ = a.pool.Exec(ctx, `
			UPDATE commerce.rider_payouts SET status='rejected', reject_reason=$2 WHERE id=$1`,
			payoutID, err.Error())
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	_, _ = a.pool.Exec(ctx, `
		UPDATE commerce.rider_payouts SET status='paid', payso_reference_id=$2, payso_transaction_id=$3, paid_at=NOW()
		WHERE id=$1`, payoutID, ref, txnID)
	jsonOK(w, map[string]any{"ok": true, "payout_id": payoutID, "status": "paid", "payso_reference_id": ref})
}
