package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/redis/go-redis/v9"
)

const flashQueueKeyPrefix = "flash:q:"
const flashTokenKeyPrefix = "flash:tok:"

func (a *orderApp) flashQueueJoin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		FlashEventID string `json:"flash_event_id"`
		BuyerID      string `json:"buyer_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.FlashEventID == "" || body.BuyerID == "" {
		http.Error(w, "flash_event_id and buyer_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	token := ulid.New()
	score := float64(time.Now().UnixMilli())
	qKey := flashQueueKeyPrefix + body.FlashEventID
	_ = a.redis.ZAdd(ctx, qKey, redis.Z{Score: score, Member: token}).Err()
	tokKey := flashTokenKeyPrefix + token
	meta, _ := json.Marshal(map[string]any{
		"flash_event_id": body.FlashEventID, "buyer_id": body.BuyerID, "admitted": false,
	})
	a.redis.Set(ctx, tokKey, meta, 30*time.Minute)

	rank, _ := a.redis.ZRank(ctx, qKey, token).Result()
	position := int(rank) + 1
	a.mreg.FlashQueueJoins.Inc()
	jsonOK(w, map[string]any{
		"ok": true, "queue_token": token, "position": position, "admitted": false, "flash_event_id": body.FlashEventID,
	})
}

func (a *orderApp) flashQueueStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "token required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	metaRaw, err := a.redis.Get(ctx, flashTokenKeyPrefix+token).Bytes()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	var meta map[string]any
	_ = json.Unmarshal(metaRaw, &meta)
	eventID, _ := meta["flash_event_id"].(string)
	admitted, _ := meta["admitted"].(bool)
	position := 0
	if !admitted && eventID != "" {
		if rank, err := a.redis.ZRank(ctx, flashQueueKeyPrefix+eventID, token).Result(); err == nil {
			position = int(rank) + 1
		}
	}
	jsonOK(w, map[string]any{
		"ok": true, "queue_token": token, "admitted": admitted, "position": position, "flash_event_id": eventID,
	})
}

func (a *orderApp) requireFlashAdmit(w http.ResponseWriter, r *http.Request) bool {
	if config.Get("FLASH_QUEUE_REQUIRED", "0") != "1" {
		return true
	}
	token := r.Header.Get("X-Flash-Queue-Token")
	if token == "" {
		http.Error(w, "X-Flash-Queue-Token required", http.StatusForbidden)
		return false
	}
	metaRaw, err := a.redis.Get(r.Context(), flashTokenKeyPrefix+token).Bytes()
	if err != nil {
		http.Error(w, "invalid_queue_token", http.StatusForbidden)
		return false
	}
	var meta map[string]any
	_ = json.Unmarshal(metaRaw, &meta)
	admitted, _ := meta["admitted"].(bool)
	if !admitted {
		http.Error(w, "not_admitted", http.StatusForbidden)
		return false
	}
	return true
}

func (a *orderApp) runFlashAdmitter(ctx context.Context) {
	batch := config.Int("FLASH_ADMIT_BATCH", 10)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.admitFlashBatch(ctx, batch)
		}
	}
}

func (a *orderApp) admitFlashBatch(ctx context.Context, batch int) {
	var cursor uint64
	for {
		keys, next, err := a.redis.Scan(ctx, cursor, flashQueueKeyPrefix+"*", 20).Result()
		if err != nil {
			return
		}
		for _, qKey := range keys {
			tokens, err := a.redis.ZRange(ctx, qKey, 0, int64(batch-1)).Result()
			if err != nil || len(tokens) == 0 {
				continue
			}
			for _, token := range tokens {
				tokKey := flashTokenKeyPrefix + token
				metaRaw, err := a.redis.Get(ctx, tokKey).Bytes()
				if err != nil {
					continue
				}
				var meta map[string]any
				if json.Unmarshal(metaRaw, &meta) != nil {
					continue
				}
				if admitted, _ := meta["admitted"].(bool); admitted {
					continue
				}
				meta["admitted"] = true
				b, _ := json.Marshal(meta)
				a.redis.Set(ctx, tokKey, b, 30*time.Minute)
				a.redis.ZRem(ctx, qKey, token)
				a.mreg.FlashQueueAdmits.Inc()
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
}

func (a *orderApp) metricsExtra() string {
	return fmt.Sprintf("aqond_order_queue_depth %d\n", a.limiter.Depth())
}

func (a *orderApp) checkAppRateLimit(w http.ResponseWriter, r *http.Request, body orderBody) bool {
	if ok, _ := a.buyerRate.Allow(r.Context(), "buyer", body.BuyerID); !ok {
		a.mreg.RateLimitRejected.Inc()
		w.Header().Set("Retry-After", strconv.Itoa(a.rateRetrySec))
		http.Error(w, "buyer_rate_limited", http.StatusTooManyRequests)
		return false
	}
	if ok, _ := a.merchantRate.Allow(r.Context(), "merchant", body.MerchantID); !ok {
		a.mreg.RateLimitRejected.Inc()
		w.Header().Set("Retry-After", strconv.Itoa(a.rateRetrySec))
		http.Error(w, "merchant_rate_limited", http.StatusTooManyRequests)
		return false
	}
	return true
}

func (a *orderApp) markProcessed(ctx context.Context, orderID string) bool {
	ok, err := a.redis.SetNX(ctx, "order:processed:"+orderID, "1", 24*time.Hour).Result()
	if err != nil {
		return true
	}
	if !ok {
		a.mreg.OrdersDedupSkipped.Inc()
		return false
	}
	return true
}
