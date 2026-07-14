// Package slo implements error-budget math for the P171 SLO framework.
package slo

// BudgetRemainingBps returns remaining error budget in basis points (10000 = 100%).
func BudgetRemainingBps(target, observed float64) int {
	if target <= 0 || target > 1 {
		target = 0.999
	}
	allowedErrors := 1.0 - target
	if allowedErrors <= 0 {
		return 10000
	}
	used := 1.0 - observed
	if used < 0 {
		used = 0
	}
	remaining := (allowedErrors - used) / allowedErrors
	if remaining < 0 {
		return 0
	}
	return int(remaining * 10000)
}

// BurnRateBps estimates hourly burn as bps of total budget consumed per hour.
func BurnRateBps(target, observed float64, windowHours float64) int {
	if windowHours <= 0 {
		windowHours = 1
	}
	remaining := BudgetRemainingBps(target, observed)
	burned := 10000 - remaining
	return int(float64(burned) / windowHours)
}

// ReleaseAllowed returns false when fast-burn threshold exceeded.
func ReleaseAllowed(burnRateBps, alertThresholdBps int) bool {
	return burnRateBps < alertThresholdBps
}
