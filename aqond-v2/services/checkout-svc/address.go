package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/aqond/aqond-v2/pkg/config"
)

type resolvedAddress struct {
	ID              string
	Recipient       string
	ShippingAddress string
	PostalCode      string
	Phone           string
}

func addressServiceURL() string {
	return strings.TrimRight(config.Get("ADDRESS_URL", "http://address-svc:8128"), "/")
}

func (a *app) resolveAddress(ctx context.Context, reg, addressID, ownerID string) (*resolvedAddress, error) {
	if addressID == "" {
		return nil, fmt.Errorf("address_id required")
	}
	url := fmt.Sprintf("%s/v1/address/%s?owner_id=%s", addressServiceURL(), addressID, ownerID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Aqond-Region", reg)
	resp, err := a.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("address_not_found")
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("address_svc %d: %s", resp.StatusCode, string(data))
	}
	var out struct {
		ID          string `json:"id"`
		Recipient   string `json:"recipient"`
		Line1       string `json:"line1"`
		Line2       string `json:"line2"`
		City        string `json:"city"`
		PostalCode  string `json:"postal_code"`
		Phone       string `json:"phone"`
	}
	if json.Unmarshal(data, &out) != nil || out.Line1 == "" {
		return nil, fmt.Errorf("invalid_address")
	}
	line := strings.TrimSpace(out.Line1)
	if out.Line2 != "" {
		line += " " + strings.TrimSpace(out.Line2)
	}
	if out.City != "" {
		line += " " + strings.TrimSpace(out.City)
	}
	return &resolvedAddress{
		ID:              out.ID,
		Recipient:       out.Recipient,
		ShippingAddress: line,
		PostalCode:      out.PostalCode,
		Phone:           out.Phone,
	}, nil
}

func (a *app) applyAddress(ctx context.Context, reg string, body *checkoutReq) error {
	if body.AddressID == "" {
		return nil
	}
	addr, err := a.resolveAddress(ctx, reg, body.AddressID, body.BuyerID)
	if err != nil {
		return err
	}
	body.ShippingAddressID = addr.ID
	if body.Recipient == "" {
		body.Recipient = addr.Recipient
	}
	if body.ShippingAddress == "" {
		body.ShippingAddress = addr.ShippingAddress
	}
	if body.PostalCode == "" {
		body.PostalCode = addr.PostalCode
	}
	if body.Phone == "" {
		body.Phone = addr.Phone
	}
	return nil
}
