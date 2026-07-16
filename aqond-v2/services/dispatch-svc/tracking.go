package main

import (
	"math"
	"os"
	"sort"
)

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

func lerp(a, b, t float64) float64 {
	return a + (b-a)*t
}

func lerpPoint(fromLat, fromLng, toLat, toLng float64, t float64) (float64, float64) {
	return lerp(fromLat, toLat, t), lerp(fromLng, toLng, t)
}

func phaseProgress(phase string) float64 {
	phases := []string{
		"merchant_pending", "merchant_accepted", "merchant_preparing", "finding_rider", "rider_assigned",
		"food_ready", "rider_picked_up", "en_route", "approaching", "arrived", "rider_calling",
		"photo_proof", "handoff", "cod_payment", "rider_completed", "review_pending", "completed",
	}
	idx := -1
	for i, p := range phases {
		if p == phase {
			idx = i
			break
		}
	}
	if idx < 0 {
		return 0.1
	}
	return float64(idx+1) / float64(len(phases))
}

var phaseLabels = map[string]string{
	"merchant_pending":    "รอร้านรับออเดอร์",
	"merchant_accepted":   "ร้านรับออเดอร์แล้ว",
	"merchant_preparing":  "กำลังเตรียมอาหาร",
	"finding_rider":       "กำลังหาไรเดอร์",
	"rider_assigned":      "ไรเดอร์รับงานแล้ว",
	"food_ready":          "อาหารพร้อม — รอไรเดอร์มารับ",
	"rider_picked_up":     "ไรเดอร์รับอาหารแล้ว",
	"en_route":            "กำลังนำมาส่ง",
	"approaching":         "ใกล้ถึงแล้ว",
	"arrived":             "ไรเดอร์ถึงที่หมาย",
	"rider_calling":       "ไรเดอร์กำลังโทรหา",
	"photo_proof":         "ถ่ายรูปหลักฐาน",
	"handoff":             "ส่งมอบอาหาร",
	"cod_payment":         "เก็บเงินปลายทาง",
	"rider_completed":     "ส่งสำเร็จ",
	"review_pending":      "รอให้คะแนน",
	"completed":           "เสร็จสมบูรณ์",
}

func riderPosForPhase(j jobRow) map[string]any {
	pickup := map[string]float64{"lat": j.PickupLat, "lng": j.PickupLng}
	drop := map[string]float64{"lat": j.DropoffLat, "lng": j.DropoffLng}
	if j.RiderLat != nil && j.RiderLng != nil {
		return map[string]any{"lat": *j.RiderLat, "lng": *j.RiderLng}
	}
	switch j.Phase {
	case "finding_rider", "food_ready", "rider_assigned":
		return map[string]any{"lat": pickup["lat"], "lng": pickup["lng"]}
	case "rider_picked_up", "en_route", "approaching":
		lat, lng := lerpPoint(pickup["lat"], pickup["lng"], drop["lat"], drop["lng"], 0.55)
		return map[string]any{"lat": lat, "lng": lng}
	case "arrived", "rider_calling", "photo_proof", "handoff", "cod_payment", "rider_completed", "review_pending", "completed":
		return map[string]any{"lat": drop["lat"], "lng": drop["lng"]}
	default:
		return map[string]any{"lat": pickup["lat"], "lng": pickup["lng"]}
	}
}

func buildTimeline(phase string) []map[string]any {
	steps := []struct {
		id, label string
		phases    []string
	}{
		{"shop", "ร้านรับออเดอร์", []string{"merchant_pending", "merchant_accepted"}},
		{"prep", "เตรียมอาหาร", []string{"merchant_preparing", "food_ready"}},
		{"find", "หาไรเดอร์", []string{"finding_rider", "rider_assigned"}},
		{"pickup", "ไรเดอร์รับอาหาร", []string{"rider_picked_up"}},
		{"deliver", "นำมาส่ง", []string{"en_route", "approaching"}},
		{"arrive", "ถึงที่หมาย", []string{"arrived", "rider_calling", "photo_proof", "handoff", "cod_payment"}},
		{"done", "เสร็จสิ้น", []string{"rider_completed", "review_pending", "completed"}},
	}
	all := []string{
		"merchant_pending", "merchant_accepted", "merchant_preparing", "finding_rider", "rider_assigned",
		"food_ready", "rider_picked_up", "en_route", "approaching", "arrived", "rider_calling",
		"photo_proof", "handoff", "cod_payment", "rider_completed", "review_pending", "completed",
	}
	idx := func(p string) int {
		for i, x := range all {
			if x == p {
				return i
			}
		}
		return 0
	}
	cur := idx(phase)
	out := make([]map[string]any, 0, len(steps))
	for _, s := range steps {
		maxI, minI := -1, 999
		for _, p := range s.phases {
			i := idx(p)
			if i > maxI {
				maxI = i
			}
			if i < minI {
				minI = i
			}
		}
		active := false
		for _, p := range s.phases {
			if p == phase {
				active = true
				break
			}
		}
		out = append(out, map[string]any{
			"id": s.id, "label": s.label, "done": cur > maxI, "active": active,
		})
	}
	return out
}

func buildTrackingView(j jobRow, rider *riderRow, hasReview bool, chats []chatRow) map[string]any {
	phase := j.Phase
	if phase == "" {
		phase = "finding_rider"
	}
	showRider := phase != "finding_rider" && phase != "merchant_pending" && phase != "merchant_preparing" && j.RiderID != ""
	delivered := phase == "rider_completed" || phase == "review_pending" || phase == "completed"
	canReview := phase == "review_pending" && !hasReview

	riderProfile := map[string]any{
		"name": "ไรเดอร์ AQOND", "phone": "081-000-0000", "vehicle": "motorcycle",
		"plate": "—", "avatar_url": "", "rating": 4.8, "review_count": 100, "grade": "A",
	}
	if rider != nil {
		riderProfile = map[string]any{
			"name": rider.DisplayName, "phone": rider.Phone, "vehicle": rider.Vehicle,
			"plate": rider.Plate, "avatar_url": "", "rating": rider.Rating,
			"review_count": rider.ReviewCount, "grade": rider.Grade,
		}
	}

	label := phaseLabels[phase]
	if label == "" {
		label = phase
	}

	photoURL := ""
	if j.DeliveryPhotoURL != nil {
		photoURL = *j.DeliveryPhotoURL
	}
	chatMsgs := make([]map[string]any, 0, len(chats))
	for _, c := range chats {
		chatMsgs = append(chatMsgs, map[string]any{"from": c.FromRole, "text": c.Text, "at": c.At})
	}

	return map[string]any{
		"order_id": j.OrderID, "buyer_id": j.BuyerID, "merchant_id": j.MerchantID,
		"merchant_name": j.MerchantName, "items_summary": j.ItemsSummary,
		"address": j.Address, "handoff_note": j.HandoffNote, "eta_label": j.EtaLabel,
		"payment_method": j.PaymentMethod, "amount_micro": j.AmountMicro,
		"phase": phase, "progress": phaseProgress(phase),
		"rider_pos": riderPosForPhase(j),
		"restaurant": map[string]any{"lat": j.PickupLat, "lng": j.PickupLng, "name": j.MerchantName},
		"destination": map[string]any{"lat": j.DropoffLat, "lng": j.DropoffLng},
		"rider": riderProfile,
		"delivered": delivered,
		"status_th": label,
		"status_detail": label,
		"minutes_left": 12,
		"show_rider": showRider,
		"show_rider_profile": showRider,
		"timeline": buildTimeline(phase),
		"active_events": []string{label},
		"can_review": canReview,
		"can_chat": showRider,
		"chat_messages": chatMsgs,
		"customer_phone": j.CustomerPhone,
		"recipient_name": j.RecipientName,
		"job_type": j.JobType,
		"delivery_photo_url": photoURL,
		"job_id": j.ID, "dispatch_status": j.Status,
		"source": "dispatch-svc",
	}
}

func pickBestRider(riders []riderRow, lat, lng float64) string {
	// Strategy B: weighted score (env-tunable). Falls back to same API surface as before.
	if os.Getenv("DISPATCH_SCORE_MODE") == "nearest" {
		return pickBestRiderNearest(riders, lat, lng)
	}
	return pickBestRiderScored(riders, lat, lng)
}

// pickBestRiderNearest — legacy Strategy A (distance + load tie-break).
func pickBestRiderNearest(riders []riderRow, lat, lng float64) string {
	if len(riders) == 0 {
		return ""
	}
	sort.Slice(riders, func(i, j int) bool {
		ri, rj := riders[i], riders[j]
		di := 999.0
		dj := 999.0
		if ri.Lat != nil && ri.Lng != nil {
			di = haversineKm(lat, lng, *ri.Lat, *ri.Lng)
		}
		if rj.Lat != nil && rj.Lng != nil {
			dj = haversineKm(lat, lng, *rj.Lat, *rj.Lng)
		}
		if di != dj {
			return di < dj
		}
		return ri.LoadCount < rj.LoadCount
	})
	return riders[0].ID
}
