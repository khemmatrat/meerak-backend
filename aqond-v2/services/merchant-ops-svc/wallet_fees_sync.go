package main

import (
	"context"
	"encoding/json"
	"time"
)

const (
	year1FreeRentUntilMicro = 1_000_000
	tierLowMonthlyMicro     = 2_500_000
	tierHighMonthlyMicro    = 5_000_000
	rentLowTotalMicro       = 150_000
	rentHighTotalMicro      = 300_000
	rentLowDailyMicro       = 10_000
	rentHighDailyMicro      = 20_000
	rentDeductionDays       = 15
	serviceFeeBps           = 300
)

func bangkokDateKey(t time.Time) string {
	loc, _ := time.LoadLocation("Asia/Bangkok")
	return t.In(loc).Format("2006-01-02")
}

func shopMonthIndex(shopStart time.Time, at time.Time) int {
	loc, _ := time.LoadLocation("Asia/Bangkok")
	s := shopStart.In(loc)
	a := at.In(loc)
	months := (a.Year()-s.Year())*12 + int(a.Month()-s.Month()) + 1
	if months < 1 {
		return 1
	}
	return months
}

func isShopFirstYear(shopStart time.Time, at time.Time) bool {
	return at.Before(shopStart.AddDate(1, 0, 0))
}

func rentTierForMonthlyRevenue(monthly int64) string {
	if monthly > tierHighMonthlyMicro {
		return "high"
	}
	if monthly > tierLowMonthlyMicro {
		return "low"
	}
	return "none"
}

func computeDailyFees(date string, monthIndex int, dailyRev, monthlyRev, cumulativeRev int64,
	rentChargedMonth int64, rentDaysMonth int, isFirstYear bool) feeLedgerDay {
	firstMonthFree := monthIndex <= 1
	year1RentWaived := isFirstYear && cumulativeRev < year1FreeRentUntilMicro
	rentWaived := firstMonthFree || year1RentWaived || monthIndex <= 1

	var serviceFee int64
	if !firstMonthFree && dailyRev > 0 {
		serviceFee = (dailyRev * serviceFeeBps) / 10_000
	}

	rentFee := int64(0)
	rentTier := "none"
	if !rentWaived && monthIndex >= 2 {
		rentTier = rentTierForMonthlyRevenue(monthlyRev)
		cap := int64(0)
		dailyRate := int64(0)
		switch rentTier {
		case "high":
			cap, dailyRate = rentHighTotalMicro, rentHighDailyMicro
		case "low":
			cap, dailyRate = rentLowTotalMicro, rentLowDailyMicro
		}
		if cap > 0 && dailyRate > 0 && rentDaysMonth < rentDeductionDays && rentChargedMonth < cap {
			rentFee = dailyRate
			if rentChargedMonth+rentFee > cap {
				rentFee = cap - rentChargedMonth
			}
		}
	}

	lines := []map[string]any{}
	if serviceFee > 0 {
		lines = append(lines, map[string]any{"type": "service_fee", "label": "ค่าธรรมเนียมบริการ 3%", "amount_micro": serviceFee})
	}
	if rentFee > 0 {
		lines = append(lines, map[string]any{"type": "shop_rent", "label": "หักค่าเช่าร้าน", "amount_micro": rentFee})
	}
	totalFee := serviceFee + rentFee
	return feeLedgerDay{
		Date: date, MonthIndex: monthIndex, GrossRevenueMicro: dailyRev,
		ServiceFeeMicro: serviceFee, RentFeeMicro: rentFee, TotalFeeMicro: totalFee,
		NetRevenueMicro: max64(0, dailyRev-totalFee), RentTier: rentTier,
		RentWaived: rentWaived, FirstMonthFree: firstMonthFree, Lines: lines,
	}
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func (a *app) syncMerchantWalletFees(ctx context.Context, merchantID string) error {
	shopStart, _ := a.shopStartDate(ctx, merchantID)
	startAt, _ := time.Parse(time.RFC3339, shopStart)

	rows, err := a.pool.Query(ctx, `
		SELECT amount_micro, COALESCE(metadata->>'fulfillment_status',''), status, created_at
		FROM commerce.orders WHERE merchant_id=$1`, merchantID)
	if err != nil {
		return err
	}
	defer rows.Close()

	revenueByDate := map[string]int64{}
	var totalEarned int64
	dayAgo := time.Now().Add(-24 * time.Hour)
	var pendingGross int64

	for rows.Next() {
		var amount int64
		var fs, status string
		var created time.Time
		if rows.Scan(&amount, &fs, &status, &created) != nil {
			continue
		}
		delivered := fs == "delivered" || status == "completed"
		if !delivered {
			continue
		}
		totalEarned += amount
		key := bangkokDateKey(created)
		revenueByDate[key] += amount
		if created.After(dayAgo) {
			pendingGross += amount
		}
	}

	dates := make([]string, 0, len(revenueByDate))
	for d := range revenueByDate {
		dates = append(dates, d)
	}
	sortStrings(dates)

	monthRentAcc := map[string]struct{ charged, days int64 }{}
	for _, date := range dates {
		at, _ := time.Parse("2006-01-02", date)
		monthKey := date[:7]
		monthIdx := shopMonthIndex(startAt, at)
		daily := revenueByDate[date]
		monthly := monthlyRevenueUpTo(revenueByDate, monthKey, date)
		cumulative := cumulativeRevenueUpTo(revenueByDate, date)
		acc := monthRentAcc[monthKey]
		entry := computeDailyFees(date, monthIdx, daily, monthly, cumulative, acc.charged, int(acc.days), isShopFirstYear(startAt, at))
		entry.MerchantID = merchantID
		linesJSON, _ := json.Marshal(entry.Lines)
		_, _ = a.pool.Exec(ctx, `
			INSERT INTO commerce.merchant_fee_ledger
			  (merchant_id, fee_date, month_index, gross_revenue_micro, service_fee_micro, rent_fee_micro,
			   total_fee_micro, net_revenue_micro, rent_tier, rent_waived, first_month_free, lines, synced_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,NOW())
			ON CONFLICT (merchant_id, fee_date) DO UPDATE SET
			  month_index=EXCLUDED.month_index, gross_revenue_micro=EXCLUDED.gross_revenue_micro,
			  service_fee_micro=EXCLUDED.service_fee_micro, rent_fee_micro=EXCLUDED.rent_fee_micro,
			  total_fee_micro=EXCLUDED.total_fee_micro, net_revenue_micro=EXCLUDED.net_revenue_micro,
			  rent_tier=EXCLUDED.rent_tier, rent_waived=EXCLUDED.rent_waived,
			  first_month_free=EXCLUDED.first_month_free, lines=EXCLUDED.lines, synced_at=NOW()`,
			merchantID, date, entry.MonthIndex, entry.GrossRevenueMicro, entry.ServiceFeeMicro,
			entry.RentFeeMicro, entry.TotalFeeMicro, entry.NetRevenueMicro, entry.RentTier,
			entry.RentWaived, entry.FirstMonthFree, string(linesJSON))
		if entry.RentFeeMicro > 0 {
			acc.charged += entry.RentFeeMicro
			acc.days++
			monthRentAcc[monthKey] = acc
		}
	}

	var totalFees int64
	_ = a.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(total_fee_micro),0) FROM commerce.merchant_fee_ledger WHERE merchant_id=$1`, merchantID).Scan(&totalFees)

	netEarned := max64(0, totalEarned-totalFees)
	_, err = a.pool.Exec(ctx, `
		INSERT INTO commerce.merchant_wallets
		  (merchant_id, available_micro, held_dispute_micro, pending_settlement_micro,
		   total_earned_micro, total_fees_micro, net_earned_micro, updated_at)
		VALUES ($1,0,0,$2,$3,$4,$5,NOW())
		ON CONFLICT (merchant_id) DO UPDATE SET
		  pending_settlement_micro=EXCLUDED.pending_settlement_micro,
		  total_earned_micro=EXCLUDED.total_earned_micro,
		  total_fees_micro=EXCLUDED.total_fees_micro,
		  net_earned_micro=EXCLUDED.net_earned_micro,
		  updated_at=NOW()`,
		merchantID, pendingGross, totalEarned, totalFees, netEarned)
	return err
}

func monthlyRevenueUpTo(revenue map[string]int64, monthKey, through string) int64 {
	var sum int64
	for d, amt := range revenue {
		if len(d) >= 7 && d[:7] == monthKey && d <= through {
			sum += amt
		}
	}
	return sum
}

func cumulativeRevenueUpTo(revenue map[string]int64, through string) int64 {
	var sum int64
	for d, amt := range revenue {
		if d <= through {
			sum += amt
		}
	}
	return sum
}

func sortStrings(ss []string) {
	for i := 0; i < len(ss); i++ {
		for j := i + 1; j < len(ss); j++ {
			if ss[j] < ss[i] {
				ss[i], ss[j] = ss[j], ss[i]
			}
		}
	}
}
