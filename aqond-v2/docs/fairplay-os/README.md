# AQOND FairPlay OS — Next Project

This repository is prepared for **FairPlay OS** as a separate initiative.

## Do NOT implement here

- FairPlay OS
- Reward Engine
- Trust Score
- Card System
- Coin System
- Care Mission
- Priority Queue
- Insurance Integration
- Badge System

## Integration hooks (Food OS → FairPlay)

| Hook | Location |
|------|----------|
| Rider completion events | `order.delivered`, `order.customer_confirmed` |
| Claim settlement | `claim.settled`, `order.refunded` |
| Review/tip | `order.review_submitted`, `order.tip_paid` |
| Lifecycle stream | `commerce.order_lifecycle_events` + outbox |

FairPlay should subscribe to the production event backbone — not duplicate Food OS state.
