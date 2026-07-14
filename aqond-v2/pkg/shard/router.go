package shard

import (
	"hash/fnv"
)

// Router maps merchant_id -> logical shard and exposes physical topology (P49).
type Router struct {
	ShardCount int
	catalog    *Catalog
}

func NewRouter(shardCount int) *Router {
	if shardCount < 1 {
		shardCount = 1
	}
	return &Router{ShardCount: shardCount, catalog: NewCatalog()}
}

func (r *Router) WithCatalog(c *Catalog) *Router {
	r.catalog = c
	return r
}

func (r *Router) Catalog() *Catalog {
	if r.catalog == nil {
		r.catalog = NewCatalog()
	}
	return r.catalog
}

// ShardKey is the Citus distribution column (merchant_id co-location).
func (r *Router) ShardKey(merchantID string) string {
	return merchantID
}

func (r *Router) LogicalShard(merchantID string) int {
	h := fnv.New32a()
	_, _ = h.Write([]byte(merchantID))
	return int(h.Sum32() % uint32(r.ShardCount))
}

func (r *Router) PhysicalNode(merchantID string) string {
	ls := r.LogicalShard(merchantID)
	if e, ok := r.catalog.Entry(ls); ok {
		return e.PhysicalNode
	}
	return "aqond-db"
}

func (r *Router) HomeRegion(merchantID string) string {
	ls := r.LogicalShard(merchantID)
	if e, ok := r.catalog.Entry(ls); ok {
		return e.Region
	}
	return "TH"
}

// MetricsLabels returns shard observability labels for metrics (P58).
func (r *Router) MetricsLabels(merchantID string) map[string]string {
	ls := r.LogicalShard(merchantID)
	labels := map[string]string{
		"logical_shard":  itoa(ls),
		"shard_key_hash": shortHash(merchantID),
	}
	if e, ok := r.catalog.Entry(ls); ok {
		labels["physical_node"] = e.PhysicalNode
		labels["region"] = e.Region
	}
	return labels
}

func (r *Router) DSNForMerchant(merchantID, baseDSN string) string {
	// Citus routes by shard_key at coordinator; apps connect to coordinator DSN.
	_ = r.PhysicalNode(merchantID)
	return baseDSN
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [12]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func shortHash(s string) string {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return itoa(int(h.Sum32() % 1000))
}
