# Đăng ký và đăng nhập riêng — 29/10/2026

Theo yêu cầu cập nhật của chủ dự án, đăng ký bằng username/email/mật khẩu chỉ tạo tài khoản. Quyết định này thay thế hành vi cấp phiên ngay khi đăng ký được mô tả trong SRS ban đầu.

API `/api/auth/register` trả `{ ok: true, message }`, không trả token/actor, không tạo Session và không gửi refresh cookie. Đăng nhập tại `/api/auth/login` mới cấp phiên theo chính sách hiện hành. Đăng ký khi có Guest không chuyển quyền sang tài khoản mới; việc gộp Guest vẫn cần xác nhận ở lúc đăng nhập.

Giao diện sau đăng ký mở form Đăng nhập, điền sẵn username, xóa mật khẩu và hiển thị thông báo thành công. Không gọi attach phiên từ phản hồi đăng ký. Người dùng đăng nhập thủ công để sử dụng tài khoản; tải lại trang sau đăng ký không tự tạo phiên.

Kiểm thử API mới trong `tests/registration.test.ts` đạt 2/2: không cấp phiên trước đăng nhập, từ chối refresh/me chưa đăng nhập, đăng nhập được sau đăng ký, duplicate không tạo phiên, giữ phiên Guest. Bộ xác thực hiện có đạt 9/9 sau khi tách IP fixture khỏi các kịch bản xác thực để tránh cộng dồn vượt rate limit. Giới hạn ứng dụng giữ nguyên.

Các fixture REST/Socket/UI/E2E đã đổi thành đăng ký rồi đăng nhập tường minh. Bộ trình duyệt đạt 8/8 E2E; hồi quy đăng ký qua reload và truy cập Hồ sơ đạt. Lượt UI tổng có 14/15 đạt, một assertion kích thước toast bị ảnh hưởng animation; sửa test chờ kích thước ổn định rồi chạy lại đăng ký/toast đạt 2/2. Lượt API tổng đạt 75/76 trước sửa IP fixture; sau sửa, toàn bộ file xác thực chạy lại đạt 9/9. Build, typecheck và lint đạt. Không cần migration database cho thay đổi này.

Xác minh trước khi push ngày 30/10/2026: `npm test` chạy lại toàn bộ đạt **76/76**, 11 file, không còn lỗi fixture rate-limit.
