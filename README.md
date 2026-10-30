# Kỳ Viện — Website cờ tướng

React/Vite/TypeScript, Express/Socket.IO và PostgreSQL/Prisma. Dự án dùng **npm workspaces**, một repository và một `package-lock.json` tại thư mục gốc.

Luồng tài khoản: đăng ký thành công → giao diện đăng nhập → nhập mật khẩu và đăng nhập → sử dụng tài khoản. API đăng ký chỉ tạo tài khoản, không cấp token/cookie hoặc phiên đăng nhập. Giao diện điền sẵn username sau đăng ký, xóa ô mật khẩu và thông báo thành công. Việc gộp dữ liệu Guest được hỏi ở bước đăng nhập.

## Cấu trúc dự án

```text
QLDA/
├── client/                 # Frontend
│   ├── src/                # React, giao diện, API client, AI Worker
│   ├── public/             # Icon và licenses
│   ├── dist/               # FE sau npm run build (không commit)
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── server/                 # Backend
│   ├── src/                # Express, Socket.IO, auth, database, game
│   ├── prisma/             # Schema và migrations
│   ├── env.mjs             # Nạp server/.env, không phụ thuộc thư mục chạy
│   ├── .env                # Secrets riêng, không commit
│   ├── .env.example
│   ├── tsconfig.json
│   └── package.json
├── shared/                 # Luật cờ, thuật toán AI, kiểu dữ liệu chung
├── tests/                  # Integration, unit và E2E
├── scripts/                # Test runner, DB local, admin, backup, benchmark
├── deploy/                 # Cấu hình reverse proxy mẫu
├── docs/
├── package.json            # Điều phối các workspace và tooling kiểm thử
├── package-lock.json       # Lockfile duy nhất
├── tsconfig.base.json
├── tsconfig.json           # Kiểm tra cả integration/E2E tests
├── Dockerfile
└── compose.yaml
```

FE → proxy `/api`, `/socket.io` → BE → Prisma → Supabase PostgreSQL. AI Worker chạy trong trình duyệt; thuật toán AI và luật cờ nằm trong `shared/`. Ván AI lưu IndexedDB theo User hoặc sessionStorage cho Guest; không lưu vào Supabase.

## Cài đặt và cấu hình

Yêu cầu **Node.js 24+**, npm và PowerShell. Chạy các lệnh dưới đây từ thư mục gốc `QLDA`:

```powershell
npm install
# Chỉ tạo .env khi chưa có; không ghi đè cấu hình đang dùng.
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
npm run db:generate
```

Secrets của dự án cũ đã được chuyển từ `.env` ở gốc sang **`server/.env`**. Không cần chép lại. Shell environment hoặc biến của nền tảng deploy có ưu tiên cao hơn file này.

Cấu hình trong `server/.env`:

- `DATABASE_URL`: connection string PostgreSQL Supabase hoặc DB local. Mật khẩu trong URL phải URI-encoded; không đưa URL này vào code FE.
- `JWT_SECRET`: chuỗi ngẫu nhiên ít nhất 32 ký tự, không dùng placeholder.
- `APP_URL=http://127.0.0.1:5174`
- `PORT=3002`, `API_HOST=127.0.0.1`

Prisma kết nối trực tiếp PostgreSQL, không cần Supabase anon/service-role key. FE không đọc `server/.env`.

Nếu database chưa có schema hoặc có migration mới:

```powershell
npm run db:migrate
```

Lệnh này áp dụng migration lên DB của BE; sao lưu trước khi chạy với dữ liệu thật. Không reset DB. Database Supabase hiện tại đã áp dụng các migration của dự án; chỉ cần chạy lại khi có migration mới.

## Chạy phát triển — một lệnh

```powershell
npm run dev
```

Mở **http://127.0.0.1:5174**. Lệnh này chạy FE 5174 và BE 3002. Giữ terminal mở; Ctrl+C dừng cả hai. Vite proxy HTTP và WebSocket đã cấu hình sẵn, không cần lệnh `node -e`.

Hoặc chạy riêng trong hai terminal:

```powershell
# Terminal Backend
npm run dev:server
```

```powershell
# Terminal Frontend
npm run dev:client
```

Nếu muốn chạy ngay trong workspace: `cd client; npm run dev` hoặc `cd server; npm run dev`. Cài dependencies ở gốc bằng `npm install`, không tạo lockfile riêng. Không chạy đồng thời `npm run dev` và các lệnh riêng trên cùng cổng.

## Chạy bản build và kiểm tra AI offline

```powershell
npm run build
```

Sau đó dùng hai terminal từ gốc:

```powershell
# Terminal Backend
npm start
```

```powershell
# Terminal Frontend
npm run preview
```

Mở http://127.0.0.1:5174. Chọn Chơi với máy và đợi trạng thái đã cache trước khi tắt mạng/reload. Bản dev không cung cấp cache offline. FE build ở `client/dist/`; chỉ sửa mã nguồn trong `client/src/`.

## Kiểm tra kết nối

Khi FE và BE đang chạy, mở terminal khác:

```powershell
Invoke-RestMethod http://127.0.0.1:3002/api/health
Invoke-RestMethod http://127.0.0.1:5174/api/health
```

Cả hai phải trả `status: ok`. Health kiểm tra truy vấn DB cơ bản; cần thử thêm đăng nhập, tạo/vào phòng public và Socket.IO để xác nhận luồng ứng dụng. Nếu đổi cổng BE, đổi cả `PORT` và proxy trong `client/vite.config.ts`. Nếu đổi URL FE, cập nhật `APP_URL` và các callback OAuth.

## Kiểm thử

Báo cáo rà soát chức năng/UX mới nhất: [functional-audit-2026-10-29](docs/implementation/functional-audit-2026-10-29.md), liệt kê lỗi đã sửa, chức năng còn thiếu và các dịch vụ chưa cấu hình. Giao diện thông báo dùng **Sonner** cho toast/loading và **SweetAlert2** cho xác nhận/nhập liệu; không dùng confirm/prompt mặc định của trình duyệt.

```powershell
npm run typecheck
npm run lint
npm run build
```

**Bộ hồi quy dùng DB local riêng**, không dùng `DATABASE_URL` Supabase của ứng dụng:

```powershell
# Terminal DB (chỉ cần khi chưa chạy PostgreSQL local)
npm run db:local
```

```powershell
# Terminal kiểm thử khác
npm test
```

Runner mặc định tạo/dùng `kyvien_utf8_test` tại `127.0.0.1:54329`, áp dụng migrations rồi chạy Vitest. Database được tạo UTF-8 bằng template0 để tránh lỗi tiếng Việt với cluster WIN1252 trên Windows; không xóa DB cũ. Nếu cần cấu hình riêng, đặt `TEST_DATABASE_URL` tới một database local có tên kết thúc bằng `_test`. Runner từ chối URL cloud và bỏ qua URL DB của ứng dụng. Không chạy `npx vitest run` trực tiếp với DB cloud: lệnh đó bỏ qua cơ chế cách ly của runner.

**E2E:** chạy `npm start` và `npm run preview` sau build, rồi:

```powershell
npx playwright install chromium
npm run test:e2e
```

E2E sử dụng database của BE cùng `server/.env` và tạo dữ liệu QA; nên dùng DB dành riêng cho E2E. Báo cáo tại `docs/implementation/e2e-results.json`, trace lỗi trong `test-results/`. Cấu hình mặc định dành cho local; có thể tăng timeout khi chạy qua Supabase có độ trễ cao. WebRTC dùng hai browser context và media giả lập; chưa thay thế kiểm tra camera/micro thật hoặc TURN qua hai mạng.

```powershell
npx tsx scripts/benchmark.ts
npm audit
```

Kiểm thử UI cô lập, tự mở/đóng BE và preview bằng cổng tạm (không dùng Supabase, không cần dừng dev server):

```powershell
npm run build
npx playwright install chromium
npm run test:ui
```

Lệnh này chạy các hồi quy UI, kiểm tra axe ở 360/768/1280px và 8 hành trình E2E trên DB local `_test`. Cần PostgreSQL local ở cổng 54329 đang chạy. Báo cáo E2E tại `docs/implementation/flow-audit-e2e.json`; ảnh `docs/implementation/accessibility-*.png`.

## Giao diện và bàn phím

Bàn cờ có một điểm Tab; dùng phím mũi tên để di chuyển ô, Enter/Space để chọn quân hoặc ô đích, Esc để bỏ chọn. Trên điện thoại, **Phóng to bàn cờ** mở vùng cuộn với ô chạm lớn; **Thu gọn bàn cờ** trở lại vừa màn hình. Replay hỗ trợ ←/→ để lùi/tiến và Space để phát/dừng khi không nhập trong form.

Thanh điều hướng mobile có bốn mục chính và **Thêm** cho ván lưu/bạn bè/hồ sơ/quản trị. Form xác thực có lỗi tại trường và nút hiện mật khẩu. Khi có bản cập nhật PWA, ứng dụng hiển thị lựa chọn **Cập nhật ngay / Để sau**; cập nhật bị khóa trong ván đang diễn ra.

Các điều chỉnh theo nhận xét UI được đối chiếu trong [báo cáo accessibility](docs/implementation/ui-accessibility-review-2026-10-29.md), gồm phần đã sửa và những lựa chọn kỹ thuật còn giữ.

## Database local và Docker

Khi chạy ứng dụng với Supabase, **không cần** `npm run db:local`. Nếu dùng DB local thay thế, dùng URL trong `server/.env.example`, chạy `npm run db:local` và `npm run db:migrate`. Dữ liệu local ở `.local/postgres`; không xóa thư mục để sửa lỗi.

Compose gồm PostgreSQL riêng và BE, sử dụng biến từ `server/.env`:

```powershell
docker compose --env-file server/.env up --build
```

Đặt `POSTGRES_PASSWORD`, `JWT_SECRET`, `APP_URL` trước khi chạy. Compose dùng PostgreSQL của nó, không lấy Supabase làm DB; dừng DB embedded nếu trùng cổng 54329. Dockerfile cài cả workspace manifests, generate Prisma tại `server/prisma`, phục vụ BE cổng 3002. FE `client/dist/` cần được phục vụ riêng qua web server HTTPS. Không coi cấu hình Docker/proxy là đã nghiệm thu trên host production.

## Ghi nhận cấu trúc và kết nối ngày 29/10/2026

- Đã chuyển cấu trúc sang `client/`, `server/src/`, `server/prisma/`, secrets tại `server/.env`; các tài liệu nghiệm thu cũ trong `docs/implementation/` có thể dùng đường dẫn trước khi chuyển.
- Sau chuyển: Prisma generate, typecheck FE/BE/tests, build FE, lint và kiểm tra lockfile bằng `npm ci --dry-run` đều đạt; **65/65 test hồi quy** và **8/8 E2E** đạt với PostgreSQL local UTF-8. E2E chạy bản preview thông qua lệnh workspace, gồm PvP/WebRTC, hồ sơ và AI offline.
- `npm run dev` đã được chạy với Supabase thật: BE/FE health đều HTTP 200 và hai trình duyệt tạo/vào phòng public thành công. Docker chưa chạy do máy chưa có lệnh Docker; cấu hình đã cập nhật đường dẫn/cổng.
- Bản sửa tick chậm được giữ nguyên trong `server/src/game.ts`: chỉ có một tick đang chờ/chạy để không tích lũy trước thao tác tạo/vào phòng. Đo lại sau chuyển: tạo phòng public 3501ms, vào phòng 3996ms qua Supabase thật; xem `docs/implementation/public-room-check.json`. Đây là một lần đo, không cam kết hiệu năng.
- OAuth/SMTP thật, TURN qua mạng khác và FE/BE deploy public vẫn cần kiểm chứng riêng; không suy từ kiểm thử trên máy phát triển thành nghiệm thu cloud toàn hệ thống.


## Cấu hình dịch vụ

- Google/Facebook: điền CLIENT_ID/CLIENT_SECRET; callback chính xác `${APP_URL}/api/auth/oauth/google/callback` hoặc `/facebook/callback`. Google dùng state + PKCE. Không auto merge theo email. Đăng nhập tài khoản cũ rồi liên kết provider từ Hồ sơ. Cookie OAuth dùng SameSite=Lax cho top-level callback; refresh cookie HttpOnly/Strict, Secure khi APP_URL HTTPS.
- SMTP: HOST/PORT/USER/PASS/FROM. Không cấu hình sẽ báo rõ chưa có dịch vụ; token reset hash trong DB, dùng một lần, hạn 30 phút. Phản hồi không tiết lộ email có tồn tại. Kiểm tra việc thư thật tới hộp thư trước nghiệm thu.
- WebRTC: STUN mặc định, TURN_URL/USERNAME/CREDENTIAL nếu cần NAT relay. Chỉ kỳ thủ có consent được lấy cấu hình media. Không recording. Kiểm tra với camera thật, HTTPS và hai mạng khác nhau.
- Admin: đăng ký tài khoản bình thường rồi operator chạy `node scripts/admin.mjs email-da-dang-ky`; đăng nhập lại. Không có tài khoản/mật khẩu Admin mẫu.

## Docker và triển khai

Kết quả hardening 16/10: [final-readiness-report](docs/implementation/final-readiness-report.md). Hướng dẫn HTTPS/proxy, secrets, backup/restore, rollback và dịch vụ thật: [deployment-runbook](docs/implementation/deployment-runbook.md). Mẫu `deploy/nginx.conf.example` chưa chạy trên host đích. Rehearsal local dùng `node scripts/backup-check.mjs`; cần PostgreSQL 18+ client tools và `PG_TOOLS_BIN` trỏ thư mục chứa `pg_dump.exe`/`pg_restore.exe`. Thiếu tools sẽ BLOCKED trước khi thay đổi DB.

Compose có PostgreSQL và Backend, yêu cầu POSTGRES_PASSWORD, JWT_SECRET, APP_URL. Dừng PostgreSQL embedded trước nếu dùng cùng port 54329. Docker daemon phải hoạt động. Chưa chạy Docker build trong môi trường này vì daemon không sẵn sàng; cấu hình không được coi là đã nghiệm thu.

Frontend `client/dist/` phục vụ qua web server HTTPS, SPA fallback `index.html`. Proxy `/api` và `/socket.io` tới Backend port 3002, hỗ trợ WebSocket upgrade, CORS đúng APP_URL. Không cache API riêng tư. Giữ một instance Backend; không scale ngang khi chưa bổ sung coordination store. Sao lưu PostgreSQL trước mọi migration lên môi trường có dữ liệu. Chưa tự deploy lên public/GitHub.

Nếu đặt sau đúng một reverse proxy, cấu hình TRUST_PROXY=1 và để proxy ghi X-Forwarded-For đúng; local mặc định 0. Không expose Backend trực tiếp khi dùng cấu hình trust proxy theo hop.

Server restart giữ biên bản committed nhưng hủy an toàn ván đang hoạt động với SERVER_RECOVERY, không tự suy đoán thắng. SAVED được bảo toàn. Đây là chính sách sự cố [BA-11], không phải seamless recovery. Reconnect thông thường giữ đồng hồ và board; deadline từng người 60s, ngân sách pause 180s.

## Hồ sơ công khai, lịch sử và quản trị trận

Trong **Bạn bè**, tìm kỳ thủ hoặc chọn một người trong danh sách rồi mở **Xem hồ sơ**. Hồ sơ hiển thị tên, avatar, mã công khai, trạng thái hiện diện và lịch sử được phép xem. Khi kỳ thủ ẩn lịch sử, chỉ các ván chung với người đang xem được hiển thị; chặn người dùng tiếp tục có hiệu lực.

**Lịch sử & kỳ phổ** có bộ lọc ngày, đối thủ, kết quả và chế độ PvP. Bấm **Áp dụng bộ lọc**, sau đó **Tải thêm** để duyệt các bản ghi cũ. Chế độ gồm phòng công khai, phòng riêng, ghép ngẫu nhiên và chưa xác định (dữ liệu cũ thiếu nguồn). Ván AI vẫn lưu trong trình duyệt theo tài khoản/phiên.

Trong **Quản trị**, các nhóm Tài khoản, Báo cáo, Audit log và Trận đấu có phân trang. Mở **Xem kỹ thuật** để đọc phiên bản, đồng hồ, kết nối và đề nghị đang chờ của trận. Truy vấn chi tiết được ghi audit; chức năng này không thay đổi nước đi hoặc kết quả.

API danh sách nhận `limit` (1–50) và `cursor`, trả `{ items, nextCursor }`; dùng `nextCursor` nguyên vẹn cho trang kế tiếp. History nhận `date=YYYY-MM-DD`, `opponent`, `result=win|loss|draw|canceled`, `mode=PUBLIC|PRIVATE|RANDOM|UNKNOWN`. Giữ nguyên bộ lọc khi tải trang sau. API profile: `/api/users/:id/profile`; trạng thái kỹ thuật: `/api/admin/matches/:id`.

Sau khi cập nhật mã nguồn, tạo Prisma Client và áp dụng migration bổ sung metadata/index vào database được cấu hình trong `server/.env` trước khi chạy Backend:

```powershell
npm run db:generate
npm run db:migrate
npm run dev
```

Kiểm thử dùng database local riêng: chạy lần lượt `npm test`, `npm run build`, sau đó `npm run test:ui`. Không chạy hai bộ test đồng thời trên cùng database vì vòng tick của UI tác động vào fixture đồng hồ giả. Test runner tự triển khai migration vào database local có hậu tố `_test`. Bộ lọc ngày dùng giờ Việt Nam (UTC+07:00).

## Luật và AI

Luật trường chiếu theo SRS 5.1.1: nước tạo lần lặp thứ ba bị chặn nếu bên đang đi đã chiếu sau mọi lượt của mình trong chu kỳ gần nhất. Không tự hòa vì 60 nước, thiếu quân hoặc lặp không chiếu. Stalemate là thua.

AI là engine JS tự viết (alpha-beta, iterative deepening, material/pawn progress), không trọng số hoặc thư viện engine bên thứ ba. Dễ depth 1/60ms, Trung bình depth 2/350ms, Khó depth tối đa 4/1300ms. Khó không được quảng cáo là trình độ Pikafish/chuyên nghiệp; sức mạnh với người chơi có kinh nghiệm và thiết bị mobile thật vẫn cần đánh giá. Nguồn quyết định giấy phép: https://www.pikafish.com/en/list.html và https://github.com/official-pikafish/Pikafish.
