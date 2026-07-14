package scylla

import (
	"fmt"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/gocql/gocql"
)

type Config struct {
	Hosts    []string
	Keyspace string
}

func LoadConfig() Config {
	hosts := strings.Split(config.Get("SCYLLA_HOSTS", "scylla:9042"), ",")
	for i := range hosts {
		hosts[i] = strings.TrimSpace(hosts[i])
	}
	return Config{
		Hosts:    hosts,
		Keyspace: config.Get("SCYLLA_KEYSPACE", "feed"),
	}
}

func NewSession(cfg Config) (*gocql.Session, error) {
	cluster := gocql.NewCluster(cfg.Hosts...)
	cluster.Consistency = gocql.Quorum
	cluster.Timeout = 10 * time.Second
	cluster.ConnectTimeout = 15 * time.Second
	cluster.Keyspace = cfg.Keyspace
	cluster.NumConns = 2
	s, err := cluster.CreateSession()
	if err != nil {
		return nil, fmt.Errorf("scylla session: %w", err)
	}
	return s, nil
}

func Ping(session *gocql.Session) error {
	var now time.Time
	return session.Query(`SELECT now() FROM system.local`).Scan(&now)
}
