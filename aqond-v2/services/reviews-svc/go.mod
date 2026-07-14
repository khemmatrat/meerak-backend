module github.com/aqond/aqond-v2/services/reviews-svc

go 1.22

require (
	github.com/aqond/aqond-v2/pkg v0.0.0
	github.com/jackc/pgx/v5 v5.7.2
)

replace github.com/aqond/aqond-v2/pkg => ../../pkg
