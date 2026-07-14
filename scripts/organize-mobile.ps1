# สร้างโฟลเดอร์ mobile และย้าย frontend (mobile app) ทั้งหมดเข้าไป
# Run: .\scripts\organize-mobile.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot
Set-Location $root

Write-Host "Creating mobile/ folder..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path "mobile" -Force | Out-Null

# ไฟล์ที่ย้าย
$files = @(
    "App.tsx", "index.html", "index.tsx", "index.css", "globals.css",
    "themes.css", "themes-vip-exclusive.css", "training-themes.css",
    "job-detail-clean-pro.css", "platinum-strawberry-override.css",
    "vite.config.ts", "vite-env.d.ts", "tsconfig.json", "tailwind.config.js",
    "firebaseConfig.ts", "firebase.json", "types.ts", "seed-data.ts", "render.yaml"
)

# โฟลเดอร์ที่ย้าย
$folders = @("components", "context", "hooks", "lib", "pages", "public", "services", "types", "utils")

foreach ($f in $files) {
    if (Test-Path $f) {
        Move-Item -Path $f -Destination "mobile\" -Force
        Write-Host "  Moved: $f" -ForegroundColor Green
    }
}

foreach ($d in $folders) {
    if (Test-Path $d) {
        Move-Item -Path $d -Destination "mobile\" -Force
        Write-Host "  Moved folder: $d" -ForegroundColor Green
    }
}

# คัดลอก package.json สำหรับ mobile
Copy-Item -Path "scripts\mobile-package.json" -Destination "mobile\package.json" -Force
Write-Host "  Created mobile/package.json" -ForegroundColor Green

Write-Host "`nDone! Next steps:" -ForegroundColor Yellow
Write-Host "  cd mobile"
Write-Host "  npm install"
Write-Host "  npm run dev"
Write-Host "`nUpdate root package.json: mobile -> npm run dev --prefix mobile" -ForegroundColor Cyan
Write-Host "Update docker-compose: working_dir -> /app/mobile" -ForegroundColor Cyan
