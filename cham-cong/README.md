# Chấm công An Tâm

Web chấm công bằng thẻ QR: https://claude.ai/artifact/6qCeybs8YTqcQojBwQDdaM

Nhân viên không cần điện thoại hay tài khoản. Mỗi người một thẻ QR in sẵn, đến và về quét thẻ vào máy đọc mã ở cửa. Chỉ máy ở cửa và người quản lý mở trang. Cả hai cần quyền chỉnh sửa trang (Editor); dữ liệu chỉ người có quyền này đọc và ghi được.

## Cách dùng
- **Máy chấm công**: máy tính bảng / máy tính ở cửa, mở mục Máy chấm công, bấm Bắt đầu (bật âm báo, giữ màn hình sáng). Mỗi máy chọn cách quét riêng (nhớ trên máy đó):
  - **Camera máy này** (mặc định): nhân viên bấm ô lớn, camera của máy mở ra (chọn camera trước/sau), chụp thẻ; web tự đọc mã (thử nhiều cỡ ảnh và vùng giữa) rồi ghi giờ. Khung claude.ai không cho mở luồng camera liên tục nên mỗi lượt là một lần chụp.
  - **Máy đọc mã USB** (loại đọc mã 2D, kiểu bàn phím): máy đọc gõ số trên thẻ rồi Enter vào ô luôn giữ con trỏ, không cần chạm màn hình.
  Màn hình hiện tên, Vào/Ra, giờ, đi muộn/về sớm. Quét lại trong 1 phút không ghi thêm. Có thể gõ số trên thẻ rồi Enter.
- **Nhân viên & thẻ**: thêm từng người hoặc dán cả danh sách (`Họ tên | Bộ phận | Ca`). Mã thẻ là 10 chữ số ngẫu nhiên, chỉ dùng chữ số để bộ gõ tiếng Việt không làm sai mã. "In thẻ" mở khung xem trước các trang A4 (10 thẻ cỡ ATM mỗi trang), bấm Ctrl+P để in; chỉ các trang thẻ được in. Trình duyệt nào in ra cả trang claude.ai thì dùng nút "Không in được? Tải PDF". Mất thẻ thì Sửa › Cấp thẻ mới (thẻ cũ hết dùng được). Nhân viên nghỉ thì bỏ tích Đang làm việc.
- **Bảng công**: theo ngày (ai đã chấm, đi muộn, về sớm), bảng công tháng (giờ làm từng ngày, ngày công, số lần muộn), lượt chấm (chấm tay khi quên thẻ, hủy lượt sai), tải Excel.
- **Cài đặt**: ca làm việc (ca qua đêm khi giờ ra nhỏ hơn giờ vào; giờ ra sáng hôm sau tính cho ngày vào ca), số phút cho phép trễ.

## Dữ liệu
- `nv/list` – nhân viên: `{a: {mã: {ten, bp, ca, ma, on}}}`.
- `set/app` – ca làm việc, số phút cho phép trễ.
- `cc/<yyyy-mm>/p/<id>` – lượt chấm: `{d, u, at, src: the|anh|tay, note, huy}`.
