package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
)

func buildPaysoRef(seed string) string {
	sum := sha256.Sum256([]byte(seed))
	n := new(big.Int).SetBytes(sum[:7])
	mod := new(big.Int).Exp(big.NewInt(10), big.NewInt(12), nil)
	n.Mod(n, mod)
	return fmt.Sprintf("%012s", n.String())
}

func paysoPayoutAuthHeaders(merchantID, apiKey, authMode string) http.Header {
	h := http.Header{}
	if authMode == "basic" {
		h.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(merchantID+":"+apiKey)))
	} else {
		h.Set("Authorization", "Bearer "+apiKey)
	}
	if merchantID != "" {
		h.Set("X-Merchant-Id", merchantID)
	}
	return h
}

func extractPromptPayID(bankAccount string) string {
	var digits strings.Builder
	for _, r := range bankAccount {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}
	s := digits.String()
	if len(s) >= 10 {
		return s
	}
	return ""
}

func sendPaysoPayout(ctx context.Context, payoutID, bankAccount string, amountThb float64) (ref, txnID string, err error) {
	if strings.TrimSpace(config.Get("PAYSO_ENABLED", "0")) != "1" {
		return "", "", fmt.Errorf("payso_not_enabled")
	}
	baseURL := strings.TrimRight(config.Get("PAYSO_API_BASE_URL", ""), "/")
	apiKey := config.Get("PAYSO_API_KEY", config.Get("PAYSO_SECRET_KEY", ""))
	merchantID := config.Get("PAYSO_MERCHANT_ID", "")
	path := config.Get("PAYSO_PROMPTPAY_PAYOUT_PATH", "/api/v1/payouts/promptpay")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	if baseURL == "" || apiKey == "" {
		return "", "", fmt.Errorf("payso_not_configured")
	}
	ppID := extractPromptPayID(bankAccount)
	if ppID == "" {
		return "", "", fmt.Errorf("invalid_promptpay_id")
	}
	ref = buildPaysoRef(payoutID)
	payload := map[string]any{
		"merchant_id": merchantID, "reference_id": ref, "reference_no": ref, "refno": ref,
		"amount": amountThb, "currency": "THB", "promptpay_id": ppID, "promptpay": ppID,
		"description": fmt.Sprintf("AQOND rider payout %s", payoutID),
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+path, bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, vs := range paysoPayoutAuthHeaders(merchantID, apiKey, strings.ToLower(config.Get("PAYSO_AUTH_MODE", "bearer"))) {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	client := &http.Client{Timeout: 25 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return ref, "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var parsed map[string]any
	_ = json.Unmarshal(raw, &parsed)
	if resp.StatusCode >= 300 {
		return ref, "", fmt.Errorf("payso_payout_http_%d: %s", resp.StatusCode, string(raw))
	}
	txnID, _ = parsed["transaction_id"].(string)
	if txnID == "" {
		if nested, ok := parsed["data"].(map[string]any); ok {
			txnID, _ = nested["transaction_id"].(string)
		}
	}
	return ref, txnID, nil
}
