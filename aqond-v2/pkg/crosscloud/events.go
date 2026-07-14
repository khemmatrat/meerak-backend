package crosscloud

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/redis/go-redis/v9"
)

const OrderReadyChannel = "aqond:events:order.ready"

// OrderReadyEvent — v2 → v1 MatchJob / integration consumers (Bible Phase 3).
type OrderReadyEvent struct {
	Event       string  `json:"event"`
	OrderID     string  `json:"order_id"`
	MerchantID  string  `json:"merchant_id"`
	BuyerID     string  `json:"buyer_id"`
	JobType     string  `json:"job_type"`
	AmountMicro int64   `json:"amount_micro"`
	PickupLat   float64 `json:"pickup_lat"`
	PickupLng   float64 `json:"pickup_lng"`
	DropoffLat  float64 `json:"dropoff_lat"`
	DropoffLng  float64 `json:"dropoff_lng"`
	JobID       string  `json:"job_id,omitempty"`
}

// PublishOrderReady publishes to Redis pub/sub for cross-version dispatch.
func PublishOrderReady(ctx context.Context, rdb redis.UniversalClient, ev OrderReadyEvent) error {
	if rdb == nil {
		return fmt.Errorf("redis unavailable")
	}
	if ev.OrderID == "" {
		return fmt.Errorf("order_id required")
	}
	if ev.Event == "" {
		ev.Event = "order.ready"
	}
	raw, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	return rdb.Publish(ctx, OrderReadyChannel, raw).Err()
}
