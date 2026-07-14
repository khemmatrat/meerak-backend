#!/usr/bin/env python3
"""Generate scripts/phase20_addendum.md (sections 29-36)."""
from pathlib import Path

OUT = Path(__file__).resolve().parent / "phase20_addendum.md"

SECTIONS = [r'''# 29. GROWTH SDK CONTRACT

**Path:** `backend/lib/aivos/sdk/growth/` (additive namespace under `createAivosSdk()`)

**Principle:** Every AI Skill, Workflow step, Application plugin, and external client MUST invoke Growth capabilities through `sdk.growth.*` — never via direct `runtime.growth` imports or raw HTTP from Skill code.

**Violation = FAIL** for any Skill that imports `backend/lib/aivos/growth/*` directly.

---

## 29.1 Namespace Layout

```typescript
interface GrowthSdk {
  profile(): GrowthProfileSdk;
  feed(): GrowthFeedSdk;
  mission(): GrowthMissionSdk;
  notification(): GrowthNotificationSdk;
  loyalty(): GrowthLoyaltySdk;
  referral(): GrowthReferralSdk;
  analytics(): GrowthAnalyticsSdk;
  recommendation(): GrowthRecommendationSdk;
  journey(): GrowthJourneySdk;
  habit(): GrowthHabitSdk;
  brief(): GrowthBriefSdk;
  coach(): GrowthCoachSdk;
  nba(): GrowthNbaSdk;
  dashboard(): GrowthDashboardSdk;
}
```

**Attachment pattern** (additive only — no breaking changes to existing SDK):

```javascript
// backend/lib/aivos/sdk/index.js
import { createGrowthSdk } from './growth/index.js';

export function createAivosSdk({ runtime, baseUrl = '/api/aivos' } = {}) {
  // ... existing namespaces unchanged ...
  const growth = createGrowthSdk({ runtime, baseUrl: `${baseUrl}/growth` });
  return { /* existing */, growth: () => growth };
}
```

When `AIVOS_GROWTH_ENABLED=0`, all `sdk.growth.*` methods return `{ ok: false, reason: 'growth_disabled' }` without throwing.

---

## 29.2 `sdk.growth.profile`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `get` | `(ctx: SdkCtx) => Promise<GrowthProfile>` | `GET /profile` | Current profile snapshot |
| `upsert` | `(ctx, patch: ProfilePatch) => Promise<GrowthProfile>` | `PUT /profile` | Updated profile |
| `getSegment` | `(ctx) => Promise<SegmentLabel>` | internal | Segment from profileSegment |
| `getEngagementScore` | `(ctx) => Promise<number>` | internal | 0–100 engagement score |

**`SdkCtx`:** `{ tenantId, userId, correlationId?, locale? }` — required on every call.

---

## 29.3 `sdk.growth.feed`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `list` | `(ctx, opts?: { cursor?, limit?, kinds? }) => Promise<FeedPage>` | `GET /feed` | Ranked work feed items |
| `markRead` | `(ctx, feedItemId) => Promise<{ ok }>` | `POST /feed/:id/read` | Ack impression |
| `dismiss` | `(ctx, feedItemId) => Promise<{ ok }>` | `POST /feed/:id/dismiss` | Remove from active feed |
| `refresh` | `(ctx) => Promise<FeedPage>` | `POST /feed/refresh` | Force re-rank |

Feed is **work feed** (missions, recommendations, alerts) — not social timeline. See §33.

---

## 29.4 `sdk.growth.mission`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `list` | `(ctx, opts?: { status? }) => Promise<Mission[]>` | `GET /missions` | Active/scheduled missions |
| `get` | `(ctx, missionId) => Promise<Mission>` | `GET /missions/:id` | Single mission |
| `start` | `(ctx, missionId) => Promise<Mission>` | `POST /missions/:id/start` | Transition scheduled→active |
| `complete` | `(ctx, missionId, evidence?: object) => Promise<MissionResult>` | `POST /missions/complete` | Complete + reward trigger |
| `abandon` | `(ctx, missionId, reason?) => Promise<{ ok }>` | `POST /missions/:id/abandon` | Expire without reward |

---

## 29.5 `sdk.growth.notification`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `list` | `(ctx, opts?: { unreadOnly? }) => Promise<Notification[]>` | `GET /notifications` | In-app notifications |
| `markRead` | `(ctx, notificationId) => Promise<{ ok }>` | `POST /notifications/:id/read` | Mark read |
| `getPreferences` | `(ctx) => Promise<NotificationPrefs>` | `GET /notifications/preferences` | Channel prefs |
| `setPreferences` | `(ctx, prefs) => Promise<NotificationPrefs>` | `PUT /notifications/preferences` | Update prefs |
| `send` | `(ctx, payload: NotificationPayload) => Promise<{ queued }>` | internal | Skill-triggered notify (governed) |

`send` requires Governance policy pass; Skills cannot bypass rate limits.

---

## 29.6 `sdk.growth.loyalty`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `getBalance` | `(ctx) => Promise<RewardBalance>` | `GET /rewards` | Points + tier |
| `getLedger` | `(ctx, opts?: { cursor?, limit? }) => Promise<LedgerPage>` | `GET /rewards/ledger` | Append-only ledger |
| `getBadges` | `(ctx) => Promise<Badge[]>` | `GET /gamification` | Badges earned |
| `getLevel` | `(ctx) => Promise<LevelInfo>` | `GET /gamification/level` | Current level + progress |
| `getLeaderboard` | `(ctx, scope?: 'tenant' \| 'team') => Promise<Leaderboard>` | `GET /gamification/leaderboard` | Tenant-scoped board |

---

## 29.7 `sdk.growth.referral`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `createCode` | `(ctx, campaign?) => Promise<ReferralCode>` | `POST /referral/create` | New referral code |
| `getStats` | `(ctx) => Promise<ReferralStats>` | `GET /referral/stats` | Attribution summary |
| `trackAttribution` | `(ctx, code, refereeId) => Promise<{ ok }>` | internal | Event-driven only |
| `listMilestones` | `(ctx) => Promise<ReferralMilestone[]>` | `GET /referral/milestones` | Campaign milestones |

---

## 29.8 `sdk.growth.analytics`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `getKpis` | `(ctx, window?: TimeWindow) => Promise<GrowthKpis>` | `GET /metrics` | Growth KPI snapshot |
| `track` | `(ctx, event: GrowthTrackEvent) => Promise<{ ok }>` | internal | Emit `growth.analytics.*` |
| `getFunnel` | `(ctx, funnelId) => Promise<FunnelSnapshot>` | `GET /metrics/funnel/:id` | Journey funnel |
| `getLoopMetrics` | `(ctx) => Promise<LoopMetrics>` | `GET /metrics/loop` | Habit loop KPIs (§33) |

**Read-only** for cross-engine analytics (`analyticsEngine`); `track` writes Growth-internal metrics only.

---

## 29.9 `sdk.growth.recommendation`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `list` | `(ctx, opts?: { types?, limit? }) => Promise<Recommendation[]>` | `GET /recommendations` | Ranked recommendations |
| `get` | `(ctx, recommendationId) => Promise<Recommendation>` | `GET /recommendations/:id` | Single recommendation |
| `accept` | `(ctx, recommendationId) => Promise<RecommendationResult>` | `POST /recommendations/:id/accept` | Execute linked action |
| `dismiss` | `(ctx, recommendationId, reason?) => Promise<{ ok }>` | `POST /recommendations/:id/dismiss` | Negative signal |
| `feedback` | `(ctx, recommendationId, signal: FeedbackSignal) => Promise<{ ok }>` | `POST /recommendations/:id/feedback` | Learning loop input |

Canonical schema: §32.

---

## 29.10 `sdk.growth.journey`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `get` | `(ctx) => Promise<JourneyState>` | `GET /journey` | Current journey state |
| `advance` | `(ctx, trigger: JourneyTrigger) => Promise<JourneyState>` | `POST /journey/advance` | Stage transition |
| `getHistory` | `(ctx) => Promise<StageHistory[]>` | `GET /journey/history` | Stage audit trail |
| `getChurnRisk` | `(ctx) => Promise<ChurnScore>` | `GET /churn` | Risk 0–1 |
| `getRetentionPlan` | `(ctx) => Promise<RetentionPlan>` | `GET /retention` | Active retention playbook |

---

## 29.11 `sdk.growth.habit`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `list` | `(ctx) => Promise<HabitRecord[]>` | `GET /habits` | All habits + streaks |
| `record` | `(ctx, habitId, metadata?) => Promise<HabitRecord>` | `POST /habits/record` | Record completion |
| `getStreak` | `(ctx, habitId) => Promise<StreakInfo>` | internal | Current streak + milestones |
| `getMilestones` | `(ctx, habitId) => Promise<StreakMilestone[]>` | `GET /habits/:id/milestones` | Earned milestones |

---

## 29.12 `sdk.growth.brief`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `morning` | `(ctx) => Promise<MorningBrief>` | `GET /brief/morning` | Daily morning brief |
| `evening` | `(ctx) => Promise<EveningReview>` | `GET /brief/evening` | Daily evening review |
| `getSchedule` | `(ctx) => Promise<BriefSchedule>` | internal | Tenant brief windows |

---

## 29.13 `sdk.growth.coach`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `ask` | `(ctx, question: string, context?: object) => Promise<CoachReply>` | `POST /coach` | Business coach Q&A |
| `getSession` | `(ctx) => Promise<CoachSession>` | `GET /coach/session` | Active session state |
| `endSession` | `(ctx) => Promise<{ ok }>` | `POST /coach/session/end` | Close session |

Coach delegates inference to Orchestrator + Knowledge — never Kernel direct.

---

## 29.14 `sdk.growth.nba`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `get` | `(ctx, opts?: { limit? }) => Promise<NextBestAction[]>` | `GET /nba` | Top ranked actions |
| `accept` | `(ctx, actionId) => Promise<NbaResult>` | `POST /nba/:id/accept` | Execute action |
| `defer` | `(ctx, actionId, until?: ISO8601) => Promise<{ ok }>` | `POST /nba/:id/defer` | Snooze action |
| `ignore` | `(ctx, actionId, reason?) => Promise<{ ok }>` | `POST /nba/:id/ignore` | Negative signal |

NBA aggregates recommendations per §32 aggregation rules.

---

## 29.15 `sdk.growth.dashboard`

| Method | Signature | HTTP Mapping | Returns |
|---|---|---|---|
| `get` | `(ctx) => Promise<DashboardSnapshot>` | `GET /dashboard` | Unified growth snapshot |
| `getWidgets` | `(ctx, widgetIds?: string[]) => Promise<WidgetData[]>` | `GET /dashboard/widgets` | Partial widget load |

`DashboardSnapshot` composes profile, journey, missions, feed preview, NBA top-3, loyalty balance, loop metrics.

---

## 29.16 Skill Integration Pattern

Skills MUST use the SDK — not internal modules.

```
┌─────────────┐     sdk.growth.*()      ┌──────────────────┐
│  AI Skill   │ ──────────────────────► │  Growth SDK      │
│  (Phase 13) │                         │  (thin wrapper)  │
└─────────────┘                         └────────┬─────────┘
                                                 │
                                                 ▼
                                        ┌──────────────────┐
                                        │  runtime.growth  │
                                        │  (DI, Phase 20)  │
                                        └──────────────────┘
```

**Skill manifest declaration** (additive field in skill registry):

```json
{
  "id": "skill.daily-mission-assistant",
  "growthCapabilities": ["mission.list", "mission.complete", "nba.get", "brief.morning"],
  "requiredSdkVersion": ">=20.1.0"
}
```

**Runtime enforcement:**

1. Skill executor receives `deps.sdk` (existing pattern from Phase 10.2 SDK packaging).
2. Skill code calls `deps.sdk.growth().mission().list(ctx)` — never `import growthMission from '...'`.
3. Governance audits every `sdk.growth.*` mutation with `entityType: growth_skill_invoke`.
4. Tenant + user context propagated from Skill execution envelope — Skills cannot override `tenantId`.

**Forbidden in Skill code:**

- `import ... from '../../growth/'`
- Direct `pool.query` against Growth tables
- Direct `fetch('/api/aivos/growth/...')` bypassing SDK

---

## 29.17 SDK Versioning Rules

| Rule | Requirement |
|---|---|
| **V1** | SDK major version aligns with Phase number: Growth SDK = `20.x.y` |
| **Additive only** | New methods = minor bump (`20.1.0`). Never remove or rename published methods. |
| **Breaking** | Requires new major (`21.0.0`) + Architecture review — prohibited during Phase 20 |
| **Namespace freeze** | The 14 namespaces in §29.1 are frozen; new domains use sub-methods, not new top-level namespaces |
| **Stub contract** | Disabled Growth returns `{ ok: false, reason }` — never throws on read paths |
| **Error envelope** | `{ ok: false, code: 'GROWTH_*', message, correlationId }` — consistent with Integration SDK |
| **Manifest gate** | Skills declare `requiredSdkVersion`; runtime rejects mismatch with `sdk_version_mismatch` |
| **Changelog** | `backend/lib/aivos/sdk/growth/CHANGELOG.md` required at implementation |

**Version header** (optional HTTP):

```
X-Aivos-Growth-Sdk-Version: 20.1.0
```''',

r'''# 30. GROWTH EVENT CONTRACT

**Absolute rule:** Growth Engine MUST NOT read external system databases directly. All cross-engine state changes arrive as **events** on the ACP Event Bus. Growth maintains its own tenant-scoped store for Growth-native entities only.

**Violation = FAIL** for any `pool.query` against non-Growth tables inside `backend/lib/aivos/growth/`.

**Permitted reads:** Growth store, `analyticsEngine` read APIs (aggregates only), `billingEngine.checkCredits` (existing read contract), Governance audit reproduce.

---

## 30.1 Inbound Event Catalog

Growth subscribes to the following ACP events (minimum catalog):

| Event | Source Engine | Growth Handler | Effect |
|---|---|---|---|
| `user.login` | Auth / Tenant | `onUserLogin` | Engagement signal, habit window, brief schedule |
| `user.logout` | Auth / Tenant | `onUserLogout` | Session duration, engagement flush |
| `workflow.completed` | Workflow (16) | `onWorkflowCompleted` | Mission progress, journey advance, feed item |
| `workflow.failed` | Workflow (16) | `onWorkflowFailed` | Churn signal, retention trigger |
| `publish.completed` | Pipeline / Application | `onPublishCompleted` | Mission complete candidate, feed item |
| `purchase.completed` | Billing / Marketplace | `onPurchaseCompleted` | Journey expansion, loyalty credit |
| `reward.claimed` | Billing / Reward | `onRewardClaimed` | Loyalty ledger sync, referral milestone |
| `mission.completed` | Growth (internal echo) | `onMissionCompleted` | Loop advance, analytics |
| `skill.executed` | Skills (13) | `onSkillExecuted` | Engagement, recommendation feedback |
| `application.installed` | Application (17) | `onApplicationInstalled` | Journey activation, mission seed |
| `application.uninstalled` | Application (17) | `onApplicationUninstalled` | Churn factor, mission cancel |
| `tenant.created` | Tenant (18) | `onTenantCreated` | Seed profile template, Personal AI init |
| `tenant.updated` | Tenant (18) | `onTenantUpdated` | Profile segment refresh |
| `knowledge.updated` | Knowledge (15) | `onKnowledgeUpdated` | Brief/coach context refresh |
| `billing.paid` | Billing (10) | `onBillingPaid` | Journey expansion, mission unlock |
| `subscription.renewed` | Billing (10) | `onSubscriptionRenewed` | Retention positive signal |
| `subscription.cancelled` | Billing (10) | `onSubscriptionCancelled` | Churn risk elevation |
| `integration.connector.executed` | Integration (19) | `onConnectorExecuted` | Feed item, mission evidence |
| `integration.webhook.received` | Integration (19) | `onWebhookReceived` | External signal ingestion |
| `marketplace.package.installed` | Marketplace | `onPackageInstalled` | Recommendation refresh |
| `analytics.insight.generated` | Analytics | `onInsightGenerated` | Feed + brief injection |
| `learning.model.updated` | Learning | `onModelUpdated` | Personalization refresh |
| `optimization.experiment.assigned` | Optimization | `onExperimentAssigned` | A/B segment tag |
| `governance.policy.violation` | Governance | `onPolicyViolation` | Coach alert, notification |
| `revenue.usage.recorded` | Revenue (5.13) | `onUsageRecorded` | Growth analytics KPI |

**Extensibility:** New inbound events require catalog entry + handler stub before implementation. Adapters translate foreign payloads — Growth handlers never parse raw foreign schemas.

---

## 30.2 Event Envelope Schema

All events — inbound and outbound — use the canonical ACP envelope:

```typescript
interface AcpEventEnvelope<T = unknown> {
  id: string;
  type: string;
  version: string;
  timestamp: string;
  tenantId: string;
  userId?: string;
  correlationId: string;
  causationId?: string;
  source: string;
  idempotencyKey: string;
  payload: T;
  metadata?: {
    locale?: string;
    plan?: string;
    flags?: Record<string, boolean>;
  };
}
```

**Validation rules:**

- Reject events missing `tenantId`, `type`, `idempotencyKey`
- `tenantId` must pass `runtime.tenants.validateAccess`
- Handlers are idempotent on `idempotencyKey` (24h dedup window)
- PII in payload masked before Growth audit persistence

---

## 30.3 Outbound `growth.*` Events

| Event | Trigger | Consumers |
|---|---|---|
| `growth.profile.updated` | Profile upsert | Analytics, Learning |
| `growth.journey.advanced` | Stage transition | Analytics, Automation |
| `growth.journey.at_risk` | Churn threshold | Automation, Notification |
| `growth.habit.recorded` | Habit completion | Analytics, Gamification |
| `growth.habit.streak.milestone` | Streak milestone hit | Notification, Loyalty |
| `growth.mission.assigned` | New mission created | Notification, Feed |
| `growth.mission.completed` | Mission complete | Billing (read), Revenue, Workflow |
| `growth.mission.expired` | Mission timeout | Retention |
| `growth.reward.granted` | Points credited | Billing, Revenue |
| `growth.feed.item.created` | New feed item | Notification |
| `growth.recommendation.generated` | Engine output | Feed, NBA |
| `growth.recommendation.accepted` | User accepted | Analytics, Learning |
| `growth.recommendation.dismissed` | User dismissed | Learning, Optimization |
| `growth.nba.presented` | NBA ranked | Analytics |
| `growth.nba.executed` | NBA action taken | Workflow, Application |
| `growth.brief.generated` | Morning/evening brief | Notification |
| `growth.coach.session.completed` | Coach session end | Analytics, Knowledge |
| `growth.referral.milestone.reached` | Referral target hit | Loyalty, Notification |
| `growth.churn.risk.elevated` | Risk score increase | Automation, Retention |
| `growth.retention.plan.activated` | Retention playbook start | Automation, Mission |
| `growth.loop.cycle.completed` | Full habit loop cycle | Analytics, Optimization |
| `growth.notification.sent` | Notification dispatched | Observability |
| `growth.analytics.kpi.updated` | KPI rollup | Dashboard cache |

---

## 30.4 Event Bridge Wiring

Growth integrates with Phase 19 `eventBridge` — no parallel bus.

```
┌─────────────────────────────────────────────────────────────────┐
│                     ACP Event Bus (runtime.events)               │
└────────────┬──────────────────────────────────────┬─────────────┘
             │ subscribe                           │ publish
             ▼                                     ▼
┌────────────────────────┐              ┌─────────────────────────┐
│  growth/eventBridge.js │              │  Downstream Engines     │
│  inbound adapters      │              │  Analytics, Learning,   │
│  outbound emitters     │              │  Automation, Integration│
└────────────┬───────────┘              └─────────────────────────┘
             │
             ▼
┌────────────────────────┐
│  growth/eventHandlers/ │
└────────────────────────┘
```

**File:** `backend/lib/aivos/growth/eventBridge.js`

```javascript
export function createGrowthEventBridge({ events, handlers, tenants, audit }) {
  const subscriptions = INBOUND_CATALOG.map(({ type, handler }) =>
    events.subscribe(type, async (envelope) => {
      await tenants.validateAccess(envelope.tenantId);
      if (await dedupe.isSeen(envelope.idempotencyKey)) return;
      await handlers[handler](envelope);
      await dedupe.mark(envelope.idempotencyKey);
    })
  );

  async function emit(type, payload, ctx) {
    const envelope = buildEnvelope({ type, payload, source: 'growth', ...ctx });
    await audit.record({ entityType: 'growth_event', action: type, envelope });
    return events.publish(envelope);
  }

  return { emit, subscriptions, shutdown: () => subscriptions.forEach(s => s.unsubscribe()) };
}
```

**Wiring in `createGrowthEngine()`:**

1. Instantiate `growthEventBridge` after all handlers registered.
2. Pass `emit` to every Growth module that produces outbound events.
3. Register bridge in `runtime.growth.eventBridge` for observability.
4. Integration `eventBridge` (Phase 19) forwards external webhooks → ACP events → Growth handlers (never direct).

**Failure handling:**

- Handler exception → retry 3x with exponential backoff → DLQ (`growth_event_dlq`)
- DLQ recovery via existing Integration webhook recovery pattern
- No silent drops — every failure audited''',

r'''# 31. FRONTEND/UI STATE CONTRACT

**Status:** DESIGN ONLY — no Frontend implementation in Phase 20.

**Purpose:** Define canonical screen state shapes so any future Frontend (Web, Mobile, Embed) implements identical contracts against `/api/aivos/growth/*` and `sdk.growth.*`.

---

## 31.1 Screen Registry

| Screen ID | Route (canonical) | Primary SDK | Home? |
|---|---|---|---|
| `Feed` | `/growth` | `sdk.growth.feed` | **YES — default home** |
| `Dashboard` | `/growth/dashboard` | `sdk.growth.dashboard` | |
| `Mission` | `/growth/missions` | `sdk.growth.mission` | |
| `Reward` | `/growth/rewards` | `sdk.growth.loyalty` | |
| `Notification` | `/growth/notifications` | `sdk.growth.notification` | |
| `DailyBrief` | `/growth/brief` | `sdk.growth.brief` | |
| `Marketplace` | `/growth/marketplace` | `sdk.workflow` + `sdk.growth.recommendation` | |
| `Profile` | `/growth/profile` | `sdk.growth.profile` | |
| `Wallet` | `/growth/wallet` | Billing SDK (read) + `sdk.growth.loyalty` | |
| `Journey` | `/growth/journey` | `sdk.growth.journey` | |
| `Coach` | `/growth/coach` | `sdk.growth.coach` | |
| `Referral` | `/growth/referral` | `sdk.growth.referral` | |
| `Community` | `/growth/community` | Community API | |
| `NBA` | `/growth/actions` | `sdk.growth.nba` | |

---

## 31.2 State Shapes

### Feed (Home)

```typescript
interface FeedScreenState {
  status: ScreenStatus;
  items: FeedItem[];
  cursor: string | null;
  unreadCount: number;
  lastRefreshedAt: string;
  nbaPreview: NextBestAction[];
  morningBriefCard: MorningBrief | null;
}
```

### Dashboard

```typescript
interface DashboardScreenState {
  status: ScreenStatus;
  snapshot: DashboardSnapshot;
  widgets: Record<WidgetId, WidgetState>;
  loopMetrics: LoopMetrics;
  churnRisk: ChurnScore | null;
}
```

### Mission

```typescript
interface MissionScreenState {
  status: ScreenStatus;
  active: Mission[];
  scheduled: Mission[];
  completed: Mission[];
  selectedId: string | null;
  completionResult: MissionResult | null;
}
```

### Reward

```typescript
interface RewardScreenState {
  status: ScreenStatus;
  balance: RewardBalance;
  ledger: LedgerEntry[];
  badges: Badge[];
  level: LevelInfo;
  leaderboard: Leaderboard | null;
}
```

### Notification

```typescript
interface NotificationScreenState {
  status: ScreenStatus;
  items: Notification[];
  unreadCount: number;
  preferences: NotificationPrefs;
}
```

### Daily Brief

```typescript
interface DailyBriefScreenState {
  status: ScreenStatus;
  morning: MorningBrief | null;
  evening: EveningReview | null;
  activeTab: 'morning' | 'evening';
  coachSuggestions: CoachReply[];
}
```

### Marketplace

```typescript
interface MarketplaceScreenState {
  status: ScreenStatus;
  installed: InstalledPackage[];
  recommended: Recommendation[];
  categories: MarketplaceCategory[];
}
```

### Profile

```typescript
interface ProfileScreenState {
  status: ScreenStatus;
  profile: GrowthProfile;
  segment: SegmentLabel;
  engagementScore: number;
  isEditing: boolean;
}
```

### Wallet

```typescript
interface WalletScreenState {
  status: ScreenStatus;
  balance: WalletBalance;
  rewardBalance: RewardBalance;
  transactions: Transaction[];
  entitlements: EntitlementSummary;
}
```

### Journey

```typescript
interface JourneyScreenState {
  status: ScreenStatus;
  journey: JourneyState;
  history: StageHistory[];
  churnRisk: ChurnScore;
  retentionPlan: RetentionPlan | null;
}
```

### Coach

```typescript
interface CoachScreenState {
  status: ScreenStatus;
  session: CoachSession;
  messages: CoachMessage[];
  isTyping: boolean;
}
```

### Referral

```typescript
interface ReferralScreenState {
  status: ScreenStatus;
  code: ReferralCode | null;
  stats: ReferralStats;
  milestones: ReferralMilestone[];
}
```

### Community

```typescript
interface CommunityScreenState {
  status: ScreenStatus;
  posts: CommunityPost[];
  cursor: string | null;
}
```

### NBA

```typescript
interface NbaScreenState {
  status: ScreenStatus;
  actions: NextBestAction[];
  selectedId: string | null;
  executionResult: NbaResult | null;
}
```

### Shared Types

```typescript
type ScreenStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface ScreenError {
  code: string;
  message: string;
  retryable: boolean;
  correlationId?: string;
}
```

---

## 31.3 Loading / Empty / Error Standards

| Status | UI Behavior | Data Rule |
|---|---|---|
| `loading` | Skeleton placeholders; no flash of empty | Initial fetch or hard refresh |
| `ready` | Render data | `items.length > 0` or scalar data present |
| `empty` | Illustration + CTA | Valid response, zero items |
| `error` | Error banner + retry if `retryable` | SDK `ok: false` or HTTP 4xx/5xx |

**Standards:**

- **Stale-while-revalidate:** Show cached `ready` with background refresh — never blank during re-fetch.
- **Optimistic updates:** Mission complete, mark-read, dismiss — apply locally, rollback on error.
- **Growth disabled:** Global banner `growth_disabled`; all screens show empty with explanation.
- **Tenant mismatch:** Full-screen `403` — no partial data leak.
- **Correlation ID:** Display in error detail for support.
- **Pagination:** Cursor-based on Feed — never offset pagination.

---

## 31.4 Navigation Contract

```
App Launch → FEED (/growth) [default home]
     ├── Dashboard
     ├── Missions
     ├── NBA (badge: unread actions)
     ├── Rewards
     ├── Profile
     └── More → Brief, Coach, Journey, Referral, Community, Marketplace, Wallet, Notifications
```

**Rules:**

1. **Feed is home** — cold start, deep link fallback, post-login land on Feed.
2. **NBA badge** — count of non-deferred actions.
3. **Brief prompt** — Morning brief card pinned atop Feed until dismissed (06:00–11:00 tenant local).
4. **Mission deeplink** — `/growth/missions/:id` sets `selectedId`.
5. **Recommendation deeplink** — `/growth/actions?rec=:id` pre-selects NBA action.
6. **Back stack** — Feed reachable in one tap (home icon).''',

r'''# 32. AI RECOMMENDATION CONTRACT

**Path:** `backend/lib/aivos/growth/recommendation/`

All recommendation engines produce recommendations conforming to this contract. **Cross-engine compliance via event adapters only** — foreign engines emit adapter-translated events; this schema never changes per engine.

---

## 32.1 Canonical Recommendation Schema

```typescript
interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: number;
  confidence: number;
  reason: string;
  source: RecommendationSource;
  action: RecommendationAction;
  expiresAt: string;
  tenantId: string;
  userId: string;
  metadata?: {
    title?: string;
    subtitle?: string;
    icon?: string;
    imageUrl?: string;
    tags?: string[];
  };
  createdAt: string;
  correlationId: string;
}
```

---

## 32.2 `RecommendationType` Enum

| Type | Description | Example |
|---|---|---|
| `content.create` | Create new content asset | "Post a TikTok video about your new product" |
| `content.publish` | Publish existing draft | "Publish your draft resume video" |
| `content.optimize` | Improve existing content | "Update your ad copy — CTR below benchmark" |
| `social.post` | Social media post | "Schedule Instagram post for peak hours" |
| `social.engage` | Engage with audience | "Reply to 3 customer comments" |
| `ads.launch` | Launch ad campaign | "Start Facebook ads for top SKU" |
| `ads.optimize` | Tune ad performance | "Increase budget on winning ad set" |
| `customer.reply` | Customer communication | "Reply to pending support ticket #4521" |
| `customer.followup` | Follow-up outreach | "Send follow-up to lead from yesterday" |
| `resume.update` | Resume/CV update | "Add your latest project to resume" |
| `workflow.run` | Execute workflow | "Run weekly report workflow" |
| `workflow.install` | Install workflow package | "Install 'Social Scheduler' from Marketplace" |
| `application.use` | Use installed application | "Try Video Studio for product demo" |
| `application.install` | Install application | "Install CRM connector for your tenant" |
| `integration.connect` | Connect external service | "Connect Shopify for order sync" |
| `knowledge.review` | Review knowledge base | "Approve 5 pending knowledge articles" |
| `mission.start` | Start growth mission | "Complete onboarding mission" |
| `habit.record` | Record daily habit | "Log today's business check-in" |
| `billing.upgrade` | Plan upgrade suggestion | "Upgrade to Pro for more AI credits" |
| `retention.engage` | Re-engagement action | "You haven't logged in for 5 days — review brief" |
| `coach.ask` | Business coach prompt | "Ask coach about Q3 revenue strategy" |
| `referral.share` | Referral action | "Share referral link — 2 away from reward" |
| `custom` | Tenant-defined type | Extensible via adapter |

---

## 32.3 `RecommendationSource`

| Source | Engine | Adapter Event |
|---|---|---|
| `growth.brain` | Growth Brain (NBA, churn, retention) | internal |
| `growth.personalization` | Personalization Engine | internal |
| `growth.feed` | Feed Ranker | internal |
| `analytics.insights` | Analytics Engine | `analytics.insight.generated` |
| `learning.model` | Learning Engine | `learning.model.updated` |
| `optimization.experiment` | Optimization Engine | `optimization.experiment.assigned` |
| `marketplace.catalog` | Marketplace | `marketplace.package.installed` |
| `application.catalog` | Application Engine | `application.installed` |
| `knowledge.graph` | Knowledge Engine | `knowledge.updated` |
| `workflow.history` | Workflow Engine | `workflow.completed` |
| `integration.signal` | Integration Engine | `integration.connector.executed` |
| `revenue.forecast` | Revenue Engine | `revenue.usage.recorded` |
| `external.webhook` | Integration webhook | `integration.webhook.received` |

**Rule:** Foreign engines NEVER write to Growth store. They emit events → `growth/recommendation/adapters/` → canonical `Recommendation` objects.

---

## 32.4 `RecommendationAction` Schema

```typescript
interface RecommendationAction {
  kind: RecommendationActionKind;
  deeplink: string;
  sdkMethod?: string;
  target?: {
    type: 'mission' | 'workflow' | 'application' | 'integration' | 'url' | 'coach';
    id: string;
    params?: Record<string, unknown>;
  };
  autoExecute: boolean;
  permissions?: string[];
}

type RecommendationActionKind =
  | 'navigate'
  | 'execute'
  | 'install'
  | 'compose'
  | 'confirm'
  | 'dismiss_only';
```

---

## 32.5 NBA Aggregation Rules

`growth.brain.nextBestAction` aggregates recommendations from all sources:

```
1. COLLECT  — all non-expired recommendations for {tenantId, userId}
2. DEDUPE   — merge by target.id + type; keep highest confidence
3. FILTER   — remove dismissed (24h), permission-denied, expired
4. BOOST    — apply journey stage weights
5. RANK     — score = (1/confidence) * priority * stageBoost * recencyDecay
6. CAP      — return top N (default 5; Feed preview = 3)
7. EMIT     — growth.nba.presented event with ranked IDs
```

**Conflict resolution:**

| Conflict | Resolution |
|---|---|
| Same `target.id`, different types | Keep higher `confidence` |
| Same type, different targets | Keep lower `priority` number |
| `billing.upgrade` + `retention.engage` | Retention wins if `churnRisk > 0.7` |
| Auto-execute candidates | Max 1 per cycle; never auto-execute `billing.*` |

---

## 32.6 Cross-Engine Compliance

```
Foreign Engine → Event Adapter → Growth Store (Recommendation[])
```

**Rules:**

1. Adapters are the **only** entry point for foreign recommendations.
2. Adapter output MUST validate against §32.1 — reject on failure, audit error.
3. No engine-specific fields on `Recommendation` — use `metadata`.
4. New source = new adapter + §32.3 catalog entry — **no contract changes**.
5. Foreign engines remain unaware of Growth — existing ACP events only.''',

r'''# 33. HABIT & GROWTH LOOP CONTRACT

**Path:** `backend/lib/aivos/growth/habit/`, `backend/lib/aivos/growth/feed/`, `backend/lib/aivos/growth/brain/`

Growth transforms AQOND from reactive tool into **proactive daily business operating system** through a canonical daily loop.

---

## 33.1 The Canonical Growth Loop

```
Open App → Morning Brief → Mission → Execute → Reward → Analytics → Learning
  → Optimization → Recommendation → New Mission → Evening Review → Tomorrow Brief → Repeat
```

**Narrative:** User opens app → sees Morning Brief on Feed → accepts Mission → executes via Workflow/Skill/Application → earns Reward → Analytics records outcome → Learning updates Personal AI → Optimization adjusts weights → Recommendation suggests next action → Mission assigned → Evening Review summarizes day → Tomorrow Brief pre-staged → cycle repeats.

**All loop transitions driven by events (§30)** — no direct cross-engine DB reads.

---

## 33.2 Loop State Machine

Phases: `IDLE` → `OPEN` → `BRIEFING` → `EXECUTING` → `REWARDING` → `LEARNING` → `RECOMMENDING` → `MISSIONING` → `REVIEWING` → `IDLE`

**State persisted:** `GrowthLoopState { phase, enteredAt, cycleId, metadata }` keyed `{tenantId}::{userId}`.

**Timeout transitions:**

| Phase | Timeout | Fallback |
|---|---|---|
| `BRIEFING` | 4h | Auto-advance to `MISSIONING` with default mission |
| `EXECUTING` | 24h | Mission expires, transition to `REVIEWING` |
| `REWARDING` | 1h | Auto-complete, emit `growth.loop.cycle.completed` |
| `REVIEWING` | 12h | Reset to `IDLE` |

---

## 33.3 Habit Contract & Streak Milestones

```typescript
interface HabitRecord {
  habitId: string;
  tenantId: string;
  userId: string;
  cadence: 'daily' | 'weekday' | 'weekly' | 'custom';
  streak: number;
  longestStreak: number;
  lastCompletedAt: string | null;
  completions: HabitCompletion[];
  milestones: StreakMilestone[];
  status: 'active' | 'paused' | 'broken';
}

interface StreakMilestone {
  days: number;
  label: string;
  rewardPoints: number;
  badgeId?: string;
  reachedAt?: string;
}
```

**Canonical milestones (default):**

| Days | Label | Reward Points | Badge |
|---|---|---|---|
| 3 | Getting Started | 10 | `streak_3` |
| 7 | One Week Strong | 25 | `streak_7` |
| 14 | Two Week Habit | 50 | `streak_14` |
| 30 | Monthly Master | 100 | `streak_30` |
| 60 | Consistency Pro | 200 | `streak_60` |
| 90 | Quarterly Champion | 500 | `streak_90` |
| 365 | Annual Legend | 2000 | `streak_365` |

**Streak rules:**

- Cadence `daily`: miss 1 day → `broken` → streak resets on next completion
- `weekday`: weekends exempt from break
- Milestone reward idempotent on `habitId + days`
- Milestone hit emits `growth.habit.streak.milestone` → Notification + Loyalty

---

## 33.4 AI Feed Engine (Work Feed — Not Social)

**Module:** `backend/lib/aivos/growth/feed/feedEngine.js`

| Feed Item Kind | Source | Priority Boost |
|---|---|---|
| `brief` | Morning/evening brief | +10 (time-window) |
| `mission` | Mission engine | +8 |
| `nba` | NBA brain | +7 |
| `recommendation` | Recommendation engine | +5 |
| `alert` | Churn, billing, governance | +9 |
| `achievement` | Gamification milestone | +3 |
| `insight` | Analytics insight | +4 |
| `community` | Community (if enabled) | +1 |

**Ranking:** `score = kindBoost + recencyDecay + journeyStageWeight + personalizationScore`

**Not in Feed:** Social likes, follower counts, viral content — Community is separate screen.

---

## 33.5 Personal AI per Tenant

```typescript
interface PersonalAiContext {
  tenantId: string;
  modelVersion: string;
  preferences: Record<string, unknown>;
  segmentWeights: Record<string, number>;
  conversationHistory: CoachMessage[];
  learningSnapshot: string;
  lastOptimizedAt: string;
}
```

**Rules:**

1. Personal AI keyed by `tenantId` — never cross-tenant.
2. Learning updates via `learning.model.updated` event only.
3. Coach, Brief, Recommendation consume Personal AI context.
4. Context reset on `tenant.updated` with Governance audit.
5. Storage in Growth store — Learning Engine remains authoritative for models.

---

## 33.6 Loop Metrics

| Metric | Event Source | KPI |
|---|---|---|
| `loop.cycle.started` | `user.login` + brief | Daily active loop starts |
| `loop.cycle.completed` | `growth.loop.cycle.completed` | Full loop completion rate |
| `loop.brief.viewed` | `growth.brief.generated` | Brief engagement |
| `loop.mission.accepted` | `growth.mission.assigned` | Mission acceptance rate |
| `loop.mission.completed` | `growth.mission.completed` | Mission completion rate |
| `loop.reward.granted` | `growth.reward.granted` | Reward distribution |
| `loop.recommendation.accepted` | `growth.recommendation.accepted` | Recommendation CTR |
| `loop.review.completed` | `growth.brief.generated` (evening) | Evening review rate |
| `loop.streak.active` | `growth.habit.recorded` | Active streak users |
| `loop.time_to_complete` | cycle timestamps | Median loop duration |

Exposed via `sdk.growth.analytics().getLoopMetrics()` and `GET /metrics/loop`.

---

## 33.7 Integration via Events Only

| Loop Step | Inbound Events | Outbound Events |
|---|---|---|
| Open App | `user.login` | — |
| Morning Brief | `user.login`, `analytics.insight.generated` | `growth.brief.generated` |
| Mission | `growth.mission.assigned` | `growth.mission.completed` |
| Execute | `workflow.completed`, `skill.executed`, `publish.completed` | — |
| Reward | `growth.mission.completed` | `growth.reward.granted` |
| Analytics | `growth.reward.granted` | `growth.analytics.kpi.updated` |
| Learning | `growth.recommendation.accepted/dismissed` | — |
| Optimization | `learning.model.updated` | — |
| Recommendation | `learning.model.updated`, `analytics.insight.generated` | `growth.recommendation.generated` |
| New Mission | `growth.recommendation.accepted` | `growth.mission.assigned` |
| Evening Review | `growth.mission.completed` | `growth.brief.generated` |
| Tomorrow Brief | scheduler (automation) | `growth.brief.generated` |''',

r'''# 34. UPDATED DELIVERABLES INDEX

Phase 20 deliverables extended from 28 → **33** with v1.1 contract additions:

| # | Deliverable | Section | Status |
|---|---|---|---|
| 1 | Architecture Diagram | §1 | v1.0 |
| 2 | Folder Structure | §2 | v1.0 |
| 3 | Dependency Graph | §3 | v1.0 |
| 4 | Data Flow | §4 | v1.0 |
| 5 | Runtime Integration | §5 | v1.0 |
| 6 | HTTP API Design | §6 | v1.0 |
| 7 | SDK Design (overview) | §7 | v1.0 — superseded by §29 |
| 8 | Data Models | §8 | v1.0 |
| 9 | Sequence Diagrams | §9 | v1.0 |
| 10 | State Machines | §10 | v1.0 — extended by §33.2 |
| 11 | Feature Flags | §11 | v1.0 |
| 12 | Security Model | §12 | v1.0 |
| 13 | Permission Matrix | §13 | v1.0 |
| 14 | Tenant Isolation | §14 | v1.0 |
| 15 | Observability | §15 | v1.0 |
| 16 | Metrics | §16 | v1.0 — extended by §33.6 |
| 17 | Audit Strategy | §17 | v1.0 |
| 18 | Disaster Recovery | §18 | v1.0 |
| 19 | Scalability Plan | §19 | v1.0 |
| 20 | Production Deployment Plan | §20 | v1.0 |
| 21 | Rollback Plan | §21 | v1.0 |
| 22 | Migration Plan | §22 | v1.0 |
| 23 | Testing Strategy | §23 | v1.0 — extended by §35 |
| 24 | Regression Strategy | §24 | v1.0 |
| 25 | Performance Targets | §25 | v1.0 |
| 26 | Risk Analysis | §26 | v1.0 |
| 27 | Architecture Validation Checklist | §27 | v1.0 — extended by §36 |
| 28 | Production Readiness Checklist | §28 | v1.0 |
| **29** | **Growth SDK Contract** | **§29** | **v1.1 NEW** |
| **30** | **Growth Event Contract** | **§30** | **v1.1 NEW** |
| **31** | **Frontend/UI State Contract** | **§31** | **v1.1 NEW** |
| **32** | **AI Recommendation Contract** | **§32** | **v1.1 NEW** |
| **33** | **Habit & Growth Loop Contract** | **§33** | **v1.1 NEW** |

**Implementation files added by v1.1:**

```
backend/lib/aivos/sdk/growth/
backend/lib/aivos/growth/eventBridge.js
backend/lib/aivos/growth/eventHandlers/
backend/lib/aivos/growth/recommendation/adapters/
backend/lib/aivos/growth/habit/loopStateMachine.js
backend/lib/aivos/growth/feed/feedEngine.js
```''',

r'''# 35. UPDATED TESTING STRATEGY

Extends §23. All existing GRW01–GRW16 tests unchanged. Five new tests added.

## 35.1 GRW01–GRW16 (unchanged)

| ID | Description |
|---|---|
| GRW01 | Config |
| GRW02 | Manifest |
| GRW03 | Profile |
| GRW04 | Journey |
| GRW05 | Habit |
| GRW06 | Mission |
| GRW07 | Reward |
| GRW08 | Feed |
| GRW09 | Runtime |
| GRW10 | Metrics |
| GRW11 | Routes |
| GRW12 | Profile → Journey → Mission → Reward |
| GRW13 | Multi-tenant isolation |
| GRW14 | Journey rollback |
| GRW15 | Churn → retention → re-engagement |
| GRW16 | Full E2E Growth → Application → Workflow → Tenant → Billing → Revenue → Audit |

## 35.2 GRW17–GRW21 (v1.1 contract tests)

| ID | Description | Contract | Assertions |
|---|---|---|---|
| **GRW17** | Growth SDK namespace | §29 | All 14 namespaces callable; disabled stub; no kernel imports; Skill `growthCapabilities` enforced |
| **GRW18** | Growth Event Bridge | §30 | Inbound handlers; idempotency dedup; outbound `growth.*`; no external DB reads |
| **GRW19** | UI State Contract | §31 | API responses match screen state shapes; Feed-as-home; loading/empty/error envelopes |
| **GRW20** | Recommendation Contract | §32 | Schema validation; adapter ingress; NBA aggregation; adapters-only cross-engine |
| **GRW21** | Habit & Growth Loop | §33 | Loop FSM transitions; streak milestones 3/7/30; work feed ranking; loop metrics; events-only |

## 35.3 Target

| Suite | Count |
|---|---|
| Phases 1–19 regression | 351 |
| Phase 20 GRW01–GRW16 | 16 |
| Phase 20 GRW17–GRW21 | 5 |
| **Total** | **372/372 PASS** |

**Test file:** `backend/__tests__/aivosPhase20Growth.test.js` (GRW01–GRW21)

**Regression rule:** Run full `aivos*.test.js` before and after every Growth change. Zero modifications to existing 351 tests.''',

r'''# 36. UPDATED ARCHITECTURE VALIDATION CHECKLIST

Extends §27 and §28. Items marked **(v1.1)** are new requirements.

## 36.1 Architecture Validation (§27 additions)

- [ ] Runtime: additive growth attachment only
- [ ] No pipeline/orchestrator/kernel changes
- [ ] No existing engine contract changes
- [ ] No existing test modifications
- [ ] `AIVOS_GROWTH_ENABLED` default OFF
- [ ] One-way dependency Growth → AI-OS
- [ ] Tenant-scoped data
- [ ] GRW01–GRW21 defined **(v1.1)**
- [ ] 351/351 regression preserved
- [ ] **`sdk.growth.*` — 14 sub-namespaces (§29) (v1.1)**
- [ ] **Skills use SDK only (§29.16) (v1.1)**
- [ ] **Growth SDK version `20.x.y` additive-only (§29.17) (v1.1)**
- [ ] **Cross-engine state via events only (§30) (v1.1)**
- [ ] **Inbound event catalog — 24+ types (§30.1) (v1.1)**
- [ ] **Outbound `growth.*` events (§30.3) (v1.1)**
- [ ] **Event bridge via `runtime.events` (§30.4) (v1.1)**
- [ ] **UI state shapes — 14 screens (§31) (v1.1)**
- [ ] **Feed is canonical home (§31.4) (v1.1)**
- [ ] **Recommendation schema enforced (§32.1) (v1.1)**
- [ ] **Recommendations via adapters only (§32.6) (v1.1)**
- [ ] **NBA aggregation rules (§32.5) (v1.1)**
- [ ] **Growth loop state machine (§33.2) (v1.1)**
- [ ] **Habit streak milestones — 7 tiers (§33.3) (v1.1)**
- [ ] **Work feed not social (§33.4) (v1.1)**
- [ ] **Personal AI per tenant (§33.5) (v1.1)**
- [ ] **Loop metrics via SDK/API (§33.6) (v1.1)**

## 36.2 Production Readiness (§28 additions)

- [ ] GRW01–GRW21 PASS **(v1.1)**
- [ ] Regression >= 372/372 **(v1.1)**
- [ ] Architecture violations = 0
- [ ] Security (§12), Permissions (§13), Observability (§15)
- [ ] DR (§18), Rollback (§21), Performance (§25) verified
- [ ] `PHASE20_GROWTH_REPORT.md` delivered
- [ ] **`sdk/growth/CHANGELOG.md` (§29.17) (v1.1)**
- [ ] **Event DLQ recovery tested (§30.4) (v1.1)**
- [ ] **Recommendation adapter coverage for §32.3 sources (v1.1)**

---

**Phase 20 SPEC v1.1 — SDK, Event, UI, Recommendation, and Loop contracts complete.**''']

def main():
    body = "\n\n".join(SECTIONS)
    OUT.write_text(body + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(body)} bytes, {len(SECTIONS)} sections)")

if __name__ == "__main__":
    main()
