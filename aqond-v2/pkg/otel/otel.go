package otel

import (
	"context"
	"net/http"
	"os"

	"github.com/aqond/aqond-v2/pkg/config"
)

const (
	HeaderTraceParent = "traceparent"
	HeaderTraceState  = "tracestate"
)

// Config holds OTel export settings (P72 — lightweight stub; full SDK in cloud).
type Config struct {
	ServiceName string
	Endpoint    string
	Enabled     bool
}

func LoadConfig(serviceName string) Config {
	return Config{
		ServiceName: serviceName,
		Endpoint:    config.Get("OTEL_EXPORTER_OTLP_ENDPOINT", ""),
		Enabled:     config.Get("OTEL_ENABLED", "0") == "1",
	}
}

// PropagateMiddleware copies W3C trace context through HTTP (P72).
func PropagateMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		if tp := r.Header.Get(HeaderTraceParent); tp != "" {
			ctx = context.WithValue(ctx, traceParentKey{}, tp)
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type traceParentKey struct{}

func TraceParentFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(traceParentKey{}).(string); ok {
		return v
	}
	return ""
}

func KafkaHeaders(ctx context.Context) map[string]string {
	h := map[string]string{}
	if tp := TraceParentFromContext(ctx); tp != "" {
		h[HeaderTraceParent] = tp
	}
	if ts := os.Getenv("OTEL_TRACESTATE"); ts != "" {
		h[HeaderTraceState] = ts
	}
	return h
}
