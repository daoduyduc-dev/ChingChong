# Implementation plan

1. Foundation: strict TypeScript, Prisma/PostgreSQL, security middleware, migration, scripts.
2. Auth/profile/friends: single session, refresh rotation, Guest, reset email, OAuth providers.
3. Core shared engine: 7 quân, self-check, stalemate, perpetual-check fixtures.
4. Room/Match service: serialized mutations, DB commit before broadcast, countdown, moves/clocks/reconnect.
5. Consent save/resume/draw/undo, notifications, replay/admin.
6. React responsive interface, room sharing/QR, chat/WebRTC.
7. Worker search, PWA cache, local save, offline verification.
8. Unit/integration/Playwright; report exact PASS/FAIL/BLOCKED/NOT RUN.

Local only. No GitHub push or public deployment. Requirements priority XN > scope > V2 > BA. No ELO/spectators/betting.
