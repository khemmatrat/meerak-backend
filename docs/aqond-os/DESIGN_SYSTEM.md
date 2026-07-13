# AQOND Design System (AXS)

Canonical index for Theme V2. Full docs: design-system/ (17 files).

## Package

aqond-v2/packages/ui — @aqond/ui (Button, Card, Input, Badge, BottomSheet, Dialog, StatusChip, Timeline, EmptyState, Skeleton, BottomNav, ThemeProvider)

Playground: aqond-v2/apps/storefront/app/design-system/page.tsx

## Layer Model

Layer 1 Business Logic — frozen during theme sprints
Layer 2 Application Logic — hooks/context frozen
Layer 3 Presentation — AXS migration target

Shadow migration: wrap logic in theme shells; do not rewrite handlers.

## Vertical Migration Status

| Product | Route | Sprint | Status |
|---------|-------|--------|--------|
| Marketplace | /m/home, /m/account | 27 | Done |
| Food | /m/food | 23 | Done |
| Rider | /m/rider | 24 | Done |
| Merchant | /m/merchant | 25 | Done |
| Admin break-glass | /m/admin | 26 | Done |
| Services | /m/services | 28 | Planned |

See SERVICES_UI_MIGRATION_PLAN.md

## Future: Component Registry (Sprint 29+)

Unified Aqond* components over @aqond/ui
