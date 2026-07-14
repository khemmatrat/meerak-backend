package delivery

import (
	"os"
	"strings"
	"sync"
)

var (
	fileCacheMu sync.Mutex
	fileCache   = map[string]fileCacheEntry{}
)

type fileCacheEntry struct {
	mtimeMs int64
	loaded  Loaded
}

func clearFileCacheForTests() {
	fileCacheMu.Lock()
	fileCache = map[string]fileCacheEntry{}
	fileCacheMu.Unlock()
}

func loadFromPathCached(path string) (Loaded, error) {
	info, err := os.Stat(path)
	if err != nil {
		return Loaded{}, err
	}
	mtimeMs := info.ModTime().UnixMilli()

	fileCacheMu.Lock()
	if hit, ok := fileCache[path]; ok && hit.mtimeMs == mtimeMs {
		loaded := hit.loaded
		fileCacheMu.Unlock()
		return loaded, nil
	}
	fileCacheMu.Unlock()

	raw, err := os.ReadFile(path)
	if err != nil {
		return Loaded{}, err
	}
	cfg, err := ParseConfigJSON(raw)
	if err != nil {
		return Loaded{}, err
	}
	loaded := Loaded{Config: cfg, Source: "env_path", Path: path}

	fileCacheMu.Lock()
	fileCache[path] = fileCacheEntry{mtimeMs: mtimeMs, loaded: loaded}
	fileCacheMu.Unlock()

	return loaded, nil
}

// ProvinceByAlias resolves a province by English name or alias (e.g. Hat Yai → Songkhla).
func (c Config) ProvinceByAlias(alias string) *ProvinceConfig {
	norm := normalizeLookup(alias)
	for i := range c.Provinces {
		p := &c.Provinces[i]
		if normalizeLookup(p.NameEN) == norm {
			return p
		}
		if p.AliasEN != "" && normalizeLookup(p.AliasEN) == norm {
			return p
		}
	}
	return nil
}

func normalizeLookup(s string) string {
	return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(s)), " ", "")
}

func countEnabledProvinces(c Config) int {
	n := 0
	for _, p := range c.Provinces {
		if p.Enabled {
			n++
		}
	}
	return n
}
