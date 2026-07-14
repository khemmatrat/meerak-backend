package delivery_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/aqond/aqond-v2/pkg/delivery"
)

func TestDefaultConfigLoadsPhase1And2(t *testing.T) {
	cfg, err := delivery.DefaultConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.MaxPickupRadiusKm != 12 {
		t.Fatalf("expected radius 12, got %v", cfg.MaxPickupRadiusKm)
	}
	if len(cfg.Provinces) != 15 {
		t.Fatalf("expected 15 provinces, got %d", len(cfg.Provinces))
	}
	phase1Express := 0
	phase2Parcel := 0
	for _, p := range cfg.Provinces {
		if p.RolloutPhase == 1 && p.ExpressEnabled {
			phase1Express++
		}
		if p.RolloutPhase == 2 && !p.ExpressEnabled && p.ParcelFallback {
			phase2Parcel++
		}
	}
	if phase1Express != 5 {
		t.Fatalf("expected 5 phase-1 express provinces, got %d", phase1Express)
	}
	if phase2Parcel != 10 {
		t.Fatalf("expected 10 phase-2 parcel-fallback provinces, got %d", phase2Parcel)
	}
}

func TestValidateRejectsDuplicateProvince(t *testing.T) {
	cfg, _ := delivery.DefaultConfig()
	cfg.Provinces = append(cfg.Provinces, cfg.Provinces[0])
	if _, err := delivery.ValidateConfig(cfg); err == nil {
		t.Fatal("expected duplicate province error")
	}
}

func TestLoadFromEnvPath(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "delivery-config.json")
	cfg, err := delivery.DefaultConfig()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DELIVERY_CONFIG_PATH", path)
	t.Setenv("DELIVERY_CONFIG_JSON", "")

	loaded := delivery.Load(context.Background(), nil)
	if loaded.Source != "env_path" {
		t.Fatalf("expected env_path, got %s", loaded.Source)
	}
	if loaded.Config.MaxPickupRadiusKm != cfg.MaxPickupRadiusKm {
		t.Fatalf("radius mismatch")
	}
}

func TestExpressAndParcelQueries(t *testing.T) {
	cfg, err := delivery.DefaultConfig()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.IsExpressEnabled("10") {
		t.Fatal("bangkok express should be enabled")
	}
	if cfg.IsExpressEnabled("83") {
		t.Fatal("phuket express should be disabled in phase 2")
	}
	if !cfg.ShouldOfferParcelFallback("83") {
		t.Fatal("phuket should offer parcel fallback when express off")
	}
	if cfg.ShouldOfferParcelFallback("10") {
		t.Fatal("bangkok express on should not auto-fallback")
	}
}

func TestDeliveryCoreCapabilities(t *testing.T) {
	cfg, err := delivery.DefaultConfig()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.CapabilityEnabled("local_delivery") {
		t.Fatal("local_delivery capability should be enabled")
	}
	if !cfg.CapabilityEnabled("express_rider") {
		t.Fatal("express_rider capability should be enabled")
	}
	if cfg.CapabilityEnabled("food_rider") {
		t.Fatal("food_rider should be disabled in phase 1")
	}
}

func TestProvinceLookup(t *testing.T) {
	cfg, _ := delivery.DefaultConfig()
	if cfg.Province("10") == nil {
		t.Fatal("expected bangkok province")
	}
	if cfg.Province("99") != nil {
		t.Fatal("unknown province should be nil")
	}
}
