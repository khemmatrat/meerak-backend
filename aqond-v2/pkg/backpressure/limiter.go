package backpressure

import "sync"

// Limiter bounds concurrent in-flight requests (load shedding when saturated).
type Limiter struct {
	sem chan struct{}
}

func New(maxConcurrent int) *Limiter {
	if maxConcurrent < 1 {
		maxConcurrent = 64
	}
	return &Limiter{sem: make(chan struct{}, maxConcurrent)}
}

func (l *Limiter) TryAcquire() bool {
	select {
	case l.sem <- struct{}{}:
		return true
	default:
		return false
	}
}

func (l *Limiter) Release() {
	select {
	case <-l.sem:
	default:
	}
}

// TrackedLimiter exposes queue depth for health metrics.
type TrackedLimiter struct {
	*Limiter
	mu    sync.Mutex
	depth int
}

func NewTracked(maxConcurrent int) *TrackedLimiter {
	return &TrackedLimiter{Limiter: New(maxConcurrent)}
}

func (l *TrackedLimiter) TryAcquire() bool {
	if !l.Limiter.TryAcquire() {
		return false
	}
	l.mu.Lock()
	l.depth++
	l.mu.Unlock()
	return true
}

func (l *TrackedLimiter) Release() {
	l.Limiter.Release()
	l.mu.Lock()
	if l.depth > 0 {
		l.depth--
	}
	l.mu.Unlock()
}

func (l *TrackedLimiter) Depth() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.depth
}
