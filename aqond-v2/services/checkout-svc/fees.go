package main

import (
	"context"

	"github.com/aqond/aqond-v2/pkg/crosscloud"
)

func (a *app) initFeesRedis() {
	a.feesRedis = crosscloud.NewRedisOptional()
}

func (a *app) applyPlatformFee(ctx context.Context, subtotal int64, orderType string) (feeMicro int64, totalWithFee int64) {
	feeMicro = crosscloud.PlatformFeeMicro(ctx, a.feesRedis, subtotal, orderType)
	return feeMicro, subtotal + feeMicro
}
