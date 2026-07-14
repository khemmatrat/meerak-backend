package main

import (
	"fmt"
	"html"
	"net/http"
)

// renderLabelHTML returns printable A6 shipping label HTML (AQOND standard).
func renderLabelHTML(d labelData) string {
	carrierHeader := ""
	if d.ShowCarrierHeader && d.CarrierName != "" {
		carrierHeader = fmt.Sprintf(`<div class="carrier">%s</div>`, html.EscapeString(d.CarrierName))
	}
	serviceBadge := html.EscapeString(d.ServiceType)
	if serviceBadge == "" {
		serviceBadge = "NDD"
	}
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8"><title>AQOND Label %s</title>
<style>
@page { size: 105mm 148mm; margin: 4mm; }
body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; }
.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 4px; }
.logo { font-weight: bold; font-size: 14px; color: #fe2c55; }
.carrier { font-weight: bold; font-size: 12px; }
.badge { border: 1px solid #000; padding: 2px 6px; font-weight: bold; }
.barcode { text-align: center; font-size: 16px; letter-spacing: 2px; margin: 8px 0; font-family: monospace; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.box { border: 1px solid #ccc; padding: 6px; min-height: 60px; }
.label { font-size: 9px; color: #666; }
.footer { margin-top: 8px; border-top: 1px dashed #999; padding-top: 6px; font-size: 9px; }
</style></head><body>
<div class="header">
  <div class="logo">AQOND</div>
  %s
  <div class="badge">%s</div>
</div>
<div class="barcode">|||| %s ||||</div>
<div class="grid">
  <div class="box"><div class="label">จาก / FROM</div>%s</div>
  <div class="box"><div class="label">ถึง / TO</div>%s</div>
</div>
<div class="footer">
  Order: %s | Qty: %d | %s<br>
  น้ำหนัก: %dg | ขนาด: %s cm<br>
  %s
</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`,
		html.EscapeString(d.TrackingNo),
		carrierHeader,
		serviceBadge,
		html.EscapeString(d.TrackingNo),
		html.EscapeString(d.SenderText),
		html.EscapeString(d.RecipientText),
		html.EscapeString(d.OrderID),
		d.Qty,
		html.EscapeString(d.ProductName),
		d.WeightGrams,
		html.EscapeString(d.DimensionsText),
		html.EscapeString(d.PaymentType),
	)
}

type labelData struct {
	TrackingNo         string
	CarrierName        string
	ServiceType        string
	ShowCarrierHeader  bool
	SenderText         string
	RecipientText      string
	OrderID            string
	ProductName        string
	Qty                int
	WeightGrams        int
	DimensionsText     string
	PaymentType        string
}

func (a *app) labelHTML(w http.ResponseWriter, r *http.Request) {
	// GET /v1/shipping/label/{shipment_id}/html
	id := stringsTrimPrefixPath(r.URL.Path, "/v1/shipping/label/")
	id = stringsTrimSuffix(id, "/html")
	if id == "" {
		http.Error(w, "shipment_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var tracking, orderID, carrier string
	var weight int
	var recipient, sender []byte
	err := a.pool.QueryRow(ctx, `
		SELECT tracking_no, order_id, carrier_id, weight_grams, recipient_snapshot, sender_snapshot
		FROM commerce.shipments WHERE id=$1`, id).
		Scan(&tracking, &orderID, &carrier, &weight, &recipient, &sender)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	recipientText := "ผู้รับ"
	senderText := "ผู้ส่ง AQOND Merchant"
	if len(recipient) > 2 {
		recipientText = string(recipient)
	}
	if len(sender) > 2 {
		senderText = string(sender)
	}
	htmlOut := renderLabelHTML(labelData{
		TrackingNo:        tracking,
		CarrierName:       carrier,
		ServiceType:       "NDD",
		ShowCarrierHeader: true,
		SenderText:        senderText,
		RecipientText:     recipientText,
		OrderID:           orderID,
		ProductName:       "สินค้า AQOND",
		Qty:               1,
		WeightGrams:       weight,
		DimensionsText:    "—",
		PaymentType:       "COD",
	})
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(htmlOut))
}

func stringsTrimPrefixPath(p, prefix string) string {
	if len(p) >= len(prefix) && p[:len(prefix)] == prefix {
		return p[len(prefix):]
	}
	return p
}

func stringsTrimSuffix(s, suffix string) string {
	if len(s) >= len(suffix) && s[len(s)-len(suffix):] == suffix {
		return s[:len(s)-len(suffix)]
	}
	return s
}
