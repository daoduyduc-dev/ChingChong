# Profile, history and administration Implementation Plan

**Goal:** Deliver four approved missing functions with bounded database reads and privacy-preserving responses.

**Architecture:** Keyset-paginated Express read endpoints and Prisma mode metadata feed focused React screens. Existing game commands retain their current authorization and concurrency rules.

**Tech Stack:** React, TypeScript, Express, Prisma, PostgreSQL, Vitest, Playwright.

**Spec:** ../specs/2026-10-29-profile-history-admin-design.md

## Constraints

Maximum page size 50. Preserve arrays on legacy requests. UNKNOWN is the honest fallback for old mode metadata. No cloud migration during tests. No staging, commits or changes to unrelated work.

## Execution

Completed and verified. Results: ../../implementation/profile-history-admin-results.md. All five deliverables below are complete; no commit was created.

- [ ] Backend: add failing API assertions for profiles, hidden/blocked history, keyset pages, mode/date/result filters and sanitized admin match detail. Implement read routes and mode migration in server/prisma and server/src; propagate metadata in shared/domain.ts. Run the focused local suite.
- [ ] Frontend: extract HistoryView, PublicProfile and AdminView components from existing App responsibilities. Fetch limit=20 pages with stale-response guards, load-more controls and accessible filters. Integrate friend/search entry points and fetch authorized replay on demand.
- [ ] Browser verification: temporary local servers and test users exercise profile entry, history beyond one page, mode filters and admin match details at desktop/mobile sizes. Clean up only test-owned rows.
- [ ] Integration: inspect API contracts and indexes; run typecheck, lint, build, logic tests and UI journeys. Correct failures from their demonstrated causes.
- [ ] Documentation: explain modes, privacy, cursor endpoints, admin views and migration/run commands in README. Record exact verification results and deployment limits.
