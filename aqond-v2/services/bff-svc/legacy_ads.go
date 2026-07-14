package main

import (
	"net/http"
	"strings"

	"github.com/aqond/aqond-v2/pkg/crosscloud"
)

// mergeLegacyAdsPromo attaches Cloud 2 sponsored placement when configured.
func (a *app) mergeLegacyAdsPromo(r *http.Request) map[string]any {
	sessionID := strings.TrimSpace(r.Header.Get("X-Session-Id"))
	if sessionID == "" {
		sessionID = "bff-home"
	}
	auth := r.Header.Get("Authorization")
	promo := crosscloud.FetchAdsSearchPromo(r.Context(), sessionID, auth)
	if promo == nil {
		return nil
	}
	return map[string]any{"legacy_ads": promo, "source": "cloud2"}
}
