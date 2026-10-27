# Requirement matrix — 15/10/2026

Trích 137 mã yêu cầu/quyết định từ toàn bộ SRS v3.0. Không có ELO, spectator, betting. Status IMPLEMENTED chỉ mô tả source; test PASS phải có kết quả thực thi. OAuth/SMTP/TURN/browser thật nằm trong blockers.md.

| Requirement ID | Module | Source files | Test cases/files | Trạng thái |
|---|---|---|---|---|
| AUTH-01 | Auth/profile | server/auth.ts, server/app.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AUTH-02 | Auth/profile | server/auth.ts, server/app.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | PARTIAL — xem blockers.md |
| AUTH-03 | Auth/profile | server/auth.ts, server/app.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AUTH-04 | Auth/profile | server/auth.ts, server/app.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AUTH-05 | Auth/profile | server/auth.ts, server/app.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | PARTIAL — xem blockers.md |
| AUTH-06 | Auth/profile | server/auth.ts, server/app.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AUTH-07 | Auth/profile | server/auth.ts, server/app.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AUTH-08 | Auth/profile | server/auth.ts, server/app.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AUTH-09 | Auth/profile | server/auth.ts, server/app.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AUTH-10 | Auth/profile | server/auth.ts, server/app.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AUTH-11 | Auth/profile | server/auth.ts, server/app.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| FRIEND-01 | Social | server/app.ts, server/game.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| FRIEND-02 | Social | server/app.ts, server/game.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| FRIEND-03 | Social | server/app.ts, server/game.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| FRIEND-04 | Social | server/app.ts, server/game.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| FRIEND-05 | Social | server/app.ts, server/game.ts, src/App.tsx | tests/auth.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| INV-01 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| INV-02 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| INV-03 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| INV-04 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| INV-05 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| INV-06 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| INV-07 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| INV-08 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| INV-09 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| ROOM-01 | Rooms/matchmaking | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| ROOM-02 | Rooms/matchmaking | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| ROOM-03 | Rooms/matchmaking | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| ROOM-04 | Rooms/matchmaking | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| ROOM-05 | Rooms/matchmaking | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| ROOM-06 | Rooms/matchmaking | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| ROOM-07 | Rooms/matchmaking | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| ROOM-08 | Rooms/matchmaking | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| ROOM-09 | Rooms/matchmaking | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RULE-01 | Core Xiangqi | shared/chess.ts, src/Board.tsx, server/game.ts | tests/chess.test.ts, tests/game.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RULE-02 | Core Xiangqi | shared/chess.ts, src/Board.tsx, server/game.ts | tests/chess.test.ts, tests/game.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RULE-03 | Core Xiangqi | shared/chess.ts, src/Board.tsx, server/game.ts | tests/chess.test.ts, tests/game.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RULE-04 | Core Xiangqi | shared/chess.ts, src/Board.tsx, server/game.ts | tests/chess.test.ts, tests/game.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RULE-05 | Core Xiangqi | shared/chess.ts, src/Board.tsx, server/game.ts | tests/chess.test.ts, tests/game.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RULE-06 | Core Xiangqi | shared/chess.ts, src/Board.tsx, server/game.ts | tests/chess.test.ts, tests/game.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RULE-07 | Core Xiangqi | shared/chess.ts, src/Board.tsx, server/game.ts | tests/chess.test.ts, tests/game.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| TIME-01 | Server clocks | server/game.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| TIME-02 | Server clocks | server/game.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| TIME-03 | Server clocks | server/game.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| TIME-04 | Server clocks | server/game.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| TIME-05 | Server clocks | server/game.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| TIME-06 | Server clocks | server/game.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| TIME-07 | Server clocks | server/game.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESULT-01 | Outcome/consent | server/game.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESULT-02 | Outcome/consent | server/game.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESULT-03 | Outcome/consent | server/game.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESULT-04 | Outcome/consent | server/game.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESULT-05 | Outcome/consent | server/game.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CONN-01 | Connection/session transfer | server/game.ts, server/app.ts, server/index.ts | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CONN-02 | Connection/session transfer | server/game.ts, server/app.ts, server/index.ts | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CONN-03 | Connection/session transfer | server/game.ts, server/app.ts, server/index.ts | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CONN-04 | Connection/session transfer | server/game.ts, server/app.ts, server/index.ts | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CONN-05 | Connection/session transfer | server/game.ts, server/app.ts, server/index.ts | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CONN-06 | Connection/session transfer | server/game.ts, server/app.ts, server/index.ts | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CONN-07 | Connection/session transfer | server/game.ts, server/app.ts, server/index.ts | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CONN-08 | Connection/session transfer | server/game.ts, server/app.ts, server/index.ts | tests/game.test.ts, tests/socket.test.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| SAVE-01 | Durable save | server/game.ts, prisma/schema.prisma | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| SAVE-02 | Durable save | server/game.ts, prisma/schema.prisma | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| SAVE-03 | Durable save | server/game.ts, prisma/schema.prisma | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| SAVE-04 | Durable save | server/game.ts, prisma/schema.prisma | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| SAVE-05 | Durable save | server/game.ts, prisma/schema.prisma | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| SAVE-06 | Durable save | server/game.ts, prisma/schema.prisma | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| SAVE-07 | Durable save | server/game.ts, prisma/schema.prisma | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| SAVE-08 | Durable save | server/game.ts, prisma/schema.prisma | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESUME-01 | Resume original players | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESUME-02 | Resume original players | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESUME-03 | Resume original players | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESUME-04 | Resume original players | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESUME-05 | Resume original players | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESUME-06 | Resume original players | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESUME-07 | Resume original players | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| RESUME-08 | Resume original players | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CHAT-01 | Chat | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CHAT-02 | Chat | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CHAT-03 | Chat | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CHAT-04 | Chat | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| CHAT-05 | Chat | server/game.ts, server/app.ts, src/App.tsx | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| VIDEO-01 | WebRTC | src/Video.tsx, server/app.ts, server/game.ts | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| VIDEO-02 | WebRTC | src/Video.tsx, server/app.ts, server/game.ts | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| VIDEO-03 | WebRTC | src/Video.tsx, server/app.ts, server/game.ts | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | PARTIAL — xem blockers.md |
| VIDEO-04 | WebRTC | src/Video.tsx, server/app.ts, server/game.ts | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| VIDEO-05 | WebRTC | src/Video.tsx, server/app.ts, server/game.ts | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| VIDEO-06 | WebRTC | src/Video.tsx, server/app.ts, server/game.ts | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | PARTIAL — xem blockers.md |
| VIDEO-07 | WebRTC | src/Video.tsx, server/app.ts, server/game.ts | tests/game.test.ts, tests/socket.test.ts, tests/e2e/journeys.spec.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AI-01 | Offline AI | shared/ai.ts, src/ai.worker.ts, src/local.ts, vite.config.ts | tests/chess.test.ts, tests/e2e/journeys.spec.ts, scripts/benchmark.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AI-02 | Offline AI | shared/ai.ts, src/ai.worker.ts, src/local.ts, vite.config.ts | tests/chess.test.ts, tests/e2e/journeys.spec.ts, scripts/benchmark.ts | PARTIAL — 3 mức/depth đã chạy; cảm nhận Khó chưa nghiệm thu |
| AI-03 | Offline AI | shared/ai.ts, src/ai.worker.ts, src/local.ts, vite.config.ts | tests/chess.test.ts, tests/e2e/journeys.spec.ts, scripts/benchmark.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AI-04 | Offline AI | shared/ai.ts, src/ai.worker.ts, src/local.ts, vite.config.ts | tests/chess.test.ts, tests/e2e/journeys.spec.ts, scripts/benchmark.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AI-05 | Offline AI | shared/ai.ts, src/ai.worker.ts, src/local.ts, vite.config.ts | tests/chess.test.ts, tests/e2e/journeys.spec.ts, scripts/benchmark.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AI-06 | Offline AI | shared/ai.ts, src/ai.worker.ts, src/local.ts, vite.config.ts | tests/chess.test.ts, tests/e2e/journeys.spec.ts, scripts/benchmark.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AI-07 | Offline AI | shared/ai.ts, src/ai.worker.ts, src/local.ts, vite.config.ts | tests/chess.test.ts, tests/e2e/journeys.spec.ts, scripts/benchmark.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AI-08 | Offline AI | shared/ai.ts, src/ai.worker.ts, src/local.ts, vite.config.ts | tests/chess.test.ts, tests/e2e/journeys.spec.ts, scripts/benchmark.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| AI-09 | Offline AI | shared/ai.ts, src/ai.worker.ts, src/local.ts, vite.config.ts | tests/chess.test.ts, tests/e2e/journeys.spec.ts, scripts/benchmark.ts | PARTIAL — xem blockers.md |
| NFR-01 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | PARTIAL — xem blockers.md |
| NFR-02 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| NFR-03 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | PARTIAL — xem blockers.md |
| NFR-04 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| NFR-05 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | PARTIAL — xem blockers.md |
| NFR-06 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| NFR-07 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| NFR-08 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| NFR-09 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | PARTIAL — xem blockers.md |
| NFR-10 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| NFR-11 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| NFR-12 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-01 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-02 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-03 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-04 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-05 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | PARTIAL — xem blockers.md |
| XN-06 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-07 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-08 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-09 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-10 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-11 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-12 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-13 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-14 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| XN-15 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | PARTIAL — xem blockers.md |
| XN-16 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | PARTIAL — xem blockers.md |
| BA-01 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| BA-02 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| BA-03 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| BA-04 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| BA-05 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| BA-06 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| BA-07 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | PARTIAL — xem blockers.md |
| BA-08 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| BA-09 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | PARTIAL — xem blockers.md |
| BA-10 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |
| BA-11 | Cross-cutting/decision | server/, shared/, src/, prisma/, docs/implementation/decisions.md | tests/, playwright.config.ts | IMPLEMENTED — tham chiếu evidence/tests, không đồng nghĩa nghiệm thu toàn môi trường |

## Các yêu cầu không có mã riêng

| Hạng mục | Source | Evidence/trạng thái |
|---|---|---|
| History, filters, statistics, replay, privacy | server/app.ts, src/App.tsx | tests/privacy.test.ts, journeys.spec.ts; PASS local |
| Admin accounts/reports/audit, no result editing | server/app.ts, scripts/admin.mjs, src/App.tsx | tests/admin.test.ts; PASS REST; journeys.spec.ts PASS Admin browser ban/unban QA target, profile privacy persistence, 390px (16/10) |
| Operational retention / full privacy deployment policy | docs/implementation/decisions.md | NOT RUN — cần chính sách môi trường vận hành |
| Room READY / Match PENDING preparation | shared/domain.ts, server/game.ts | Folded into confirmed seats + COUNTDOWN; no moves/clocks before countdown completes. BA implementation decision. |

## 71 acceptance scenarios

Mỗi scenario được truy vết riêng. Một test có thể kiểm tra nhiều TC; không diễn giải số test runner thành 71 test độc lập. PASS dưới đây là phạm vi local đã mô tả; device/NAT/network production vẫn chưa nghiệm thu. TC-009 chỉ kiểm tra phản hồi cấu hình thiếu, phần email thật BLOCKED.

| TC | Given/When | Expected Then | Tests | Trạng thái / phạm vi |
|---|---|---|---|---|
| TC-001 | Đăng ký thành công với username, email và password hợp lệ | Tạo đúng một User, không gửi OTP, cấp một phiên | tests/auth.test.ts | PASS — Local automated evidence |
| TC-002 | Đăng ký username đã tồn tại khác hoa/thường | Từ chối, không tạo User khác trùng canonical username | tests/auth.test.ts | PASS — Local automated evidence |
| TC-003 | Đăng ký email đã tồn tại | Từ chối, không tạo tài khoản mới | tests/auth.test.ts | PASS — Local automated evidence |
| TC-004 | Đăng nhập bằng username hoặc email | Cùng một accountId, một phiên hợp lệ | tests/auth.test.ts | PASS — Local automated evidence |
| TC-005 | Đăng nhập thiết bị B khi A đang đăng nhập | Phiên A bị revoke, phiên B là duy nhất | tests/auth.test.ts | PASS — Local automated evidence |
| TC-006 | Hai tab A/B cùng gửi move của một User | Chỉ current session/control token mới được ghi nước | tests/auth.test.ts; tests/socket.test.ts | PASS — Local automated evidence |
| TC-007 | Access token hết hạn khi đang chơi | Tự refresh hoặc yêu cầu đăng nhập lại an toàn, không nhân đôi nước | tests/auth.test.ts | PASS — Local automated evidence |
| TC-008 | Reset password bằng token đã dùng | Bị từ chối; password không bị đổi lần thứ hai | tests/auth.test.ts | PASS — Local automated evidence |
| TC-009 | Reset email chưa tồn tại | Thông báo trung tính, không lộ sự tồn tại email | tests/auth.test.ts | BLOCKED — SMTP chưa cấu hình; mailbox chưa kiểm chứng |
| TC-010 | Guest đổi sang User và chọn gộp phiên | Không ghi đè dữ liệu User sẵn có, giữ dữ liệu được phép | tests/auth.test.ts | PASS — Local automated evidence |
| TC-011 | Người dùng soft-delete khi còn saved match | Revoke phiên, khóa resume, quyền bên còn lại không bị chuyển thành thắng | tests/auth.test.ts; tests/privacy.test.ts | PASS — Local automated evidence |
| TC-012 | Đổi tên hiển thị lần hai trong 7 ngày | Từ chối; vẫn được trùng tên người khác | tests/auth.test.ts | PASS — Local automated evidence |
| TC-013 | Hai người gửi lời mời kết bạn chéo | Tự chuyển quan hệ ACCEPTED duy nhất | tests/auth.test.ts | PASS — Local automated evidence |
| TC-014 | B từ chối, A gửi lại ngay | Có thể gửi lại nếu chưa bị chặn/không vượt giới hạn chống spam | tests/auth.test.ts | PASS — Local automated evidence |
| TC-015 | A chặn B khi B gửi lời mời chơi/chat/video | Các tương tác trực tiếp bị từ chối | tests/auth.test.ts; tests/socket.test.ts | PASS — Local automated evidence |
| TC-016 | Hai Client join vào một phòng chỉ còn một ghế | Chỉ một join commit, không có 3 kỳ thủ | tests/game.test.ts; tests/e2e/journeys.spec.ts | PASS — Local automated evidence |
| TC-017 | Tạo room Public/Private | Public xuất hiện danh sách, Private không xuất hiện | tests/game.test.ts | PASS — Local automated evidence |
| TC-018 | Nhập mã 6 số sai/hết hiệu lực | Hiện lỗi thích hợp, không gia nhập nhầm phòng | tests/game.test.ts; tests/socket.test.ts | PASS — Local automated evidence |
| TC-019 | Nhấp URL mời khi Guest | Được chọn Guest hoặc đăng nhập rồi chuyển vào phòng hợp lệ | tests/game.test.ts; tests/e2e/journeys.spec.ts | PASS — Local automated evidence |
| TC-020 | Chủ/khách rời phòng khi countdown | Đếm ngược hủy, không ghi kết quả thua | tests/game.test.ts | PASS — Local automated evidence |
| TC-021 | Một người đổi time control sau người khác READY | Ready cả hai reset, không tự bắt đầu với cấu hình cũ | tests/game.test.ts | PASS — Local automated evidence |
| TC-022 | Hai người chơi cùng tài khoản cố chiếm hai ghế | Từ chối đối thủ trùng actor/định danh | tests/game.test.ts | PASS — Local automated evidence |
| TC-023 | Tìm trận ngẫu nhiên cùng time control | Ghép hai người khác nhau, không tính ELO | tests/game.test.ts; tests/socket.test.ts | PASS — Local automated evidence |
| TC-024 | Hủy tìm trận trước khi ghép | Thoát queue; không bị ghép về sau | tests/game.test.ts; tests/socket.test.ts | PASS — Local automated evidence |
| TC-025 | Cấm phòng vì block hai chiều | Không ghép; không hiển thị dữ liệu không được phép | tests/game.test.ts; tests/socket.test.ts | PASS — Local automated evidence |
| TC-026 | Mã bị cản chân, Tượng bị chặn mắt | Từ chối các nước vi phạm luật | tests/chess.test.ts | PASS — Local automated evidence |
| TC-027 | Pháo ăn qua 0/2 ngòi | Không hợp lệ; đúng 1 ngòi mới hợp lệ | tests/chess.test.ts | PASS — Local automated evidence |
| TC-028 | Tốt trước sông đi ngang | Từ chối; sau sông đi ngang hợp lệ nếu không vi phạm khác | tests/chess.test.ts | PASS — Local automated evidence |
| TC-029 | Hai Tướng lộ mặt sau một nước đi | Từ chối và giữ nguyên lượt | tests/chess.test.ts | PASS — Local automated evidence |
| TC-030 | Nước tự để Tướng bị chiếu | Từ chối và trả snapshot không đổi | tests/chess.test.ts | PASS — Local automated evidence |
| TC-031 | Chiếu bí và hết nước hợp lệ | Bên không còn nước hợp lệ thua, reasonCode phân biệt | tests/chess.test.ts | PASS — Local automated evidence |
| TC-032 | Cố đi nước tiếp tục trường chiếu bị cấm | Từ chối, yêu cầu đổi nước; nếu hết nước thua | tests/chess.test.ts | PASS — Local automated evidence |
| TC-033 | Lặp vị trí không thuộc trường chiếu bị cấm | Không tự hòa 60 nước; áp đúng bộ quy tắc đã thiết kế | tests/chess.test.ts | PASS — Local automated evidence |
| TC-034 | Chọn không giới hạn, đi nhiều lượt | Không phát sự kiện hết giờ | tests/game.test.ts | PASS — Local automated evidence |
| TC-035 | Chọn 5/10/15/30 và người chơi hết giờ | Thua đúng người hết giờ, chỉ một result | tests/game.test.ts | PASS — Local automated evidence |
| TC-036 | Client thay đổi đồng hồ máy | Không làm thay đổi clock authoritative | tests/game.test.ts; tests/socket.test.ts | PASS — Local automated evidence |
| TC-037 | Nước sai luật khi đang đến lượt | Không chuyển lượt, đồng hồ vẫn chạy | tests/game.test.ts | PASS — Local automated evidence |
| TC-038 | A rớt mạng, quay lại trong 60 giây | Resume chính xác board/clock và thời gian đã đóng băng | tests/game.test.ts | PASS — Local automated evidence |
| TC-039 | A rớt >60s, B vẫn online | A thua do disconnect, B thắng | tests/game.test.ts | PASS — Local automated evidence |
| TC-040 | A rớt t0, B rớt t20, cả hai không quay lại | Đến khi cả hai quá deadline: CANCELED, lưu biên bản, không DRAW | tests/game.test.ts | PASS — Local automated evidence |
| TC-041 | A rớt t0, B rớt t20, B trở lại trước t80 khi A quá hạn | B thắng, không hủy ván | tests/game.test.ts | PASS — Local automated evidence |
| TC-042 | Người chơi reconnect nhiều lần cố cộng thời gian | Không reset deadline/budget theo refresh | tests/game.test.ts | PASS — Local automated evidence |
| TC-043 | Đăng nhập thiết bị mới trước deadline | Phiên cũ bị thu hồi; thiết bị mới được snapshot | tests/game.test.ts; tests/socket.test.ts | PASS — Local automated evidence |
| TC-044 | Server restart giữa trận khi state bền vững | Không có nước đi mất/nhân đôi; xử lý clock an toàn | tests/game.test.ts | PASS — Local automated evidence |
| TC-045 | A yêu cầu lưu, B từ chối | Trận ACTIVE bình thường, không có SAVED | tests/game.test.ts | PASS — Local automated evidence |
| TC-046 | A yêu cầu lưu, B chấp nhận | Chỉ một snapshot SAVED chính xác hai User gốc | tests/game.test.ts; tests/e2e/journeys.spec.ts | PASS — Local automated evidence |
| TC-047 | Hai người cùng gửi SAVE gần như đồng thời | Chỉ một yêu cầu hiệu lực và một transaction save | tests/game.test.ts | PASS — Local automated evidence |
| TC-048 | A xin lưu khi đang có người Guest | Không lưu dài hạn khi chưa đủ hai User | tests/game.test.ts | PASS — Local automated evidence |
| TC-049 | Một nước đi được ghi trong lúc SAVE chờ xác nhận | Snapshot theo thứ tự commit, stale confirmation yêu cầu xác minh lại | tests/game.test.ts | PASS — Local automated evidence |
| TC-050 | Chiếu bí/đầu hàng commit ngay trước SAVE | FINISHED giữ hiệu lực; SAVE bị từ chối | tests/game.test.ts | PASS — Local automated evidence |
| TC-051 | DB rollback trong lúc SAVE | Không hiển thị lưu thành công; Match nhất quán | tests/game.test.ts | PASS — Local automated evidence |
| TC-052 | B offline khi A mời tiếp tục | Request + notification còn lưu, Match vẫn SAVED | tests/game.test.ts | PASS — Local automated evidence |
| TC-053 | B từ chối tiếp tục | Match vẫn SAVED, không sinh ACTIVE mới | tests/game.test.ts | PASS — Local automated evidence |
| TC-054 | Hai người READY để resume đúng saved match | Đúng màu/board/clock/lượt, không tạo trận nhân đôi | tests/game.test.ts; tests/e2e/journeys.spec.ts | PASS — Local automated evidence |
| TC-055 | User khác dò matchId muốn resume | Từ chối 403, không lộ snapshot | tests/game.test.ts | PASS — Local automated evidence |
| TC-056 | Xin hòa không được đồng ý | Không kết thúc hòa | tests/game.test.ts | PASS — Local automated evidence |
| TC-057 | Hai bên đồng ý xin hòa | FINISHED/DRAW đúng một lần | tests/game.test.ts | PASS — Local automated evidence |
| TC-058 | Hai bên đồng ý Undo | Khôi phục board/timers/history đồng nhất | tests/game.test.ts | PASS — Local automated evidence |
| TC-059 | B từ chối lời mời Video Call | Không mở camera/mic, PvP vẫn hoạt động | tests/game.test.ts; tests/e2e/journeys.spec.ts | PASS — Local real WebRTC pipeline with fake capture; hardware/TURN outside scope |
| TC-060 | Một bên cấp quyền camera, bên kia chưa đồng ý | Chưa thực hiện luồng video hai phía | tests/game.test.ts; tests/e2e/journeys.spec.ts | PASS — Local real WebRTC pipeline with fake capture; hardware/TURN outside scope |
| TC-061 | WebRTC lỗi kết nối hoặc mạng yếu | Trận chơi vẫn tiếp tục; media fallback/đóng an toàn | tests/game.test.ts; tests/e2e/journeys.spec.ts | PASS — Local real WebRTC pipeline with fake capture; hardware/TURN outside scope |
| TC-062 | Match SAVED hoặc FINISHED | Media tracks đóng và không ghi âm/hình | tests/game.test.ts; tests/e2e/journeys.spec.ts | PASS — Local real WebRTC pipeline with fake capture; hardware/TURN outside scope |
| TC-063 | Người thứ ba giả mạo chat matchId | Bị từ chối và ghi audit cần thiết | tests/game.test.ts; tests/socket.test.ts | PASS — Local automated evidence |
| TC-064 | Tải xong AI, tắt mạng rồi refresh | Mở được chức năng AI khi cache còn và Worker chạy được | tests/e2e/journeys.spec.ts | PASS — Offline Chromium reload, 10 human + 10 AI plies, zero Backend requests |
| TC-065 | Dữ liệu AI thiếu khi offline | Thông báo thiếu asset, không âm thầm gọi server | tests/e2e/journeys.spec.ts | PASS — Local automated evidence |
| TC-066 | Undo khi Worker đang suy nghĩ | Hủy request AI cũ, không xuất hiện nước đi cũ sau hoàn tác | tests/e2e/journeys.spec.ts | PASS — Local automated evidence |
| TC-067 | User chơi offline rồi khôi phục ván | Snapshot hợp lệ được mở lại; không làm mất nước đã commit | tests/e2e/journeys.spec.ts | PASS — Local automated evidence |
| TC-068 | Guest hết phiên/clear session data | Không khẳng định dữ liệu Guest được lưu dài hạn | tests/e2e/journeys.spec.ts | PASS — Local automated evidence |
| TC-069 | Một ván bị hủy vì hai bên offline | Lịch sử có reason CANCELED, không tính W/L/D | tests/game.test.ts; tests/privacy.test.ts | PASS — Local automated evidence |
| TC-070 | Replay qua từng nước và sau Undo | Chỉ phát nước hiệu lực, không thay đổi Match gốc | tests/game.test.ts; tests/e2e/journeys.spec.ts | PASS — Local automated evidence |
| TC-071 | Người dùng ẩn lịch sử cá nhân | Người lạ không thấy, kỳ thủ cùng ván vẫn xem theo quyền | tests/game.test.ts; tests/privacy.test.ts | PASS — Local automated evidence |
