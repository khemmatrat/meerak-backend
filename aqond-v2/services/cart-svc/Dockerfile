FROM golang:1.22-alpine AS build
RUN apk add --no-cache git ca-certificates
WORKDIR /src
COPY go.work go.work
COPY pkg ./pkg
COPY services ./services
WORKDIR /src/services/cart-svc
RUN go mod download && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /service .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /service /service
USER nonroot:nonroot
EXPOSE 8133
ENTRYPOINT ["/service"]
