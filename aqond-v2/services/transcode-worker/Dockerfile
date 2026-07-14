FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.work go.work
COPY pkg ./pkg
COPY services ./services
WORKDIR /src/services/transcode-worker
RUN go mod download && CGO_ENABLED=0 go build -ldflags="-s -w" -o /service .

FROM alpine:3.19
RUN apk add --no-cache ffmpeg curl && adduser -D -u 65532 -g 65532 appuser
WORKDIR /app
COPY --from=build /service /app/service
USER appuser
ENTRYPOINT ["/app/service"]
