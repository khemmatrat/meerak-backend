package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/aqond/aqond-v2/pkg/ulid"
)

// AuthResult is what a PaymentProvider returns from Authorize.
type AuthResult struct {
	ProviderRef  string
	TokenRef     string
	Requires3DS  bool
	RedirectURL  string
	QRCodeURL    string
}

// PaymentProvider is the provider-agnostic seam (P81). Real PSP adapters
// (Stripe-style card, PromptPay/QR, e-wallet) implement this in P83.
type PaymentProvider interface {
	Name() string
	// Authorize reserves funds; never receives or stores a PAN (P90) — only a token.
	Authorize(intent *intent) (AuthResult, error)
	Capture(intent *intent, amountMicro int64) (string, error)
	Refund(intent *intent, amountMicro int64) (string, error)
	Void(intent *intent) error
}

// tokenize turns raw instrument input into an opaque vault token (P90).
// In dev-lite this is a deterministic hash; in prod this calls a PCI vault.
func tokenize(method, raw string) string {
	if raw == "" {
		raw = ulid.New()
	}
	sum := sha256.Sum256([]byte(method + ":" + raw))
	return "tok_" + hex.EncodeToString(sum[:8])
}

// ---- Stub adapters (dev-lite sandbox; replace with real PSP SDKs in P83) ----

type cardProvider struct{}

func (cardProvider) Name() string { return "stub-card" }
func (cardProvider) Authorize(in *intent) (AuthResult, error) {
	// Card auth may trigger 3DS step-up when risk is elevated (P89).
	return AuthResult{
		ProviderRef: "auth_" + ulid.New(),
		TokenRef:    tokenize("card", in.metadataString("instrument")),
		Requires3DS: in.RiskScore >= 60,
		RedirectURL: "",
	}, nil
}
func (cardProvider) Capture(in *intent, amt int64) (string, error) { return "cap_" + ulid.New(), nil }
func (cardProvider) Refund(in *intent, amt int64) (string, error)  { return "ref_" + ulid.New(), nil }
func (cardProvider) Void(in *intent) error                         { return nil }

type promptPayProvider struct{}

func (promptPayProvider) Name() string { return "stub-promptpay" }
func (promptPayProvider) Authorize(in *intent) (AuthResult, error) {
	// QR rails authorize via redirect/scan, no 3DS.
	return AuthResult{
		ProviderRef: "pp_" + ulid.New(),
		TokenRef:    tokenize("promptpay", in.BuyerID),
		RedirectURL: "promptpay://qr/" + in.ID,
	}, nil
}
func (promptPayProvider) Capture(in *intent, amt int64) (string, error) { return "cap_" + ulid.New(), nil }
func (promptPayProvider) Refund(in *intent, amt int64) (string, error)  { return "ref_" + ulid.New(), nil }
func (promptPayProvider) Void(in *intent) error                         { return nil }

// codProvider models Cash-on-Delivery (P82): authorize == accept order,
// capture happens on courier confirmation webhook.
type codProvider struct{}

func (codProvider) Name() string { return "cod" }
func (codProvider) Authorize(in *intent) (AuthResult, error) {
	return AuthResult{ProviderRef: "cod_" + ulid.New(), TokenRef: ""}, nil
}
func (codProvider) Capture(in *intent, amt int64) (string, error) { return "codcap_" + ulid.New(), nil }
func (codProvider) Refund(in *intent, amt int64) (string, error)  { return "codref_" + ulid.New(), nil }
func (codProvider) Void(in *intent) error                         { return nil }

func providerFor(method string) (PaymentProvider, error) {
	switch strings.ToLower(method) {
	case "card", "wallet", "bank_transfer":
		return cardProvider{}, nil
	case "promptpay":
		if isPaysoEnabled() {
			return paysoProvider{}, nil
		}
		return promptPayProvider{}, nil
	case "cod":
		return codProvider{}, nil
	default:
		return nil, fmt.Errorf("unsupported method %q", method)
	}
}
