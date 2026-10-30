# Hồ sơ, lịch sử và quản trị trận — 29/10/2026

## Chức năng

- Hồ sơ kỳ thủ mở từ tìm bạn, bạn bè và đối thủ trong lịch sử. Chỉ hiển thị thông tin công khai và trạng thái hiện diện.
- Lịch sử PvP dùng phân trang keyset theo createdAt/id, 20 bản ghi/lần trên UI, tối đa 50/API. Các bộ lọc ngày Việt Nam, tên đối thủ, kết quả và chế độ áp dụng trước phân trang. Kỳ phổ được tải riêng khi mở.
- Chế độ PUBLIC/PRIVATE/RANDOM ghi theo nguồn tạo trận; dữ liệu lịch sử thiếu nguồn dùng UNKNOWN. AI tiếp tục lưu cục bộ.
- Admin có các nhóm Tài khoản/Báo cáo/Audit log/Trận đấu, tìm kiếm và tải thêm. Chi tiết kỹ thuật chỉ đọc, được ghi audit, loại nội dung chat và receipts.
- Các truy vấn hồ sơ/lịch sử/replay áp dụng quyền ẩn lịch sử, block và quyền của kỳ thủ gốc. Khách tham gia trận vẫn xem lại được ván của mình.

## Cấu trúc và tối ưu

`client/src/DataViews.tsx` chứa các màn hình dữ liệu, tách khỏi luồng bàn cờ trong App. `server/src/browse.ts` chứa quy tắc cursor, lọc và dữ liệu tóm tắt. API danh sách mới không truyền toàn bộ log/bàn cờ/chat về frontend. Không tải trước tất cả nhóm Admin. Request cũ giữ dạng mảng tương thích; giao diện mới dùng items/nextCursor. Lịch sử dùng truy vấn SQL có tham số; quyền riêng tư được kiểm tra bằng EXISTS theo khóa người chơi/quan hệ chặn, không tải danh sách tài khoản toàn hệ thống. Mốc cursor dùng timestamp UTC tường minh, độc lập timezone của PostgreSQL.

Hai migration bổ sung cột mode, ràng buộc mode và index sắp xếp/phân trang, bao gồm index theo từng kỳ thủ/trạng thái/ngày/id. Không reset dữ liệu.

## Bằng chứng

Prisma Client generate, typecheck, build và lint đã chạy thành công. Ba journey mới đạt trên trình duyệt Chromium và database local: 25 ván không trùng qua nhiều trang/bộ lọc chế độ; hồ sơ ẩn chỉ hiện ván chung; Admin xem kỹ thuật không lộ chat và responsive 390px. Ảnh: `public-profile-mobile.png`, `admin-match-mobile.png`.

Lượt chạy đầu toàn bộ logic và UI đồng thời trên một database bị nhiễu bởi game tick thời gian thực tác động fixture đồng hồ giả. Chạy lại tuần tự đạt 74/74 kiểm thử logic/API (10 file), 14/14 kiểm thử UI (3 file, gồm wrapper chạy 8/8 E2E cũ). Sau tối ưu SQL, chạy lại browse 2/2 và ba journey UI mới 3/3 đều đạt. Kiểm thử SQL đã bắt và sửa khác biệt timestamp do timezone DB; không tăng timeout để che lỗi. Typecheck/lint và build đạt.

## Chạy và triển khai

Xem README mục Hồ sơ công khai, lịch sử và quản trị trận. Hai migration `202610290001_browsing` và `202610290002_history_indexes` đã áp dụng thành công vào database local test và Supabase cấu hình trong server/.env qua `npm run db:migrate`. Không reset hoặc xóa dữ liệu ứng dụng. Môi trường này có thể khởi động bằng `npm run dev`; môi trường khác cần `npm run db:generate`, `npm run db:migrate` trước. Không chạy hai test runner đồng thời trên cùng database. Các journey ghi dữ liệu kiểm thử chỉ chạy local, không ghi fixture lên Supabase.
