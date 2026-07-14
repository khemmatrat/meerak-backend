package config

import (
	"os"
	"strconv"
	"strings"
)

func Get(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return strings.TrimSpace(v)
	}
	return fallback
}

func Int(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

type Postgres struct {
	Host     string
	Port     int
	User     string
	Password string
	Database string
}

func LoadPostgres() Postgres {
	return Postgres{
		Host:     Get("PGHOST", "aqond-db"),
		Port:     Int("PGPORT", 5432),
		User:     Get("PGUSER", "admin_boss"),
		Password: Get("PGPASSWORD", ""),
		Database: Get("PGDATABASE", "commerce"),
	}
}

// LoadPostgresRead returns the read-replica target (falls back to primary host).
func LoadPostgresRead() Postgres {
	pg := LoadPostgres()
	if h := Get("PGREADHOST", ""); h != "" {
		pg.Host = h
	}
	if p := Int("PGREADPORT", 0); p > 0 {
		pg.Port = p
	}
	return pg
}

func LoadRedisAddr() string {
	return Get("REDIS_ADDR", "aqond-redis:6379")
}

func LoadKafkaBrokers() []string {
	b := Get("KAFKA_BROKERS", "redpanda:9092")
	return []string{b}
}

func LoadScyllaHosts() []string {
	raw := Get("SCYLLA_HOSTS", "scylla:9042")
	parts := strings.Split(raw, ",")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return parts
}

type MinIO struct {
	Endpoint  string
	PublicURL string
	AccessKey string
	SecretKey string
	Bucket    string
	VideoBucket string
}

func LoadMinIO() MinIO {
	return MinIO{
		Endpoint:    Get("MINIO_ENDPOINT", "http://minio:9000"),
		PublicURL:   Get("MINIO_PUBLIC_URL", "http://localhost:9000"),
		AccessKey:   Get("MINIO_ACCESS_KEY", Get("MINIO_ROOT_USER", "aqond_minio")),
		SecretKey:   Get("MINIO_SECRET_KEY", Get("MINIO_ROOT_PASSWORD", "")),
		Bucket:      Get("MINIO_BUCKET", "aqond-products"),
		VideoBucket: Get("MINIO_VIDEO_BUCKET", "aqond-videos"),
	}
}

func LoadCDNBaseURL() string {
	return Get("CDN_BASE_URL", "http://localhost:8098/cdn")
}

func UseCitus() bool {
	return Get("USE_CITUS", "0") == "1"
}

func LoadPostgresCitus() Postgres {
	pg := LoadPostgres()
	if UseCitus() {
		pg.Host = Get("CITUS_COORDINATOR_HOST", "citus-coordinator")
		if p := Int("CITUS_COORDINATOR_PORT", 5432); p > 0 {
			pg.Port = p
		}
	}
	return pg
}

func LoadRegion() string {
	return Get("AQOND_REGION", Get("AQOND_DEFAULT_REGION", "TH"))
}

func RedisClusterMode() bool {
	return Get("REDIS_CLUSTER", "0") == "1"
}

func LoadRedisClusterAddrs() []string {
	raw := Get("REDIS_CLUSTER_ADDRS", "redis-node-1:6379,redis-node-2:6379,redis-node-3:6379")
	parts := strings.Split(raw, ",")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return parts
}
