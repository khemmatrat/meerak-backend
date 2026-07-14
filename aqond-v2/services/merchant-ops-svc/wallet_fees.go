package main

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

type feeLedgerDay struct {
	MerchantID        string `json:"merchant_id"`
	Date              string `json:"date"`
	MonthIndex        int    `json:"month_index"`
	GrossRevenueMicro int64  `json:"gross_revenue_micro"`
	ServiceFeeMicro   int64  `json:"service_fee_micro"`
	RentFeeMicro      int64  `json:"rent_fee_micro"`
	TotalFeeMicro     int64  `json:"total_fee_micro"`
	NetRevenueMicro   int64  `json:"net_revenue_micro"`
	RentTier          string `json:"rent_tier"`
	RentWaived        bool   `json:"rent_waived"`
	FirstMonthFree    bool   `json:"first_month_free"`
	Lines             []map[string]any `json:"lines"`
	SyncedAt          string `json:"synced_at"`
}

func (a *app) walletFeesRoot(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		path := r.URL.Path
		if path == "/v1/merchant-ops/wallet" || path == "/v1/merchant-ops/wallet/" {
			a.getWallet(w, r)
			return
		}
		if path == "/v1/merchant-ops/fees" || path == "/v1/merchant-ops/fees/" {
			a.getFees(w, r)
			return
		}
	}
	if r.Method == http.MethodPost && (r.URL.Path == "/v1/merchant-ops/wallet/sync" || r.URL.Path == "/v1/merchant-ops/wallet/sync/") {
		a.syncWalletFees(w, r)
		return
	}
	http.Error(w, "not found", http.StatusNotFound)
}

func (a *app) getWallet(w http.ResponseWriter, r *http.Request) {
	mid := r.URL.Query().Get("merchant_id")
	if mid == "" {
		http.Error(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	_ = a.syncMerchantWalletFees(ctx, mid)
	var wlt struct {
		MerchantID              string
		AvailableMicro          int64
		HeldDisputeMicro        int64
		PendingSettlementMicro  int64
		TotalEarnedMicro        int64
		TotalFeesMicro          int64
		NetEarnedMicro          int64
		UpdatedAt               time.Time
	}
	err := a.pool.QueryRow(ctx, `
		SELECT merchant_id, available_micro, held_dispute_micro, pending_settlement_micro,
		       total_earned_micro, total_fees_micro, net_earned_micro, updated_at
		FROM commerce.merchant_wallets WHERE merchant_id=$1`, mid).Scan(
		&wlt.MerchantID, &wlt.AvailableMicro, &wlt.HeldDisputeMicro, &wlt.PendingSettlementMicro,
		&wlt.TotalEarnedMicro, &wlt.TotalFeesMicro, &wlt.NetEarnedMicro, &wlt.UpdatedAt)
	if err != nil {
		http.Error(w, "wallet_not_found", http.StatusNotFound)
		return
	}
	fees, _ := a.loadFeeSummary(ctx, mid)
	jsonOK(w, map[string]any{
		"wallet": map[string]any{
			"merchant_id": wlt.MerchantID,
			"available_micro": wlt.AvailableMicro,
			"held_dispute_micro": wlt.HeldDisputeMicro,
			"pending_settlement_micro": wlt.PendingSettlementMicro,
			"total_earned_micro": wlt.TotalEarnedMicro,
			"total_fees_micro": wlt.TotalFeesMicro,
			"net_earned_micro": wlt.NetEarnedMicro,
			"updated_at": wlt.UpdatedAt.UTC().Format(time.RFC3339),
		},
		"fees": fees,
		"source": "merchant-ops-pg",
	})
}

func (a *app) getFees(w http.ResponseWriter, r *http.Request) {
	mid := r.URL.Query().Get("merchant_id")
	if mid == "" {
		http.Error(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	_ = a.syncMerchantWalletFees(ctx, mid)
	summary, err := a.loadFeeSummary(ctx, mid)
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, summary)
}

func (a *app) syncWalletFees(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MerchantID string `json:"merchant_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	mid := body.MerchantID
	if mid == "" {
		mid = r.URL.Query().Get("merchant_id")
	}
	if mid == "" {
		http.Error(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	if err := a.syncMerchantWalletFees(r.Context(), mid); err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{"ok": true, "merchant_id": mid})
}

func (a *app) loadFeeSummary(ctx context.Context, merchantID string) (map[string]any, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT fee_date, month_index, gross_revenue_micro, service_fee_micro, rent_fee_micro,
		       total_fee_micro, net_revenue_micro, rent_tier, rent_waived, first_month_free, lines, synced_at
		FROM commerce.merchant_fee_ledger WHERE merchant_id=$1 ORDER BY fee_date DESC LIMIT 45`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ledger []feeLedgerDay
	var totalFees, totalGross int64
	for rows.Next() {
		var d feeLedgerDay
		var dt time.Time
		var lines []byte
		var synced time.Time
		if rows.Scan(&dt, &d.MonthIndex, &d.GrossRevenueMicro, &d.ServiceFeeMicro, &d.RentFeeMicro,
			&d.TotalFeeMicro, &d.NetRevenueMicro, &d.RentTier, &d.RentWaived, &d.FirstMonthFree, &lines, &synced) == nil {
			d.MerchantID = merchantID
			d.Date = dt.Format("2006-01-02")
			d.SyncedAt = synced.UTC().Format(time.RFC3339)
			_ = json.Unmarshal(lines, &d.Lines)
			ledger = append(ledger, d)
			totalFees += d.TotalFeeMicro
			totalGross += d.GrossRevenueMicro
		}
	}
	today := bangkokDateKey(time.Now())
	var todayEntry any
	for _, e := range ledger {
		if e.Date == today {
			todayEntry = e
			break
		}
	}
	monthKey := today[:7]
	var monthGross, monthFees int64
	for _, e := range ledger {
		if len(e.Date) >= 7 && e.Date[:7] == monthKey {
			monthGross += e.GrossRevenueMicro
			monthFees += e.TotalFeeMicro
		}
	}
	shopStart, _ := a.shopStartDate(ctx, merchantID)
	return map[string]any{
		"merchant_id": merchantID,
		"shop_started_at": shopStart,
		"today": todayEntry,
		"month": map[string]any{
			"key": monthKey, "gross_micro": monthGross, "fees_micro": monthFees,
			"net_micro": monthGross - monthFees,
		},
		"totals": map[string]any{
			"gross_micro": totalGross, "fees_micro": totalFees, "net_micro": totalGross - totalFees,
		},
		"ledger": ledger,
		"source": "merchant-ops-pg",
	}, nil
}

func (a *app) shopStartDate(ctx context.Context, merchantID string) (string, error) {
	var created time.Time
	err := a.pool.QueryRow(ctx, `
		SELECT created_at FROM commerce.merchant_shops WHERE id=$1 LIMIT 1`, merchantID).Scan(&created)
	if err != nil {
		return time.Now().UTC().Format(time.RFC3339), nil
	}
	return created.UTC().Format(time.RFC3339), nil
}
