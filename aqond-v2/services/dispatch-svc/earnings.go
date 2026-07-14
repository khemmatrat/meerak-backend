package main

import (
	"context"
	"fmt"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/ulid"
)

func (a *app) creditRiderEarning(ctx context.Context, riderID, jobID, orderID string, grossMicro int64) error {
	if riderID == "" || grossMicro <= 0 {
		return nil
	}
	feeBps := config.Int("RIDER_PLATFORM_FEE_BPS", 1500)
	feeMicro := grossMicro * int64(feeBps) / 10000
	netMicro := grossMicro - feeMicro
	if netMicro < 0 {
		netMicro = 0
	}
	id := ulid.New()
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.rider_earnings (id, rider_id, job_id, order_id, gross_micro, fee_micro, net_micro)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		id, riderID, jobID, orderID, grossMicro, feeMicro, netMicro)
	if err != nil {
		return err
	}
	_, err = a.pool.Exec(ctx, `
		UPDATE commerce.dispatch_riders SET earnings_micro = earnings_micro + $2
		WHERE id=$1`, riderID, netMicro)
	return err
}

func (a *app) riderEarningPerJob() int64 {
	v := config.Int("RIDER_EARNING_PER_JOB_MICRO", 4500)
	if v <= 0 {
		v = 4500
	}
	return int64(v)
}

func (a *app) riderWithdrawableMicro(ctx context.Context, riderID string) (int64, error) {
	var earned int64
	_ = a.pool.QueryRow(ctx, `SELECT COALESCE(SUM(net_micro),0) FROM commerce.rider_earnings WHERE rider_id=$1`, riderID).Scan(&earned)
	var paid int64
	_ = a.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_micro),0) FROM commerce.rider_payouts
		WHERE rider_id=$1 AND status IN ('pending','approved','paid')`, riderID).Scan(&paid)
	bal := earned - paid
	if bal < 0 {
		return 0, nil
	}
	return bal, nil
}

func (a *app) createRiderPayout(ctx context.Context, riderID string, amountMicro int64) (string, error) {
	if amountMicro <= 0 {
		return "", fmt.Errorf("invalid_amount")
	}
	withdrawable, err := a.riderWithdrawableMicro(ctx, riderID)
	if err != nil {
		return "", err
	}
	if amountMicro > withdrawable {
		return "", fmt.Errorf("insufficient_balance")
	}
	var kyc, bank string
	var suspended bool
	err = a.pool.QueryRow(ctx, `
		SELECT kyc_status, COALESCE(bank_account,''), suspended FROM commerce.dispatch_riders WHERE id=$1`,
		riderID).Scan(&kyc, &bank, &suspended)
	if err != nil {
		return "", fmt.Errorf("rider_not_found")
	}
	if suspended {
		return "", fmt.Errorf("rider_suspended")
	}
	if kyc != "approved" {
		return "", fmt.Errorf("kyc_not_approved")
	}
	if bank == "" {
		return "", fmt.Errorf("bank_account_required")
	}
	minPayout := int64(config.Int("RIDER_MIN_PAYOUT_MICRO", 10000))
	if amountMicro < minPayout {
		return "", fmt.Errorf("below_minimum")
	}
	id := ulid.New()
	_, err = a.pool.Exec(ctx, `
		INSERT INTO commerce.rider_payouts (id, rider_id, amount_micro, status, bank_account)
		VALUES ($1,$2,$3,'pending',$4)`, id, riderID, amountMicro, bank)
	return id, err
}
