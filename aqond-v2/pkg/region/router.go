package region

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/jackc/pgx/v5/pgxpool"
)

const HeaderRegion = "X-Aqond-Region"

// Router resolves home region for requests and enforces routing policy (P53).
type Router struct {
	DefaultRegion string
	FallbackRead  bool
}

func NewRouter() *Router {
	return &Router{
		DefaultRegion: config.Get("AQOND_DEFAULT_REGION", "TH"),
		FallbackRead:  config.Get("REGION_FALLBACK_READ", "1") == "1",
	}
}

func (r *Router) FromRequest(req *http.Request) string {
	if v := strings.TrimSpace(req.Header.Get(HeaderRegion)); v != "" {
		return strings.ToUpper(v)
	}
	if v := strings.TrimSpace(req.URL.Query().Get("region")); v != "" {
		return strings.ToUpper(v)
	}
	return r.DefaultRegion
}

// RouteTarget returns the target region and whether cross-region read fallback is allowed.
func (r *Router) RouteTarget(homeRegion, requestRegion string, write bool) (target string, allowed bool, reason string) {
	home := strings.ToUpper(homeRegion)
	req := strings.ToUpper(requestRegion)
	if req == "" {
		req = r.DefaultRegion
	}
	if write {
		if req != home {
			return home, false, fmt.Sprintf("write pinned to home region %s, got %s", home, req)
		}
		return home, true, "home write"
	}
	if req == home {
		return home, true, "home read"
	}
	if r.FallbackRead {
		return req, true, "cross-region read fallback"
	}
	return home, false, "cross-region read disabled"
}

// HomeRegionForShard looks up merchant/user home region from shard catalog (P53).
func HomeRegionForShard(ctx context.Context, pool *pgxpool.Pool, shardKey string, logicalShard int) string {
	var region string
	_ = pool.QueryRow(ctx, `
		SELECT region FROM commerce.shard_catalog WHERE logical_shard = $1 LIMIT 1`, logicalShard).Scan(&region)
	if region != "" {
		return region
	}
	_ = pool.QueryRow(ctx, `
		SELECT region FROM commerce.merchants WHERE shard_key = $1 LIMIT 1`, shardKey).Scan(&region)
	if region != "" {
		return region
	}
	return config.Get("AQOND_DEFAULT_REGION", "TH")
}
