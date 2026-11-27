# Chấm công An Tâm

**Từ 27/11/2026 Chấm công là bộ phận thứ 4 trong web An Tâm** (https://claude.ai/artifact/ErmZYgHgUzBeTJrtTR6yAC, màn chọn bộ phận › Chấm công), dùng chung kho dữ liệu với Đóng hàng, Kho, Giao. `kho-noi-bo/online/build.py --hop` nhúng file này vào trang gộp (template `hop-cc`, hàm `hopAppCc`). Trong trang gộp dữ liệu đổi tên: `ccnv/list`, `ccset/app`, `ccfc/<mã nv>`, `cc/<yyyy-mm>/p/<id>`; quy tắc của trang An Tâm cho 4 đường dẫn này: chỉ quản lý (Editor) đọc/ghi, các bộ phận khác giữ quyền cũ. Tệp mô hình khuôn mặt đăng kèm trang An Tâm ở `model/`. Dữ liệu cũ (2 nhân viên, 2 khuôn mặt, 8 lượt) đã chép sang An Tâm; trang riêng bên dưới chỉ còn để xem dữ liệu cũ.

Web chấm công bằng khuôn mặt (thẻ QR dự phòng): https://claude.ai/artifact/6qCeybs8YTqcQojBwQDdaM

Nhân viên không cần điện thoại hay tài khoản: đến và về bấm nút trên máy ở cửa, nhìn vào camera và chụp; web nhận ra khuôn mặt và ghi giờ. Thẻ QR in sẵn dùng khi không nhận ra mặt. Chỉ máy ở cửa và người quản lý mở trang. Cả hai cần quyền chỉnh sửa trang (Editor); dữ liệu chỉ người có quyền này đọc và ghi được.

## Cách dùng
- **Máy chấm công**: máy tính bảng / máy tính ở cửa, mở mục Máy chấm công, bấm Bắt đầu (bật âm báo, giữ màn hình sáng). Mỗi máy chọn cách chấm riêng (nhớ trên máy đó):
  - **Khuôn mặt** (mặc định): bấm ô lớn, camera mở ra, chụp mặt. Web dò khuôn mặt lớn nhất, so với khuôn mặt đã đăng ký: độ lệch ≤ 0,45 là khớp, và người khớp nhất phải hơn người thứ hai ít nhất 0,05; nếu không thì báo chụp lại. Lượt chấm lưu kèm ảnh nhỏ 96 px và độ lệch để quản lý đối chiếu. Không chống được ảnh chụp của ảnh: quản lý xem ảnh nhỏ ở Bảng công › Lượt chấm.
  - **Camera máy này** (mặc định): nhân viên bấm ô lớn, camera của máy mở ra (chọn camera trước/sau), chụp thẻ; web tự đọc mã (thử nhiều cỡ ảnh và vùng giữa) rồi ghi giờ. Khung claude.ai không cho mở luồng camera liên tục nên mỗi lượt là một lần chụp.
  - **Máy đọc mã USB** (loại đọc mã 2D, kiểu bàn phím): máy đọc gõ số trên thẻ rồi Enter vào ô luôn giữ con trỏ, không cần chạm màn hình.
  Màn hình hiện tên, Vào/Ra, giờ, đi muộn/về sớm. Quét lại trong 1 phút không ghi thêm. Có thể gõ số trên thẻ rồi Enter.
- **Đăng ký khuôn mặt** (Nhân viên & thẻ › Khuôn mặt): chụp 3 ảnh (thẳng, quay trái, quay phải) hoặc chọn ảnh có sẵn. Chặn ảnh giống người khác đã đăng ký (< 0,4) và ảnh không giống các ảnh trước (> 0,6). Lưu `fc/<mã nv>` = đặc trưng 128 số mỗi ảnh và 1 ảnh nhỏ; không lưu ảnh gốc. Cần nhân viên đồng ý (dữ liệu sinh trắc học).
- **Nhân viên & thẻ**: thêm từng người hoặc dán cả danh sách (`Họ tên | Bộ phận | Ca`). Mã thẻ là 10 chữ số ngẫu nhiên, chỉ dùng chữ số để bộ gõ tiếng Việt không làm sai mã. "In thẻ" mở khung xem trước các trang A4 (10 thẻ cỡ ATM mỗi trang), bấm Ctrl+P để in; chỉ các trang thẻ được in. Trình duyệt nào in ra cả trang claude.ai thì dùng nút "Không in được? Tải PDF". Mất thẻ thì Sửa › Cấp thẻ mới (thẻ cũ hết dùng được). Nhân viên nghỉ thì bỏ tích Đang làm việc.
- **Bảng công**: theo ngày (ai đã chấm, đi muộn, về sớm), bảng công tháng (giờ làm từng ngày, ngày công, số lần muộn), lượt chấm (chấm tay khi quên thẻ, hủy lượt sai), tải Excel.
- **Cài đặt**: ca làm việc (ca qua đêm khi giờ ra nhỏ hơn giờ vào; giờ ra sáng hôm sau tính cho ngày vào ca), số phút cho phép trễ.

## Camera
claude.ai không cho trang mở webcam trực tiếp (quyền `camera` không có trong runtime; khai báo bị từ chối "unknown capability: camera"). Trang chỉ mở camera qua `<input type=file capture>`: chỉ Android, iPhone, iPad mở camera để chụp; Windows (kể cả Surface), macOS chỉ mở hộp chọn tệp. Vì vậy máy chấm công khuôn mặt phải là máy tính bảng Android, iPad hoặc điện thoại. Trên Windows/macOS trang hiện cảnh báo, gợi ý dùng máy đọc mã USB hoặc ứng dụng Camera rồi chọn ảnh.

## Bộ nhận diện
`@vladmandic/face-api@1.7.15` (nạp từ jsDelivr khi cần) chạy ngay trên máy, WebGL nếu có. Tệp mô hình (khoảng 12 MB) đăng kèm trang ở `model/`, lấy bằng `bash cham-cong/lay-mo-hinh.sh <thư mục>`; tệp trọng số đổi đuôi `.bin` thành `.wasm` vì trang không phục vụ `.bin`. Đăng lại trang không cần gửi lại các tệp này: tệp không gửi được giữ nguyên.

## Dữ liệu
- `fc/<mã nv>` – khuôn mặt đã đăng ký: `{d: [[128 số]…], th, n, at}`.
- `nv/list` – nhân viên: `{a: {mã: {ten, bp, ca, ma, on}}}`.
- `set/app` – ca làm việc, số phút cho phép trễ.
- `cc/<yyyy-mm>/p/<id>` – lượt chấm: `{d, u, at, src: mat|the|anh|tay, th, kc, note, huy}`.
