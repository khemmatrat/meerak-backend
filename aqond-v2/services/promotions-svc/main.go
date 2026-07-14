// promotions-svc implements Epoch 11 P201/P203: EXP-PROMO promotions engine
// and EXP-CAT mall category taxonomy for production storefront.
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
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool   *pgxpool.Pool
	region *region.Router
}

var mHits atomic.Int64

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{pool: pool, region: region.NewRouter()}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/categories", a.categories)
	mux.HandleFunc("/v1/promotions", a.promotions)
	mux.HandleFunc("/v1/promotions/", a.promotionByID)

	port := config.Int("PORT", 8136)
	log.Printf("promotions-svc :%d p201-p203", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "promotions-svc", "p201_p203": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_promotions_requests_total %d\n", mHits.Load())
}

func (a *app) categories(w http.ResponseWriter, r *http.Request) {
	mallOnly := r.URL.Query().Get("mall") == "1"
	ctx := r.Context()
	q := `SELECT id, slug, name_en, name_th, icon_url, sort_order, mall_tab FROM commerce.categories WHERE active=TRUE`
	if mallOnly {
		q += ` AND mall_tab=TRUE`
	}
	q += ` ORDER BY sort_order`
	rows, err := a.pool.Query(ctx, q)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var cats []map[string]any
	for rows.Next() {
		var id, slug, en, th, icon string
		var sort int
		var mall bool
		if rows.Scan(&id, &slug, &en, &th, &icon, &sort, &mall) == nil {
			cats = append(cats, map[string]any{"id": id, "slug": slug, "name": en, "name_th": th, "icon_url": icon, "mall_tab": mall})
		}
	}
	mHits.Add(1)
	jsonOK(w, map[string]any{"categories": cats})
}

func (a *app) promotions(w http.ResponseWriter, r *http.Request) {
	reg := a.region.FromRequest(r)
	ctx := r.Context()
	rows, err := a.pool.Query(ctx, `
		SELECT id, slug, title, kind, value_bps, value_micro, banner_url, starts_at, ends_at
		FROM commerce.promotions
		WHERE active=TRUE AND (region='*' OR region=$1)
		  AND starts_at <= NOW() AND (ends_at IS NULL OR ends_at > NOW())
		ORDER BY starts_at DESC LIMIT 20`, reg)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var promos []map[string]any
	for rows.Next() {
		var id, slug, title, kind, banner string
		var bps int
		var micro int64
		var starts, ends any
		if rows.Scan(&id, &slug, &title, &kind, &bps, &micro, &banner, &starts, &ends) == nil {
			promos = append(promos, map[string]any{
				"id": id, "slug": slug, "title": title, "kind": kind,
				"value_bps": bps, "value_micro": micro, "banner_url": banner,
				"starts_at": starts, "ends_at": ends,
			})
		}
	}
	mHits.Add(1)
	jsonOK(w, map[string]any{"region": reg, "promotions": promos})
}

func (a *app) promotionByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/v1/promotions/")
	if id == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var slug, title, kind, banner string
	var bps int
	var micro int64
	err := a.pool.QueryRow(ctx, `
		SELECT slug, title, kind, value_bps, value_micro, banner_url
		FROM commerce.promotions WHERE id=$1 OR slug=$1`, id).
		Scan(&slug, &title, &kind, &bps, &micro, &banner)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	rows, _ := a.pool.Query(ctx, `SELECT product_id FROM commerce.promotion_products WHERE promotion_id=$1`, id)
	defer rows.Close()
	var products []string
	for rows.Next() {
		var pid string
		if rows.Scan(&pid) == nil {
			products = append(products, pid)
		}
	}
	mHits.Add(1)
	jsonOK(w, map[string]any{"id": id, "slug": slug, "title": title, "kind": kind, "value_bps": bps, "value_micro": micro, "banner_url": banner, "products": products})
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
