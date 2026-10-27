# Kết quả kiểm thử — 15/10/2026

> Checkpoint lịch sử. Lượt mới **16/10/2026**: **63/63 unit/integration, 8/8 E2E PASS**, typecheck/lint/build/generate/migrations/audit PASS. JSON phản ánh lượt mới; xem [final-readiness-report.md](final-readiness-report.md) cho lỗi đã sửa, giới hạn và BLOCKED. Số 59/6 phía dưới là kết quả cũ.

**PARTIALLY COMPLETE**. Source đã tích hợp local; chưa nghiệm thu tất cả dịch vụ/thiết bị thật.

| Kiểm tra | Lệnh / bằng chứng | Kết quả |
|---|---|---|
| TypeScript strict | npm run typecheck | PASS, 0 lỗi |
| ESLint | npm run lint | PASS, 0 lỗi |
| Build/PWA | npm run build | PASS; dist/, cache UI/fonts/Worker, 38 precache entries |
| Prisma client | npm run db:generate | PASS |
| PostgreSQL migrations | npm run db:migrate | PASS, 2 migrations; PostgreSQL thật port 54329 |
| Unit/integration/Socket/API | npm test -- --reporter=json --outputFile=docs/implementation/unit-results.json | **59 PASS / 0 FAIL** |
| Chromium E2E | npm run test:e2e | **6 PASS / 0 FAIL**, 21.3 giây ở lượt cuối |
| Dependency audit | npm audit | PASS, 0 vulnerabilities |
| AI benchmark | npx tsx scripts/benchmark.ts | 9/9 nước hợp lệ; Dễ depth1, Trung bình2, Khó3–4, khoảng 1.3s tối đa trên máy này |
| Socket latency local | tests/socket.test.ts; socket-latency.json | 20 ACK thật, p95 23.88ms; loopback + PostgreSQL thật, server clock giả lập cho test; không nghiệm thu mạng thật |

## Sáu hành trình trình duyệt đã chạy

1. Hai context độc lập: register, private room, ready/countdown, hai nước PvP, chat text XSS-safe, consent và remote WebRTC frames ở cả hai peer, đóng call, lỗi RTC config không cản đi quân, Save/Resume đúng Match cũ, surrender/replay và logout dọn private view/cache identity.
2. Offline-ready: tắt network, reload, 10 lượt người + 10 lượt AI, **không có request Backend/Socket**, reload/continue/undo và clear dữ liệu Guest không còn ván lâu dài.
3. Responsive 390px: lobby/AI không tràn ngang; screenshot desktop/mobile.
4. Hai Guest mở invitation URL cùng lúc, tranh ghế cuối; đúng một người vào, chỉ hai ghế, QR PNG thật chứa URL phòng, owner rời đóng phòng.
5. Undo khi Worker thật đang nghĩ: terminate worker, không có nước cũ xuất hiện; Hint hợp lệ; local snapshot hỏng bị báo lỗi.
6. Xóa Worker khỏi cache + clear browser cache rồi offline: báo không tải AI, không giả tạo nước/Backend fallback.

## Coverage nghiệp vụ

Requirements matrix ánh xạ **137 mã yêu cầu/quyết định** và đủ **71 TC**. Các TC được nhóm trong 59 test unit/integration và 6 E2E, không phải 71 test runner riêng biệt. Bảng scenario ghi **70 PASS local / 1 BLOCKED (TC-009 mail thật)**. Những kiểm chứng hardware/NAT/provider/production vẫn BLOCKED hoặc NOT RUN trong blockers.md; con số PASS local không thay thế nghiệm thu toàn môi trường.

Fault injection gồm SQL rollback khi lưu, mất broadcast sau save commit, duplicate move/ACK, crossed Save/Resume, stale confirmation, terminal ưu tiên, staggered disconnect, pause budget, new login device, server/DB incident recovery và soft delete privacy. Các lỗi phát hiện ở những batch trước đã được sửa, không tắt test: Room không chuyển post-match khi reconnect phân xử; dùng chung test DB với server watch; locator không chính xác; Room resume owner khác; token/control và private UI cleanup.

## Giới hạn cụ thể

- Google/Facebook, explicit provider link và thư SMTP thật: **BLOCKED**, chưa có credentials/mailbox.
- WebRTC đã chứng minh hai RTCPeerConnection và media remote thật trên loopback, sử dụng **fake capture devices của Chromium**. Camera/micro thật, TURN relay qua NAT, weak network và mobile: **BLOCKED/NOT RUN**.
- AI Khó có depth/time khác thật; sức mạnh với người chơi có kinh nghiệm và hiệu năng điện thoại thật: **NOT RUN**.
- Safari/Firefox/Edge/hardware, Docker build/Compose daemon và p95 mạng gần Server: chưa được nghiệm thu.
- Admin REST/RBAC/audit đã chạy test; UI admin trên browser chưa chạy riêng.

## Artifacts

unit-results.json, e2e-results.json, acceptance-results.json, npm-audit.json, ai-benchmark.json, socket-latency.json; lobby-desktop.png, lobby-mobile.png, ai-mobile.png, pvp-desktop.png.
