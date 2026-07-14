package main

import (
	"context"
	"encoding/json"
	"log"
	"os"

	"github.com/aqond/aqond-v2/pkg/redisclient"
)

func dispatchGPSChannel(orderID string) string {
	return "dispatch:gps:" + orderID
}

func dispatchTrackChannel(orderID string) string {
	return "dispatch:track:" + orderID
}

func (a *app) initRedis() {
	if os.Getenv("DISPATCH_REDIS") == "0" {
		return
	}
	a.redis = redisclient.NewUniversal()
	if err := redisclient.Ping(context.Background(), a.redis); err != nil {
		log.Printf("dispatch-svc: redis unavailable (%v) — GPS pub/sub disabled", err)
		a.redis = nil
		return
	}
	go a.redisTrackSubscriber()
	log.Printf("dispatch-svc: redis pub/sub enabled")
}

func (a *app) publishTrackUpdate(ctx context.Context, orderID string, payload any) {
	if a.redis == nil || orderID == "" {
		return
	}
	raw, _ := json.Marshal(payload)
	_ = a.redis.Publish(ctx, dispatchTrackChannel(orderID), raw).Err()
	_ = a.redis.Publish(ctx, dispatchGPSChannel(orderID), raw).Err()
}

func (a *app) redisTrackSubscriber() {
	if a.redis == nil {
		return
	}
	sub := a.redis.PSubscribe(context.Background(), "dispatch:track:*", "dispatch:gps:*")
	for msg := range sub.Channel() {
		var payload map[string]any
		if json.Unmarshal([]byte(msg.Payload), &payload) != nil {
			continue
		}
		orderID, _ := payload["order_id"].(string)
		if orderID == "" {
			continue
		}
		a.wsHub.broadcast(orderID, []byte(msg.Payload))
	}
}
