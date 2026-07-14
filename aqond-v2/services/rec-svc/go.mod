module github.com/aqond/aqond-v2/services/rec-svc

go 1.22

require (
	github.com/aqond/aqond-v2/pkg v0.0.0
	github.com/jackc/pgx/v5 v5.7.2
	github.com/redis/go-redis/v9 v9.7.0
)

replace github.com/aqond/aqond-v2/pkg => ../../pkg
