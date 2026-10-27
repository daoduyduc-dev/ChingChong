# Kỳ Viện — Website cờ tướng

React/Vite/TypeScript, Express/Socket.IO, PostgreSQL/Prisma. PvP authoritative; AI chạy trong Worker trình duyệt. Trạng thái nghiệm thu: **PARTIALLY COMPLETE** cho đến khi OAuth/SMTP/hạ tầng TURN và trình duyệt/thiết bị mục tiêu được kiểm chứng. Xem `docs/implementation/` để biết bằng chứng và giới hạn.

## Chạy local trên Windows

Yêu cầu Node 24+, npm và trình duyệt hiện đại. Không cần Docker cho PostgreSQL local.

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Đặt JWT_SECRET ngẫu nhiên ít nhất 32 ký tự trong `.env`; không commit file này. DATABASE_URL mặc định chỉ dành cho DB phát triển loopback. Trong các terminal riêng:

```powershell
npm run db:local
npm run db:generate
npm run db:migrate
npm run dev
```

Mở http://127.0.0.1:5173. PostgreSQL thật lưu ở `.local/postgres`, port 54329. Không xóa thư mục này để “sửa” lỗi. Dừng DB bằng Ctrl+C tại terminal DB. Migrations thêm bảng/ràng buộc, không reset dữ liệu.

## Chạy bản có cache offline

```powershell
npm run build
npm start
npm run preview
```

`preview` dùng http://127.0.0.1:5174; đổi APP_URL tương ứng và khởi động lại Backend nếu dùng OAuth. Chỉ chạy một Backend. Mở Chơi với máy, chờ trạng thái tài nguyên đã cache. Sau đó có thể tắt mạng, reload URL và chơi AI. Bản dev không cung cấp cache offline.

User lưu AI bằng IndexedDB theo user ID; Guest lưu trong sessionStorage. Xóa cache/bộ nhớ trình duyệt sẽ làm mất tài nguyên/van cục bộ. Guest chuyển User cần đồng ý gộp; không ghi đè ván cục bộ có sẵn của User.

## Kiểm thử

```powershell
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run build
npm start
npm run test:e2e
npm audit
npx tsx scripts/benchmark.ts
```

`npm test` tạo DB riêng `kyvien_test` trên cluster local, áp dụng migrations và chạy Vitest/Supertest/Socket.IO. Không reset DB ứng dụng. Playwright dùng hai browser context độc lập, thử WebRTC bằng media giả lập của Chromium **qua hai RTCPeerConnection thực sự**, không dùng video local thay cho cuộc gọi. Không coi đó là nghiệm thu camera/micro thật hoặc TURN qua hai mạng khác nhau.

## Cấu hình dịch vụ

- Google/Facebook: điền CLIENT_ID/CLIENT_SECRET; callback chính xác `${APP_URL}/api/auth/oauth/google/callback` hoặc `/facebook/callback`. Google dùng state + PKCE. Không auto merge theo email. Đăng nhập tài khoản cũ rồi liên kết provider từ Hồ sơ. Cookie OAuth dùng SameSite=Lax cho top-level callback; refresh cookie HttpOnly/Strict, Secure khi APP_URL HTTPS.
- SMTP: HOST/PORT/USER/PASS/FROM. Không cấu hình sẽ báo rõ chưa có dịch vụ; token reset hash trong DB, dùng một lần, hạn 30 phút. Phản hồi không tiết lộ email có tồn tại. Kiểm tra việc thư thật tới hộp thư trước nghiệm thu.
- WebRTC: STUN mặc định, TURN_URL/USERNAME/CREDENTIAL nếu cần NAT relay. Chỉ kỳ thủ có consent được lấy cấu hình media. Không recording. Kiểm tra với camera thật, HTTPS và hai mạng khác nhau.
- Admin: đăng ký tài khoản bình thường rồi operator chạy `node scripts/admin.mjs email-da-dang-ky`; đăng nhập lại. Không có tài khoản/mật khẩu Admin mẫu.

## Docker và triển khai

Kết quả hardening 16/10: [final-readiness-report](docs/implementation/final-readiness-report.md). Hướng dẫn HTTPS/proxy, secrets, backup/restore, rollback và dịch vụ thật: [deployment-runbook](docs/implementation/deployment-runbook.md). Mẫu `deploy/nginx.conf.example` chưa chạy trên host đích. Rehearsal local dùng `node scripts/backup-check.mjs`; cần PostgreSQL 18+ client tools và `PG_TOOLS_BIN` trỏ thư mục chứa `pg_dump.exe`/`pg_restore.exe`. Thiếu tools sẽ BLOCKED trước khi thay đổi DB.

Compose có PostgreSQL và Backend, yêu cầu POSTGRES_PASSWORD, JWT_SECRET, APP_URL. Dừng PostgreSQL embedded trước nếu dùng cùng port 54329. Docker daemon phải hoạt động. Chưa chạy Docker build trong môi trường này vì daemon không sẵn sàng; cấu hình không được coi là đã nghiệm thu.

Frontend `dist/` phục vụ qua web server HTTPS, SPA fallback `index.html`. Proxy `/api` và `/socket.io` tới Backend port 3001, hỗ trợ WebSocket upgrade, CORS đúng APP_URL. Không cache API riêng tư. Giữ một instance Backend; không scale ngang khi chưa bổ sung coordination store. Sao lưu PostgreSQL trước mọi migration lên môi trường có dữ liệu. Chưa tự deploy lên public/GitHub.

Nếu đặt sau đúng một reverse proxy, cấu hình TRUST_PROXY=1 và để proxy ghi X-Forwarded-For đúng; local mặc định 0. Không expose Backend trực tiếp khi dùng cấu hình trust proxy theo hop.

Server restart giữ biên bản committed nhưng hủy an toàn ván đang hoạt động với SERVER_RECOVERY, không tự suy đoán thắng. SAVED được bảo toàn. Đây là chính sách sự cố [BA-11], không phải seamless recovery. Reconnect thông thường giữ đồng hồ và board; deadline từng người 60s, ngân sách pause 180s.

## Luật và AI

Luật trường chiếu theo SRS 5.1.1: nước tạo lần lặp thứ ba bị chặn nếu bên đang đi đã chiếu sau mọi lượt của mình trong chu kỳ gần nhất. Không tự hòa vì 60 nước, thiếu quân hoặc lặp không chiếu. Stalemate là thua.

AI là engine JS tự viết (alpha-beta, iterative deepening, material/pawn progress), không trọng số hoặc thư viện engine bên thứ ba. Dễ depth 1/60ms, Trung bình depth 2/350ms, Khó depth tối đa 4/1300ms. Khó không được quảng cáo là trình độ Pikafish/chuyên nghiệp; sức mạnh với người chơi có kinh nghiệm và thiết bị mobile thật vẫn cần đánh giá. Nguồn quyết định giấy phép: https://www.pikafish.com/en/list.html và https://github.com/official-pikafish/Pikafish.
