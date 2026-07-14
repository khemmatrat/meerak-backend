# P111-P140 i18n / cross-border / compliance / localized-ops smoke test (Epoch 8)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"
$Kong = "8000"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

function J($obj) { $obj | ConvertTo-Json -Depth 6 }
function Url($p) { "http://127.0.0.1:${Kong}$p" }
$ts = Get-Date -Format "HHmmss"
$buyer = "buyer-$ts"
$seller = "seller-$ts"
$prod = "prod-$ts"

# ---------------- Pillar A: i18n / tax / invoicing ----------------
Write-Host "=== P111 locale resolve ==="
$loc = Invoke-RestMethod -Uri (Url "/api/v1/locale/v1/locale/resolve?region=TH&locale=th-TH") -TimeoutSec 30
Write-Host "OK locale=$($loc.locale) currency=$($loc.currency)"

Write-Host "`n=== P112 message catalog upsert + read ==="
Invoke-RestMethod -Uri (Url "/api/v1/messages/v1/messages") -Method POST -ContentType "application/json" `
  -Body (J @{ locale="th-TH"; messages=@{ "cart.checkout"="ชำระเงิน"; "cart.total"="รวม" } }) | Out-Null
$msgs = Invoke-RestMethod -Uri (Url "/api/v1/messages/v1/messages?locale=th-TH") -TimeoutSec 30
Write-Host "OK messages cart.checkout=$($msgs.messages.'cart.checkout')"

Write-Host "`n=== P113 product i18n upsert + read ==="
Invoke-RestMethod -Uri (Url "/api/v1/product-i18n/v1/product-i18n") -Method POST -ContentType "application/json" `
  -Body (J @{ product_id=$prod; locale="en-US"; title="Silk Scarf"; description="Hand-woven"; source="human" }) | Out-Null
$pi = Invoke-RestMethod -Uri (Url "/api/v1/product-i18n/v1/product-i18n?product_id=$prod&locale=en-US") -TimeoutSec 30
Write-Host "OK product_i18n title=$($pi.title)"

Write-Host "`n=== P115 tax quote (TH VAT inclusive) ==="
$tax = Invoke-RestMethod -Uri (Url "/api/v1/tax/v1/tax/quote") -Method POST -ContentType "application/json" `
  -Body (J @{ market="TH"; amount_micro=107000000; currency="THB" })
Write-Host "OK net=$($tax.net_micro) tax=$($tax.tax_micro) gross=$($tax.gross_micro)"

Write-Host "`n=== P116 invoice create ==="
$inv = Invoke-RestMethod -Uri (Url "/api/v1/invoice/v1/invoice") -Method POST -ContentType "application/json" `
  -Body (J @{ order_id="o-$ts"; merchant_id=$seller; market="TH"; locale="th-TH"; currency="THB"; subtotal_micro=100000000; tax_micro=7000000 })
Write-Host "OK invoice_no=$($inv.invoice_no) total=$($inv.total_micro)"

# ---------------- Pillar B: cross-border / logistics / address ----------------
Write-Host "`n=== P119 customs HS register ==="
Invoke-RestMethod -Uri (Url "/api/v1/customs/v1/customs") -Method POST -ContentType "application/json" `
  -Body (J @{ product_id=$prod; hs_code="6214.10"; origin_country="TH"; declared_value_micro=100000000; restricted_destinations=@("EU") }) | Out-Null
Write-Host "OK customs registered"

Write-Host "`n=== P120 shipping quote (cross-border TH->US) ==="
$sq = Invoke-RestMethod -Uri (Url "/api/v1/shipping/v1/shipping/quote") -Method POST -ContentType "application/json" `
  -Body (J @{ from_region="TH"; to_region="US"; weight_grams=800 })
Write-Host "OK carriers=$($sq.rates.Count) cross_border=$($sq.cross_border)"

Write-Host "`n=== P118 landed cost (TH->US) ==="
$lc = Invoke-RestMethod -Uri (Url "/api/v1/shipping/v1/shipping/landed-cost") -Method POST -ContentType "application/json" `
  -Body (J @{ product_id=$prod; from_region="TH"; to_region="US"; item_micro=100000000; weight_grams=800; currency="USD" })
Write-Host "OK allowed=$($lc.allowed) landed=$($lc.landed_total_micro) duty=$($lc.duty_micro) tax=$($lc.tax_micro)"

Write-Host "`n=== P119 restricted destination blocked (TH->EU) ==="
$blk = Invoke-RestMethod -Uri (Url "/api/v1/shipping/v1/shipping/landed-cost") -Method POST -ContentType "application/json" `
  -Body (J @{ product_id=$prod; from_region="TH"; to_region="EU"; item_micro=100000000; weight_grams=800 }) -SkipHttpErrorCheck
Write-Host "OK blocked allowed=$($blk.allowed) reason=$($blk.reason)"

Write-Host "`n=== P120 label + track ==="
$lbl = Invoke-RestMethod -Uri (Url "/api/v1/shipping/v1/shipping/label") -Method POST -ContentType "application/json" `
  -Body (J @{ order_id="o-$ts"; merchant_id=$seller; carrier_id="thaipost"; from_region="TH"; to_region="SEA"; weight_grams=800; item_micro=100000000; product_id=$prod; currency="THB" })
Invoke-RestMethod -Uri (Url "/api/v1/shipping/v1/shipping/track") -Method POST -ContentType "application/json" `
  -Body (J @{ tracking_no=$lbl.tracking_no; status="in_transit" }) | Out-Null
$trk = Invoke-RestMethod -Uri (Url "/api/v1/shipping/v1/shipping/track?tracking_no=$($lbl.tracking_no)") -TimeoutSec 30
Write-Host "OK tracking=$($lbl.tracking_no) status=$($trk.status)"

Write-Host "`n=== P121 address validate (good + bad) ==="
$ok = Invoke-RestMethod -Uri (Url "/api/v1/address/v1/address/validate") -Method POST -ContentType "application/json" `
  -Body (J @{ country="US"; recipient="Jane"; line1="1 Main St"; city="NYC"; state="NY"; postal_code="10001" })
$bad = Invoke-RestMethod -Uri (Url "/api/v1/address/v1/address/validate") -Method POST -ContentType "application/json" `
  -Body (J @{ country="US"; recipient="Jane"; line1="1 Main St"; city="NYC"; postal_code="ABCDE" }) -SkipHttpErrorCheck
Write-Host "OK valid_us=$($ok.valid) invalid_us=$($bad.valid)"

Write-Host "`n=== P121 address store ==="
$addr = Invoke-RestMethod -Uri (Url "/api/v1/address/v1/address") -Method POST -ContentType "application/json" `
  -Body (J @{ owner_id=$buyer; country="TH"; region="TH"; recipient="สมชาย"; line1="1 ถนนสุขุมวิท"; city="กรุงเทพ"; postal_code="10110"; phone="0812345678"; is_default=$true })
Write-Host "OK address_id=$($addr.address_id)"

# ---------------- Pillar C: compliance / privacy / fincrime ----------------
Write-Host "`n=== P122 residency check (cross-border transfer EU denied) ==="
$res = Invoke-RestMethod -Uri (Url "/api/v1/residency/v1/residency/check") -Method POST -ContentType "application/json" `
  -Body (J @{ region="EU"; operation="transfer" })
Write-Host "OK store_in=$($res.store_in) allowed=$($res.allowed) reason=$($res.reason)"

Write-Host "`n=== P123 DSR export ==="
$dsr = Invoke-RestMethod -Uri (Url "/api/v1/dsr/v1/dsr") -Method POST -ContentType "application/json" `
  -Body (J @{ subject_id=$buyer; region="TH"; kind="export" })
Invoke-RestMethod -Uri (Url "/api/v1/dsr/v1/dsr/advance") -Method POST -ContentType "application/json" `
  -Body (J @{ id=$dsr.dsr_id; status="completed"; result_uri="/exports/$($dsr.dsr_id).zip" }) | Out-Null
Write-Host "OK dsr=$($dsr.dsr_id)"

Write-Host "`n=== P124 consent grant + read ==="
Invoke-RestMethod -Uri (Url "/api/v1/consent/v1/consent") -Method POST -ContentType "application/json" `
  -Body (J @{ subject_id=$buyer; purpose="marketing"; granted=$true }) | Out-Null
$cons = Invoke-RestMethod -Uri (Url "/api/v1/consent/v1/consent?subject_id=$buyer") -TimeoutSec 30
Write-Host "OK marketing granted=$($cons.consents.marketing.granted)"

Write-Host "`n=== P125 KYC submit (clean) ==="
$kyc = Invoke-RestMethod -Uri (Url "/api/v1/kyc/v1/kyc") -Method POST -ContentType "application/json" `
  -Body (J @{ subject_id=$seller; subject_type="business"; region="TH"; doc_type="passport"; name="Acme Co" })
Write-Host "OK kyc status=$($kyc.status) aml=$($kyc.aml_decision)"

Write-Host "`n=== P126 AML screen (sanctioned -> block) ==="
$aml = Invoke-RestMethod -Uri (Url "/api/v1/aml/v1/aml/screen") -Method POST -ContentType "application/json" `
  -Body (J @{ subject_id="x-$ts"; name="A Sanctioned Person"; list_type="sanctions" })
Write-Host "OK aml matched=$($aml.matched) decision=$($aml.decision)"

Write-Host "`n=== P127 age gate (minor) ==="
$age = Invoke-RestMethod -Uri (Url "/api/v1/age/v1/age") -Method POST -ContentType "application/json" `
  -Body (J @{ subject_id=$buyer; birth_year=2015; method="self_declared" })
Write-Host "OK age_band=$($age.age_band)"

Write-Host "`n=== P128 parental link ==="
$par = Invoke-RestMethod -Uri (Url "/api/v1/parental/v1/parental/link") -Method POST -ContentType "application/json" `
  -Body (J @{ guardian_id="g-$ts"; minor_id=$buyer; spend_cap_micro=50000000; approved=$true })
Write-Host "OK parental approved=$($par.approved)"

Write-Host "`n=== P131 returns/RMA within window ==="
$ret = Invoke-RestMethod -Uri (Url "/api/v1/returns/v1/returns") -Method POST -ContentType "application/json" `
  -Body (J @{ order_id="o-$ts"; buyer_id=$buyer; merchant_id=$seller; region="TH"; reason="defective"; amount_micro=100000000; days_since_delivery=3 })
Invoke-RestMethod -Uri (Url "/api/v1/returns/v1/returns/decide") -Method POST -ContentType "application/json" `
  -Body (J @{ id=$ret.return_id; status="approved" }) | Out-Null
Write-Host "OK return=$($ret.return_id) within_window=$($ret.within_window)"

Write-Host "`n=== P138 retention policies ==="
$rp = Invoke-RestMethod -Uri (Url "/api/v1/retention/v1/retention") -TimeoutSec 30
Write-Host "OK retention policies=$($rp.policies.Count)"

Write-Host "`n=== P136 treasury positions ==="
$tp = Invoke-RestMethod -Uri (Url "/api/v1/treasury/v1/treasury/positions") -TimeoutSec 30
Write-Host "OK base=$($tp.base_currency) positions=$($tp.positions.Count)"

# ---------------- Pillar C/D: policy / legal / routing / notifications ----------------
Write-Host "`n=== P129 feature flags (region TH) + eval ==="
$flags = Invoke-RestMethod -Uri (Url "/api/v1/flags/v1/flags?region=TH") -TimeoutSec 30
$fe = Invoke-RestMethod -Uri (Url "/api/v1/flags/v1/flags/eval?key=live_shopping&region=TH&subject_id=$buyer") -TimeoutSec 30
Write-Host "OK live_shopping on=$($fe.on)"

Write-Host "`n=== P130 legal doc + acceptance ==="
$legal = Invoke-RestMethod -Uri (Url "/api/v1/legal/v1/legal?doc_type=tos&region=TH&locale=th-TH") -TimeoutSec 30
Invoke-RestMethod -Uri (Url "/api/v1/legal/v1/legal/accept") -Method POST -ContentType "application/json" `
  -Body (J @{ subject_id=$buyer; doc_id=$legal.id; doc_type="tos"; version=$legal.version; ip="1.2.3.4" }) | Out-Null
Write-Host "OK accepted tos version=$($legal.version)"

Write-Host "`n=== P132 payment-method routing (TH) ==="
$pm = Invoke-RestMethod -Uri (Url "/api/v1/payment-methods/v1/payment-methods?region=TH&amount_micro=100000000") -TimeoutSec 30
Write-Host "OK methods=$(($pm.methods | ForEach-Object { $_.method }) -join ',')"

Write-Host "`n=== P139 compliance report ==="
$rep = Invoke-RestMethod -Uri (Url "/api/v1/reports/v1/reports") -Method POST -ContentType "application/json" `
  -Body (J @{ report_type="tax_remittance"; region="TH"; period="2026-Q2"; metrics=@{ vat_collected_micro=7000000 } })
Write-Host "OK report=$($rep.report_id) status=$($rep.status)"

Write-Host "`n=== P135 localized notification (transactional, sent) ==="
$note = Invoke-RestMethod -Uri (Url "/api/v1/notify/v1/notify") -Method POST -ContentType "application/json" `
  -Body (J @{ recipient_id=$buyer; region="TH"; locale="th-TH"; channel="push"; template_key="order_shipped"; consent_purpose="transactional"; payload=@{ orderId="o-$ts"; tracking=$lbl.tracking_no } })
Write-Host "OK notification=$($note.notification_id) status=$($note.status) rendered='$($note.rendered)'"

Write-Host "`n=== P134 dispatch scheduled notifications ==="
$disp = Invoke-RestMethod -Uri (Url "/api/v1/notify/v1/notify/dispatch") -Method POST -ContentType "application/json" -Body "{}"
Write-Host "OK dispatched=$($disp.dispatched)"

Write-Host "`n=== Epoch 8 (P111-P140) smoke test complete ==="
