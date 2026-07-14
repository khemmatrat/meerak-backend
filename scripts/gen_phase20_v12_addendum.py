#!/usr/bin/env python3
"""Generate scripts/phase20_v12_addendum.md (sections 37-43)."""
from pathlib import Path

OUT = Path(__file__).resolve().parent / "phase20_v12_addendum.md"

SECTIONS = [r'''# 37. GROWTH DOMAIN MODEL

**Path:** `backend/lib/aivos/growth/domain/`

**Principle:** Every Growth entity has exactly one **write owner**, one **storage namespace**, and canonical events. Cross-engine entities are **read-only projections** — never duplicated in Growth store.

**Violation = FAIL** for any Growth module that writes to a foreign engine's authoritative store or maintains a second copy of a canonical entity without an adapter projection rule.

---

## 37.1 Entity Hierarchy

Canonical ownership chain (parent → child):

```
User
 └── GrowthProfile
      └── Journey
           └── Habit
                └── Mission
                     └── MissionExecution
                          └── Reward
                               └── LoyaltyTier
                                    └── Recommendation (canonical)
                                         └── FeedItem
                                              └── Notification
                                                   └── MorningBrief / EveningReview
                                                        └── PersonalAI Persona
                                                             └── ChurnScore
                                                                  └── GrowthLoopState
                                                                       └── AnalyticsFact
                                                                            └── LearningModel (projection)
                                                                                 └── BillingTransaction (read)
                                                                                      └── RevenueMetric (read)
```

**Read order:** User is owned by Tenant/Auth — Growth never creates Users. GrowthProfile is the Growth root aggregate.

---

## 37.2 Ownership Matrix

| Entity | Write Owner | Storage Namespace | Analytics Owner | Audit Owner | Canonical Events |
|---|---|---|---|---|---|
| **User** | Tenant/Auth | `tenants.users` | Analytics | Governance | `user.login`, `user.logout` |
| **GrowthProfile** | `growth.profile` | `growth.profiles` | Growth Analytics | Growth Audit | `growth.profile.updated` |
| **Journey** | `growth.journey` | `growth.journeys` | Growth Analytics | Growth Audit | `growth.journey.advanced`, `growth.journey.at_risk` |
| **Habit** | `growth.habit` | `growth.habits` | Growth Analytics | Growth Audit | `growth.habit.recorded`, `growth.habit.streak.milestone` |
| **Mission** | `growth.mission` | `growth.missions` | Growth Analytics | Growth Audit | `growth.mission.assigned`, `growth.mission.completed`, `growth.mission.expired` |
| **MissionExecution** | `growth.mission` | `growth.mission_executions` | Growth Analytics | Growth Audit | `growth.mission.completed` |
| **Reward** | `growth.reward` | `growth.rewards` | Growth Analytics | Growth Audit | `growth.reward.granted` |
| **LoyaltyTier** | `growth.loyalty` | `growth.loyalty_tiers` | Growth Analytics | Growth Audit | `growth.reward.granted` |
| **Recommendation** (canonical) | `growth.recommendation` | `growth.recommendations` | Growth Analytics | Growth Audit | `growth.recommendation.generated`, `growth.recommendation.accepted`, `growth.recommendation.dismissed` |
| **RecommendationSource** | Foreign engine (via adapter) | *none in Growth* | Source engine | Growth Audit | Adapter ingress event (§32.3) |
| **FeedItem** | `growth.feed` | `growth.feed_items` | Growth Analytics | Growth Audit | `growth.feed.item.created` |
| **Notification** | `growth.notification` | `growth.notifications` | Growth Analytics | Growth Audit | `growth.notification.sent` |
| **MorningBrief / EveningReview** | `growth.brief` | `growth.briefs` | Growth Analytics | Growth Audit | `growth.brief.generated` |
| **PersonalAI Persona** | `growth.personalization` | `growth.personal_ai` | Learning (model) | Growth Audit | `learning.model.updated` |
| **ChurnScore** | `growth.journey` | `growth.churn_scores` | Growth Analytics | Growth Audit | `growth.churn.risk.elevated` |
| **GrowthLoopState** | `growth.brain` | `growth.loop_state` | Growth Analytics | Growth Audit | `growth.loop.cycle.completed` |
| **AnalyticsFact** | `growth.analytics` | `growth.analytics_facts` | Analytics (rollup) | Growth Audit | `growth.analytics.kpi.updated` |
| **LearningModel** | Learning Engine | `learning.models` | Learning | Governance | `learning.model.updated` |
| **BillingTransaction** | Billing Engine | `billing.transactions` | Billing | Governance | `billing.paid`, `purchase.completed` |
| **RevenueMetric** | Revenue Engine | `revenue.metrics` | Revenue | Governance | `revenue.usage.recorded` |

---

## 37.3 Entity Schemas (Growth-Native)

```typescript
interface GrowthProfile {
  tenantId: string;
  userId: string;
  lifecycleStage: 'onboarding' | 'activation' | 'retention' | 'expansion' | 'advocacy' | 'at_risk' | 'churned';
  persona: string;
  goals: string[];
  preferences: Record<string, unknown>;
  engagementScore: number;
  segment: string;
  updatedAt: string;
}

interface Journey {
  journeyId: string;
  tenantId: string;
  userId: string;
  currentStage: string;
  stageHistory: StageHistory[];
  completed: boolean;
  startedAt: string;
}

interface Mission {
  id: string;
  tenantId: string;
  userId: string;
  templateId: string;
  title: string;
  status: 'scheduled' | 'active' | 'completed' | 'expired' | 'abandoned';
  progress: number;
  linkedAppId?: string;
  linkedWorkflowId?: string;
  rewardPoints: number;
  expiresAt: string;
}

interface MissionExecution {
  id: string;
  missionId: string;
  tenantId: string;
  userId: string;
  startedAt: string;
  completedAt?: string;
  evidence?: Record<string, unknown>;
  outcome: 'success' | 'failure' | 'timeout' | 'abandoned';
}

interface Reward {
  id: string;
  tenantId: string;
  userId: string;
  points: number;
  source: 'mission' | 'habit' | 'referral' | 'loyalty' | 'manual';
  sourceId: string;
  grantedAt: string;
}

interface LoyaltyTier {
  tierId: string;
  tenantId: string;
  userId: string;
  level: number;
  label: string;
  pointsRequired: number;
  currentPoints: number;
  perks: string[];
}

interface FeedItem {
  id: string;
  tenantId: string;
  userId: string;
  kind: 'brief' | 'mission' | 'nba' | 'recommendation' | 'alert' | 'achievement' | 'insight' | 'community';
  title: string;
  body: string;
  priority: number;
  score: number;
  readAt?: string;
  dismissedAt?: string;
  metadata?: Record<string, unknown>;
}

interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  channel: 'in_app' | 'email' | 'push';
  title: string;
  body: string;
  read: boolean;
  sentAt: string;
  correlationId: string;
}

interface MorningBrief {
  id: string;
  tenantId: string;
  userId: string;
  date: string;
  summary: string;
  missions: Mission[];
  nbaPreview: NextBestAction[];
  insights: string[];
  generatedAt: string;
}

interface EveningReview {
  id: string;
  tenantId: string;
  userId: string;
  date: string;
  completedMissions: number;
  pointsEarned: number;
  streakStatus: string;
  tomorrowPreview: string;
  generatedAt: string;
}

interface PersonalAiPersona {
  tenantId: string;
  modelVersion: string;
  preferences: Record<string, unknown>;
  segmentWeights: Record<string, number>;
  learningSnapshot: string;
  lastOptimizedAt: string;
}

interface ChurnScore {
  tenantId: string;
  userId: string;
  risk: number;
  factors: { name: string; weight: number }[];
  computedAt: string;
}

interface GrowthLoopState {
  tenantId: string;
  userId: string;
  phase: string;
  cycleId: string;
  enteredAt: string;
  metadata?: Record<string, unknown>;
}

interface AnalyticsFact {
  id: string;
  tenantId: string;
  kpiId: string;
  window: string;
  value: number;
  dimensions?: Record<string, string>;
  recordedAt: string;
}
```

---

## 37.4 Anti-Duplication Rules

| Rule | Requirement | Violation |
|---|---|---|
| **DM-1** | User identity owned by Tenant/Auth — Growth stores `userId` reference only | **FAIL** if Growth creates users |
| **DM-2** | Billing transactions owned by Billing — Growth reads via events/SDK | **FAIL** if Growth writes `billing.transactions` |
| **DM-3** | Revenue metrics owned by Revenue — Growth consumes via `revenue.usage.recorded` | **FAIL** if Growth duplicates revenue rollups |
| **DM-4** | Learning models owned by Learning — Growth stores `PersonalAiPersona` projection only | **FAIL** if Growth trains or stores model weights |
| **DM-5** | Foreign recommendations arrive via adapters (§32.6) — one canonical `Recommendation` per logical action | **FAIL** if adapter writes directly to Feed |
| **DM-6** | MissionExecution is append-only — never mutate completed executions | **FAIL** if execution records are updated post-complete |
| **DM-7** | AnalyticsFact is derived — single writer (`growth.analytics`); no module writes KPI facts directly | **FAIL** if mission/habit modules write analytics tables |

---

## 37.5 Entity Relationship Diagram

```
┌──────────┐       1:1        ┌────────────────┐
│   User   │─────────────────►│ GrowthProfile  │
└──────────┘                  └───────┬────────┘
                                      │ 1:1
                                      ▼
                               ┌──────────────┐
                               │   Journey    │
                               └──────┬───────┘
                                      │ 1:N
                                      ▼
                               ┌──────────────┐      1:N     ┌───────────────────┐
                               │    Habit     │─────────────►│     Mission       │
                               └──────────────┘              └─────────┬─────────┘
                                                                      │ 1:N
                                                                      ▼
                                                            ┌───────────────────┐
                                                            │ MissionExecution  │
                                                            └─────────┬─────────┘
                                                                      │ triggers
                                                                      ▼
┌─────────────────┐    N:1    ┌──────────────┐    N:1    ┌─────────────────────┐
│ Recommendation  │◄──────────│   FeedItem   │──────────►│   Notification      │
│   (canonical)   │           └──────────────┘           └─────────────────────┘
└────────┬────────┘
         │ sources (read-only)
         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ LearningModel   │     │ BillingTransaction│     │  RevenueMetric  │
│  (projection)   │     │    (read-only)    │     │   (read-only)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘

        Reward ──► LoyaltyTier          ChurnScore ──► GrowthLoopState ──► AnalyticsFact
              MorningBrief / EveningReview ──► PersonalAI Persona
```

---

## 37.6 Domain Module → SDK Namespace Mapping

| Domain Module | Path | SDK Namespace | Primary Entities |
|---|---|---|---|
| `profileEngine` | `growth/profile/` | `sdk.growth.profile` | GrowthProfile |
| `journeyEngine` | `growth/journey/` | `sdk.growth.journey` | Journey, ChurnScore |
| `habitEngine` | `growth/habit/` | `sdk.growth.habit` | Habit, GrowthLoopState |
| `missionEngine` | `growth/mission/` | `sdk.growth.mission` | Mission, MissionExecution |
| `rewardEngine` | `growth/reward/` | `sdk.growth.loyalty` | Reward, LoyaltyTier |
| `recommendationEngine` | `growth/recommendation/` | `sdk.growth.recommendation` | Recommendation |
| `feedEngine` | `growth/feed/` | `sdk.growth.feed` | FeedItem |
| `notificationEngine` | `growth/notification/` | `sdk.growth.notification` | Notification |
| `briefEngine` | `growth/brief/` | `sdk.growth.brief` | MorningBrief, EveningReview |
| `personalizationEngine` | `growth/personalization/` | internal | PersonalAiPersona |
| `brainEngine` | `growth/brain/` | `sdk.growth.nba`, `sdk.growth.coach` | GrowthLoopState, NBA |
| `analyticsAdapter` | `growth/analytics/` | `sdk.growth.analytics` | AnalyticsFact |
| `dashboardComposer` | `growth/dashboard/` | `sdk.growth.dashboard` | read-only aggregate |
| `referralEngine` | `growth/referral/` | `sdk.growth.referral` | Referral (extends Reward) |

---

## 37.7 Cross-Engine Read Policy

| Foreign System | Permitted Read | Forbidden | Access Pattern |
|---|---|---|---|
| **Analytics Engine** | Aggregates, funnels, insights | Raw event store mutation | `analyticsEngine.getInsight()` read API |
| **Learning Engine** | Model version, segment weights | Model files, training data | `learning.model.updated` event → projection |
| **Billing Engine** | Credits, entitlements, transactions | Payment instruments | `billingEngine.checkCredits()` + events |
| **Revenue Engine** | Usage metrics, forecasts | Revenue ledger writes | `revenue.usage.recorded` event |
| **Workflow Engine** | Execution status | Workflow definitions mutation | Events + `sdk.workflow` read |
| **Application Engine** | Installed apps catalog | App runtime state | Events + `sdk.application` read |
| **Integration Engine** | Connector status | Credential vault | `sdk.integrations` read |
| **Knowledge Engine** | Articles for brief/coach | Knowledge graph writes | `sdk.knowledge` read |
| **Tenant Engine** | User, quota, plan | User creation | `runtime.tenants` validate + read |

**Absolute rule:** No `pool.query` against non-Growth tables inside `backend/lib/aivos/growth/`. **Violation = FAIL** (reinforces §30).''',

r'''# 38. GROWTH UX BLUEPRINT

**Status:** DESIGN ONLY — canonical wireflows for Web, iOS, Android, and Embed.

**Purpose:** Bind §31 screen contracts to daily user journeys. Every screen MUST map to a wireflow step. **Violation = FAIL** if a shipped screen lacks wireflow mapping and empty/loading/error contract.

---

## 38.1 Primary Daily Wireflow

Canonical proactive loop (production default):

```
Launch → Morning Brief → Today's Mission → One-Click Execute → Reward → Next Best Action
  → Dashboard → Evening Summary → Tomorrow Mission → Repeat
```

| Step | Wireflow ID | Primary Screen (§31) | SDK Entry | Exit Event |
|---|---|---|---|---|
| 1 | `WF.LAUNCH` | Feed (home) | `sdk.growth.feed.list` | `user.login` |
| 2 | `WF.BRIEF` | DailyBrief / Feed card | `sdk.growth.brief.morning` | `growth.brief.generated` |
| 3 | `WF.MISSION` | Mission | `sdk.growth.mission.list` | `growth.mission.assigned` |
| 4 | `WF.EXECUTE` | Mission / NBA | One-Click Execute (§38.3) | `workflow.completed` |
| 5 | `WF.REWARD` | Reward | `sdk.growth.loyalty.getBalance` | `growth.reward.granted` |
| 6 | `WF.NBA` | NBA | `sdk.growth.nba.get` | `growth.nba.executed` |
| 7 | `WF.DASHBOARD` | Dashboard | `sdk.growth.dashboard.get` | — |
| 8 | `WF.EVENING` | DailyBrief (evening tab) | `sdk.growth.brief.evening` | `growth.brief.generated` |
| 9 | `WF.TOMORROW` | Mission (scheduled) | `sdk.growth.mission.list` | `growth.mission.assigned` |
| 10 | `WF.REPEAT` | Feed | loop reset | `growth.loop.cycle.completed` |

**Narrative:** User opens app → Morning Brief card pinned on Feed → accepts today's Mission → One-Click Execute runs linked Workflow/Application → Reward animation → NBA suggests next action → optional Dashboard check-in → Evening Summary → tomorrow's Mission pre-staged → cycle repeats (§33.1).

---

## 38.2 Screen-to-Wireflow Mapping (§31)

| Screen ID (§31) | Route | Wireflow Steps | Home? |
|---|---|---|---|
| `Feed` | `/growth` | LAUNCH, BRIEF (card), REPEAT | **YES** |
| `Dashboard` | `/growth/dashboard` | DASHBOARD | |
| `Mission` | `/growth/missions` | MISSION, EXECUTE, TOMORROW | |
| `Reward` | `/growth/rewards` | REWARD | |
| `Notification` | `/growth/notifications` | LAUNCH (badge) | |
| `DailyBrief` | `/growth/brief` | BRIEF, EVENING | |
| `Marketplace` | `/growth/marketplace` | NBA (install actions) | |
| `Profile` | `/growth/profile` | LAUNCH (settings) | |
| `Wallet` | `/growth/wallet` | REWARD (billing read) | |
| `Journey` | `/growth/journey` | DASHBOARD (journey widget) | |
| `Coach` | `/growth/coach` | BRIEF, NBA | |
| `Referral` | `/growth/referral` | REWARD | |
| `Community` | `/growth/community` | — (secondary) | |
| `NBA` | `/growth/actions` | NBA, EXECUTE | |

---

## 38.3 One-Click Execute Contract

**Purpose:** Single-tap mission/recommendation execution without navigation churn.

```typescript
interface OneClickExecuteRequest {
  tenantId: string;
  userId: string;
  sourceType: 'mission' | 'recommendation' | 'nba';
  sourceId: string;
  correlationId: string;
  evidence?: Record<string, unknown>;
}

interface OneClickExecuteResult {
  ok: boolean;
  executionId: string;
  outcome: 'completed' | 'delegated' | 'failed' | 'confirmation_required';
  missionResult?: MissionResult;
  rewardGranted?: Reward;
  nbaFollowUp?: NextBestAction[];
  deeplink?: string;
  error?: { code: string; message: string; retryable: boolean };
}
```

**Flow:**

```
User tap "Execute"
  → sdk.growth.mission().complete(ctx, missionId, evidence)
     OR sdk.growth.nba().accept(ctx, actionId)
     OR sdk.growth.recommendation().accept(ctx, recommendationId)
  → Growth resolves action.target (workflow | application | integration | coach)
  → If autoExecute && permissions pass → delegate to sdk.workflow / sdk.application
  → On success → rewardEngine.grant → feed refresh → NBA re-rank
  → Return OneClickExecuteResult
```

**Rules:**

1. Max **1** auto-execute per loop cycle (§32.5).
2. `billing.*` recommendations NEVER auto-execute — `confirmation_required`.
3. Optimistic UI: show `executing` state; rollback on `ok: false`.
4. Every execute audited with `entityType: growth_one_click_execute`.
5. **Violation = FAIL** if execute bypasses SDK or Governance policy check.

---

## 38.4 Secondary Navigation

**Feed remains canonical home** (§31.4). Secondary shell uses **5 tabs**:

```
┌─────────┬───────────┬──────────┬─────────┬─────────┐
│  Feed   │ Missions  │ Actions  │ Rewards │  More   │
│  (home) │           │  (NBA)   │         │         │
└─────────┴───────────┴──────────┴─────────┴─────────┘
                              │
                    More ► Brief, Dashboard, Journey, Coach,
                           Profile, Referral, Marketplace,
                           Wallet, Notifications, Community
```

| Tab | Route | Badge Rule |
|---|---|---|
| Feed | `/growth` | Unread feed items |
| Missions | `/growth/missions` | Active mission count |
| Actions (NBA) | `/growth/actions` | Non-deferred NBA count |
| Rewards | `/growth/rewards` | — |
| More | drawer | Notification unread |

---

## 38.5 Empty / Loading / Error States

| Screen | Loading | Empty | Error |
|---|---|---|---|
| Feed | Skeleton cards (3) | "Your feed is clear — check back after your morning brief" + CTA Brief | Banner + retry; correlation ID |
| Dashboard | Widget skeletons | "Complete a mission to see your dashboard" + CTA Missions | Partial render with failed widget badges |
| Mission | List skeleton | "No missions today" + CTA NBA | Retry; preserve tab selection |
| Reward | Balance skeleton | "Start a mission to earn rewards" + CTA Missions | Retry |
| NBA | Action card skeleton | "You're all caught up" illustration | Retry |
| DailyBrief | Brief skeleton | "Brief not ready yet" + schedule hint | Retry; fall back to Feed |
| Notification | Row skeleton | "No notifications" | Retry |
| Coach | Message placeholder | "Ask your business coach anything" + prompts | Session error + restart |
| Journey | Timeline skeleton | "Your journey begins with onboarding" + CTA | Retry |
| Profile | Form skeleton | N/A (always has profile or create) | Retry |

**Global rules (§31.3):** `growth_disabled` → all screens empty with explanation. Tenant mismatch → full-screen 403. Stale-while-revalidate on Feed and Dashboard.

---

## 38.6 Platform Parity Matrix

| Capability | Web | iOS | Android | Embed |
|---|---|---|---|---|
| Feed-as-home | Y | Y | Y | Y |
| Morning Brief card | Y | Y | Y | N (widget optional) |
| One-Click Execute | Y | Y | Y | Y |
| Push notifications | N | Y | Y | N |
| Deep links | Y | Y | Y | Y |
| Offline cached Feed | N | Y (read) | Y (read) | N |
| Biometric re-auth | N | Y | Y | N |
| Coach voice input | N | Y | Y | N |
| Haptic reward feedback | N | Y | Y | N |
| Dashboard widgets | Y | Y | Y | partial |

**Violation = FAIL** if Web and mobile diverge on One-Click Execute result shape or NBA ranking.

---

## 38.7 Deep Link Schema

**Scheme:** `aqond://growth/{resource}/{id}?{params}`

| Pattern | Maps To | Example |
|---|---|---|
| `aqond://growth/feed` | Feed (home) | `aqond://growth/feed` |
| `aqond://growth/missions` | Mission list | `aqond://growth/missions` |
| `aqond://growth/missions/{id}` | Mission detail + execute | `aqond://growth/missions/m_abc123` |
| `aqond://growth/actions` | NBA screen | `aqond://growth/actions` |
| `aqond://growth/actions/{id}` | Pre-selected NBA | `aqond://growth/actions/nba_xyz` |
| `aqond://growth/recommendations/{id}` | Recommendation accept | `aqond://growth/recommendations/rec_456` |
| `aqond://growth/brief/morning` | Morning brief | `aqond://growth/brief/morning` |
| `aqond://growth/brief/evening` | Evening review | `aqond://growth/brief/evening` |
| `aqond://growth/rewards` | Reward screen | `aqond://growth/rewards` |
| `aqond://growth/dashboard` | Dashboard | `aqond://growth/dashboard` |
| `aqond://growth/journey` | Journey | `aqond://growth/journey` |
| `aqond://growth/coach` | Coach | `aqond://growth/coach?prompt=revenue` |
| `aqond://growth/notifications/{id}` | Notification detail | `aqond://growth/notifications/n_789` |
| `aqond://growth/referral` | Referral | `aqond://growth/referral` |
| `aqond://growth/marketplace` | Marketplace | `aqond://growth/marketplace` |

**HTTP equivalents:** `/growth/...` paths from §31.1. Deep links MUST resolve to the same screen state shapes.''',

r'''# 39. GROWTH KPI SPECIFICATION

**Path:** `backend/lib/aivos/growth/analytics/kpiEngine.js`

**Principle:** All Growth KPIs are **derived** from canonical events (§30) into `AnalyticsFact` records (§37). No module computes KPIs locally. **Violation = FAIL** if a KPI is computed outside `growth/analytics/`.

---

## 39.1 KPI Catalog (15 KPIs)

| KPI ID | Name | Formula | Source Events | Owner |
|---|---|---|---|---|
| **KPI-DAU** | Daily Active Users | `COUNT(DISTINCT userId) WHERE event IN (login, mission.start, feed.read) per calendar day` | `user.login`, `growth.mission.assigned`, `growth.feed.item.created` | Growth Analytics |
| **KPI-WAU** | Weekly Active Users | `COUNT(DISTINCT userId) over rolling 7d` | Same as DAU | Growth Analytics |
| **KPI-MAU** | Monthly Active Users | `COUNT(DISTINCT userId) over rolling 30d` | Same as DAU | Growth Analytics |
| **KPI-RET-D1** | Retention Day 1 | `users active on day+1 / new users on day0` | `user.login`, `tenant.created` | Growth Analytics |
| **KPI-RET-D7** | Retention Day 7 | `users active on day+7 / cohort day0` | `user.login` | Growth Analytics |
| **KPI-RET-D30** | Retention Day 30 | `users active on day+30 / cohort day0` | `user.login` | Growth Analytics |
| **KPI-MCR** | Mission Completion Rate | `missions completed / missions assigned` per window | `growth.mission.assigned`, `growth.mission.completed` | Growth Analytics |
| **KPI-AVG-SESS** | Average Session Duration | `AVG(logout.timestamp - login.timestamp)` | `user.login`, `user.logout` | Growth Analytics |
| **KPI-FCTR** | Feed CTR | `feed items clicked / feed items impressed` | `growth.feed.item.created`, feed read events | Growth Analytics |
| **KPI-RAR** | Recommendation Acceptance Rate | `recommendations accepted / recommendations generated` | `growth.recommendation.generated`, `growth.recommendation.accepted` | Growth Analytics |
| **KPI-AAR** | Automation Acceptance Rate | `automation suggestions accepted / presented` | `growth.nba.presented`, `growth.nba.executed` | Growth Analytics |
| **KPI-RPU** | Revenue Per User | `SUM(revenue.usage) / MAU` | `revenue.usage.recorded`, KPI-MAU | Revenue + Growth |
| **KPI-LTV** | Lifetime Value | `SUM(billing.paid) / cohort users` over lifetime | `billing.paid`, `purchase.completed` | Revenue + Growth |
| **KPI-HS** | Habit Score | `AVG(streak_days / target_streak) * 100` per active habit | `growth.habit.recorded`, `growth.habit.streak.milestone` | Growth Analytics |
| **KPI-JP** | Journey Progress | `AVG(stage_index / total_stages) * 100` | `growth.journey.advanced` | Growth Analytics |

---

## 39.2 KPI Computation Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     ACP Event Bus (§30)                           │
└────────────┬─────────────────────────────────────────────────────┘
             │ growth.* + user.* + billing.* + revenue.*
             ▼
┌────────────────────────┐     rollup      ┌─────────────────────┐
│  growth/analytics/     │ ───────────────►│  AnalyticsFact      │
│  kpiEngine.js          │                 │  (growth store)     │
│  (single writer)       │                 └──────────┬──────────┘
└────────────────────────┘                            │
             │                                          │
             │ emit                                     ▼
             ▼                               ┌─────────────────────┐
  growth.analytics.kpi.updated               │  Exporters (§39.3)  │
                                             └─────────────────────┘
```

**Schedule:** Real-time for DAU/session; hourly for rates; daily for retention/LTV.

---

## 39.3 KPI Exposure

| Surface | KPIs Exposed | Access |
|---|---|---|
| **Dashboard** (`/growth/dashboard`) | DAU, MCR, HS, JP, loop metrics | `sdk.growth.dashboard` |
| **Morning/Evening Brief** | MCR, HS, personalized delta | `sdk.growth.brief` |
| **SDK** | All via `sdk.growth.analytics().getKpis()` | Authenticated ctx |
| **Admin** | Full catalog + alerts | Tenant admin role |
| **Revenue bridge** | RPU, LTV | Read-only to Revenue dashboards |

---

## 39.4 `KpiSnapshot` Interface

```typescript
interface KpiSnapshot {
  tenantId: string;
  window: '1d' | '7d' | '30d' | '90d';
  computedAt: string;
  kpis: {
    dau: number;
    wau: number;
    mau: number;
    retentionD1: number;
    retentionD7: number;
    retentionD30: number;
    missionCompletionRate: number;
    avgSessionSeconds: number;
    feedCtr: number;
    recommendationAcceptanceRate: number;
    automationAcceptanceRate: number;
    rpu: number;
    ltv: number;
    habitScore: number;
    journeyProgress: number;
  };
  deltas?: Partial<Record<keyof KpiSnapshot['kpis'], number>>;
  alerts?: KpiAlert[];
}

interface KpiAlert {
  kpiId: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  threshold: number;
  actual: number;
}
```

---

## 39.5 Healthy Targets & Alert Thresholds

| KPI ID | Healthy Target | Warning | Critical |
|---|---|---|---|
| KPI-DAU | ≥ prior week +5% | −10% WoW | −25% WoW |
| KPI-RET-D1 | ≥ 40% | < 30% | < 20% |
| KPI-RET-D7 | ≥ 25% | < 18% | < 12% |
| KPI-RET-D30 | ≥ 15% | < 10% | < 6% |
| KPI-MCR | ≥ 60% | < 45% | < 30% |
| KPI-AVG-SESS | ≥ 180s | < 120s | < 60s |
| KPI-FCTR | ≥ 15% | < 10% | < 5% |
| KPI-RAR | ≥ 20% | < 12% | < 6% |
| KPI-AAR | ≥ 30% | < 20% | < 10% |
| KPI-RPU | tenant-defined | −15% MoM | −30% MoM |
| KPI-LTV | tenant-defined | −10% QoQ | −20% QoQ |
| KPI-HS | ≥ 70 | < 50 | < 30 |
| KPI-JP | ≥ 50% | < 35% | < 20% |

Alerts emit `growth.analytics.kpi.updated` with `alerts[]` populated. Critical alerts trigger Coach notification for tenant admins.

---

## 39.6 KPI ↔ Growth Loop Mapping (§33)

| Loop Step (§33.1) | Primary KPIs | Loop Metric (§33.6) |
|---|---|---|
| Open App | KPI-DAU, KPI-AVG-SESS | `loop.cycle.started` |
| Morning Brief | KPI-FCTR | `loop.brief.viewed` |
| Mission | KPI-MCR | `loop.mission.accepted`, `loop.mission.completed` |
| Execute | KPI-AAR | — |
| Reward | KPI-HS | `loop.reward.granted` |
| Analytics | All KPIs | `growth.analytics.kpi.updated` |
| Learning | KPI-RAR | — |
| Recommendation | KPI-RAR | `loop.recommendation.accepted` |
| New Mission | KPI-MCR, KPI-JP | — |
| Evening Review | KPI-DAU (return) | `loop.review.completed` |
| Tomorrow Brief | KPI-RET-D1 | — |
| Full Cycle | KPI-HS, KPI-JP | `loop.cycle.completed` |''',

r'''# 40. PRODUCTION SPRINT PLAN

**Principle:** Phase 20 ships in **5 production sprints** with cumulative test gates. No sprint closes without its exit criteria and regression slice. **Violation = FAIL** to advance sprint N+1 if sprint N exit criteria unmet.

---

## 40.1 Sprint Overview

| Sprint | Focus Modules | New Tests | Cumulative Tests | Duration |
|---|---|---|---|---|
| **20.1** | Runtime, Feed, Habit, Mission, Recommendation Aggregator | GRW01–GRW08, GRW17, GRW20, GRW22 | 361/375 | 2 weeks |
| **20.2** | Reward, Loyalty, Journey, Notification, Daily Brief | GRW04–GRW07, GRW18, GRW21 | 368/375 | 2 weeks |
| **20.3** | Coach AI, NBA, Personal AI, Dashboard, Analytics/KPI | GRW09–GRW10, GRW19, GRW24 | 372/375 | 2 weeks |
| **20.4** | SDK, HTTP API, Marketplace/Application/Tenant Integration | GRW11–GRW16 | 375/375 | 2 weeks |
| **20.5** | Full Regression, Load Test, Production Readiness, Docs, RC | regression + load | 375/375 PASS | 1 week |

---

## 40.2 Sprint 20.1 — Foundation

**Modules:** `growth/index.js`, `feedEngine`, `habitEngine`, `missionEngine`, `recommendation/adapters/`

| Deliverable | Exit Artifact |
|---|---|
| `createGrowthEngine()` DI attachment | `runtime.growth` stub + flag OFF |
| Feed ranking (§33.4) | GRW08 PASS |
| Habit streak engine (§33.3) | GRW05 PASS |
| Mission lifecycle (§10) | GRW06 PASS |
| Recommendation aggregator (§32.5) | GRW20 PASS |
| Domain model enforcement (§37) | GRW22 PASS |

**Exit criteria:**

- [ ] `AIVOS_GROWTH_ENABLED=0` → 503 stub on all routes
- [ ] GRW01–GRW08 PASS
- [ ] GRW17, GRW20, GRW22 PASS
- [ ] 351/351 Phases 1–19 regression unchanged
- [ ] No kernel imports in `growth/`

---

## 40.3 Sprint 20.2 — Engagement Core

**Modules:** `rewardEngine`, `loyaltyEngine`, `journeyEngine`, `notificationEngine`, `briefEngine`, `eventBridge`

| Deliverable | Exit Artifact |
|---|---|
| Reward ledger (append-only) | GRW07 PASS |
| Journey FSM (§10) | GRW04 PASS |
| Event bridge (§30) | GRW18 PASS |
| Morning/evening brief | brief routes live |
| Notification dispatch | GRW notification coverage |

**Exit criteria:**

- [ ] GRW04, GRW07, GRW18, GRW21 PASS
- [ ] Inbound event catalog ≥ 24 types handled
- [ ] Outbound `growth.*` events emitted per §30.3
- [ ] Cumulative 368/375 tests PASS

---

## 40.4 Sprint 20.3 — Intelligence Layer

**Modules:** `brainEngine`, `coachEngine`, `nbaEngine`, `personalizationEngine`, `dashboardComposer`, `analytics/kpiEngine`

| Deliverable | Exit Artifact |
|---|---|
| Coach AI (Orchestrator delegate) | coach routes |
| NBA ranking (§32.5) | NBA routes |
| Personal AI per tenant (§33.5) | personalization store |
| Dashboard composer | GRW09 PASS |
| KPI engine (§39) | GRW10, GRW24 PASS |

**Exit criteria:**

- [ ] GRW09, GRW10, GRW19, GRW24 PASS
- [ ] All 15 KPIs computable in staging
- [ ] Loop FSM complete (§33.2)
- [ ] Cumulative 372/375 tests PASS

---

## 40.5 Sprint 20.4 — Integration Surface

**Modules:** `sdk/growth/*`, `routes.js`, Marketplace/Application/Tenant wiring

| Deliverable | Exit Artifact |
|---|---|
| Growth SDK (§29) — 14 namespaces | GRW17 PASS |
| HTTP API (§6) — all routes | GRW11 PASS |
| Application install → mission seed | integration test |
| Tenant created → profile seed | integration test |
| Marketplace package → recommendation | adapter test |

**Exit criteria:**

- [ ] GRW11–GRW16 PASS
- [ ] Skills use SDK only (§29.16) verified
- [ ] Full E2E GRW16 PASS
- [ ] Cumulative **375/375** tests PASS

---

## 40.6 Sprint 20.5 — Production Readiness

**Activities:** Full regression, load test, documentation, release candidate

| Activity | Target |
|---|---|
| Full `aivos*.test.js` regression | 375/375 PASS |
| Load test — 10k users churn batch | < 30s (§25) |
| Load test — Feed P95 | < 200ms |
| `PHASE20_GROWTH_REPORT.md` | Delivered |
| `sdk/growth/CHANGELOG.md` | Delivered |
| Feature flag rollout plan (§20) | Documented |
| RC tag | `v20.0.0-rc.1` |

**Exit criteria:**

- [ ] 375/375 PASS (zero regressions)
- [ ] Architecture validation checklist (§43) — all items checked
- [ ] Security review sign-off
- [ ] RC deployed to staging with `AIVOS_GROWTH_ENABLED=1` pilot tenant

---

## 40.7 Sprint Dependency Graph

```
                    ┌─────────────┐
                    │  Sprint 20.1 │
                    │  Foundation  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │ Sprint   │ │ Sprint   │ │  (parallel   │
        │  20.2    │ │  20.3   │ │   after 20.1)│
        │ Engage   │ │ Intel    │ └──────────────┘
        └────┬─────┘ └────┬─────┘
             │            │
             └─────┬──────┘
                   ▼
            ┌─────────────┐
            │  Sprint 20.4 │
            │  Integration │
            └──────┬──────┘
                   ▼
            ┌─────────────┐
            │  Sprint 20.5 │
            │  RC / Prod   │
            └─────────────┘
```

**Rule:** 20.2 and 20.3 may overlap after 20.1 exit. 20.4 requires both 20.2 and 20.3 exit. 20.5 requires 20.4 exit.''',

r'''# 41. UPDATED DELIVERABLES INDEX (v1.2)

Phase 20 deliverables extended from 33 → **37** with v1.2 additions:

| # | Deliverable | Section | Status |
|---|---|---|---|
| 1 | Architecture Diagram | §1 | v1.0 |
| 2 | Folder Structure | §2 | v1.0 |
| 3 | Dependency Graph | §3 | v1.0 |
| 4 | Data Flow | §4 | v1.0 |
| 5 | Runtime Integration | §5 | v1.0 |
| 6 | HTTP API Design | §6 | v1.0 |
| 7 | SDK Design (overview) | §7 | v1.0 — superseded by §29 |
| 8 | Data Models | §8 | v1.0 — extended by §37 |
| 9 | Sequence Diagrams | §9 | v1.0 |
| 10 | State Machines | §10 | v1.0 — extended by §33.2 |
| 11 | Feature Flags | §11 | v1.0 |
| 12 | Security Model | §12 | v1.0 |
| 13 | Permission Matrix | §13 | v1.0 |
| 14 | Tenant Isolation | §14 | v1.0 |
| 15 | Observability | §15 | v1.0 |
| 16 | Metrics | §16 | v1.0 — extended by §39 |
| 17 | Audit Strategy | §17 | v1.0 |
| 18 | Disaster Recovery | §18 | v1.0 |
| 19 | Scalability Plan | §19 | v1.0 |
| 20 | Production Deployment Plan | §20 | v1.0 — extended by §40 |
| 21 | Rollback Plan | §21 | v1.0 |
| 22 | Migration Plan | §22 | v1.0 |
| 23 | Testing Strategy | §23 | v1.0 — extended by §42 |
| 24 | Regression Strategy | §24 | v1.0 |
| 25 | Performance Targets | §25 | v1.0 |
| 26 | Risk Analysis | §26 | v1.0 |
| 27 | Architecture Validation Checklist | §27 | v1.0 — extended by §43 |
| 28 | Production Readiness Checklist | §28 | v1.0 |
| 29 | Growth SDK Contract | §29 | v1.1 |
| 30 | Growth Event Contract | §30 | v1.1 |
| 31 | Frontend/UI State Contract | §31 | v1.1 — extended by §38 |
| 32 | AI Recommendation Contract | §32 | v1.1 |
| 33 | Habit & Growth Loop Contract | §33 | v1.1 |
| **34** | **Growth Domain Model** | **§37** | **v1.2 NEW** |
| **35** | **Growth UX Blueprint** | **§38** | **v1.2 NEW** |
| **36** | **Growth KPI Specification** | **§39** | **v1.2 NEW** |
| **37** | **Production Sprint Plan** | **§40** | **v1.2 NEW** |

**Implementation files added by v1.2:**

```
backend/lib/aivos/growth/domain/
backend/lib/aivos/growth/analytics/kpiEngine.js
backend/lib/aivos/growth/brain/oneClickExecute.js
docs/growth/UX_BLUEPRINT.md
docs/growth/KPI_CATALOG.md
```''',

r'''# 42. UPDATED TESTING STRATEGY (v1.2)

Extends §35. All existing GRW01–GRW21 tests unchanged. Three new tests added.

## 42.1 GRW01–GRW21 (unchanged)

See §35.1 and §35.2 — no modifications permitted.

## 42.2 GRW22–GRW24 (v1.2 contract tests)

| ID | Description | Contract | Assertions |
|---|---|---|---|
| **GRW22** | Growth Domain Model | §37 | Ownership matrix enforced; DM-1–DM-7; no foreign store writes; entity hierarchy valid |
| **GRW23** | Growth UX Blueprint | §38 | Wireflow steps map to §31 screens; One-Click Execute contract; deep links resolve; empty/loading/error envelopes |
| **GRW24** | Growth KPI Specification | §39 | All 15 KPIs computable; KpiSnapshot shape; alert thresholds; single-writer kpiEngine; loop mapping |

## 42.3 Target

| Suite | Count |
|---|---|
| Phases 1–19 regression | 351 |
| Phase 20 GRW01–GRW16 | 16 |
| Phase 20 GRW17–GRW21 | 5 |
| Phase 20 GRW22–GRW24 | 3 |
| **Total** | **375/375 PASS** |

**Test file:** `backend/__tests__/aivosPhase20Growth.test.js` (GRW01–GRW24)

**Regression rule:** Run full `aivos*.test.js` before and after every Growth change. Zero modifications to existing 351 tests.''',

r'''# 43. UPDATED ARCHITECTURE VALIDATION CHECKLIST (v1.2)

Extends §36. Items marked **(v1.2)** are new requirements.

## 43.1 Architecture Validation (§27 additions)

- [ ] Runtime: additive growth attachment only
- [ ] No pipeline/orchestrator/kernel changes
- [ ] No existing engine contract changes
- [ ] No existing test modifications
- [ ] `AIVOS_GROWTH_ENABLED` default OFF
- [ ] One-way dependency Growth → AI-OS
- [ ] Tenant-scoped data
- [ ] GRW01–GRW24 defined **(v1.2)**
- [ ] 351/351 regression preserved
- [ ] `sdk.growth.*` — 14 sub-namespaces (§29) (v1.1)
- [ ] Skills use SDK only (§29.16) (v1.1)
- [ ] Growth SDK version `20.x.y` additive-only (§29.17) (v1.1)
- [ ] Cross-engine state via events only (§30) (v1.1)
- [ ] Inbound event catalog — 24+ types (§30.1) (v1.1)
- [ ] Outbound `growth.*` events (§30.3) (v1.1)
- [ ] Event bridge via `runtime.events` (§30.4) (v1.1)
- [ ] UI state shapes — 14 screens (§31) (v1.1)
- [ ] Feed is canonical home (§31.4) (v1.1)
- [ ] Recommendation schema enforced (§32.1) (v1.1)
- [ ] Recommendations via adapters only (§32.6) (v1.1)
- [ ] NBA aggregation rules (§32.5) (v1.1)
- [ ] Growth loop state machine (§33.2) (v1.1)
- [ ] Habit streak milestones — 7 tiers (§33.3) (v1.1)
- [ ] Work feed not social (§33.4) (v1.1)
- [ ] Personal AI per tenant (§33.5) (v1.1)
- [ ] Loop metrics via SDK/API (§33.6) (v1.1)
- [ ] **Entity ownership matrix — 20 entities (§37.2) (v1.2)**
- [ ] **Anti-duplication rules DM-1–DM-7 (§37.4) (v1.2)**
- [ ] **Cross-engine read policy enforced (§37.7) (v1.2)**
- [ ] **Primary daily wireflow — 10 steps (§38.1) (v1.2)**
- [ ] **One-Click Execute contract (§38.3) (v1.2)**
- [ ] **Deep link schema `aqond://growth/*` (§38.7) (v1.2)**
- [ ] **Platform parity Web/iOS/Android (§38.6) (v1.2)**
- [ ] **15 KPIs with KpiSnapshot interface (§39) (v1.2)**
- [ ] **KPI single-writer via kpiEngine (§39.2) (v1.2)**
- [ ] **KPI ↔ Loop mapping complete (§39.6) (v1.2)**
- [ ] **5-sprint production plan with exit criteria (§40) (v1.2)**

## 43.2 Production Readiness (§28 additions)

- [ ] GRW01–GRW24 PASS **(v1.2)**
- [ ] Regression >= 375/375 **(v1.2)**
- [ ] Architecture violations = 0
- [ ] Security (§12), Permissions (§13), Observability (§15)
- [ ] DR (§18), Rollback (§21), Performance (§25) verified
- [ ] `PHASE20_GROWTH_REPORT.md` delivered
- [ ] `sdk/growth/CHANGELOG.md` (§29.17) (v1.1)
- [ ] Event DLQ recovery tested (§30.4) (v1.1)
- [ ] Recommendation adapter coverage for §32.3 sources (v1.1)
- [ ] **Sprint 20.5 RC `v20.0.0-rc.1` staged (§40.6) (v1.2)**
- [ ] **Load test targets met (§25 + §40.6) (v1.2)**
- [ ] **`docs/growth/UX_BLUEPRINT.md` delivered (v1.2)**
- [ ] **`docs/growth/KPI_CATALOG.md` delivered (v1.2)**

---

**Phase 20 SPEC v1.2 — Domain Model, UX Blueprint, KPI Specification, and Sprint Plan complete.**''']


def main() -> None:
    body = "\n\n".join(SECTIONS)
    OUT.write_text(body + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(body)} bytes, {len(SECTIONS)} sections)")


if __name__ == "__main__":
    main()
