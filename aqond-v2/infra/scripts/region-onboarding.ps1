# P117: onboard a new region/market in one command (dev-lite).
# Seeds locale, residency policy, tax rule, return policy, quiet hours and a
# default payment method so a new market is immediately functional.
#
# Usage:
#   ./region-onboarding.ps1 -Region SEA -Locale en-SG -Language en -Currency SGD `
#       -StoreIn ap-southeast-1 -TaxBps 900 -TaxKind gst -ReturnDays 15 `
#       -Timezone Asia/Singapore -PaymentMethod paynow -PaymentProvider stub-sg
param(
  [Parameter(Mandatory = $true)][string]$Region,
  [Parameter(Mandatory = $true)][string]$Locale,
  [string]$Language = "en",
  [string]$Currency = "USD",
  [string]$FallbackLocale = "th-TH",
  [string]$StoreIn = "ap-southeast-1",
  [int]$TaxBps = 0,
  [string]$TaxKind = "vat",
  [bool]$TaxInclusive = $true,
  [int]$ReturnDays = 14,
  [string]$Timezone = "Asia/Bangkok",
  [int]$QuietStart = 22,
  [int]$QuietEnd = 8,
  [string]$PaymentMethod = "card",
  [string]$PaymentProvider = "stub-card",
  [bool]$CrossBorderAllowed = $true
)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EnvFile = Join-Path $Root "infra\.env"

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}
$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "admin_boss" }
$Pass = $env:POSTGRES_PASSWORD
if (-not $Pass) { throw "Set POSTGRES_PASSWORD in infra/.env" }

$inc = if ($TaxInclusive) { "TRUE" } else { "FALSE" }
$xb = if ($CrossBorderAllowed) { "TRUE" } else { "FALSE" }
$taxId = "tax-$($Region.ToLower())-std"
$pmId = "pm-$($Region.ToLower())-$($PaymentMethod.ToLower())"

$sql = @"
INSERT INTO commerce.locales (locale, language, region, currency, fallback_locale)
VALUES ('$Locale','$Language','$Region','$Currency','$FallbackLocale')
ON CONFLICT (locale) DO UPDATE SET language=EXCLUDED.language, region=EXCLUDED.region,
  currency=EXCLUDED.currency, fallback_locale=EXCLUDED.fallback_locale, updated_at=NOW();

INSERT INTO commerce.residency_policies (region, store_in, pii_localized, cross_border_allowed)
VALUES ('$Region','$StoreIn',TRUE,$xb)
ON CONFLICT (region) DO UPDATE SET store_in=EXCLUDED.store_in, cross_border_allowed=EXCLUDED.cross_border_allowed;

INSERT INTO commerce.tax_rules (id, market, tax_category, rate_bps, kind, inclusive)
VALUES ('$taxId','$Region','standard',$TaxBps,'$TaxKind',$inc)
ON CONFLICT (market, tax_category) DO UPDATE SET rate_bps=EXCLUDED.rate_bps, kind=EXCLUDED.kind, inclusive=EXCLUDED.inclusive;

INSERT INTO commerce.return_policies (market, window_days)
VALUES ('$Region',$ReturnDays)
ON CONFLICT (market) DO UPDATE SET window_days=EXCLUDED.window_days;

INSERT INTO commerce.quiet_hours (region, timezone, start_hour, end_hour)
VALUES ('$Region','$Timezone',$QuietStart,$QuietEnd)
ON CONFLICT (region) DO UPDATE SET timezone=EXCLUDED.timezone, start_hour=EXCLUDED.start_hour, end_hour=EXCLUDED.end_hour;

INSERT INTO commerce.payment_method_availability (id, region, method, provider, currency, priority)
VALUES ('$pmId','$Region','$PaymentMethod','$PaymentProvider','$Currency',10)
ON CONFLICT (region, method, provider) DO UPDATE SET enabled=TRUE, currency=EXCLUDED.currency;
"@

Write-Host "=== Onboarding region '$Region' (locale=$Locale currency=$Currency) ==="
$sql | docker compose --env-file $EnvFile -f (Join-Path $Root "docker-compose.yml") `
  exec -T -e "PGPASSWORD=$Pass" aqond-db psql -U $User -d commerce -v ON_ERROR_STOP=1
Write-Host "Region '$Region' onboarded."
