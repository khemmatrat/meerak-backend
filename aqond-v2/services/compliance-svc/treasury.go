// FX treasury positions + reconciliation (P136). Reads Epoch 7 settlement,
// payout and FX-rate tables to produce per-currency positions and base-currency
// (THB) exposure, and reconciles settled net vs paid-out amounts.
package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

func baseCurrency() string {
	return "THB"
}

// P136: per-currency treasury positions + base-currency exposure.
func (a *app) treasuryPositions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	base := baseCurrency()

	settled := map[string]int64{}
	if rows, err := a.pool.Query(ctx, `
		SELECT currency, COALESCE(SUM(net_micro),0) FROM commerce.settlements GROUP BY currency`); err == nil {
		defer rows.Close()
		for rows.Next() {
			var cur string
			var v int64
			if rows.Scan(&cur, &v) == nil {
				settled[cur] += v
			}
		}
	}

	paid := map[string]int64{}
	if rows, err := a.pool.Query(ctx, `
		SELECT currency, COALESCE(SUM(amount_micro),0) FROM commerce.payouts WHERE status IN ('paid','processing') GROUP BY currency`); err == nil {
		defer rows.Close()
		for rows.Next() {
			var cur string
			var v int64
			if rows.Scan(&cur, &v) == nil {
				paid[cur] += v
			}
		}
	}

	currencies := map[string]struct{}{}
	for c := range settled {
		currencies[c] = struct{}{}
	}
	for c := range paid {
		currencies[c] = struct{}{}
	}

	var positions []map[string]any
	var baseExposure int64
	for cur := range currencies {
		net := settled[cur] - paid[cur]
		rate := a.rateTo(ctx, cur, base)
		baseVal := int64(float64(net) * rate)
		baseExposure += baseVal
		positions = append(positions, map[string]any{
			"currency": cur, "settled_micro": settled[cur], "paid_out_micro": paid[cur],
			"net_position_micro": net, "fx_rate_to_base": rate, "base_value_micro": baseVal,
		})
	}
	jsonOK(w, map[string]any{"base_currency": base, "positions": positions, "base_exposure_micro": baseExposure})
}

// P136: reconcile settled net vs payouts per currency, flag variance.
func (a *app) treasuryReconcile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Currency      string `json:"currency"`
		ToleranceBps  int    `json:"tolerance_bps"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Currency == "" {
		body.Currency = baseCurrency()
	}
	if body.ToleranceBps == 0 {
		body.ToleranceBps = 50 // 0.5%
	}
	body.Currency = strings.ToUpper(body.Currency)
	ctx := r.Context()

	var settled, paid int64
	_ = a.pool.QueryRow(ctx, `SELECT COALESCE(SUM(net_micro),0) FROM commerce.settlements WHERE currency=$1`, body.Currency).Scan(&settled)
	_ = a.pool.QueryRow(ctx, `SELECT COALESCE(SUM(amount_micro),0) FROM commerce.payouts WHERE currency=$1 AND status IN ('paid','processing')`, body.Currency).Scan(&paid)

	variance := settled - paid
	absVar := variance
	if absVar < 0 {
		absVar = -absVar
	}
	tolerance := settled * int64(body.ToleranceBps) / 10000
	if tolerance < 0 {
		tolerance = -tolerance
	}
	balanced := absVar <= tolerance
	jsonOK(w, map[string]any{
		"currency": body.Currency, "settled_micro": settled, "paid_out_micro": paid,
		"variance_micro": variance, "tolerance_micro": tolerance, "balanced": balanced,
	})
}

func (a *app) rateTo(ctx context.Context, from, to string) float64 {
	if strings.EqualFold(from, to) {
		return 1.0
	}
	var rate float64
	err := a.pool.QueryRow(ctx, `
		SELECT rate FROM commerce.fx_rates WHERE base_currency=$1 AND quote_currency=$2
		ORDER BY captured_at DESC LIMIT 1`, from, to).Scan(&rate)
	if err != nil || rate == 0 {
		return 1.0
	}
	return rate
}
