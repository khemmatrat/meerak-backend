# AQOND Services — UI Theme Migration Plan

**Sprint:** 28 (Presentation Layer Only)
**Date:** 2026-06-30
**Status:** PLAN — no code until approved

## Objective

Migrate AQOND Services to AXS Theme V2 (Sprint 22-27). NOT a rewrite. NOT a feature sprint. Presentation layer only.

## Iron Rules

DO NOT: business logic, API, backend, database, events, state contracts, routing semantics, permissions.

DO: CSS/layout, @aqond/ui, token bridge, skeletons, shadow wrappers.

### Shadow Migration (mandatory)

Logic hook (unchanged) -> Theme wrapper (@aqond/ui) -> same behavior.

Example: useJobCardLogic() inside Card with tt-services-job-card class.

## Current State

| Product | Theme V2 | Location |
|---------|----------|----------|
| Food | Done Sprint 23 | storefront /m/food |
| Market shell | Done Sprint 27 | storefront /m |
| Rider | Done Sprint 24 | storefront /m/rider |
| Merchant | Done Sprint 25 | storefront /m/merchant |
| Admin break-glass | Done Sprint 26 | storefront /m/admin |
| **Services** | **Not started** | **mobile/ only today** |

Services modules in mobile:
- MatchJob: pages/Jobs.tsx, JobDetails.tsx, CreateJob.tsx, MyJobs.tsx, Payment.tsx
- Job Board: JobBoard.tsx, JobDetailAdvance.tsx, CreateJobAdvance.tsx, ManageAdvanceJob.tsx
- Booking: Talents.tsx, ExpertView.tsx, BeautyBookingFlow.tsx, MyBookings.tsx
- Video: VideoFeed.tsx, SavedVideoClips.tsx, PostCreate.tsx
- Create Job: WorkRoutingMatrix.tsx + create pages

Taxonomy: mobile/constants/workTaxonomy.ts (booking | match_job | jobboard | videofeed)

Do NOT edit mobile/ (no-touch-mobile.mdc). Port to storefront with shadow migration.

## Target Structure

aqond-v2/apps/storefront/
  app/m/services/layout.tsx + services-axs.css
  app/m/services/match/ board/ booking/ video/
  components/mobile/ServicesShell.tsx
  components/axs/services/AxsServicesLoading.tsx
  components/services/{match,board,booking,video}/
  lib/services/{matchJobApi,advanceJobApi,bookingApi,videoFeedApi}.ts
  hooks/services/use*.ts

## Route Mapping

/jobs -> /m/services/match
/jobs/:id -> /m/services/match/[id]
/create-job -> /m/services/match/create
/my-jobs -> /m/services/match/mine
/job-board -> /m/services/board
/job-board/:id -> /m/services/board/[id]
/create-job-advance -> /m/services/board/create
/talents -> /m/services/booking/talents
/video-feed -> /m/services/video

## Migration Priority

1. MatchJob (list, detail, create, mine, payment)
2. Job Board (list, detail, create, manage, chat)
3. Booking (directory, profile, flow, mine)
4. Video Hiring Feed (feed, saved, upload)
5. Create Job Flow (routing matrix)

## Per-Page Checklist

1. Read mobile source
2. Extract hook (hooks/services/)
3. Theme wrapper (components/services/)
4. Thin page.tsx + loading.tsx
5. StatusChip tone mapper
6. Visual + functional + API regression (payload diff = 0)

## Sprint 28 Phases

28a: layout, services-axs.css, ServicesShell, hub
28b-c: MatchJob
28d-e: Job Board
28f: Booking
28g: Video
28h: Create Job polish
28i: SERVICES_THEME_MIGRATION.md + regression

## Future Sprint 29 — Component Registry

AqondButton, AqondCard, AqondSheet, AqondDialog, AqondInput, AqondHeader, AqondNavbar, AqondSearch, AqondChip, AqondBadge, AqondTimeline, AqondStatus, AqondLoading, AqondSkeleton, AqondToast

Aliases over @aqond/ui for Brain, Pay, future products. NOT Sprint 28.

## Success Report

Business Logic Changed: 0
API Changed: 0
Database Changed: 0
Routes Changed (semantics): 0
Theme Migration: 100%
Backward Compatibility: 100%

