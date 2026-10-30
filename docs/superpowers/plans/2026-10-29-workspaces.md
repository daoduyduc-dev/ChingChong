# Client/server workspaces implementation plan

**Goal:** Implement the approved client/server structure while preserving application behavior.
**Architecture:** npm workspaces at client and server, root tooling and shared TypeScript source. Backend-only explicit environment loader and Prisma schema live under server.
**Spec:** ../specs/2026-10-29-workspaces-design.md
**Execution:** Inline in the authorized current checkout; no commits or independent worktrees required.

## Tasks

- [x] Move frontend sources/assets/config into client and backend source/schema/secrets into server; update relative shared/test imports.
- [x] Split dependency manifests, retain versions/overrides, update scripts and TypeScript configurations. Configure Vite HTTP/WebSocket proxy for dev and preview on 5174 -> 3002.
- [x] Update environment loading, Prisma CLI/test/maintenance scripts, E2E and Docker/proxy paths. Preserve all database data and earlier fixes.
- [x] Install workspaces and regenerate Prisma; run workspace typechecks, build, lint, UTF-8 DB regression tests and a browser smoke test.
- [x] Rewrite current README commands and folder map, record verification/limitations, and review the final diff.

## Verification

Run `npm install`, `npm run db:generate`, `npm run build`, `npm run lint`. Regression suite uses the existing dedicated local UTF-8 test database via DATABASE_URL override, never the cloud application database. Start workspace FE/BE and use Playwright to check health, AI and public-room flows. Existing tests are the regression contract for this structural change.

## Results

Install, Prisma generation, workspace/root typechecks, build, lint, lockfile npm-ci dry-run: passed. Root npm test uses TEST_DATABASE_URL, defaulting to dedicated local UTF-8 database rather than application DATABASE_URL: 65/65 passed. Full E2E against local UTF-8 backend and root preview workspace command: 8/8 passed. Root development command with Supabase: FE/BE health 200, public create 3501ms / join 3996ms in one browser smoke sample. Test runner rejects nonlocal TEST_DATABASE_URL before any DB connection. Reviewer findings (nested dist lint ignore and Docker base tsconfig) fixed. Docker execution unavailable because Docker is not installed.
