package metrics

import (
	"fmt"
	"net/http"
	"sync/atomic"
)

// Counter is a thread-safe counter exported on /metrics.
type Counter struct {
	v atomic.Int64
}

func (c *Counter) Inc() { c.v.Add(1) }

func (c *Counter) Add(n int64) { c.v.Add(n) }

func (c *Counter) Val() int64 { return c.v.Load() }

// Registry holds hot-path counters for Prometheus-style text export.
type Registry struct {
	OrdersAccepted      Counter
	OrdersShed          Counter
	ReserveConflicts    Counter
	FlashQueueJoins     Counter
	FlashQueueAdmits    Counter
	RateLimitRejected   Counter
	OrdersProcessed     Counter
	OrdersDedupSkipped  Counter
}

func (r *Registry) Handler(extra func() string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		fmt.Fprintf(w, "# HELP aqond_orders_accepted_total Accepted order/flash requests\n")
		fmt.Fprintf(w, "aqond_orders_accepted_total %d\n", r.OrdersAccepted.Val())
		fmt.Fprintf(w, "aqond_orders_shed_total %d\n", r.OrdersShed.Val())
		fmt.Fprintf(w, "aqond_reserve_conflicts_total %d\n", r.ReserveConflicts.Val())
		fmt.Fprintf(w, "aqond_flash_queue_joins_total %d\n", r.FlashQueueJoins.Val())
		fmt.Fprintf(w, "aqond_flash_queue_admits_total %d\n", r.FlashQueueAdmits.Val())
		fmt.Fprintf(w, "aqond_rate_limit_rejected_total %d\n", r.RateLimitRejected.Val())
		fmt.Fprintf(w, "aqond_orders_processed_total %d\n", r.OrdersProcessed.Val())
		fmt.Fprintf(w, "aqond_orders_dedup_skipped_total %d\n", r.OrdersDedupSkipped.Val())
		if extra != nil {
			fmt.Fprint(w, extra())
		}
	}
}
