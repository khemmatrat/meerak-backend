# P81-P110 Payments / Search / Recsys-Ads / Trust & Safety smoke test (Epoch 7)
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
$ts = Get-Date -Format "HHmmss"
$merchant = "m-$ts"
$buyer = "buyer-$ts"
$creator = "creator-$ts"

# ---------------- Pillar A: Payments ----------------
Write-Host "=== P81 payment-svc health ==="
$ph = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/payment/v1/intents/get?id=none" -TimeoutSec 30 -SkipHttpErrorCheck
$h = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/payment/health" -TimeoutSec 30
if (-not $h.ok) { throw "payment-svc unhealthy" }
Write-Host "OK payment-svc"

Write-Host "`n=== P81/P89 create intent (card) + fraud score ==="
$intent = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/payment/v1/intents" -Method POST -ContentType "application/json" `
  -Body (J @{ merchant_id=$merchant; buyer_id=$buyer; method="card"; amount_micro=250000000; currency="THB"; idempotency_key="$ts-i1"; device="dev1"; ip="1.2.3.4" })
Write-Host "OK intent=$($intent.intent.id) fraud=$($intent.fraud_decision) risk=$($intent.intent.risk_score)"

Write-Host "`n=== P83 authorize + P81 capture ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/payment/v1/intents/authorize" -Method POST -ContentType "application/json" `
  -Body (J @{ intent_id=$intent.intent.id }) | Out-Null
$cap = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/payment/v1/intents/capture" -Method POST -ContentType "application/json" `
  -Body (J @{ intent_id=$intent.intent.id; amount_micro=250000000 })
Write-Host "OK captured status=$($cap.intent.status)"

Write-Host "`n=== P85 partial refund ==="
$ref = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/payment/v1/refund" -Method POST -ContentType "application/json" `
  -Body (J @{ intent_id=$intent.intent.id; amount_micro=50000000; reason="smoke"; idempotency_key="$ts-r1" })
Write-Host "OK refund=$($ref.refund_id) status=$($ref.intent.status)"

Write-Host "`n=== P88 FX snapshot ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/payment/v1/fx/rate" -Method POST -ContentType "application/json" `
  -Body (J @{ base_currency="USD"; quote_currency="THB"; rate=36.5 }) | Out-Null
$fx = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/payment/v1/fx/rate?base=USD&quote=THB" -TimeoutSec 30
Write-Host "OK USD->THB=$($fx.rate)"

Write-Host "`n=== P86 payout (held until KYC) ==="
$po = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/payment/v1/payouts" -Method POST -ContentType "application/json" `
  -Body (J @{ merchant_id=$merchant; amount_micro=200000000; idempotency_key="$ts-p1"; kyc_verified=$false })
Write-Host "OK payout=$($po.payout_id) status=$($po.status) hold=$($po.hold_reason)"

Write-Host "`n=== P87 settlement reconcile ==="
$set = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/payment/v1/settlements/ingest" -Method POST -ContentType "application/json" `
  -Body (J @{ provider="stub"; currency="THB"; lines=@(@{ intent_id=$intent.intent.id; amount_micro=250000000; fee_micro=7500000 }) })
Write-Host "OK settlement matched=$($set.matched) exceptions=$($set.exceptions)"

Write-Host "`n=== P82/P84 checkout saga (COD) ==="
$co = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/checkout/v1/checkout" -Method POST -ContentType "application/json" `
  -Body (J @{ merchant_id=$merchant; buyer_id=$buyer; method="cod"; currency="THB"; idempotency_key="$ts-co1";
    items=@(@{ variant_id="v1"; product_id="p1"; qty=2; unit_price_micro=100000000 }) })
Write-Host "OK checkout status=$($co.status) order=$($co.order_id) total=$($co.total_micro)"

# ---------------- Pillar B: Search ----------------
Write-Host "`n=== P91/P92 search reindex ==="
$ri = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/search/v1/index/reindex" -Method POST -TimeoutSec 60
Write-Host "OK reindexed=$($ri.reindexed)"

Write-Host "`n=== P92 push upsert a product doc ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/search/v1/index/upsert" -Method POST -ContentType "application/json" `
  -Body (J @{ entity_type="product"; entity_id="smoke-$ts"; title="Smoke Test Widget"; body="great widget for testing";
    category="gadgets"; price_micro=99000000; rating=4.5; sold_count=120; ship_from_region="TH"; cod_available=$true; popularity=50 }) | Out-Null
Write-Host "OK upserted"

Write-Host "`n=== P93/P94 search products w/ filters + sort ==="
$sr = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/search/v1/search?q=widget&tab=product&sort=best_selling&cod=1" -TimeoutSec 30
Write-Host "OK hits=$($sr.count) latency=$($sr.latency_ms)ms"

Write-Host "`n=== P95 autocomplete ==="
$sg = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/search/v1/suggest?q=smo" -TimeoutSec 30
Write-Host "OK suggestions=$($sg.suggestions.Count)"

Write-Host "`n=== P98 search analytics ==="
$an = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/search/v1/analytics" -TimeoutSec 30
Write-Host "OK total=$($an.total_queries) zero_rate=$($an.zero_result_rate)"

# ---------------- Pillar C: Recsys / Ads ----------------
Write-Host "`n=== P99 feature store put/get ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/recsys/v1/features" -Method POST -ContentType "application/json" `
  -Body (J @{ entity="user"; id=$buyer; features=@{ purchase_signals=3; like=10 }; ttl_sec=3600 }) | Out-Null
$ft = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/recsys/v1/features?entity=user&id=$buyer" -TimeoutSec 30
Write-Host "OK features freshness=$($ft.freshness_sec)s"

Write-Host "`n=== P100 embedding upsert + retrieval ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/recsys/v1/embeddings/upsert" -Method POST -ContentType "application/json" `
  -Body (J @{ item_id="vid-$ts"; item_type="video"; vector=@(0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8) }) | Out-Null
$rt = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/recsys/v1/retrieval?user_id=$buyer&k=10" -TimeoutSec 30
Write-Host "OK retrieval candidates=$($rt.count)"

Write-Host "`n=== P101 learned ranker (heuristic fallback) ==="
$rk = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/recsys/v1/rank" -Method POST -ContentType "application/json" `
  -Body (J @{ user_id=$buyer; candidates=@(@{ item_id="a"; base_score=1.0 }, @{ item_id="b"; base_score=0.5 }) })
Write-Host "OK ranked model=$($rk.model_version) learned=$($rk.learned)"

Write-Host "`n=== P103 ad campaign + auction ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/recsys/v1/ads/campaigns" -Method POST -ContentType "application/json" `
  -Body (J @{ merchant_id=$merchant; name="smoke camp"; bid_micro=500000; daily_budget_micro=100000000; product_id="p1"; headline="Buy!"; est_ctr=0.05 }) | Out-Null
$auc = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/recsys/v1/ads/auction" -Method POST -ContentType "application/json" `
  -Body (J @{ user_id=$buyer; slots=2 })
Write-Host "OK auction winners=$($auc.winners.Count)"

Write-Host "`n=== P104 affiliate link + match ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/recsys/v1/affiliate/links" -Method POST -ContentType "application/json" `
  -Body (J @{ creator_id=$creator; product_id="p1"; merchant_id=$merchant; commission_bps=800 }) | Out-Null
$am = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/recsys/v1/affiliate/match?creator_id=$creator" -TimeoutSec 30
Write-Host "OK affiliate matches=$($am.matches.Count)"

# ---------------- Pillar D: Trust & Safety ----------------
Write-Host "`n=== P105 moderation (clean) ==="
$mod1 = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/trust/v1/moderate" -Method POST -ContentType "application/json" `
  -Body (J @{ surface="post"; entity_id="post-clean-$ts"; text="lovely sunset video" })
Write-Host "OK clean decision=$($mod1.decision) severity=$($mod1.severity)"

Write-Host "`n=== P105 moderation (scam -> reject/queue) ==="
$mod2 = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/trust/v1/moderate" -Method POST -ContentType "application/json" `
  -Body (J @{ surface="post"; entity_id="post-bad-$ts"; text="guaranteed profit send your password free money" })
Write-Host "OK scam decision=$($mod2.decision) severity=$($mod2.severity) score=$($mod2.score)"

Write-Host "`n=== P106 copyright register + check ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/trust/v1/copyright/assets" -Method POST -ContentType "application/json" `
  -Body (J @{ kind="audio"; content="famous-song-waveform"; rights_holder="Label X"; policy="block" }) | Out-Null
$cc = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/trust/v1/copyright/check" -Method POST -ContentType "application/json" `
  -Body (J @{ media_id="media-$ts"; kind="audio"; content="famous-song-waveform" })
Write-Host "OK copyright match=$($cc.match) policy=$($cc.policy)"

Write-Host "`n=== P107 account integrity signal ==="
$ai = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/trust/v1/integrity/signal" -Method POST -ContentType "application/json" `
  -Body (J @{ account_id="acct-$ts"; signal="bot_velocity"; score=70; device_fingerprint="dfp1"; ip="9.9.9.9" })
Write-Host "OK integrity decision=$($ai.decision)"

Write-Host "`n=== P108 review (verified-purchase aware) ==="
$rv = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/reviews/v1/reviews" -Method POST -ContentType "application/json" `
  -Body (J @{ product_id="p1"; merchant_id=$merchant; author_id=$buyer; rating=5; title="great"; body="works perfectly for me" })
Write-Host "OK review=$($rv.review_id) verified=$($rv.verified_purchase) spam=$($rv.spam_score)"
$rs = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/reviews/v1/reviews/summary?product_id=p1" -TimeoutSec 30
Write-Host "OK review summary count=$($rs.count) avg=$($rs.avg_rating)"

Write-Host "`n=== P109 report -> enforce -> appeal ==="
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/trust/v1/reports" -Method POST -ContentType "application/json" `
  -Body (J @{ reporter_id=$buyer; surface="post"; entity_id="post-bad-$ts"; reason="scam" }) | Out-Null
$enf = Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/trust/v1/enforce" -Method POST -ContentType "application/json" `
  -Body (J @{ target_type="content"; target_id="post-bad-$ts"; action="takedown"; reason="scam"; case_id=$mod2.case_id })
Invoke-RestMethod -Uri "http://127.0.0.1:${Kong}/api/v1/trust/v1/appeals" -Method POST -ContentType "application/json" `
  -Body (J @{ action_id=$enf.action_id; outcome="upheld" }) | Out-Null
Write-Host "OK enforcement=$($enf.action_id) action=$($enf.action)"

Write-Host "`n=== P110 T&S metrics ==="
$tm = Invoke-WebRequest -Uri "http://127.0.0.1:${Kong}/api/v1/trust/metrics" -TimeoutSec 30
Write-Host ($tm.Content -split "`n" | Where-Object { $_ -match "queue_depth|moderated_total|enforcement_total" }) -Separator "`n"

Write-Host "`nP81-P110 smoke test complete." -ForegroundColor Green
