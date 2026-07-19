# TOS-8 Implementation Report — Unified Chat Workspace

**Phase:** TOS-8 · **Date:** 2026-07-19 · **Status:** Complete

## Charter

Unified Chat Workspace = **presentation-only hub** at `/m/talent/chat`. Surfaces conversations composed from existing data and **deep-links** into product-specific chat SSOT routes. Does **not** merge chat services, websocket, backend, DB, or migrate messages.

Reference: [11-TALENT-OS-BLUEPRINT.md](./11-TALENT-OS-BLUEPRINT.md) · [TOS-7-REPORT.md](./TOS-7-REPORT.md)

## Route

| Path | Component |
|------|-----------|
| `/m/talent/chat` | `UnifiedChatWorkspace` |

## Components

| Component | Path | Role |
|-----------|------|------|
| `UnifiedChatWorkspace` | `components/talent/chat/UnifiedChatWorkspace.tsx` | Page shell, search, sections |
| `ChatSectionHub` | `components/talent/chat/ChatSectionHub.tsx` | Booking / Match / Merchant / Support lanes |
| `ChatConversationList` | `components/talent/chat/ChatConversationList.tsx` | Recent / Unread lists |
| `ChatConversationItem` | `components/talent/chat/ChatConversationItem.tsx` | Row + deep link |
| `ChatFilterBar` | `components/talent/chat/ChatFilterBar.tsx` | Lane + unread filters |
| `ChatEmpty` | `components/talent/chat/ChatEmpty.tsx` | Guest / empty states |
| `ChatSkeleton` | `components/talent/chat/ChatSkeleton.tsx` | Loading state |

## Chat SSOT deep links (not merged)

| Lane | Hub route | Thread / open |
|------|-----------|---------------|
| **Booking Chat** | `/m/services/booking/mine` | incoming tab |
| **Match Chat** | `/m/services/match/mine?tab=working` | `/m/services/match/:id#chat` |
| **Merchant Chat** | `/m/chats` | `/m/chat/:shopId` |
| **Support** | `/m/account/settings/help` | static help |

## Composed sources (read-only)

| Source | API / fetch | Maps to lane |
|--------|-------------|--------------|
| Match jobs | `fetchMyMatchJobs` + `filterMyMatchJobs` | match |
| Bookings | `fetchIncomingBookings` + `fetchMyBookingRequests` | booking |
| Shop threads | `GET /api/shop-chat/inbox` (existing) | merchant |
| Chat notifications | `fetchTalentNotifications` + category chat | match/booking/support |
| Support | static hub row | support |

## UI sections

| Section | Behaviour |
|---------|-----------|
| **Hub cards** | 4 lanes → SSOT routes |
| **Search** | Client filter on title/preview |
| **Filters** | All · Unread · Booking · Match · Merchant · Support |
| **Unread** | Rows with `unread` heuristic (pending booking + chat notifications) |
| **Recent Conversations** | Newest composed rows (max 12) |

## Data layer

| Artifact | Purpose |
|----------|---------|
| `loadTalentChatRaw` | Today wide fetch + shop inbox threads |
| `composeTalentChatConversations` | Unified rows + dedupe |
| `talentChatLinks.ts` | SSOT href helpers |
| `filterTalentChatConversations` | Search + lane filter |

## Scope compliance

| Rule | Result |
|------|--------|
| Presentation only | ✅ |
| Do not merge chat services | ✅ Deep links only |
| Reuse existing chat routes | ✅ |
| No websocket / backend / DB / migration | ✅ |
| Search + Unread + Recent | ✅ |

## Acceptance

| Check | Result |
|-------|--------|
| Compile | ✅ storefront webpack |
| No chat service merge | ✅ |
| Evidence doc | ✅ This file |

**STOP FOR REVIEW**
