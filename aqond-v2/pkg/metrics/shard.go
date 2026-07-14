package metrics

import "sync"

// ShardRegistry tracks per-shard counters for skew detection (P58).
type ShardRegistry struct {
	mu      sync.Mutex
	byShard map[string]float64
	byRegion map[string]float64
}

func NewShardRegistry() *ShardRegistry {
	return &ShardRegistry{
		byShard:  make(map[string]float64),
		byRegion: make(map[string]float64),
	}
}

func (s *ShardRegistry) IncShard(shard, region string, delta float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.byShard[shard] += delta
	if region != "" {
		s.byRegion[region] += delta
	}
}

func (s *ShardRegistry) Snapshot() (shards, regions map[string]float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	shards = make(map[string]float64, len(s.byShard))
	for k, v := range s.byShard {
		shards[k] = v
	}
	regions = make(map[string]float64, len(s.byRegion))
	for k, v := range s.byRegion {
		regions[k] = v
	}
	return shards, regions
}

// HotShards returns shard keys above mean * factor (skew detection).
func (s *ShardRegistry) HotShards(factor float64) []string {
	shards, _ := s.Snapshot()
	if len(shards) == 0 {
		return nil
	}
	var sum float64
	for _, v := range shards {
		sum += v
	}
	mean := sum / float64(len(shards))
	threshold := mean * factor
	var hot []string
	for k, v := range shards {
		if v >= threshold && v > 0 {
			hot = append(hot, k)
		}
	}
	return hot
}
