package main

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/kafka"
)

type searchDoc struct {
	EntityType string   `json:"entity_type"`
	EntityID   string   `json:"entity_id"`
	ShardKey   string   `json:"shard_key"`
	Region     string   `json:"region"`
	Locale     string   `json:"locale"`
	Title      string   `json:"title"`
	Body       string   `json:"body"`
	Category   string   `json:"category"`
	Tags       []string `json:"tags"`
	PriceMicro int64    `json:"price_micro"`
	Currency   string   `json:"currency"`
	Rating     float64  `json:"rating"`
	SoldCount  int64    `json:"sold_count"`
	ShipFrom   string   `json:"ship_from_region"`
	COD        bool     `json:"cod_available"`
	Popularity float64  `json:"popularity"`
	Status     string   `json:"status"`
}

func (a *app) upsertDoc(ctx context.Context, d searchDoc) error {
	if d.Tags == nil {
		d.Tags = []string{}
	}
	if d.Currency == "" {
		d.Currency = "THB"
	}
	if d.Region == "" {
		d.Region = "TH"
	}
	if d.Locale == "" {
		d.Locale = "th"
	}
	if d.Status == "" {
		d.Status = "active"
	}
	_, err := a.pools.Write.Exec(ctx, `
		INSERT INTO commerce.search_documents
		  (id, entity_type, entity_id, shard_key, region, locale, title, body, category, tags,
		   price_micro, currency, rating, sold_count, ship_from_region, cod_available, popularity, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		ON CONFLICT (entity_type, entity_id) DO UPDATE SET
		  title=EXCLUDED.title, body=EXCLUDED.body, category=EXCLUDED.category, tags=EXCLUDED.tags,
		  price_micro=EXCLUDED.price_micro, currency=EXCLUDED.currency, rating=EXCLUDED.rating,
		  sold_count=EXCLUDED.sold_count, ship_from_region=EXCLUDED.ship_from_region,
		  cod_available=EXCLUDED.cod_available, popularity=EXCLUDED.popularity, status=EXCLUDED.status,
		  updated_at=NOW()`,
		d.EntityType+":"+d.EntityID, d.EntityType, d.EntityID, d.ShardKey, d.Region, d.Locale,
		d.Title, d.Body, d.Category, d.Tags, d.PriceMicro, d.Currency, d.Rating, d.SoldCount,
		d.ShipFrom, d.COD, d.Popularity, d.Status)
	return err
}

func (a *app) deleteDoc(ctx context.Context, entityType, entityID string) {
	_, _ = a.pools.Write.Exec(ctx, `DELETE FROM commerce.search_documents WHERE entity_type=$1 AND entity_id=$2`, entityType, entityID)
}

// reindexAll backfills the index from source-of-truth tables (P92).
func (a *app) reindexAll(ctx context.Context) int {
	count := 0

	// Products (with min variant price)
	rows, err := a.pools.Read.Query(ctx, `
		SELECT p.id, p.merchant_id, p.shard_key, p.region, p.title, p.description, p.category,
		       COALESCE((SELECT MIN(price_micro) FROM commerce.product_variants v WHERE v.product_id = p.id), 0)
		FROM commerce.products p WHERE p.status='published'`)
	if err == nil {
		for rows.Next() {
			var id, mid, sk, reg, title, desc, cat string
			var price int64
			if rows.Scan(&id, &mid, &sk, &reg, &title, &desc, &cat, &price) == nil {
				_ = a.upsertDoc(ctx, searchDoc{EntityType: "product", EntityID: id, ShardKey: sk, Region: reg,
					Title: title, Body: desc, Category: cat, PriceMicro: price, ShipFrom: reg, COD: true})
				count++
			}
		}
		rows.Close()
	} else {
		log.Printf("reindex products: %v", err)
	}

	// Shops
	rows2, err := a.pools.Read.Query(ctx, `SELECT id, shard_key, region, display_name FROM commerce.stores WHERE status='active'`)
	if err == nil {
		for rows2.Next() {
			var id, sk, reg, name string
			if rows2.Scan(&id, &sk, &reg, &name) == nil {
				_ = a.upsertDoc(ctx, searchDoc{EntityType: "shop", EntityID: id, ShardKey: sk, Region: reg, Title: name, Category: "shop"})
				count++
			}
		}
		rows2.Close()
	}

	// Food restaurants (Tier 2 search tab)
	rowsFood, err := a.pools.Read.Query(ctx, `
		SELECT id, shard_key, name, cuisine, rating, review_count, distance_km,
		       delivery_fee_micro, min_order_micro, zone_id, tags
		FROM commerce.food_restaurants WHERE open_default=TRUE`)
	if err == nil {
		for rowsFood.Next() {
			var id, sk, name, cuisine, zone string
			var tags []string
			var rating float64
			var reviews int
			var dist float64
			var fee, min int64
			if rowsFood.Scan(&id, &sk, &name, &cuisine, &rating, &reviews, &dist, &fee, &min, &zone, &tags) == nil {
				body := cuisine
				if zone != "" {
					body += " zone:" + zone
				}
				_ = a.upsertDoc(ctx, searchDoc{
					EntityType: "food", EntityID: id, ShardKey: sk, Region: "TH",
					Title: name, Body: body, Category: cuisine, Tags: tags,
					PriceMicro: min, Rating: rating, SoldCount: int64(reviews),
					ShipFrom: zone, Popularity: 1.0 / (dist + 0.1),
				})
				count++
			}
		}
		rowsFood.Close()
	}

	// Posts -> video tab
	rows3, err := a.pools.Read.Query(ctx, `SELECT id, author_id, COALESCE(shard_key,''), COALESCE(region,'TH') FROM commerce.posts WHERE status='published'`)
	if err == nil {
		for rows3.Next() {
			var id, author, sk, reg string
			if rows3.Scan(&id, &author, &sk, &reg) == nil {
				_ = a.upsertDoc(ctx, searchDoc{EntityType: "video", EntityID: id, ShardKey: sk, Region: reg, Title: "post " + id, Category: "video"})
				count++
			}
		}
		rows3.Close()
	}
	mIndexed.Add(int64(count))
	return count
}

// runIndexer consumes the search index topic for near-real-time upserts (P92).
// In prod this is fed by the outbox relay; in dev-lite tests push to the topic
// or call /v1/index/upsert directly.
func (a *app) runIndexer(ctx context.Context) {
	topic := config.Get("SEARCH_INDEX_TOPIC", "search.index")
	brokers := config.LoadKafkaBrokers()
	if err := kafka.EnsureTopic(ctx, brokers, topic, 4); err != nil {
		log.Printf("search indexer ensure topic: %v", err)
	}
	reader := kafka.NewReader(brokers, topic, "search-svc-indexer")
	defer reader.Close()
	log.Printf("search indexer consuming %s", topic)
	for {
		m, err := reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			time.Sleep(time.Second)
			continue
		}
		var msg struct {
			Action string    `json:"action"`
			Doc    searchDoc `json:"doc"`
		}
		if err := json.Unmarshal(m.Value, &msg); err != nil {
			continue
		}
		if msg.Action == "delete" {
			a.deleteDoc(ctx, msg.Doc.EntityType, msg.Doc.EntityID)
			continue
		}
		if err := a.upsertDoc(ctx, msg.Doc); err != nil {
			log.Printf("indexer upsert: %v", err)
		}
	}
}
