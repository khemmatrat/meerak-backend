package shard

import (
	"context"
	"fmt"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CatalogEntry maps a logical shard to a physical Citus node and home region.
type CatalogEntry struct {
	LogicalShard int
	PhysicalNode string
	Region       string
	CitusGroupID int
	Status       string
}

// Catalog holds the shard topology loaded from commerce.shard_catalog.
type Catalog struct {
	mu       sync.RWMutex
	entries  map[int]CatalogEntry
	byRegion map[string][]CatalogEntry
}

func NewCatalog() *Catalog {
	return &Catalog{
		entries:  make(map[int]CatalogEntry),
		byRegion: make(map[string][]CatalogEntry),
	}
}

func (c *Catalog) Load(ctx context.Context, pool *pgxpool.Pool) error {
	rows, err := pool.Query(ctx, `
		SELECT logical_shard, physical_node, region, COALESCE(citus_group_id,0), status
		FROM commerce.shard_catalog WHERE status = 'active' ORDER BY logical_shard`)
	if err != nil {
		return err
	}
	defer rows.Close()

	next := make(map[int]CatalogEntry)
	byRegion := make(map[string][]CatalogEntry)
	for rows.Next() {
		var e CatalogEntry
		if err := rows.Scan(&e.LogicalShard, &e.PhysicalNode, &e.Region, &e.CitusGroupID, &e.Status); err != nil {
			return err
		}
		next[e.LogicalShard] = e
		byRegion[e.Region] = append(byRegion[e.Region], e)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(next) == 0 {
		return fmt.Errorf("shard catalog empty")
	}
	c.mu.Lock()
	c.entries = next
	c.byRegion = byRegion
	c.mu.Unlock()
	return nil
}

func (c *Catalog) Entry(logicalShard int) (CatalogEntry, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	e, ok := c.entries[logicalShard]
	return e, ok
}

func (c *Catalog) Regions() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]string, 0, len(c.byRegion))
	for r := range c.byRegion {
		out = append(out, r)
	}
	return out
}

func (c *Catalog) Snapshot() []CatalogEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]CatalogEntry, 0, len(c.entries))
	for _, e := range c.entries {
		out = append(out, e)
	}
	return out
}
