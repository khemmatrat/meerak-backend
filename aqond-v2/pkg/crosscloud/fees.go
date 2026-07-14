package crosscloud

import (
	"context"
	"encoding/json"
	"log"

	"github.com/aqond/aqond-v2/pkg/redisclient"
	"github.com/redis/go-redis/v9"
)

const FeesRedisKey = "aqond:config:fees"

// FeeConfig is published by nexus-admin → legacy backend → Redis.
type FeeConfig struct {
	PlatformFeeBps   int    `json:"platform_fee_bps"`
	MarketplaceFeeBps int   `json:"marketplace_fee_bps"`
	FoodFeeBps       int    `json:"food_fee_bps"`
	Currency         string `json:"currency"`
	UpdatedAt        string `json:"updated_at"`
}

var defaultFees = FeeConfig{
	PlatformFeeBps: 250, MarketplaceFeeBps: 250, FoodFeeBps: 150, Currency: "THB",
}

// LoadFees reads aqond:config:fees from Redis; returns defaults if missing.
func LoadFees(ctx context.Context, rdb redis.UniversalClient) FeeConfig {
	if rdb == nil {
		return defaultFees
	}
	raw, err := rdb.Get(ctx, FeesRedisKey).Result()
	if err != nil || raw == "" {
		return defaultFees
	}
	var cfg FeeConfig
	if json.Unmarshal([]byte(raw), &cfg) != nil {
		return defaultFees
	}
	if cfg.PlatformFeeBps <= 0 {
		cfg.PlatformFeeBps = defaultFees.PlatformFeeBps
	}
	return cfg
}

// PlatformFeeMicro computes platform fee from subtotal using Redis config.
func PlatformFeeMicro(ctx context.Context, rdb redis.UniversalClient, subtotalMicro int64, orderType string) int64 {
	if subtotalMicro <= 0 {
		return 0
	}
	cfg := LoadFees(ctx, rdb)
	bps := cfg.PlatformFeeBps
	if orderType == "food" && cfg.FoodFeeBps > 0 {
		bps = cfg.FoodFeeBps
	} else if orderType == "marketplace" && cfg.MarketplaceFeeBps > 0 {
		bps = cfg.MarketplaceFeeBps
	}
	return subtotalMicro * int64(bps) / 10000
}

// NewRedisOptional connects to Redis; logs and returns nil on failure.
func NewRedisOptional() redis.UniversalClient {
	rdb := redisclient.NewUniversal()
	if err := redisclient.Ping(context.Background(), rdb); err != nil {
		log.Printf("crosscloud: redis unavailable (%v)", err)
		return nil
	}
	return rdb
}
