package shard

import (
	"fmt"
	"regexp"
	"strings"
)

var crossShardPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bJOIN\b`),
	regexp.MustCompile(`(?i)\bUNION\b`),
	regexp.MustCompile(`(?i)\bIN\s*\(\s*SELECT`),
}

// GuardWarn checks SQL for patterns that may cause cross-shard scatter-gather on hot paths.
// Returns a warning message when the query looks unsafe for single-shard hot paths.
func GuardWarn(query string, shardKeyFilterPresent bool) string {
	q := strings.TrimSpace(query)
	if q == "" {
		return ""
	}
	if shardKeyFilterPresent {
		return ""
	}
	for _, re := range crossShardPatterns {
		if re.MatchString(q) {
			return "possible cross-shard query: missing shard_key filter with join/union pattern"
		}
	}
	if strings.Contains(strings.ToLower(q), "cross join") {
		return "cross join without shard_key filter"
	}
	return ""
}

// GuardHotPath rejects queries on hot paths that lack shard_key equality filter.
func GuardHotPath(query, shardKey string) error {
	if shardKey == "" {
		return fmt.Errorf("hot path requires shard_key")
	}
	lower := strings.ToLower(query)
	if !strings.Contains(lower, "shard_key") {
		return fmt.Errorf("hot path query must filter shard_key=%q", shardKey)
	}
	return nil
}
