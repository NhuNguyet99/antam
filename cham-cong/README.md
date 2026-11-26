# Chấm công An Tâm

Web chấm công bằng mã QR: https://claude.ai/artifact/6qCeybs8YTqcQojBwQDdaM

## Cách dùng
- **Máy QR** (máy tính bảng ở cửa, mở bằng tài khoản quản lý có quyền chỉnh sửa trang): hiện mã QR tự đổi mỗi 30 giây và xác nhận từng lượt quét ngay khi nhân viên quét. Giữ trang mở; web tự giữ màn hình sáng.
- **Nhân viên**: dùng camera điện thoại quét mã, bấm link → trang mở và ghi giờ. Lần quét đầu trong ca là giờ vào, lần cuối là giờ ra. Dự phòng: nút "Chụp ảnh mã QR" (web tự đọc mã trong ảnh) hoặc nhập mã 6 ký tự hiện dưới QR.
- **Bảng công**: theo ngày (ai đã chấm, đi muộn, về sớm), bảng công tháng (số giờ từng ngày, ngày công, số lần muộn), lượt quét (chấm tay khi quên quét, hủy lượt sai), tải Excel.
- **Cài đặt**: link trang, số phút cho phép trễ, chu kỳ đổi mã, ca làm việc (ca qua đêm: giờ ra < giờ vào), ca của từng nhân viên, đổi khóa mã QR.

Nhân viên đăng nhập bằng nick (khối đăng nhập dùng chung `shared/nick-gate.html`). Trang cần chia sẻ cho nhân viên với quyền Contributor để ghi được lượt quét.

## Chống chấm hộ
Mã = HMAC(khóa bí mật, khung giờ 30 giây), 6 ký tự. Link trong QR: `<link trang>#cc-<khung giờ>-<mã>`.
- Khóa nằm ở `cfg/secret`, chỉ quản lý đọc được.
- Nhân viên chỉ ghi lượt quét (`cc/...`). Kết quả "Hợp lệ" (`ccv/...`) chỉ máy QR / quản lý ghi được.
- Mã quá 2,5 phút bị báo hết hạn. Giờ điện thoại lệch quá 3 phút thì lấy giờ máy QR nhận.

## Dữ liệu
- `set/app` – cài đặt.
- `cfg/secret` – khóa mã QR.
- `cc/<yyyy-mm>/p/<id>` – lượt quét.
- `ccv/<yyyy-mm>/v/<id>` – kết quả xác nhận (`ok`, `tay`, `huy`, `het`, `sai`).
- `auth/accounts` – nick nhân viên.
