// locale-svc implements Epoch 8 Pillar A: i18n, localization, price books,
// tax engine and invoicing (P111-P116).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/region"
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool   *pgxpool.Pool
	router *shard.Router
	region *region.Router
}

var (
	mResolve atomic.Int64
	mTax     atomic.Int64
	mInvoice atomic.Int64
)

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{
		pool:   pool,
		router: shard.NewRouter(config.Int("SHARD_COUNT", 1)),
		region: region.NewRouter(),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/locale/resolve", a.resolve)  // P111
	mux.HandleFunc("/v1/messages", a.messages)        // P112
	mux.HandleFunc("/v1/product-i18n", a.productI18n) // P113
	mux.HandleFunc("/v1/price", a.price)              // P114
	mux.HandleFunc("/v1/tax/quote", a.taxQuote)       // P115
	mux.HandleFunc("/v1/invoice", a.invoice)          // P116

	port := config.Int("PORT", 8126)
	log.Printf("locale-svc :%d p111-p116", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "locale-svc", "p111_p116": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_locale_resolve_total %d\n", mResolve.Load())
	fmt.Fprintf(w, "aqond_tax_quote_total %d\n", mTax.Load())
	fmt.Fprintf(w, "aqond_invoice_total %d\n", mInvoice.Load())
}

// P111: resolve best locale for a request given region + Accept-Language.
func (a *app) resolve(w http.ResponseWriter, r *http.Request) {
	reg := a.region.FromRequest(r)
	accept := r.URL.Query().Get("locale")
	if accept == "" {
		accept = firstLang(r.Header.Get("Accept-Language"))
	}
	ctx := r.Context()

	var locale, language, currency, fallback string
	var rtl bool
	// exact locale match
	err := a.pool.QueryRow(ctx, `
		SELECT locale, language, currency, rtl, COALESCE(fallback_locale,'')
		FROM commerce.locales WHERE enabled AND lower(locale)=lower($1) LIMIT 1`, accept).
		Scan(&locale, &language, &currency, &rtl, &fallback)
	if err != nil {
		// fall back to first enabled locale for the region
		err = a.pool.QueryRow(ctx, `
			SELECT locale, language, currency, rtl, COALESCE(fallback_locale,'')
			FROM commerce.locales WHERE enabled AND region=$1
			ORDER BY locale LIMIT 1`, reg).
			Scan(&locale, &language, &currency, &rtl, &fallback)
	}
	if err != nil {
		locale, language, currency, fallback = "th-TH", "th", "THB", ""
	}
	mResolve.Add(1)
	jsonOK(w, map[string]any{
		"region": reg, "locale": locale, "language": language,
		"currency": currency, "rtl": rtl, "fallback_locale": fallback,
	})
}

// P112: keyed message catalog (GET reads, POST upserts).
func (a *app) messages(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		locale := r.URL.Query().Get("locale")
		if locale == "" {
			locale = "th-TH"
		}
		rows, err := a.pool.Query(ctx, `
			SELECT message_key, value FROM commerce.i18n_messages WHERE locale=$1`, locale)
		if err != nil {
			httpErr(w, err)
			return
		}
		defer rows.Close()
		out := map[string]string{}
		for rows.Next() {
			var k, v string
			if rows.Scan(&k, &v) == nil {
				out[k] = v
			}
		}
		jsonOK(w, map[string]any{"locale": locale, "messages": out})
	case http.MethodPost:
		var body struct {
			Locale   string            `json:"locale"`
			Source   string            `json:"source"`
			Messages map[string]string `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if body.Source == "" {
			body.Source = "human"
		}
		n := 0
		for k, v := range body.Messages {
			_, err := a.pool.Exec(ctx, `
				INSERT INTO commerce.i18n_messages (message_key, locale, value, source)
				VALUES ($1,$2,$3,$4)
				ON CONFLICT (message_key, locale) DO UPDATE SET value=EXCLUDED.value, source=EXCLUDED.source, updated_at=NOW()`,
				k, body.Locale, v, body.Source)
			if err == nil {
				n++
			}
		}
		jsonOK(w, map[string]any{"locale": body.Locale, "upserted": n})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// P113: catalog/content localization.
func (a *app) productI18n(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		pid := r.URL.Query().Get("product_id")
		locale := r.URL.Query().Get("locale")
		if pid == "" || locale == "" {
			http.Error(w, "product_id and locale required", http.StatusBadRequest)
			return
		}
		var title, desc, slug string
		err := a.pool.QueryRow(ctx, `
			SELECT title, description, COALESCE(slug,'') FROM commerce.product_i18n
			WHERE product_id=$1 AND locale=$2`, pid, locale).Scan(&title, &desc, &slug)
		if err != nil {
			// fallback through locale chain
			var fb string
			_ = a.pool.QueryRow(ctx, `SELECT COALESCE(fallback_locale,'') FROM commerce.locales WHERE locale=$1`, locale).Scan(&fb)
			if fb != "" {
				_ = a.pool.QueryRow(ctx, `
					SELECT title, description, COALESCE(slug,'') FROM commerce.product_i18n
					WHERE product_id=$1 AND locale=$2`, pid, fb).Scan(&title, &desc, &slug)
				locale = fb
			}
		}
		jsonOK(w, map[string]any{"product_id": pid, "locale": locale, "title": title, "description": desc, "slug": slug})
	case http.MethodPost:
		var body struct {
			ProductID   string `json:"product_id"`
			Locale      string `json:"locale"`
			ShardKey    string `json:"shard_key"`
			Title       string `json:"title"`
			Description string `json:"description"`
			Slug        string `json:"slug"`
			Source      string `json:"source"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if body.Source == "" {
			body.Source = "machine"
		}
		sk := body.ShardKey
		if sk == "" {
			sk = a.router.ShardKey(body.ProductID)
		}
		_, err := a.pool.Exec(ctx, `
			INSERT INTO commerce.product_i18n (product_id, locale, shard_key, title, description, slug, source)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
			ON CONFLICT (product_id, locale) DO UPDATE SET
				title=EXCLUDED.title, description=EXCLUDED.description, slug=EXCLUDED.slug,
				source=EXCLUDED.source, updated_at=NOW()`,
			body.ProductID, body.Locale, sk, body.Title, body.Description, nullable(body.Slug), body.Source)
		if err != nil {
			httpErr(w, err)
			return
		}
		jsonOK(w, map[string]any{"product_id": body.ProductID, "locale": body.Locale, "saved": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// P114: per-market price book lookup (with FX fallback to base price).
func (a *app) price(w http.ResponseWriter, r *http.Request) {
	pid := r.URL.Query().Get("product_id")
	market := strings.ToUpper(r.URL.Query().Get("market"))
	if pid == "" {
		http.Error(w, "product_id required", http.StatusBadRequest)
		return
	}
	if market == "" {
		market = a.region.FromRequest(r)
	}
	ctx := r.Context()
	var priceMicro int64
	var currency string
	var taxInclusive bool
	err := a.pool.QueryRow(ctx, `
		SELECT price_micro, currency, tax_inclusive FROM commerce.price_books
		WHERE product_id=$1 AND market=$2 AND active ORDER BY updated_at DESC LIMIT 1`, pid, market).
		Scan(&priceMicro, &currency, &taxInclusive)
	if err != nil {
		// FX fallback: convert base THB price via fx_rates if a base price book exists
		var baseMicro int64
		var baseCur string
		e2 := a.pool.QueryRow(ctx, `
			SELECT price_micro, currency FROM commerce.price_books
			WHERE product_id=$1 AND active ORDER BY updated_at DESC LIMIT 1`, pid).Scan(&baseMicro, &baseCur)
		if e2 != nil {
			http.Error(w, "no price book for product", http.StatusNotFound)
			return
		}
		cur := currencyForMarket(ctx, a.pool, market)
		rate := fxRate(ctx, a.pool, baseCur, cur)
		jsonOK(w, map[string]any{
			"product_id": pid, "market": market, "currency": cur,
			"price_micro": int64(float64(baseMicro) * rate), "converted": true, "fx_rate": rate,
		})
		return
	}
	jsonOK(w, map[string]any{
		"product_id": pid, "market": market, "currency": currency,
		"price_micro": priceMicro, "tax_inclusive": taxInclusive, "converted": false,
	})
}

// P115: tax quote for a market + amount.
func (a *app) taxQuote(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Market      string `json:"market"`
		TaxCategory string `json:"tax_category"`
		AmountMicro int64  `json:"amount_micro"`
		Currency    string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Market == "" {
		body.Market = a.region.FromRequest(r)
	}
	if body.TaxCategory == "" {
		body.TaxCategory = "standard"
	}
	ctx := r.Context()
	var rateBps int
	var kind string
	var inclusive, facilitator bool
	err := a.pool.QueryRow(ctx, `
		SELECT rate_bps, kind, inclusive, marketplace_facilitator FROM commerce.tax_rules
		WHERE market=$1 AND tax_category=$2`, body.Market, body.TaxCategory).
		Scan(&rateBps, &kind, &inclusive, &facilitator)
	if err != nil {
		rateBps, kind, inclusive, facilitator = 0, "none", false, false
	}
	var taxMicro, netMicro, grossMicro int64
	if inclusive {
		// amount already includes tax: tax = amount * rate/(10000+rate)
		taxMicro = body.AmountMicro * int64(rateBps) / int64(10000+rateBps)
		grossMicro = body.AmountMicro
		netMicro = grossMicro - taxMicro
	} else {
		taxMicro = body.AmountMicro * int64(rateBps) / 10000
		netMicro = body.AmountMicro
		grossMicro = netMicro + taxMicro
	}
	mTax.Add(1)
	jsonOK(w, map[string]any{
		"market": body.Market, "tax_category": body.TaxCategory, "kind": kind,
		"rate_bps": rateBps, "inclusive": inclusive, "marketplace_facilitator": facilitator,
		"net_micro": netMicro, "tax_micro": taxMicro, "gross_micro": grossMicro,
		"currency": body.Currency,
	})
}

// P116: create or fetch a localized, numbered invoice.
func (a *app) invoice(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method == http.MethodGet {
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "id required", http.StatusBadRequest)
			return
		}
		var orderID, market, locale, invoiceNo, currency string
		var sub, tax, total int64
		err := a.pool.QueryRow(ctx, `
			SELECT order_id, market, locale, invoice_no, currency, subtotal_micro, tax_micro, total_micro
			FROM commerce.invoices WHERE id=$1`, id).
			Scan(&orderID, &market, &locale, &invoiceNo, &currency, &sub, &tax, &total)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		jsonOK(w, map[string]any{
			"id": id, "order_id": orderID, "market": market, "locale": locale,
			"invoice_no": invoiceNo, "currency": currency,
			"subtotal_micro": sub, "tax_micro": tax, "total_micro": total,
		})
		return
	}

	var body struct {
		OrderID       string `json:"order_id"`
		MerchantID    string `json:"merchant_id"`
		Market        string `json:"market"`
		Locale        string `json:"locale"`
		Currency      string `json:"currency"`
		SubtotalMicro int64  `json:"subtotal_micro"`
		TaxMicro      int64  `json:"tax_micro"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.OrderID == "" || body.Market == "" {
		http.Error(w, "order_id and market required", http.StatusBadRequest)
		return
	}
	if body.Locale == "" {
		body.Locale = "th-TH"
	}

	tx, err := a.pool.Begin(ctx)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer tx.Rollback(ctx)

	var nextNo int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO commerce.invoice_counters (market, next_no) VALUES ($1, 2)
		ON CONFLICT (market) DO UPDATE SET next_no = commerce.invoice_counters.next_no + 1
		RETURNING next_no - 1`, body.Market).Scan(&nextNo); err != nil {
		httpErr(w, err)
		return
	}
	invoiceNo := fmt.Sprintf("%s-%06d", body.Market, nextNo)
	total := body.SubtotalMicro + body.TaxMicro
	id := ulid.New()
	sk := a.router.ShardKey(body.MerchantID)
	if _, err := tx.Exec(ctx, `
		INSERT INTO commerce.invoices
			(id, order_id, merchant_id, shard_key, market, locale, invoice_no, currency, subtotal_micro, tax_micro, total_micro)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		id, body.OrderID, body.MerchantID, sk, body.Market, body.Locale, invoiceNo, body.Currency,
		body.SubtotalMicro, body.TaxMicro, total); err != nil {
		httpErr(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		httpErr(w, err)
		return
	}
	mInvoice.Add(1)
	jsonOK(w, map[string]any{"invoice_id": id, "invoice_no": invoiceNo, "total_micro": total, "currency": body.Currency})
}

func currencyForMarket(ctx context.Context, pool *pgxpool.Pool, market string) string {
	var cur string
	_ = pool.QueryRow(ctx, `SELECT currency FROM commerce.locales WHERE region=$1 AND enabled ORDER BY locale LIMIT 1`, market).Scan(&cur)
	if cur == "" {
		return "THB"
	}
	return cur
}

func fxRate(ctx context.Context, pool *pgxpool.Pool, from, to string) float64 {
	if from == to || to == "" {
		return 1.0
	}
	var rate float64
	err := pool.QueryRow(ctx, `
		SELECT rate FROM commerce.fx_rates WHERE base_currency=$1 AND quote_currency=$2
		ORDER BY captured_at DESC LIMIT 1`, from, to).Scan(&rate)
	if err != nil || rate == 0 {
		return 1.0
	}
	return rate
}

func firstLang(accept string) string {
	if accept == "" {
		return ""
	}
	parts := strings.Split(accept, ",")
	return strings.TrimSpace(strings.SplitN(parts[0], ";", 2)[0])
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
