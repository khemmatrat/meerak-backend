#Requires -Version 5.1
# Daily restart — product stack, no compile. ~2-5 minutes.
& (Join-Path $PSScriptRoot "dev-marketplace.ps1") -Quick @args
