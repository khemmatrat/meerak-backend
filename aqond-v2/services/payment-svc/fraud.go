package main

import (
	"strings"
)

// scoreFraud is a transparent rule-based risk scorer for the authorize path (P89).
// Returns score 0-100 + decision (allow|challenge|block) + the signals that fired.
// Designed to run in shadow-mode first (FRAUD_ENFORCE=0) before hard enforcement.
func scoreFraud(buyerID string, amountMicro int64, device, ip, method string) (int, string, map[string]any) {
	score := 0
	signals := map[string]any{}

	// High-value velocity heuristic
	if amountMicro > 5_000_000_000 { // > ~5000 in major units
		score += 40
		signals["high_value"] = true
	} else if amountMicro > 1_000_000_000 {
		score += 15
		signals["elevated_value"] = true
	}

	// Missing device / ip fingerprints are suspicious for card-not-present
	if device == "" && (method == "card" || method == "wallet") {
		score += 20
		signals["missing_device"] = true
	}
	if ip == "" {
		score += 10
		signals["missing_ip"] = true
	}

	// Known blocklist prefixes (stub; real impl checks a blocklist store)
	if strings.HasPrefix(strings.ToLower(buyerID), "blocked") {
		score += 60
		signals["buyer_blocklisted"] = true
	}
	if isBlockedIP(ip) {
		score += 50
		signals["ip_blocklisted"] = true
	}

	// COD has its own risk track (no card auth), keep moderate
	if method == "cod" && amountMicro > 2_000_000_000 {
		score += 25
		signals["high_value_cod"] = true
	}

	if score > 100 {
		score = 100
	}
	decision := "allow"
	switch {
	case score >= 85:
		decision = "block"
	case score >= 55:
		decision = "challenge"
	}
	signals["score"] = score
	return score, decision, signals
}

func isBlockedIP(ip string) bool {
	for _, b := range []string{"0.0.0.0", "10.66.66.66"} {
		if ip == b {
			return true
		}
	}
	return false
}
