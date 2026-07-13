# AQOND Rider OS — Sprint P1 + Timeline Engines

## Rider OS Shell (`/m/rider/*`)
- **Home** `/m/rider/home` — Dashboard: Online/Offline, GPS, earnings, trips, acceptance/cancel rate
- **Jobs** `/m/rider/jobs` — open jobs + radar map
- **Map** `/m/rider/map` — full map + accept from pin
- **Wallet** `/m/rider/wallet` — earnings, bonus, withdraw (AQOND Pay hook)
- **Profile** `/m/rider/profile` + **Settings** `/m/rider/settings`
- **Active job** `/m/rider/active/[jobId]` — navigation map, GPS telemetry, chat, phases

Entry: Account hub **รับงานส่งของ** → `/m/rider/home`

## APIs
- `POST /api/rider/status` — online/offline
- `POST /api/rider/telemetry` — GPS, speed, battery, current job
- `GET /api/rider/dashboard` — today stats
- `GET /api/orders/[orderId]/timeline` — unified timeline
- `GET /api/admin/food/orders/[orderId]/timeline` — Food Timeline Engine (admin)
- `GET /api/admin/food/dispatch` — Dispatch pipeline

## Event Bus extensions
Dispatch timeline events: `dispatch.search_started`, `dispatch.rider_offered`, `dispatch.rider_rejected`, `dispatch.rider_timeout`, `dispatch.rider_accepted`

## Admin
- Orders tab: click order → Food Timeline + Dispatch Timeline
- Dashboard: Dispatch Pipeline counts
- Riders tab: jobs + event stream

## Next (P3–P6)
- Live Map heatmap (admin)
- AQOND Pay settlement dashboard
- CRM / Analytics / AI Director
