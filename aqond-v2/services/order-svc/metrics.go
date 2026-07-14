package main

import "github.com/aqond/aqond-v2/pkg/metrics"

func (a *orderApp) metricsRegistry() *metrics.Registry {
	return a.mreg
}
