module github.com/aqond/aqond-v2/services/transcode-worker

go 1.22

require (
	github.com/aqond/aqond-v2/pkg v0.0.0
	github.com/jackc/pgx/v5 v5.7.2
	github.com/minio/minio-go/v7 v7.0.80
	github.com/segmentio/kafka-go v0.4.47
)

replace github.com/aqond/aqond-v2/pkg => ../../pkg
