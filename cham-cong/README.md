# Chấm công An Tâm

Web chấm công bằng thẻ QR: https://claude.ai/artifact/6qCeybs8YTqcQojBwQDdaM

Nhân viên không cần điện thoại hay tài khoản. Mỗi người một thẻ QR in sẵn, đến và về quét thẻ vào máy đọc mã ở cửa. Chỉ máy ở cửa và người quản lý mở trang. Cả hai cần quyền chỉnh sửa trang (Editor); dữ liệu chỉ người có quyền này đọc và ghi được.

## Cách dùng
- **Máy chấm công**: máy tính hoặc máy tính bảng ở cửa, cắm máy đọc mã QR loại USB (kiểu bàn phím, đọc được mã 2D). Mở mục Máy chấm công, bấm Bắt đầu (bật âm báo, giữ màn hình sáng). Máy đọc gõ số trên thẻ rồi Enter vào ô luôn được giữ con trỏ; màn hình hiện tên, Vào/Ra, giờ và báo đi muộn hoặc về sớm. Quét lại trong 1 phút không ghi thêm. Chưa có máy đọc thì dùng nút "Chụp thẻ bằng camera" hoặc gõ số trên thẻ.
- **Nhân viên & thẻ**: thêm từng người hoặc dán cả danh sách (`Họ tên | Bộ phận | Ca`). Mã thẻ là 10 chữ số ngẫu nhiên, chỉ dùng chữ số để bộ gõ tiếng Việt không làm sai mã. "Tải PDF in thẻ" cho file PDF khổ A4, 10 thẻ cỡ ATM mỗi trang; in tỉ lệ 100%. Mất thẻ thì Sửa › Cấp thẻ mới (thẻ cũ hết dùng được). Nhân viên nghỉ thì bỏ tích Đang làm việc.
- **Bảng công**: theo ngày (ai đã chấm, đi muộn, về sớm), bảng công tháng (giờ làm từng ngày, ngày công, số lần muộn), lượt chấm (chấm tay khi quên thẻ, hủy lượt sai), tải Excel.
- **Cài đặt**: ca làm việc (ca qua đêm khi giờ ra nhỏ hơn giờ vào; giờ ra sáng hôm sau tính cho ngày vào ca), số phút cho phép trễ.

## Dữ liệu
- `nv/list` – nhân viên: `{a: {mã: {ten, bp, ca, ma, on}}}`.
- `set/app` – ca làm việc, số phút cho phép trễ.
- `cc/<yyyy-mm>/p/<id>` – lượt chấm: `{d, u, at, src: the|anh|tay, note, huy}`.
