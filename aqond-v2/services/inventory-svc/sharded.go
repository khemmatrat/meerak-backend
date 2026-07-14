package main

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/metrics"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"
)

const reserveShardedLua = `
local qty = tonumber(ARGV[1])
local total = 0
for i = 1, #KEYS do
  total = total + tonumber(redis.call('GET', KEYS[i]) or '0')
end
if total < qty then return 0 end
local remaining = qty
for i = 1, #KEYS do
  if remaining <= 0 then break end
  local avail = tonumber(redis.call('GET', KEYS[i]) or '0')
  if avail > 0 then
    local take = math.min(avail, remaining)
    redis.call('DECRBY', KEYS[i], take)
    remaining = remaining - take
  end
end
return 1
`

const releaseShardedLua = `
local qty = tonumber(ARGV[1])
if #KEYS < 1 then return 0 end
redis.call('INCRBY', KEYS[1], qty)
return 1
`

type inventoryCache struct {
	mu      sync.RWMutex
	entries map[string]cacheEntry
	ttl     time.Duration
	group   singleflight.Group
}

type cacheEntry struct {
	available int
	reserved  int
	expires   time.Time
}

func newInventoryCache(ttlMs int) *inventoryCache {
	if ttlMs < 1 {
		ttlMs = 500
	}
	return &inventoryCache{
		entries: make(map[string]cacheEntry),
		ttl:     time.Duration(ttlMs) * time.Millisecond,
	}
}

func (c *inventoryCache) get(variantID string) (cacheEntry, bool) {
	c.mu.RLock()
	e, ok := c.entries[variantID]
	c.mu.RUnlock()
	if !ok || time.Now().After(e.expires) {
		return cacheEntry{}, false
	}
	return e, true
}

func (c *inventoryCache) set(variantID string, avail, reserved int) {
	c.mu.Lock()
	c.entries[variantID] = cacheEntry{
		available: avail,
		reserved:  reserved,
		expires:   time.Now().Add(c.ttl),
	}
	c.mu.Unlock()
}

func (c *inventoryCache) invalidate(variantID string) {
	c.mu.Lock()
	delete(c.entries, variantID)
	c.mu.Unlock()
}

func shardBucketKeys(variantID string, buckets int) []string {
	// P56: hash-tag keeps all buckets in same Redis Cluster slot
	tag := fmt.Sprintf("inv:{%s}", variantID)
	keys := make([]string, buckets)
	for i := 0; i < buckets; i++ {
		keys[i] = fmt.Sprintf("%s:%d", tag, i)
	}
	return keys
}

func (a *inventoryApp) shardBuckets() int {
	n := config.Int("INV_SHARD_BUCKETS", 8)
	if n < 1 {
		return 1
	}
	if n > 32 {
		return 32
	}
	return n
}

func (a *inventoryApp) syncShardedRedis(ctx context.Context, variantID string) error {
	buckets := a.shardBuckets()
	var avail int
	err := a.readPool.QueryRow(ctx, `SELECT available FROM commerce.inventory WHERE variant_id=$1`, variantID).Scan(&avail)
	if err != nil {
		return err
	}
	per := avail / buckets
	rem := avail % buckets
	pipe := a.redis.Pipeline()
	tag := fmt.Sprintf("inv:{%s}", variantID)
	for i := 0; i < buckets; i++ {
		v := per
		if i < rem {
			v++
		}
		pipe.Set(ctx, fmt.Sprintf("%s:%d", tag, i), v, 0)
	}
	_, err = pipe.Exec(ctx)
	return err
}

func (a *inventoryApp) reserveSharded(ctx context.Context, variantID string, qty int) (int, error) {
	buckets := a.shardBuckets()
	keys := shardBucketKeys(variantID, buckets)
	res, err := a.redis.Eval(ctx, reserveShardedLua, keys, qty).Int()
	return res, err
}

func (a *inventoryApp) releaseSharded(ctx context.Context, variantID string, qty int) error {
	buckets := a.shardBuckets()
	keys := shardBucketKeys(variantID, buckets)
	_, err := a.redis.Eval(ctx, releaseShardedLua, keys[:1], qty).Int()
	if err != nil {
		return err
	}
	return a.syncShardedRedis(ctx, variantID)
}

func (a *inventoryApp) readInventoryCoalesced(ctx context.Context, variantID string) (avail, reserved int, err error) {
	if e, ok := a.cache.get(variantID); ok {
		return e.available, e.reserved, nil
	}
	v, err, _ := a.cache.group.Do(variantID, func() (any, error) {
		if e, ok := a.cache.get(variantID); ok {
			return e, nil
		}
		var a1, r1 int
		err := a.readPool.QueryRow(ctx, `SELECT available, reserved FROM commerce.inventory WHERE variant_id=$1`, variantID).
			Scan(&a1, &r1)
		if err != nil {
			return nil, err
		}
		a.cache.set(variantID, a1, r1)
		return cacheEntry{available: a1, reserved: r1}, nil
	})
	if err != nil {
		return 0, 0, err
	}
	e := v.(cacheEntry)
	return e.available, e.reserved, nil
}

func (a *inventoryApp) invalidateCache(variantID string) {
	a.cache.invalidate(variantID)
}

type inventoryApp struct {
	pool    *pgxpool.Pool
	readPool *pgxpool.Pool
	redis   redis.UniversalClient
	cache   *inventoryCache
	buckets int
	mreg    *metrics.Registry
}
