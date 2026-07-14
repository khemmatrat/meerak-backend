# P61: Production Go service image — distroless, non-root
# Build: docker build -f infra/docker/go-service.Dockerfile --build-arg SERVICE=catalog-svc --build-arg PORT=8110 -t aqond/catalog-svc:dev .
ARG SERVICE
ARG PORT=8080

FROM golang:1.22-alpine AS build
RUN apk add --no-cache git ca-certificates
WORKDIR /src
COPY go.work go.work
COPY pkg ./pkg
COPY services ./services
ARG SERVICE
WORKDIR /src/services/${SERVICE}
RUN go mod download && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/service .

FROM gcr.io/distroless/static-debian12:nonroot
ARG PORT
WORKDIR /
COPY --from=build /out/service /service
USER nonroot:nonroot
EXPOSE ${PORT}
ENTRYPOINT ["/service"]
