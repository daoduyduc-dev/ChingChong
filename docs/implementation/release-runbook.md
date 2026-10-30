# Release runbook — 30/10/2026

## Những môi trường đã tách

- `server/.env`: cấu hình ứng dụng. Trên máy thực thi hiện là PostgreSQL loopback cũ đã chuyển sang đúng đường dẫn; không có Supabase URL. Không đưa file này lên Git hoặc gửi vào chat.
- Vitest/UI: `kyvien_utf8_test`, local 54329; test runner từ chối cloud/DB không có hậu tố `_test`.
- Release rehearsal: Compose project `kyvien-release`, volume riêng `kyvien-release_postgres-data`, env `.local/release.env`, DB 54330, BE 3003, FE/Nginx 5180. Không sử dụng DB của người dùng hoặc Supabase. Chứa dữ liệu QA từ acceptance.
- Supabase deployment: `compose.external-db.yaml`, chỉ FE/BE, DB do `DATABASE_URL` cung cấp. Prisma kết nối PostgreSQL; không cần Supabase anon/service-role key và không đổi hệ thống auth sang Supabase Auth.

## Chạy lại bản local

Node 24+, Docker Desktop đang chạy. Từ gốc repository:

```powershell
node scripts/deploy-local.mjs
```

Helper đã chạy PASS, tạo/giữ secrets và chờ cả ba services healthy. URL `http://127.0.0.1:5180`. Các port đều loopback. Port 8080 trên máy đang thuộc dịch vụ khác nên bản này dùng 5180; không chiếm hoặc dừng dịch vụ khác.

Kiểm chứng:

```powershell
npm run typecheck
npm run lint
npm test -- --reporter=json --outputFile=docs/implementation/release-unit-results.json
npm run build
npm run test:ui -- --reporter=json --outputFile=docs/implementation/release-ui-results.json
node scripts/release-acceptance.mjs
npx playwright test --config tests/deploy/browsers.config.ts
node scripts/release-operations.mjs
```

Không chạy hai test runner dùng cùng DB local `_test` đồng thời. Deployment acceptance và browser smoke có outputDir riêng; acceptance chia hai batch cách nhau một phút để giữ nguyên rate-limit khi mọi người dùng thử đi qua cùng IP proxy. Không coi việc chạy quá nhanh chạm limiter là lý do tắt limiter. Browser smoke dùng engine Chromium/Firefox/WebKit của Playwright trên Windows, chưa phải Safari/iPhone/Edge thật.

`release-operations.mjs` stop/start stack rồi so sánh digest và số dòng User/Identity/Move/các Match terminal hoặc SAVED, gọi health và kết nối Socket.IO chỉ qua WebSocket. Nó chỉ đọc `.local/release.env`, không nhận URL production. Chạy khi không có người chơi vì BA-11 hủy active match khi Backend restart.

## Chuyển lên hosting dùng Supabase

Trạng thái **BLOCKED**: chưa có URL/password Supabase và host/domain/deployment credentials. Không tự tạo tài nguyên trả phí, đổi DNS, hoặc giả lập Supabase thành PASS.

1. Chuẩn bị VPS/container host có Node/Docker, hỗ trợ persistent process và WebSocket. Giữ đúng một Backend instance. Sites Workers không trực tiếp chạy stack Express/Socket.IO/TCP PostgreSQL này; không tách FE public trỏ localhost của người dùng.
2. Cấu hình file secrets ngoài source hoặc secret store: `DATABASE_URL` từ Supabase, `JWT_SECRET` ngẫu nhiên, `APP_URL=https://DOMAIN`, các provider/mail/TURN nếu phát hành. Chọn endpoint tương thích migration và Prisma theo cấu hình Supabase của dự án; URI-encode password và bật TLS theo provider. Không tự đoán connection string, không lấy anon key thay database URL.
3. Backup Supabase bằng phương thức của chủ DB/plan hiện có và restore drill vào DB khác. Không chạy script backup local vào cloud: nó chủ động từ chối external URL. Kiểm tra DB có 4 migration, review hai migration metadata/index mới trước apply; không reset, không `db push --accept-data-loss`.
4. Dùng `docker compose -f compose.external-db.yaml --env-file server/.env config --quiet` để validate mà không in secrets. Sau backup và cấu hình: `docker compose -f compose.external-db.yaml --env-file server/.env up -d --build --wait`. Backend chỉ lộ trong network Compose; FE bind loopback, đặt reverse proxy HTTPS bên ngoài.
5. TLS proxy host → FE/Nginx cổng FRONTEND_PORT (mặc định 5180), cho phép WebSocket upgrade end-to-end. **Hai proxy:** Nginx container hiện ghi đè X-Forwarded-For bằng peer trực tiếp để chống header giả ở bản local. Khi thêm TLS proxy bên ngoài phải cấu hình trust chain chính xác tại Nginx (chỉ trusted proxy IP), rồi kiểm tra rate limiter theo IP thực. Không chỉ tăng TRUST_PROXY hoặc tin XFF của mọi client.
6. `APP_URL` HTTPS đúng origin, Secure/HttpOnly cookies; không cache `/api`, `sw.js` hoặc index quá lâu; hash assets immutable. Kiểm tra login, refresh/revoke, PvP hai context, Save/Resume, WebSocket-only connect và offline AI qua domain thật. Kiểm tra cross-origin từ domain lạ và cookie/log không lộ token.
7. Nghiệm thu provider/mailbox/camera/TURN qua hai mạng và browser/thiết bị thật. Lưu evidence đã che IP/secrets. Kiểm tra selected ICE candidate là relay mới ghi TURN PASS.
8. Thiết lập supervisor/health alert, DB backup/off-host retention, log rotation, audit delivery failure, TURN quota/rotation. Chốt maintenance window và BA-11 trước nhận người dùng thật.

`deploy/nginx.conf.example` là mẫu TLS cho host phục vụ FE static trực tiếp + BE, khác với mô hình Nginx container có một proxy upstream. Chọn một topology rõ ràng, kiểm tra `nginx -t`, không ghép tùy tiện hai trust chains.

## Backup local và khôi phục

`node scripts/backup-check.mjs` dùng native PostgreSQL clients khi có `PG_TOOLS_BIN`, hoặc Docker image `postgres:18` đã pull. Docker truyền credentials qua environment, không in secret trên command line/log. Dump local ở `.local/backups`, restore vào DB **mới** `kyvien_restoreqa_<timestamp>`. So count và digest nội dung từng bảng, giữ DB/dump để kiểm tra; không xóa hay ghi đè DB nguồn. Đã PASS 12 bảng trước migration mới. Dump chứa password hash/dữ liệu riêng tư, không thuộc source/release archive; bảo vệ và mã hóa khi chuyển ra host khác.

Kiểm chứng này không chứng nhận Supabase backup, PITR, off-host disaster recovery, RPO/RTO hoặc retention production. Những mục đó cần chủ DB cung cấp môi trường/chính sách.

## Rollback

Giữ image ID và source archive/checksum trong release manifest. Tag/copy image được phê duyệt trước khi thay thế; không dùng mutable `latest` làm định danh duy nhất cho production. Dừng nhận ván mới/maintenance; rollback về image trước và FE tương ứng sau khi xác nhận tương thích schema. Bốn migration hiện tại additive; không tự chạy down migration. Với schema không tương thích, restore vào DB mới rồi chuyển endpoint theo quyết định operator, không restore đè DB đang phục vụ.

Container cold restart/persistence đã PASS local. BA-11 active recovery được chạy regression; không gọi đây là seamless recovery hoặc zero-downtime rollout. Kiểm thử rollback về một release production trước **NOT RUN** vì chưa có release/host production trước đó.

## Dừng môi trường

```powershell
docker compose -p kyvien-release --env-file .local/release.env stop
```

Không xóa volume/env. PostgreSQL embedded dùng cho unit/UI được dừng sạch sau kiểm thử; container deployment là môi trường bàn giao riêng, được để chạy để người dùng mở kiểm tra.
