# Public profiles, history and match operations

Approved in chat on 2026-10-29. Extend the existing React/Express/Prisma application with public profiles, fully browsable PvP history and read-only technical match administration.

Profile data is restricted to public identity and presence. Blocking and hidden history rules apply to every request. Original opponents retain access to shared records. Public history and replay must enforce the same access rule and exclude chat/session data.

Persist PUBLIC, PRIVATE, RANDOM and UNKNOWN match modes. Historic data uses UNKNOWN when its origin cannot be established reliably. AI remains browser-local. Pagination uses descending createdAt/id keysets with a bounded limit (maximum 50), items and nextCursor. Legacy unparameterized list responses remain arrays for compatibility. Filters execute before pagination on the server.

Admin users, reports, audit and matches are browsable using the same pagination convention. Match detail exposes clocks, version, turn, move counts, reconnect state, pending requests and timestamps, never arbitrary mutation of game results. Detail access writes an audit record.

Use focused frontend components, accessible controls, consistent cream/green styling, mobile layouts, cancellation guards and explicit loading/empty/error states. Verify privacy, filters, stable pagination and administrator authorization with local database integration tests and browser journeys. Preserve existing uncommitted work. Cloud migration is an explicit operational step documented in README.
