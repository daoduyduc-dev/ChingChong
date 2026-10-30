# Client/server workspace design

Approved in chat on 29/10/2026. Work directly in the existing checkout and preserve uncommitted fixes and database contents.

- `client/`: React sources, public assets, HTML, Vite config, frontend dependencies and TypeScript config. Build output is `client/dist/`.
- `server/`: backend `src/`, Prisma, backend dependencies, TypeScript config, `.env` and `.env.example`. Explicit environment loading works from the root and workspace commands; shell environment takes precedence.
- Root: npm workspaces, one lockfile, shared code, integration/E2E tests, scripts, deployment configuration and documentation.
- Development/preview FE port 5174 proxies HTTP and WebSocket to BE 3002. Root commands orchestrate workspace commands without JavaScript shell quoting.
- No database reset or cloud schema change. Keep existing shared game rules, APIs, offline AI and tick fix unchanged.
- Verify workspace dependency install, generation, separate typechecks, build, lint, full isolated UTF-8 DB suite, and FE/BE browser smoke tests. Docker changes are validated statically unless an engine is available.
