# Talent OS — SSOT Link Registry

**Program:** R5 B-6 · H7 governance  
**Rule:** Talent **links** to owners; never owns domain workflows.

---

## Wallet

| Talent surface | Href | SSOT owner |
|----------------|------|------------|
| Today wallet card | `/m/account/wallet` | Account wallet |
| Commerce wallet section | `/m/account/wallet` | Account wallet |
| Read adapter | `bffGet /v1/wallet` | wallet-svc via BFF |

---

## Services — Match

| Surface | Href | Owner |
|---------|------|-------|
| Today Match cards | `/m/services/match/:id` | Services match |
| Match list | `/m/services/match/mine` | Services match |
| Chat compose (match job) | `/m/services/match/:id` | Services match (no `#chat`) |

---

## Services — Board

| Surface | Href | Owner |
|---------|------|-------|
| Board applications | `/m/services/board/:jobId` | Services board |
| Board list | `/m/services/board` | Services board |

---

## Services — Booking

| Surface | Href | Owner |
|---------|------|-------|
| My bookings | `/m/services/booking/mine` | Services booking |
| Incoming bookings | `/m/services/booking/incoming` | Services booking |
| Calendar compose links (H3) | `/m/services/booking/mine` | Services booking (calendar tab placeholder) |

---

## Notifications

| Surface | Href | Owner |
|---------|------|-------|
| Notification Center | `/m/talent/notifications` | Talent inbox (read-only compose) |
| Read transport | `/api/talent/read/notifications/latest` | Legacy notification service (proxied) |
| Push settings | `/m/account` (notify client) | Account |

---

## Reviews / Trust

| Surface | Href | Owner |
|---------|------|-------|
| Trust tab (placeholder) | `/m/talent/trust` | Talent placeholder |
| Reviews read | `/api/talent/read/reviews/worker/:id` | Legacy reviews (proxied) |

---

## Chat

| Surface | Href | Owner |
|---------|------|-------|
| Unified Chat index | `/m/talent/chat` | Talent index only |
| Match messaging | `/m/services/match/:id` | Services |
| Shop merchant thread | `/m/chat/:shopId` | Marketplace chat |
| Support | `/m/account/support` (or configured) | Account |

**Rule:** No chat merge — deep link only (TOS-8).

---

## Platform entry (H6)

| Surface | Href |
|---------|------|
| Services hub tile | `/m/talent` |
| Account menu | `/m/talent` |
| Onboarding intent | `/m/talent` |

SSOT config: `lib/talent/talentDiscoverability.ts`

---

## Code locations

| Registry file | Path |
|---------------|------|
| Today links | `lib/talent/talentTodayLinks.ts` |
| Chat links | `lib/talent/talentChatLinks.ts` |
| Commerce links | `lib/talent/commerce/talentCommerceLinks.ts` |
| Discoverability | `lib/talent/talentDiscoverability.ts` |

---

## Change control

Any new Talent-generated href must:

1. Point to an existing SSOT route
2. Be added to this registry
3. Pass H3 deep-link audit (no dead anchors)
