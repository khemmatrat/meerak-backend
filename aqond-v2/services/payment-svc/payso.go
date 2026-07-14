package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
)

type paysoConfig struct {
	baseURL    string
	merchantID string
	apiKey     string
	authMode   string
	headerName string
	amountUnit string
	depositPath string
	statusPath  string
	webhookURL  string
}

func isPaysoEnabled() bool {
	return strings.TrimSpace(config.Get("PAYSO_ENABLED", "0")) == "1"
}

func loadPaysoConfig() paysoConfig {
	base := strings.TrimRight(strings.TrimSpace(config.Get("PAYSO_API_BASE_URL", "")), "/")
	deposit := strings.TrimSpace(config.Get("PAYSO_DEPOSIT_PATH", "/api/v2/promptpaynew"))
	if deposit != "" && !strings.HasPrefix(deposit, "/") {
		deposit = "/" + deposit
	}
	status := strings.TrimSpace(config.Get("PAYSO_DEPOSIT_STATUS_PATH", ""))
	if status != "" && !strings.HasPrefix(status, "/") && !strings.HasPrefix(status, "http") {
		status = "/" + status
	}
	webhook := strings.TrimSpace(config.Get("PAYSO_WEBHOOK_PUBLIC_URL", ""))
	if webhook == "" {
		basePublic := strings.TrimRight(strings.TrimSpace(config.Get("PUBLIC_BASE_URL", "")), "/")
		if basePublic != "" {
			webhook = basePublic + "/api/v1/payment/v1/webhooks/payso"
		}
	}
	return paysoConfig{
		baseURL:     base,
		merchantID:  strings.TrimSpace(config.Get("PAYSO_MERCHANT_ID", "")),
		apiKey:      firstNonEmpty(config.Get("PAYSO_API_KEY", ""), config.Get("PAYSO_SECRET_KEY", "")),
		authMode:    strings.ToLower(config.Get("PAYSO_AUTH_MODE", "bearer")),
		headerName:  config.Get("PAYSO_API_KEY_HEADER", "X-API-Key"),
		amountUnit:  strings.ToLower(config.Get("PAYSO_AMOUNT_UNIT", "thb")),
		depositPath: deposit,
		statusPath:  status,
		webhookURL:  webhook,
	}
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func buildPaysoReferenceID(seed string) string {
	sum := sha256.Sum256([]byte(seed))
	n := new(big.Int).SetBytes(sum[:7])
	mod := new(big.Int).Exp(big.NewInt(10), big.NewInt(12), nil)
	n.Mod(n, mod)
	return fmt.Sprintf("%012s", n.String())
}

func (c paysoConfig) authHeaders() (http.Header, error) {
	h := http.Header{}
	if c.apiKey == "" {
		return h, fmt.Errorf("PAYSO_API_KEY not configured")
	}
	switch c.authMode {
	case "basic":
		h.Set("Authorization", "Basic "+basicAuth(c.merchantID, c.apiKey))
	case "header":
		h.Set(c.headerName, c.apiKey)
		if c.merchantID != "" {
			h.Set("merchant_id", c.merchantID)
		}
	default:
		h.Set("Authorization", "Bearer "+c.apiKey)
	}
	if c.merchantID != "" {
		h.Set("X-Merchant-Id", c.merchantID)
	}
	return h, nil
}

func basicAuth(user, pass string) string {
	return base64.StdEncoding.EncodeToString([]byte(user + ":" + pass))
}

type paysoDepositResult struct {
	ReferenceID string
	QRCodeURL   string
	Raw         map[string]any
}

func createPaysoDepositCharge(cfg paysoConfig, amountThb float64, seed, customerEmail, productDetail string) (*paysoDepositResult, error) {
	if cfg.baseURL == "" {
		return nil, fmt.Errorf("PAYSO_API_BASE_URL not configured")
	}
	headers, err := cfg.authHeaders()
	if err != nil {
		return nil, err
	}
		ref := buildPaysoReferenceID(seed)
	paysoRef := ref
	if strings.HasPrefix(paysoRef, "0") {
		paysoRef = "1" + paysoRef[1:]
	}
	amount := amountThb
	if cfg.amountUnit == "satang" {
		amount = float64(int64(amountThb*100)) / 100
	}
	email := customerEmail
	if email == "" {
		email = "noreply@aqond.com"
	}
	detail := productDetail
	if detail == "" {
		detail = "AQOND order " + seed
	}
	detail = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(detail, "<", ""), ">", ""))
	if len(detail) > 256 {
		detail = detail[:256]
	}
	qs := url.Values{
		"merchantID":    {cfg.merchantID},
		"productDetail": {detail},
		"customerEmail": {email},
		"customerName":  {"AQOND User"},
		"total":         {fmt.Sprintf("%.2f", amount)},
		"referenceNo":   {paysoRef},
	}
	if cfg.webhookURL != "" {
		for _, k := range []string{"callbackUrl", "callback_url", "webhookUrl", "webhook_url", "notifyUrl", "notify_url"} {
			qs.Set(k, cfg.webhookURL)
		}
	}
	reqURL := cfg.baseURL + cfg.depositPath + "?" + qs.Encode()
	body, status, err := paysoHTTPRequest("POST", reqURL, headers, nil)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		errMsg := paysoErrMsg(body)
		if errMsg == "" {
			errMsg = fmt.Sprintf("payso_deposit_http_%d", status)
		}
		return nil, fmt.Errorf("%s", errMsg)
	}
	if errMsg := paysoErrMsg(body); errMsg != "" {
		return nil, fmt.Errorf("%s", errMsg)
	}
	qr := extractPaysoQR(body)
	return &paysoDepositResult{ReferenceID: paysoRef, QRCodeURL: qr, Raw: body}, nil
}

func extractPaysoQR(body map[string]any) string {
	if body == nil {
		return ""
	}
	nested, _ := body["data"].(map[string]any)
	candidates := []any{
		body["image"], nested["image"], body["QRImage"], nested["QRImage"],
		body["qr_code_url"], body["qr_image_url"], body["qrcode_url"], body["image_url"], body["qr_url"],
	}
	if nested != nil {
		candidates = append(candidates, nested["qr_code_url"], nested["qr_image_url"], nested["image_url"])
	}
	for _, c := range candidates {
		s := strings.TrimSpace(fmt.Sprint(c))
		if s == "" || s == "<nil>" {
			continue
		}
		if strings.HasPrefix(s, "data:image/") || strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") {
			return s
		}
		if len(s) > 40 {
			return "data:image/png;base64," + s
		}
	}
	return ""
}

func paysoErrMsg(body map[string]any) string {
	if body == nil {
		return ""
	}
	for _, k := range []string{"error", "message", "error_message"} {
		if v, ok := body[k].(string); ok && strings.TrimSpace(v) != "" {
			return v
		}
	}
	if e, ok := body["errors"].(string); ok && e != "" {
		return e
	}
	return ""
}

type paysoInquiryResult struct {
	Paid          bool
	Status        string
	TransactionID string
	Error         string
}

func queryPaysoDepositStatus(cfg paysoConfig, referenceID string) paysoInquiryResult {
	ref := strings.TrimSpace(referenceID)
	if ref == "" {
		return paysoInquiryResult{Error: "missing_reference_id"}
	}
	if cfg.baseURL == "" {
		return paysoInquiryResult{Error: "PAYSO_API_BASE_URL not configured"}
	}
	if cfg.statusPath == "" {
		return paysoInquiryResult{Error: "PAYSO_DEPOSIT_STATUS_PATH not configured"}
	}
	if cfg.statusPath == cfg.depositPath {
		return paysoInquiryResult{Error: "PAYSO_DEPOSIT_STATUS_PATH points to deposit-create endpoint"}
	}
	headers, err := cfg.authHeaders()
	if err != nil {
		return paysoInquiryResult{Error: err.Error()}
	}
	qs := url.Values{
		"merchantID":   {cfg.merchantID},
		"referenceNo":  {ref},
		"reference_id": {ref},
		"referenceId":  {ref},
	}
	var reqURL string
	if strings.HasPrefix(cfg.statusPath, "http") {
		reqURL = cfg.statusPath
	} else {
		reqURL = cfg.baseURL + cfg.statusPath + "?" + qs.Encode()
	}
	method := strings.ToUpper(config.Get("PAYSO_DEPOSIT_STATUS_METHOD", "GET"))
	body, status, err := paysoHTTPRequest(method, reqURL, headers, nil)
	if err != nil {
		return paysoInquiryResult{Error: err.Error()}
	}
	if status == 405 && method == "GET" {
		body, status, err = paysoHTTPRequest("POST", reqURL, headers, map[string]any{
			"merchantID": cfg.merchantID, "orderNo": ref, "refno": ref,
		})
		if err != nil {
			return paysoInquiryResult{Error: err.Error()}
		}
	}
	if status < 200 || status >= 300 {
		return paysoInquiryResult{Error: fmt.Sprintf("payso_status_http_%d", status)}
	}
	parsed := parsePaysoPaidFlag(body)
	return paysoInquiryResult{
		Paid: parsed.Paid, Status: parsed.Status, TransactionID: parsed.TransactionID,
		Error: paysoErrMsg(body),
	}
}

func parsePaysoPaidFlag(body map[string]any) paysoInquiryResult {
	src := body
	if arr, ok := body[""].([]any); ok && len(arr) > 0 {
		if m, ok := arr[0].(map[string]any); ok {
			src = m
		}
	}
	nested, _ := src["data"].(map[string]any)
	statusRaw := strings.ToLower(firstString(
		src["status"], nested["status"], src["Status"], nested["Status"],
		src["payment_status"], nested["payment_status"], src["state"], nested["state"],
	))
	paidStates := map[string]bool{
		"success": true, "successful": true, "succeeded": true, "paid": true,
		"completed": true, "complete": true, "charge.complete": true, "settled": true, "cp": true, "y": true,
	}
	paid := paidStates[statusRaw]
	if !paid {
		paid = src["paid"] == true || nested["paid"] == true || src["success"] == true || nested["success"] == true
	}
	txn := firstString(
		src["transaction_id"], nested["transaction_id"], src["transactionId"], nested["transactionId"],
		src["payso_transaction_id"], nested["payso_transaction_id"],
	)
	return paysoInquiryResult{Paid: paid, Status: statusRaw, TransactionID: txn}
}

func firstString(vals ...any) string {
	for _, v := range vals {
		s := strings.TrimSpace(fmt.Sprint(v))
		if s != "" && s != "<nil>" {
			return s
		}
	}
	return ""
}

func paysoHTTPRequest(method, reqURL string, headers http.Header, jsonBody map[string]any) (map[string]any, int, error) {
	client := &http.Client{Timeout: 20 * time.Second}
	var bodyReader io.Reader
	if jsonBody != nil {
		b, _ := json.Marshal(jsonBody)
		bodyReader = strings.NewReader(string(b))
	}
	req, err := http.NewRequest(method, reqURL, bodyReader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json")
	if jsonBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, vs := range headers {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var parsed map[string]any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &parsed)
	}
	if parsed == nil {
		parsed = map[string]any{"raw": string(raw)}
	}
	return parsed, resp.StatusCode, nil
}

func verifyPaysoWebhookSignature(rawBody []byte, headers http.Header) bool {
	secret := strings.TrimSpace(config.Get("PAYSO_WEBHOOK_SECRET", ""))
	if secret == "" {
		return false
	}
	headerName := strings.ToLower(config.Get("PAYSO_WEBHOOK_SIGNATURE_HEADER", "x-payso-signature"))
	sig := headers.Get(headerName)
	if sig == "" {
		for _, h := range []string{"X-Payso-Signature", "X-Signature", "X-Hub-Signature-256"} {
			if v := headers.Get(h); v != "" {
				sig = v
				break
			}
		}
	}
	if sig == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))
	normalized := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(sig)), "sha256=")
	return hmac.Equal([]byte(normalized), []byte(expected)) || sig == expected
}

type paysoWebhookPayload struct {
	ReferenceID   string
	TransactionID string
	Status        string
	Amount        float64
	Raw           map[string]any
}

func parsePaysoWebhookPayload(raw []byte) (*paysoWebhookPayload, error) {
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		// form-urlencoded fallback
		vals, err2 := url.ParseQuery(string(raw))
		if err2 != nil {
			return nil, fmt.Errorf("invalid_payload")
		}
		payload = map[string]any{}
		for k, v := range vals {
			if len(v) > 0 {
				payload[k] = v[0]
			}
		}
	}
	nested, _ := payload["data"].(map[string]any)
	ref := firstString(
		payload["reference_id"], nested["reference_id"], payload["reference_no"], payload["refno"],
		payload["ref_no"], payload["referenceId"],
	)
	st := strings.ToLower(firstString(payload["status"], nested["status"], payload["payment_status"], payload["state"]))
	txn := firstString(payload["transaction_id"], nested["transaction_id"], payload["transactionId"])
	var amt float64
	for _, k := range []string{"total", "amount", "total_amount"} {
		if v, ok := payload[k]; ok {
			switch n := v.(type) {
			case float64:
				amt = n
			case string:
				fmt.Sscanf(n, "%f", &amt)
			}
			if amt > 0 {
				break
			}
		}
	}
	return &paysoWebhookPayload{
		ReferenceID: ref, TransactionID: txn, Status: st, Amount: amt, Raw: payload,
	}, nil
}

func paysoSuccessStatus(st string) bool {
	success := map[string]bool{
		"success": true, "successful": true, "succeeded": true, "paid": true,
		"completed": true, "complete": true, "settled": true,
	}
	return success[st]
}

func paysoFailureStatus(st string) bool {
	fail := map[string]bool{"failed": true, "cancel": true, "cancelled": true, "expired": true, "void": true}
	return fail[st]
}

type paysoProvider struct{}

func (paysoProvider) Name() string { return "payso-th" }

func (paysoProvider) Authorize(in *intent) (AuthResult, error) {
	cfg := loadPaysoConfig()
	amountThb := float64(in.AmountMicro) / 1_000_000
	email := in.metadataString("customer_email")
	if email == "" {
		email = in.metadataString("buyer_email")
	}
	detail := fmt.Sprintf("AQOND order %s merchant %s", in.OrderID, in.MerchantID)
	if in.OrderID == "" {
		detail = fmt.Sprintf("AQOND payment %s", in.ID)
	}
	seed := in.ID + "-" + in.BuyerID
	res, err := createPaysoDepositCharge(cfg, amountThb, seed, email, detail)
	if err != nil {
		return AuthResult{}, err
	}
	return AuthResult{
		ProviderRef: res.ReferenceID,
		TokenRef:    tokenize("payso", res.ReferenceID),
		RedirectURL: res.QRCodeURL,
		QRCodeURL:   res.QRCodeURL,
	}, nil
}

func (paysoProvider) Capture(in *intent, amt int64) (string, error) {
	cfg := loadPaysoConfig()
	ref := in.ProviderRef
	if ref == "" {
		ref = in.metadataString("payso_reference_id")
	}
	inquiry := queryPaysoDepositStatus(cfg, ref)
	if inquiry.Error != "" && !inquiry.Paid {
		return "", fmt.Errorf("payso_not_paid: %s", inquiry.Error)
	}
	if !inquiry.Paid {
		return "", fmt.Errorf("payso_not_paid")
	}
	txn := inquiry.TransactionID
	if txn == "" {
		txn = "payso_" + ref
	}
	return txn, nil
}

func (paysoProvider) Refund(in *intent, amt int64) (string, error) {
	return "payso_ref_" + in.ID, nil
}

func (paysoProvider) Void(in *intent) error { return nil }
