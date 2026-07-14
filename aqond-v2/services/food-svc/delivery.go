package main

import (
	"math"
	"sort"
)

type deliveryMode string

const (
	modeExpress deliveryMode = "express"
	modeNormal  deliveryMode = "normal"
	modeSaver   deliveryMode = "saver"

	riderBaseMicro  int64 = 3500
	riderPerKmMicro int64 = 900
)

type restaurantRow struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Cuisine          string   `json:"cuisine"`
	Emoji            string   `json:"emoji"`
	Rating           float64  `json:"rating"`
	ReviewCount      int      `json:"review_count"`
	DistanceKm       float64  `json:"distance_km"`
	PrepMin          int      `json:"prep_min"`
	DeliveryFeeMicro int64    `json:"delivery_fee_micro"`
	MinOrderMicro    int64    `json:"min_order_micro"`
	Open             bool     `json:"open"`
	Tags             []string `json:"tags,omitempty"`
	ZoneID           string   `json:"zone_id,omitempty"`
	Lat              *float64 `json:"lat,omitempty"`
	Lng              *float64 `json:"lng,omitempty"`
}

type shopDeliveryLine struct {
	MerchantID    string `json:"merchant_id"`
	MerchantName  string `json:"merchant_name"`
	ExpressMicro  int64  `json:"express_micro"`
	ChargedMicro  int64  `json:"charged_micro"`
}

type deliveryQuote struct {
	Mode               deliveryMode       `json:"mode"`
	TotalMicro         int64              `json:"total_micro"`
	PerShop            []shopDeliveryLine `json:"per_shop"`
	ShopCount          int                `json:"shop_count"`
	BatchEligible      bool               `json:"batch_eligible"`
	BatchZone          string             `json:"batch_zone,omitempty"`
	RiderEstimateMicro int64              `json:"rider_estimate_micro"`
	RiderHint          string             `json:"rider_hint"`
	EtaExtraMin        int                `json:"eta_extra_min"`
	EtaLabel           string             `json:"eta_label,omitempty"`
}

func haversineKm(aLat, aLng, bLat, bLng float64) float64 {
	const R = 6371.0
	dLat := (bLat - aLat) * math.Pi / 180
	dLng := (bLng - aLng) * math.Pi / 180
	lat1 := aLat * math.Pi / 180
	lat2 := bLat * math.Pi / 180
	h := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1)*math.Cos(lat2)*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * R * math.Asin(math.Sqrt(h))
}

func maxSpreadKm(restaurants []restaurantRow) float64 {
	max := 0.0
	for i := 0; i < len(restaurants); i++ {
		for j := i + 1; j < len(restaurants); j++ {
			a, b := restaurants[i], restaurants[j]
			if a.Lat != nil && a.Lng != nil && b.Lat != nil && b.Lng != nil {
				d := haversineKm(*a.Lat, *a.Lng, *b.Lat, *b.Lng)
				if d > max {
					max = d
				}
			}
		}
	}
	return max
}

func canBatchRestaurants(restaurants []restaurantRow) bool {
	if len(restaurants) < 2 {
		return false
	}
	zones := map[string]bool{}
	for _, r := range restaurants {
		if r.ZoneID != "" {
			zones[r.ZoneID] = true
		}
	}
	if len(zones) == 1 {
		return true
	}
	spread := maxSpreadKm(restaurants)
	return spread > 0 && spread <= 3
}

func normalFeeFromExpress(express int64) int64 {
	v := int64(math.Round(float64(express) * 0.7))
	if v < 1400 {
		return 1400
	}
	return v
}

func saverTotalMicro(restaurants []restaurantRow) int64 {
	if len(restaurants) >= 2 && canBatchRestaurants(restaurants) {
		spread := maxSpreadKm(restaurants)
		if spread <= 0.5 {
			return 800
		}
		if spread <= 1.5 {
			return 1000
		}
		return 1200
	}
	return 1000
}

func riderEstimateMicro(restaurants []restaurantRow) int64 {
	if len(restaurants) == 0 {
		return riderBaseMicro
	}
	sum := 0.0
	for _, r := range restaurants {
		d := r.DistanceKm
		if d <= 0 {
			d = 1
		}
		sum += d
	}
	avg := sum / float64(len(restaurants))
	stops := float64(len(restaurants))
	km := avg + (stops-1)*0.35
	return riderBaseMicro + int64(math.Round(km*float64(riderPerKmMicro)))
}

func estimateEta(restaurant restaurantRow) (etaMin, etaMax int) {
	travel := int(math.Max(5, math.Round(restaurant.DistanceKm*5+4)))
	prep := restaurant.PrepMin
	etaMin = prep + travel
	etaMax = etaMin + 7
	return
}

func etaExtraForMode(mode deliveryMode) int {
	switch mode {
	case modeExpress:
		return 0
	case modeSaver:
		return 18
	default:
		return 5
	}
}

func quoteFoodDelivery(restaurants []restaurantRow, mode deliveryMode) deliveryQuote {
	if mode == "" {
		mode = modeNormal
	}
	batchEligible := len(restaurants) >= 2 && canBatchRestaurants(restaurants)
	var zone string
	for _, r := range restaurants {
		if r.ZoneID != "" {
			zone = r.ZoneID
			break
		}
	}
	extra := etaExtraForMode(mode)

	perShop := make([]shopDeliveryLine, len(restaurants))
	for i, r := range restaurants {
		express := r.DeliveryFeeMicro
		if express == 0 {
			express = 2000
		}
		charged := express
		if mode == modeNormal {
			charged = normalFeeFromExpress(express)
		}
		if mode == modeSaver {
			charged = 0
		}
		perShop[i] = shopDeliveryLine{
			MerchantID:   r.ID,
			MerchantName: r.Name,
			ExpressMicro: express,
			ChargedMicro: charged,
		}
	}

	var total int64
	if mode == modeSaver {
		total = saverTotalMicro(restaurants)
		each := total / int64(max(1, len(perShop)))
		for i := range perShop {
			if i == len(perShop)-1 {
				perShop[i].ChargedMicro = total - each*int64(len(perShop)-1)
			} else {
				perShop[i].ChargedMicro = each
			}
		}
	} else if mode == modeNormal {
		for _, p := range perShop {
			total += p.ChargedMicro
		}
	} else {
		for i := range perShop {
			perShop[i].ChargedMicro = perShop[i].ExpressMicro
			total += perShop[i].ExpressMicro
		}
	}

	riderEst := riderEstimateMicro(restaurants)
	longestMin, longestMax := 25, 35
	for _, r := range restaurants {
		emin, emax := estimateEta(r)
		if emax > longestMax {
			longestMin, longestMax = emin, emax
		}
	}
	etaMin := longestMin + extra
	etaMax := longestMax + extra

	hint := "ไรเดอร์ ~" + formatBaht(riderEst) + " บาท (ฐาน 35 + กม.ละ 9)"
	if batchEligible && mode == modeSaver {
		hint = "ไรเดอร์รับรวม ~" + formatBaht(riderEst) + " บาท · หลายร้านละแวกเดียวกัน"
	}

	return deliveryQuote{
		Mode:               mode,
		TotalMicro:         total,
		PerShop:            perShop,
		ShopCount:          len(restaurants),
		BatchEligible:      batchEligible,
		BatchZone:          zone,
		RiderEstimateMicro: riderEst,
		RiderHint:          hint,
		EtaExtraMin:        extra,
		EtaLabel:           itoa(etaMin) + "–" + itoa(etaMax) + " นาที",
	}
}

func formatBaht(micro int64) string {
	return itoa(int(math.Round(float64(micro) / 100)))
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	if neg {
		return "-" + string(digits)
	}
	return string(digits)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func optionsSignature(opts []map[string]any) string {
	if len(opts) == 0 {
		return ""
	}
	ids := make([]string, 0, len(opts))
	for _, o := range opts {
		if id, ok := o["option_id"].(string); ok && id != "" {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return joinStrings(ids, ",")
}

func joinStrings(parts []string, sep string) string {
	if len(parts) == 0 {
		return ""
	}
	out := parts[0]
	for i := 1; i < len(parts); i++ {
		out += sep + parts[i]
	}
	return out
}

func lineUnitMicro(base int64, opts []map[string]any) int64 {
	sum := base
	for _, o := range opts {
		if v, ok := o["price_micro"].(float64); ok {
			sum += int64(v)
		}
	}
	return sum
}
