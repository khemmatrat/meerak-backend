package delivery

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"

	"github.com/aqond/aqond-v2/pkg/redisclient"
	"github.com/redis/go-redis/v9"
)

const RedisKey = "aqond:config:delivery"

// ProvinceConfig is a rollout row for a Thai province code (1–2 digits, zero-padded when read).
type ProvinceConfig struct {
	ProvinceCode   string `json:"province_code"`
	NameTH         string `json:"name_th"`
	NameEN         string `json:"name_en"`
	AliasEN        string `json:"alias_en,omitempty"`
	AliasTH        string `json:"alias_th,omitempty"`
	RolloutPhase   int    `json:"rollout_phase"`
	Enabled        bool   `json:"enabled"`
	ExpressEnabled bool   `json:"express_enabled"`
	ParcelFallback bool   `json:"parcel_fallback"`
}

// MatchingConfig defines rider ranking priority (Phase 3+).
type MatchingConfig struct {
	SortPriority []string `json:"sort_priority"`
}

// CapabilityToggle is a Delivery Core capability flag from configuration.
type CapabilityToggle struct {
	Enabled bool `json:"enabled"`
}

// Config is the generic AQOND Delivery Core configuration.
type Config struct {
	SchemaVersion         int                         `json:"schema_version"`
	UpdatedAt             string                      `json:"updated_at"`
	MaxPickupRadiusKm     float64                     `json:"max_pickup_radius_km"`
	ParcelFallbackEnabled bool                        `json:"parcel_fallback_enabled"`
	Capabilities          map[string]CapabilityToggle `json:"capabilities,omitempty"`
	Matching              MatchingConfig              `json:"matching"`
	Provinces             []ProvinceConfig            `json:"provinces"`
}

// Loaded wraps config with its resolution source.
type Loaded struct {
	Config Config
	Source string
	Path   string
}

var (
	defaultOnce sync.Once
	defaultCfg  Config
	defaultErr  error
)

func defaultConfigBytes() []byte {
	return []byte(`{
  "schema_version": 2,
  "updated_at": "2026-07-02T12:00:00Z",
  "max_pickup_radius_km": 12,
  "parcel_fallback_enabled": true,
  "capabilities": {
    "express_rider": { "enabled": true },
    "food_rider": { "enabled": false },
    "parcel_fallback": { "enabled": true },
    "future_courier": { "enabled": false },
    "same_day_delivery": { "enabled": false },
    "scheduled_delivery": { "enabled": false },
    "local_delivery": { "enabled": true }
  },
  "matching": {
    "sort_priority": ["distance_km", "rider_available", "score", "avg_accept_seconds", "acceptance_rate"]
  },
  "provinces": [
    {"province_code":"10","name_th":"กรุงเทพมหานคร","name_en":"Bangkok","rollout_phase":1,"enabled":true,"express_enabled":true,"parcel_fallback":true},
    {"province_code":"11","name_th":"สมุทรปราการ","name_en":"Samut Prakan","rollout_phase":1,"enabled":true,"express_enabled":true,"parcel_fallback":true},
    {"province_code":"12","name_th":"นนทบุรี","name_en":"Nonthaburi","rollout_phase":1,"enabled":true,"express_enabled":true,"parcel_fallback":true},
    {"province_code":"13","name_th":"ปทุมธานี","name_en":"Pathum Thani","rollout_phase":1,"enabled":true,"express_enabled":true,"parcel_fallback":true},
    {"province_code":"74","name_th":"สมุทรสาคร","name_en":"Samut Sakhon","rollout_phase":1,"enabled":true,"express_enabled":true,"parcel_fallback":true},
    {"province_code":"83","name_th":"ภูเก็ต","name_en":"Phuket","rollout_phase":2,"enabled":true,"express_enabled":false,"parcel_fallback":true},
    {"province_code":"81","name_th":"กระบี่","name_en":"Krabi","rollout_phase":2,"enabled":true,"express_enabled":false,"parcel_fallback":true},
    {"province_code":"50","name_th":"เชียงใหม่","name_en":"Chiang Mai","rollout_phase":2,"enabled":true,"express_enabled":false,"parcel_fallback":true},
    {"province_code":"30","name_th":"นครราชสีมา","name_en":"Nakhon Ratchasima","rollout_phase":2,"enabled":true,"express_enabled":false,"parcel_fallback":true},
    {"province_code":"40","name_th":"ขอนแก่น","name_en":"Khon Kaen","rollout_phase":2,"enabled":true,"express_enabled":false,"parcel_fallback":true},
    {"province_code":"84","name_th":"สุราษฎร์ธานี","name_en":"Surat Thani","rollout_phase":2,"enabled":true,"express_enabled":false,"parcel_fallback":true},
    {"province_code":"90","name_th":"สงขลา","name_en":"Songkhla","alias_en":"Hat Yai","alias_th":"หาดใหญ่","rollout_phase":2,"enabled":true,"express_enabled":false,"parcel_fallback":true},
    {"province_code":"70","name_th":"ราชบุรี","name_en":"Ratchaburi","rollout_phase":2,"enabled":true,"express_enabled":false,"parcel_fallback":true},
    {"province_code":"20","name_th":"ชลบุรี","name_en":"Chonburi","rollout_phase":2,"enabled":true,"express_enabled":false,"parcel_fallback":true},
    {"province_code":"21","name_th":"ระยอง","name_en":"Rayong","rollout_phase":2,"enabled":true,"express_enabled":false,"parcel_fallback":true}
  ]
}`)
}

func DefaultConfig() (Config, error) {
	defaultOnce.Do(func() {
		defaultCfg, defaultErr = ParseConfigJSON(defaultConfigBytes())
	})
	return defaultCfg, defaultErr
}

// ParseConfigJSON validates and normalizes raw JSON into Config.
func ParseConfigJSON(raw []byte) (Config, error) {
	var cfg Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return Config{}, err
	}
	return ValidateConfig(cfg)
}

// ValidateConfig enforces schema invariants — no hardcoded province lists in logic.
func ValidateConfig(cfg Config) (Config, error) {
	if cfg.SchemaVersion != 1 && cfg.SchemaVersion != 2 {
		return Config{}, fmt.Errorf("schema_version must be 1 or 2")
	}
	if cfg.MaxPickupRadiusKm <= 0 {
		return Config{}, fmt.Errorf("max_pickup_radius_km must be positive")
	}
	if len(cfg.Provinces) == 0 {
		return Config{}, fmt.Errorf("provinces must not be empty")
	}
	seen := map[string]struct{}{}
	for i := range cfg.Provinces {
		p := &cfg.Provinces[i]
		if p.ProvinceCode == "" {
			return Config{}, fmt.Errorf("province_code required at index %d", i)
		}
		if _, ok := seen[p.ProvinceCode]; ok {
			return Config{}, fmt.Errorf("duplicate province_code %s", p.ProvinceCode)
		}
		seen[p.ProvinceCode] = struct{}{}
		if p.RolloutPhase != 1 && p.RolloutPhase != 2 {
			return Config{}, fmt.Errorf("invalid rollout_phase for %s", p.ProvinceCode)
		}
	}
	if len(cfg.Matching.SortPriority) == 0 {
		cfg.Matching.SortPriority = []string{
			"distance_km", "rider_available", "score", "avg_accept_seconds", "acceptance_rate",
		}
	}
	return cfg, nil
}

// Load reads configuration from env path, Redis, or bundled default.
func Load(ctx context.Context, rdb redis.UniversalClient) Loaded {
	if inline := os.Getenv("DELIVERY_CONFIG_JSON"); inline != "" {
		cfg, err := ParseConfigJSON([]byte(inline))
		if err == nil {
			return Loaded{Config: cfg, Source: "env_json"}
		}
		log.Printf("delivery: DELIVERY_CONFIG_JSON invalid (%v)", err)
	}

	if path := os.Getenv("DELIVERY_CONFIG_PATH"); path != "" {
		if loaded, err := loadFromPathCached(path); err == nil {
			return loaded
		} else if !os.IsNotExist(err) {
			log.Printf("delivery: config file unreadable (%v)", err)
		}
	}

	if rdb != nil {
		raw, err := rdb.Get(ctx, RedisKey).Result()
		if err == nil && raw != "" {
			cfg, perr := ParseConfigJSON([]byte(raw))
			if perr == nil {
				return Loaded{Config: cfg, Source: "redis"}
			}
			log.Printf("delivery: redis config invalid (%v)", perr)
		}
	}

	cfg, err := DefaultConfig()
	if err != nil {
		log.Printf("delivery: default config invalid (%v)", err)
		return Loaded{Config: Config{MaxPickupRadiusKm: 12, ParcelFallbackEnabled: true}, Source: "fallback"}
	}
	return Loaded{Config: cfg, Source: "default_json"}
}

// LoadOptionalRedis connects to Redis when available.
func LoadOptionalRedis() redis.UniversalClient {
	rdb := redisclient.NewUniversal()
	if err := redisclient.Ping(context.Background(), rdb); err != nil {
		return nil
	}
	return rdb
}

// Province returns config for a province code or nil.
func (c Config) Province(code string) *ProvinceConfig {
	norm := normalizeProvinceCode(code)
	for i := range c.Provinces {
		if c.Provinces[i].ProvinceCode == norm {
			return &c.Provinces[i]
		}
	}
	return nil
}

func (c Config) IsExpressEnabled(code string) bool {
	p := c.Province(code)
	return p != nil && p.Enabled && p.ExpressEnabled
}

func (c Config) ShouldOfferParcelFallback(code string) bool {
	if !c.ParcelFallbackEnabled {
		return false
	}
	p := c.Province(code)
	if p == nil {
		return c.ParcelFallbackEnabled
	}
	if !p.Enabled || !p.ExpressEnabled {
		return p.ParcelFallback
	}
	return false
}

func (c Config) CapabilityEnabled(id string) bool {
	if c.Capabilities == nil {
		return false
	}
	return c.Capabilities[id].Enabled
}

func normalizeProvinceCode(code string) string {
	if code == "" {
		return ""
	}
	if len(code) == 1 {
		return "0" + code
	}
	return code
}
