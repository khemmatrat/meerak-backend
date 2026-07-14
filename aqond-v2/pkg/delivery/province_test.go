package delivery_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/aqond/aqond-v2/pkg/delivery"
)

func TestProvinceAliasHatYai(t *testing.T) {
	cfg, err := delivery.DefaultConfig()
	if err != nil {
		t.Fatal(err)
	}
	p := cfg.ProvinceByAlias("Hat Yai")
	if p == nil || p.ProvinceCode != "90" {
		t.Fatalf("expected Songkhla via Hat Yai alias, got %#v", p)
	}
	if !p.Enabled {
		t.Fatal("Songkhla should be enabled")
	}
}

func TestAllInitialProvincesEnabled(t *testing.T) {
	cfg, err := delivery.DefaultConfig()
	if err != nil {
		t.Fatal(err)
	}
	if count := countEnabled(cfg); count != 15 {
		t.Fatalf("expected 15 enabled provinces, got %d", count)
	}
	if cfg.MaxPickupRadiusKm != 12 {
		t.Fatalf("expected radius 12, got %v", cfg.MaxPickupRadiusKm)
	}
}

func TestHotReloadFromFilePath(t *testing.T) {
	cfg, err := delivery.DefaultConfig()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "delivery-config.json")
	writeConfig(t, path, cfg)

	t.Setenv("DELIVERY_CONFIG_PATH", path)
	t.Setenv("DELIVERY_CONFIG_JSON", "")

	first := delivery.Load(context.Background(), nil)
	if first.Source != "env_path" {
		t.Fatalf("expected env_path, got %s", first.Source)
	}

	cfg.Provinces[0].Enabled = false
	writeConfig(t, path, cfg)
	time.Sleep(10 * time.Millisecond)

	second := delivery.Load(context.Background(), nil)
	if second.Config.Provinces[0].Enabled {
		t.Fatal("expected hot reload to pick up disabled province")
	}
}

func writeConfig(t *testing.T, path string, cfg delivery.Config) {
	t.Helper()
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatal(err)
	}
}

func countEnabled(cfg delivery.Config) int {
	n := 0
	for _, p := range cfg.Provinces {
		if p.Enabled {
			n++
		}
	}
	return n
}
