package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/region"
)

type svcClient struct {
	http   *http.Client
	region *region.Router
	urls   map[string]string
}

func newClient() *svcClient {
	return &svcClient{
		http:   &http.Client{Timeout: 5 * time.Second},
		region: region.NewRouter(),
		urls: map[string]string{
			"catalog":  config.Get("CATALOG_URL", "http://catalog-svc:8110"),
			"search":   config.Get("SEARCH_URL", "http://search-svc:8122"),
			"locale":   config.Get("LOCALE_URL", "http://locale-svc:8126"),
			"cart":     config.Get("CART_URL", "http://cart-svc:8133"),
			"checkout": config.Get("CHECKOUT_URL", "http://checkout-svc:8121"),
			"order":    config.Get("ORDER_URL", "http://order-svc:8113"),
			"feed":     config.Get("FEED_URL", "http://feed-svc:8115"),
			"recsys":   config.Get("RECSYS_URL", "http://recsys-svc:8125"),
			"reviews":  config.Get("REVIEWS_URL", "http://reviews-svc:8123"),
			"shipping": config.Get("SHIPPING_URL", "http://shipping-svc:8127"),
			"address":  config.Get("ADDRESS_URL", "http://address-svc:8128"),
			"policy":   config.Get("POLICY_URL", "http://policy-svc:8130"),
			"settings": config.Get("SETTINGS_URL", "http://settings-svc:8134"),
			"payment":  config.Get("PAYMENT_URL", "http://payment-svc:8120"),
			"video":    config.Get("VIDEO_URL", "http://video-svc:8116"),
			"promo":    config.Get("PROMOTIONS_URL", "http://promotions-svc:8136"),
			"coupon":   config.Get("COUPON_URL", "http://coupon-svc:8137"),
			"account":  config.Get("ACCOUNT_URL", "http://account-svc:8138"),
			"coins":    config.Get("COINS_URL", "http://coins-svc:8139"),
			"creator":  config.Get("CREATOR_URL", "http://creator-svc:8140"),
			"wallet":   config.Get("WALLET_URL", "http://wallet-svc:8112"),
			"food":     config.Get("FOOD_URL", "http://food-svc:8141"),
		},
	}
}

func (c *svcClient) ctxHeaders(r *http.Request) context.Context {
	return r.Context()
}

func (c *svcClient) regionOf(r *http.Request) string {
	return c.region.FromRequest(r)
}

func (c *svcClient) applyUpstreamAuth(from *http.Request, to *http.Request) {
	if from == nil {
		return
	}
	if v := from.Header.Get("Authorization"); v != "" {
		to.Header.Set("Authorization", v)
	}
	if v := from.Header.Get("X-User-Id"); v != "" {
		to.Header.Set("X-User-Id", v)
	}
	if v := from.Header.Get("X-Session-Id"); v != "" {
		to.Header.Set("X-Session-Id", v)
	}
}

func (c *svcClient) getJSON(ctx context.Context, base, path string, reg string, from *http.Request, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set(region.HeaderRegion, reg)
	c.applyUpstreamAuth(from, req)
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("%s: %s", resp.Status, string(b))
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *svcClient) postJSON(ctx context.Context, base, path string, reg string, from *http.Request, body any, out any) error {
	payload, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(region.HeaderRegion, reg)
	c.applyUpstreamAuth(from, req)
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("%s: %s", resp.Status, string(b))
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *svcClient) proxy(w http.ResponseWriter, r *http.Request, svc, path string) {
	var out map[string]any
	err := c.getJSON(r.Context(), c.urls[svc], path, c.regionOf(r), r, &out)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	jsonOK(w, out)
}

func (c *svcClient) proxyPost(w http.ResponseWriter, r *http.Request, svc, path string, body any) {
	var out map[string]any
	if err := c.postJSON(r.Context(), c.urls[svc], path, c.regionOf(r), r, body, &out); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	jsonOK(w, out)
}
