# Deploy đồ án: Render Web Service + Supabase

> Phương án hiện tại đã chọn. Railway tạm ngừng đăng ký mới; không cần tạo tài khoản Railway.

**Render chạy chung React, Express/Socket.IO; Supabase PostgreSQL lưu dữ liệu qua Prisma; Google OAuth.** Không tạo Render Postgres. Account/mật khẩu và Guest hiện có vẫn hoạt động. Facebook không còn UI/config/route OAuth public; dữ liệu Identity lịch sử được giữ.

## 1. Đưa bản code mới lên GitHub

Repository phải có `render.yaml`, `server/src/middleware/frontend.ts` và các thay đổi liên quan. Render không đọc mã còn nằm riêng trên máy. Không đưa `.env`, `.local`, backup dump hoặc node_modules lên Git. Mã được chuẩn bị để triển khai; chưa tạo tài nguyên cloud. Chọn nhánh main sau khi bản cập nhật đã push thành công.

## 2. Tạo bằng Blueprint

Đăng nhập [Render Dashboard](https://dashboard.render.com), kết nối GitHub → **New → Blueprint** → chọn repo và nhánh có code mới → kiểm tra cấu hình rồi triển khai.

Blueprint chỉ tạo một Web Service. Trong Supabase, lấy đúng **Connect → Session pooler** connection string (IPv4/port 5432), rồi điền vào secret DATABASE_URL khi Render hỏi. Không dùng anon/service-role key thay database URL. Backup trước khi áp dụng migrations lên database có dữ liệu; không reset hoặc tạo lại project.

| Tài nguyên / biến | Giá trị |
|---|---|
| `ky-vien` | Web Service, Node 24.22.1, Free, một instance |
| `DATABASE_URL` | Supabase Session pooler URL, nhập dưới dạng secret |
| `JWT_SECRET` | Tự sinh, giữ nguyên qua redeploy |
| `APP_URL` | Code lấy HTTPS `RENDER_EXTERNAL_URL` do Render cấp |
| `PORT` | Dùng PORT của Render, không đặt cố định |
| `SERVE_CLIENT=true` | BE phục vụ client/dist cùng API/WebSocket |
| `TRUST_PROXY=1` | Một proxy Render, không thêm Nginx trong Web Service |
| Auto deploy | Tắt; Manual Deploy khi chủ động cập nhật |

Build: `npm ci --include=dev && npm run db:generate && npm run build`.

Start: `npm run db:migrate && node --import tsx server/src/index.ts`.

Chờ **Live**, mở đúng URL HTTPS Render cấp; `/api/health` phải trả `{"status":"ok"}`. Có thể dùng Guest hoặc đăng ký/login thường trước khi bật Google. Migrations chạy vào Supabase đã cấu hình; không tự chuyển, xóa hoặc thay thế dữ liệu.

Nếu tạo thủ công, chọn runtime **Node**, root repository; cấu hình commands/env giống Blueprint. Không chọn Static Site. Supabase đã kết nối và đối chiếu đủ bốn migration bằng truy vấn chỉ đọc; xem `implementation/supabase-connection-results.json`. Render deployment và Google OAuth thật vẫn cần cấu hình tài khoản/credentials riêng.

## 3. Bật Google

Trong Google Cloud project:

1. Cấu hình Google Auth Platform / OAuth consent và audience. Nếu dùng Testing, thêm email của bạn và người chấm vào test users.
2. Tạo OAuth client loại **Web application**.
3. Thêm Authorized redirect URI chính xác theo URL service:

   ```text
   https://TEN-THUC-TE.onrender.com/api/auth/oauth/google/callback
   ```

4. Render → Web Service → **Environment**: thêm `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, save/redeploy. Không đưa secret vào Git hoặc chat.
5. Thử Google login, logout, login lại. Nếu email trùng tài khoản thường, đăng nhập tài khoản đó rồi **Liên kết Google** ở Hồ sơ; không tự merge bằng email.

Nút Google chỉ bật khi đủ cả hai giá trị. Không cần SMTP cho Google login. Không bật Supabase Auth hoặc dùng `/auth/v1/callback`. Không đặt APP_URL localhost trên Render. Nếu sau này dùng domain riêng, đặt APP_URL HTTPS và sửa Google redirect URI khớp hoàn toàn.

## 4. Chuẩn bị báo cáo

- Mở website trước vài phút: Free có thể ngủ sau 15 phút không có inbound HTTP/WebSocket; cold start khoảng một phút.
- Thử hai browser context: vào phòng, ready, đi quân, chat, save/resume, surrender/replay.
- Chờ AI báo đã cache, tắt mạng/reload và thử tiếp tục ván.
- Không deploy/restart giữa ván demo: BA-11 hủy an toàn active match khi Backend restart, giữ biên bản/SAVED; không seamless recovery.
- Không dùng Render Postgres nên không có yêu cầu thời hạn 30 ngày của dịch vụ đó. Giữ project/database Supabase hiện tại.
- Quên mật khẩu account thường cần SMTP riêng. Camera/mic/TURN qua hai mạng vẫn cần kiểm chứng riêng nếu trình diễn video; Google/PvP PASS không phải TURN PASS.

## 5. Rehearsal local (không bắt buộc)

Rehearsal `kyvien-render-check` dùng tài nguyên local riêng; volume/env được giữ, không có database nào bị xóa. Trạng thái chạy/dừng phụ thuộc lần kiểm thử gần nhất. `compose.render-local.yaml` chỉ là fixture local (Web 5181, DB 54331), không phải tài nguyên cloud cần tạo. Report render-* chỉ chứng minh phạm vi local, không phải Supabase thật.

```powershell
docker compose -p kyvien-render-check -f compose.render-local.yaml --env-file .local/render-check.env up -d --build --wait

# Unit/UI: PostgreSQL local 54329 cần chạy trong terminal riêng.
npm test -- --reporter=json --outputFile=docs/implementation/render-unit-results.json
npm run build
npm run test:ui -- --reporter=json --outputFile=docs/implementation/render-ui-results.json

# Acceptance chỉ vào container local, không trỏ runner vào cloud DB:
$env:LOCAL_ACCEPTANCE_ENV_FILE='.local/render-check.env'
$env:ACCEPTANCE_REPORT_PREFIX='render-deployment'
node scripts/release-acceptance.mjs

$env:DEPLOY_ORIGIN='http://127.0.0.1:5181'
$env:BROWSER_REPORT_FILE='docs/implementation/render-browser-results.json'
npx playwright test --config tests/deploy/browsers.config.ts
```

Không chạy đồng thời hai runner dùng cùng local `_test` database. Acceptance tạo account/đổi role QA, không chạy trên dữ liệu thật. Dừng rehearsal bằng `docker compose -p kyvien-render-check -f compose.render-local.yaml --env-file .local/render-check.env stop`, không xóa volume.

Nguồn: [Blueprint](https://render.com/docs/blueprint-spec), [Postgres](https://render.com/docs/postgresql-creating-connecting), [Free limits](https://render.com/docs/free), [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server). JSON Schema và rehearsal local không thay nghiệm thu Render/Google thật.

## Email khôi phục và đổi mật khẩu

Render Free chặn cổng SMTP 25/465/587. Dùng Brevo Transactional Email API qua HTTPS: tạo tài khoản Brevo, bật gửi transactional email, xác minh địa chỉ người gửi, tạo API key. Trên Render đặt `BREVO_API_KEY` và `MAIL_FROM` (email người gửi đã xác minh), rồi deploy. Tài khoản Brevo có thể cần xét duyệt trước khi gửi được; gửi thử thật tới Gmail, kể cả hộp thư Spam. Không ghi API key vào Git hay chat. Khi dùng địa chỉ gửi Gmail, Brevo có thể thay đổi địa chỉ From để đáp ứng chính sách nhà cung cấp; domain riêng đã xác thực tăng khả năng nhận thư.

Người dùng yêu cầu liên kết tại Quên mật khẩu hoặc Hồ sơ → Bảo mật tài khoản. Liên kết hiệu lực 30 phút, chỉ dùng một lần; đổi mật khẩu thu hồi phiên và vô hiệu các liên kết cũ. Nếu chưa cấu hình gửi thư, chức năng chưa sẵn sàng. SMTP vẫn hỗ trợ trên host cho phép kết nối bằng `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
