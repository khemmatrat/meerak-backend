// Package degrade defines load-shedding priorities for P184 graceful degradation.
package degrade

// Priority ranks surfaces during overload (higher = keep serving longer).
var Priority = map[string]int{
	"checkout": 100,
	"payment":  95,
	"flash_buy": 90,
	"order":    85,
	"search":   50,
	"feed":     40,
	"browse":   30,
	"analytics": 10,
}

// ShouldShed returns true if the surface should be shed at the given brownout level.
func ShouldShed(surface, level string) bool {
	p := Priority[surface]
	switch level {
	case "normal":
		return false
	case "elevated":
		return p < 50
	case "brownout":
		return p < 85
	case "critical":
		return p < 95
	default:
		return false
	}
}
