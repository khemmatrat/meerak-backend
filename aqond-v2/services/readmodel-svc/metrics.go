package main

import "github.com/aqond/aqond-v2/pkg/metrics"

func (a *readmodelApp) metricsRegistry() *metrics.Registry {
	if a.mreg == nil {
		a.mreg = &metrics.Registry{}
	}
	return a.mreg
}

func (a *readmodelApp) metricsExtra() string {
	return ""
}
