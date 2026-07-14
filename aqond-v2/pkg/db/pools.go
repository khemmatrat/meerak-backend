package db

import (
	"context"
	"fmt"
	"net/url"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Pools separates write (primary) and read (replica or read-only) connections.
type Pools struct {
	Write        *pgxpool.Pool
	Read         *pgxpool.Pool
	CitusEnabled bool
}

func newPoolDSN(pg config.Postgres, readOnly bool) string {
	u := &url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(pg.User, pg.Password),
		Host:   fmt.Sprintf("%s:%d", pg.Host, pg.Port),
		Path:   pg.Database,
	}
	q := u.Query()
	q.Set("sslmode", "disable")
	if readOnly {
		q.Set("default_transaction_read_only", "true")
	}
	u.RawQuery = q.Encode()
	return u.String()
}

func NewPool(ctx context.Context, pg config.Postgres) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, newPoolDSN(pg, false))
}

func NewPools(ctx context.Context) (*Pools, error) {
	writePG := config.LoadPostgresCitus()
	write, err := pgxpool.New(ctx, newPoolDSN(writePG, false))
	if err != nil {
		return nil, err
	}
	readPG := config.LoadPostgresRead()
	if config.UseCitus() {
		readPG = writePG
	}
	read, err := pgxpool.New(ctx, newPoolDSN(readPG, readPG.Host != writePG.Host))
	if err != nil {
		write.Close()
		return nil, err
	}
	return &Pools{Write: write, Read: read, CitusEnabled: config.UseCitus()}, nil
}
