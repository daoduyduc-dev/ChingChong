# Deploy đồ án: Railway + Supabase

> Phương án dự phòng. Hiện dùng [Render + Supabase](DEPLOY_RENDER.md) vì Railway đang tạm ngừng đăng ký mới.

Một Railway service chạy React, Express và Socket.IO. Supabase hiện tại lưu dữ liệu PostgreSQL qua Prisma. Không thêm Postgres service trên Railway.

## Chuẩn bị tài khoản

Đăng ký tại https://railway.com bằng GitHub, kết nối repository `daoduyduc-dev/ChingChong`. Kiểm tra tài khoản là Full Trial hay Limited Trial: Limited Trial có giới hạn kết nối ra ngoài, cần xác minh kết nối Supabase thực tế trước khi dùng để báo cáo. Theo dõi credit và thời hạn trong dashboard; trial không bảo đảm đủ một số ngày cố định nếu credit hết trước.

Mã mới phải có trên nhánh triển khai. Hiện các thay đổi còn ở máy, chưa commit/push. Không đưa `server/.env`, `.local` hoặc backup vào Git.

## Tạo ứng dụng

1. New Project → Deploy from GitHub repo → chọn repository và nhánh đã cập nhật.
2. Giữ Root Directory là gốc repo. Railway đọc `railway.json`: Dockerfile `deploy/app.Dockerfile`, một replica, health check `/api/health`, Serverless tắt (`sleepApplication=false`). Không dùng Dockerfile gốc chỉ chạy backend.
3. Điền Variables dưới đây rồi deploy. Không ghi đè Start Command; Dockerfile chạy migration và khởi động ứng dụng.

| Biến | Giá trị |
|---|---|
| `DATABASE_URL` | Sao chép Supabase Session pooler URL hiện tại từ `server/.env` vào dashboard |
| `JWT_SECRET` | Sao chép giá trị hiện tại từ `server/.env`, giữ nguyên qua redeploy |
| `TRUST_PROXY` | `1` |
| `API_HOST` | `0.0.0.0` |
| `SERVE_CLIENT` | `true` |

Không sao chép `APP_URL=http://127.0.0.1:5174` hoặc PORT local. Railway cấp PORT. File `.env` không nằm trong Docker image.

4. Settings → Networking → Generate Domain. Nếu dashboard hỏi target port, dùng PORT đang được cấp cho service (Docker mặc định 10000 khi không có PORT khác).
5. Redeploy sau khi tạo domain. Code lấy `APP_URL=https://` + `RAILWAY_PUBLIC_DOMAIN`. Với domain riêng, đặt `APP_URL` bằng origin HTTPS chính xác, không có dấu `/` cuối.
6. Mở domain và `/api/health`. Phải có giao diện và health trả `{"status":"ok"}`. Health check này chưa thay thế kiểm thử database/đăng nhập.

Lệnh khởi động áp dụng migrations vào Supabase đã cấu hình. Backup trước khi có migration mới trên dữ liệu thật; không dùng reset. Chỉ một replica vì trạng thái ván và Socket.IO hiện được điều phối trong tiến trình.

## Google login

Trong Google Cloud Console, tạo OAuth Client kiểu Web application và cấu hình consent screen. Đặt Authorized JavaScript origin là origin HTTPS của Railway, Authorized redirect URI là:

```text
https://TEN-THUC-TE.up.railway.app/api/auth/oauth/google/callback
```

Điền `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` vào Railway Variables rồi redeploy. Nếu consent screen ở Testing, thêm tài khoản dùng demo vào Test users. Không gửi secret vào chat. Khi chưa cấu hình, Google login bị ẩn; Guest và đăng nhập mật khẩu vẫn dùng được. Không cần Facebook hoặc SMTP để dùng Google.

## Nghiệm thu trên URL thật

- Đăng ký, đăng nhập, đăng xuất và tải lại trang; cookie HTTPS hoạt động.
- Google callback với tài khoản demo; kiểm tra đúng tài khoản sau đăng nhập.
- Hai trình duyệt/tài khoản tạo phòng, vào phòng, đi quân, tải lại và kết nối lại Socket.IO.
- Chơi AI, chuyển offline và tiếp tục; kiểm tra trên điện thoại.
- Xem logs không có lỗi Prisma/network; xác nhận dữ liệu còn sau redeploy. Restart có thể kết thúc ván đang chạy theo cơ chế phục hồi hiện tại, nên tránh redeploy giữa buổi demo.
- Theo dõi credit và usage trước buổi báo cáo. Không tự nâng gói trả phí khi chưa có quyết định của chủ tài khoản.

Tài liệu chính thức: [Public networking](https://docs.railway.com/networking/public-networking), [Free Trial](https://docs.railway.com/pricing/free-trial), [Config schema](https://railway.com/railway.schema.json).

Hiện chưa có deployment public vì chủ dự án chưa tạo tài khoản Railway. Google OAuth cũng chưa có credentials; các bước này chưa được nghiệm thu trên cloud.
