# Web Nhân sự An Tâm – hướng dẫn triển khai & sử dụng

Web quản lý **tuyển dụng** và **nhân sự** cho Công ty TNHH SX-TM Ẩm Thực An Tâm.
Chạy trên Google Apps Script giống web Quản trị / web Kho: dữ liệu lưu trong Google Sheet, CV lưu trong Google Drive.

| File | Vai trò |
|---|---|
| `Code.gs` | Phần chạy trên máy chủ Google: đọc/ghi Google Sheet, lưu CV lên Drive, gửi email báo cáo |
| `NhanSu.html` | Toàn bộ giao diện web |

> **Bảo mật:** web chứa lương, số tài khoản, CCCD của nhân viên. Dùng một **Google Sheet riêng** cho nhân sự (không dùng chung Sheet "An Tâm – Dữ liệu quản trị"), và khi triển khai chỉ cấp quyền cho người phòng HCNS / Ban Giám đốc. Không đưa file sao lưu (.json) hay file lương lên GitHub – kho mã này đang để công khai.

## 1. Đưa web lên Google Apps Script (làm 1 lần)

1. Tạo Google Sheet mới, đặt tên **"An Tâm – Dữ liệu nhân sự"**.
2. Menu **Tiện ích mở rộng → Apps Script**.
3. File `Code.gs` có sẵn: xoá hết, dán toàn bộ nội dung file `Code.gs` trong thư mục này.
4. Bấm **+** cạnh "Tệp" → **HTML** → đặt tên đúng là `NhanSu` (không gõ .html). Xoá nội dung mẫu, dán toàn bộ `NhanSu.html`. Bấm lưu (Ctrl+S), đặt tên dự án "Nhân sự An Tâm".
5. **Triển khai → Tuỳ chọn triển khai mới → Ứng dụng web**
   - Thực thi dưới dạng: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai** – máy khác mở được ngay, không phải đăng nhập Google. Dữ liệu vẫn được bảo vệ bằng tài khoản đăng nhập riêng của web (mục "Đăng nhập & phân quyền").
6. Cấp quyền (Google hỏi quyền Sheet, Drive, Gmail để lưu dữ liệu, lưu CV, gửi báo cáo) → nếu hiện "Google chưa xác minh ứng dụng này": **Nâng cao → Đi tới Nhân sự An Tâm → Cho phép**.
7. Sao chép **URL ứng dụng web** (…/exec). Đó là link web nhân sự.

Khi sửa mã sau này: dán mã mới → **Triển khai → Quản lý các lần triển khai → bút chì → Phiên bản mới → Triển khai**. Link giữ nguyên.

Có thể mở thẳng file `NhanSu.html` bằng trình duyệt để dùng thử: dữ liệu khi đó chỉ lưu trên máy đang mở, CV lưu trong trình duyệt.

## 2. Nạp dữ liệu nhân sự lần đầu

1. Tải file **`Lương T8 mới.xlsx`** (Drive › An Tâm – Dữ liệu (từ máy tính 05-10-2026) › HSCB AN TÂM) về máy.
2. Web → **Cài đặt & dữ liệu → Nhập dữ liệu nhân sự từ file lương Excel** → chọn file → xem trước → **Nhập**.
   - Đọc 43 nhân viên của 6 khối (Kebab, Tacos, Quản lý/Giám sát/QC SX, Kỹ thuật, Giao hàng, Văn phòng): chức danh, cấp bậc, ngày vào làm, lương thoả thuận, LCB, phụ cấp, lương đóng BHXH, cách tính thuế, số người phụ thuộc, ngân hàng / số tài khoản (sheet "Ngân hàng-Thực lãnh").
   - Tạo luôn **bảng lương tháng 8/2026**. Tổng khớp file: tổng thu nhập 426.615.051đ, thực lãnh 336.433.326đ. 7 dòng khác công thức chuẩn được giữ nguyên số của file và gắn nhãn "nhập từ file".
   - Nhập lại file tháng sau: nhân viên trùng mã được **cập nhật**, không tạo trùng.
3. Vào **Hồ sơ nhân sự**, bổ sung những gì file lương không có: ngày sinh, CCCD, **hợp đồng** (số HĐ, loại, ngày hết hạn), giấy tờ hồ sơ. Đây là căn cứ để web cảnh báo hạn hợp đồng và kiểm tra pháp lý.
4. Kiểm tra lại trạng thái **thử việc**. File tháng 8 ghi "CÒN THỬ VIỆC" cho 17 người; nếu ai đã chuyển chính thức thì vào hồ sơ đổi trạng thái hoặc dùng **Theo dõi thử việc → Đánh giá thử việc**.

Web có sẵn **16 yêu cầu tuyển dụng mẫu** kèm MTCV lấy từ các poster, ở trạng thái **Chờ duyệt**.

- Trang **Yêu cầu tuyển dụng** có nút **Chỉ giữ 3 vị trí ví dụ** (Nhân viên QC, Nhân viên C&B, Nhân viên sale online) để xoá các vị trí mẫu chưa dùng.
- Muốn xoá nhiều yêu cầu khác: tích ô đầu dòng rồi bấm **Xoá … dòng đã chọn**.
- Vị trí giữ lại: xác nhận số lượng rồi chuyển sang **Đang tuyển**.

## 3. Quy trình tuyển dụng trên web

```
Tiếp nhận yêu cầu → Duyệt (Đang tuyển) → Lọc CV theo MTCV → Phiếu thông tin ứng viên
→ Hẹn phỏng vấn → Phiếu đánh giá PV → Đạt PV → Nhận việc (tạo hồ sơ NV + HĐ thử việc)
→ Đánh giá thử việc → Đạt: ký HĐLĐ, chính thức / Không đạt: chấm dứt
```

- **Yêu cầu tuyển dụng:** theo dõi từng vị trí: cần bao nhiêu, đã tuyển bao nhiêu, còn thiếu, số ứng viên. Khi đủ người nhận việc, yêu cầu tự chuyển "Đã tuyển đủ". Nếu có người không qua thử việc, yêu cầu tự mở lại.
- **Lọc CV theo MTCV:** chọn yêu cầu (hoặc tải file MTCV PDF/Word lên), kéo thả nhiều CV (PDF có chữ, .docx, .txt). Web đọc CV, tự lấy họ tên, SĐT, email, ngày sinh, trình độ, số năm kinh nghiệm, rồi chấm điểm và xếp hạng:
  - 45% từ khoá bắt buộc, 15% từ khoá ưu tiên, 20% số năm kinh nghiệm, 10% trình độ, 10% độ tương đồng nội dung với MTCV.
  - Từ khoá chỉnh được: bấm vào từ khoá để chuyển bắt buộc ↔ ưu tiên, bấm ✕ để bỏ, thêm từ khoá mới, rồi **Lưu tiêu chí** vào yêu cầu.
  - Giới tính và độ tuổi **không** được tính điểm (Điều 8 BLLĐ cấm phân biệt đối xử).
  - CV dạng ảnh chụp hoặc PDF scan không đọc được chữ. Web vẫn lưu file, HCNS đánh giá thủ công.
- **Phiếu thông tin ứng viên:** dữ liệu lấy từ CV điền sẵn vào phiếu. Từ phiếu có thể lên lịch PV, mở **Phiếu đánh giá phỏng vấn** (chấm 1–5 theo trọng số, kết luận, in ký), chuyển giai đoạn.
- **Theo dõi thử việc:** hạn thử việc tính theo Điều 25 BLLĐ (180 / 60 / 30 ngày / 6 ngày làm việc). Web chặn lương thử việc dưới 85% (Điều 26). Phiếu đánh giá thử việc tạo luôn HĐLĐ chính thức.
- **Kho CV:** mọi CV lưu trong Google Drive, thư mục **An Tâm – Kho CV › Phòng ban › Vị trí**. Xem theo cây thư mục, tìm kiếm, phân loại lại.

### Nhận CV qua email (tự động)

```
Ứng viên gửi CV về email → Google Sheet "An Tâm – CV nhận qua email" (+ file CV lên Drive)
→ web tự tạo ứng viên, đoán vị trí theo tiêu đề thư, đọc CV và chấm điểm theo MTCV
```

- **Bật một lần:** mở Google Sheet **"An Tâm – CV nhận qua email"** trên Drive → menu **An Tâm CV → Bật tự động nhận CV (15 phút/lần)** → đăng nhập và **cho phép** quyền đọc Gmail, Drive, Sheet. Lần đầu quét lại 30 ngày gần nhất.
  - Nếu Google báo "ứng dụng chưa được xác minh": bấm **Nâng cao → Đi tới… → Cho phép**.
- **Hộp thư được quét:** Gmail của tài khoản bấm "Bật". Trạng thái và lần quét gần nhất xem ở web → **Cài đặt & dữ liệu → Nhận CV qua email**.
- **Ứng viên gửi CV về một email khác** (email tên miền công ty, Outlook, Gmail khác):
  1. Trong hộp thư đó bật **tự động chuyển tiếp** (Forwarding) tới Gmail đang chạy công cụ nhận CV:
     - **Gmail / Google Workspace:** ⚙ Cài đặt → Xem tất cả chế độ cài đặt → **Chuyển tiếp và POP/IMAP** → Thêm địa chỉ chuyển tiếp → lấy mã xác nhận ở Gmail nhận → chọn **Chuyển tiếp bản sao**.
     - **Outlook / Microsoft 365:** Cài đặt → Thư → **Chuyển tiếp**.
     - **Email tên miền** (cPanel, Mắt Bão, PA, Zimbra…): mục **Forwarders / Chuyển tiếp thư**.
  2. Web → **Cài đặt & dữ liệu → Nhận CV qua email** → nhập địa chỉ email nhận CV → **Lưu email nhận CV**. Nhiều địa chỉ thì cách nhau dấu phẩy. Web chỉ nhận thư gửi tới các địa chỉ này, thư riêng khác trong Gmail bị bỏ qua.
  3. Gửi thử 1 thư có file CV, khoảng 15 phút sau bấm **Lấy CV mới từ email ngay**.
- **Thư nào được nhận:** thư có file PDF, Word hoặc ảnh (ảnh nhỏ như logo, chữ ký được bỏ qua) và có từ khoá ứng tuyển trong tiêu đề, tên file hoặc nội dung ("ứng tuyển", "CV", "hồ sơ", "xin việc"…).
  - Sửa danh sách từ khoá và địa chỉ cần bỏ qua ở tab **Cài đặt**.
  - Thư có nhiều file: file CV chính là file tên có "CV / sơ yếu / lý lịch", nếu không có thì lấy file PDF hoặc Word lớn nhất. Các file khác lưu kèm.
- **Trên web:**
  - Mỗi lần mở web, 10 phút một lần, hoặc khi bấm **📧 Lấy CV từ email** (trang Ứng viên, Lọc CV, Cài đặt), CV mới thành ứng viên nguồn "Email".
  - File chuyển vào Kho CV › phòng ban › vị trí.
  - Sheet ghi lại trạng thái, vị trí và mã ứng viên.
- **Vị trí:** đoán từ tiêu đề thư hoặc tên file (VD "Ứng tuyển Nhân viên QC"). Đoán được thì chấm điểm ngay theo MTCV.
  - Không đoán được: vào **Lọc CV theo MTCV**, chọn yêu cầu → **Chấm điểm … CV email chưa gắn vị trí** → xem điểm → **Gắn vào yêu cầu**.
- **Dòng bị lỗi** (cột "Trạng thái trên web" ghi "Lỗi…"): xoá ô trạng thái để web thử lại.

### Tải dữ liệu từ máy lên

Menu **Hệ thống → Tải dữ liệu lên**. Mọi file đều được xem trước rồi mới ghi; dòng trùng được cập nhật, không tạo trùng:

1. **Danh sách nhân sự (Excel/CSV):**
   - Bấm **Tải file mẫu** để lấy đủ cột: mã NV, họ tên, ngày sinh, CCCD, bộ phận, chức danh, ngày vào làm, trạng thái, lương, BHXH, MST, ngân hàng, hợp đồng…
   - Chỉ bắt buộc cột Họ tên. Tên cột có dấu hay không dấu đều được, ô trống không xoá dữ liệu cũ.
   - Trùng mã NV, CCCD hoặc họ tên + ngày sinh sẽ được cập nhật. Thiếu mã thì web tự cấp mã. Bộ phận mới tự thêm vào Cài đặt.
2. **Danh sách ứng viên (Excel/CSV):**
   - Vị trí trùng tên yêu cầu tuyển dụng sẽ tự gắn vào yêu cầu đó.
   - Trùng SĐT hoặc email thì cập nhật.
   - Cột **Link CV** được lưu vào Kho CV.
3. **CV hàng loạt:** chọn yêu cầu tuyển dụng (tự điền phòng ban, vị trí), kéo thả nhiều CV. Web tạo ứng viên, đọc thông tin và chấm điểm theo MTCV.
4. **File lương / nhân sự An Tâm (Excel):** như mục nhập file lương trong Cài đặt.
5. **Khôi phục bản sao lưu (.json).**

## 4. Nhân sự công ty

- **Hồ sơ nhân sự:** thông tin cá nhân, hợp đồng, lương – BHXH – thuế – ngân hàng, giấy tờ hồ sơ (tỷ lệ % đầy đủ), phép năm (12 ngày + thâm niên).
- **Hợp đồng & thời hạn:** HĐ đã hết hạn, sắp hết hạn (mặc định trước 45 ngày), số lần ký HĐ xác định thời hạn (lần 3 bắt buộc không xác định thời hạn), gợi ý xử lý.
- **Tuân thủ pháp luật:**
  - Tự rà từng nhân viên: hết thử việc chưa có kết quả, thử việc vượt mức luật, chưa ký HĐLĐ, HĐ hết hạn, chưa tham gia BHXH, lương dưới tối thiểu vùng, lao động chưa thành niên, thuế 10% sai đối tượng, nghỉ việc chưa thanh toán/chốt sổ, thiếu hồ sơ.
  - **Lịch tuân thủ định kỳ:** nộp BHXH, thuế TNCN, báo cáo tình hình lao động 6 tháng/năm, quyết toán thuế, khám sức khoẻ định kỳ, tập huấn an toàn thực phẩm, huấn luyện ATVSLĐ, PCCC, đối thoại tại nơi làm việc, hội nghị NLĐ, thang bảng lương, nội quy. Bấm "Đã hoàn thành" cho từng kỳ.
  - Sổ tay căn cứ pháp lý tra nhanh.
- **Chấm công & bảng lương:** tạo bảng lương tháng từ hồ sơ, nhập công / thưởng / tạm ứng, web tự tính theo đúng cách tính trong file lương:
  - Khối sản xuất: công chuẩn 26, quy đổi 31 ngày, tách P1/P2/P3.
  - Khối văn phòng: tính theo công chuẩn.
  - Trả thêm khoản tương đương BHXH (Điều 168) cho người chưa đóng BHXH.
  - BHXH 10,5% / 21,5%. Thuế TNCN luỹ tiến 5 bậc, giảm trừ 15,5 triệu + 6,2 triệu/người phụ thuộc; thử việc khấu trừ 10%.
  - Xuất Excel (kèm sheet chuyển khoản ngân hàng), in phiếu lương từng người (nút **Phiếu** cạnh tên).
  - Dòng **Cộng từng bộ phận** và **TỔNG CỘNG** cộng đủ mọi cột: công, giờ (OT, ca đêm, đi làm lễ, đi trễ…), số người HĐ chính thức / thử việc và mọi khoản tiền. Ô tổng đầu trang hiện số tiền đầy đủ, không làm tròn triệu.
  - **Tìm nhanh** ngay trên bảng lương: gõ tên, mã NV hoặc chức danh (gõ không dấu cũng được), lọc thêm theo bộ phận và loại HĐ (CT/TV). Dòng **Cộng kết quả tìm** cộng riêng những người đang hiện; nút **In phiếu lương** khi đang lọc chỉ in phiếu của những người đó. Bấm **✕ Bỏ lọc** hoặc phím Esc để xem lại tất cả.
  - Bảng lương chưa khoá: nút **✕** cạnh tên để bỏ một người khỏi bảng lương tháng đó (không xoá hồ sơ), nút **Hồ sơ** để mở hồ sơ nhân viên.
  - **Khoá bảng lương** khi đã nhập xong: lần đầu khoá, web yêu cầu đặt **mật khẩu quản lý lương** (tối thiểu 6 ký tự). Bảng đã khoá thì máy chủ Google từ chối mọi lệnh sửa, xoá, nhập đè từ Excel hay khôi phục sao lưu; vẫn xem, in và xuất Excel được. Chỉ mở khoá được bằng mật khẩu (sai 5 lần thì tạm chặn 15 phút). Mật khẩu lưu dạng mã hoá trong Thuộc tính tập lệnh của dự án Apps Script, không nằm trong Google Sheet. Quên mật khẩu: người sở hữu dự án vào Apps Script → Cài đặt dự án → Thuộc tính tập lệnh, xoá `PAY_PIN` rồi đặt lại.
- **Hai cơ cấu lương:** bảng lương đến **T8/2026** tính theo P1/P2/P3 như file lương cũ (giữ nguyên). Từ **T9/2026** tính theo file `AT_BL_T9_2026_TongHopCong`: đơn giá ngày = (LCB + phụ cấp CV) ÷ công chuẩn, đơn giá giờ = đơn giá ngày ÷ 8; lương ngày thường, nghỉ phép, nghỉ lễ theo ngày; đi làm lễ 400%; OT 150% / 200% (ngày off) / 300% (lễ); ca đêm +30%, đêm lễ +90%; hỗ trợ cơm và hỗ trợ khác (= thoả thuận − LCB − PC − cơm) chia theo công; trừ đi trễ theo giờ; Kho vận & Giao hàng, Sản xuất tính tối đa 28 công thường; BHXH 10,5% / 21,5% chỉ cho HĐ chính thức đi làm từ 14 công, trên LCB + PC; KPCĐ 2% công ty; thuế: CT luỹ tiến (không tính OT, cơm, ca đêm), thử việc 10%, dưới 5 triệu không khấu trừ. Tháng bắt đầu cơ cấu mới chỉnh ở Cài đặt (`paySchemeFrom`). Nhập file lương T9 ở **Cài đặt & dữ liệu → Nhập từ file lương Excel**: web tự nhận ra mẫu mới.
- **Cơ cấu tính lương** (menu Nhân sự): lưu riêng 2 cơ cấu – T8/2026 (P1/P2/P3) và T9/2026 (ngày công/giờ) – với bảng so sánh, tháng áp dụng, tham số (công chuẩn, giờ chuẩn, hệ số OT/lễ/ca đêm, số công tối thiểu đóng BHXH, KPCĐ, ngưỡng thuế). Mỗi bảng lương lưu kèm bản sao tham số lúc tạo/nhập, nên sửa cơ cấu không làm đổi tháng đã tính; tháng chưa khoá có nút "Áp dụng tham số hiện hành".
- **Cơ cấu nhân sự & lương:** số người, quỹ lương, lương bình quân theo khối và cấp bậc; thâm niên; biến động vào/nghỉ 12 tháng.

### Dọn dữ liệu tự động (một lần)

Lần đầu tài khoản Quản trị hoặc HCNS mở web bản mới, web tự làm một lần các việc sau.

1. **Sao lưu toàn bộ dữ liệu** ra file .json trong thư mục Drive **"An Tâm – Sao lưu dữ liệu"**.
2. **Gộp hồ sơ nhân sự trùng** theo lựa chọn mặc định ở mục dưới.
3. **Sửa ngày vào làm** bị lùi 1 ngày.
4. **Xoá các yêu cầu tuyển dụng mẫu** chưa dùng, chỉ giữ 3 vị trí ví dụ.

Kết quả hiện ở trang **Tổng quan**, kèm nút **Xem chi tiết** và link file sao lưu. Muốn quay lại như trước: **Tải dữ liệu lên → Khôi phục bản sao lưu** → chọn file .json đó.

### Lọc hồ sơ trùng

**Hồ sơ nhân sự → 🔍 Lọc hồ sơ trùng.** Khi có trùng, trang cũng hiện cảnh báo kèm số nhóm.

- **Cách nhận ra hồ sơ trùng:** cùng họ tên (không phân biệt dấu, hoa thường) và không khác ngày sinh hay CCCD; hoặc trùng số CCCD.
- **Mỗi nhóm giữ 1 mã.** Mặc định giữ mã có trong bảng lương, nhiều thông tin hơn, mã cũ hơn; bấm chọn để đổi.
- **Thông tin còn thiếu** được lấy từ mã kia: ngày sinh, CCCD, SĐT, hợp đồng, ngân hàng, BHXH, giấy tờ. Sau đó mã kia bị xoá.
- **Trường ghi khác nhau** (bộ phận, chức danh, trạng thái, ngày vào làm, ngày nghỉ) chọn được giá trị giữ lại. Mặc định:
  - trạng thái lấy theo bản cập nhật gần nhất;
  - ngày vào làm lấy ngày khớp ngày bắt đầu hợp đồng.
- **Bảng lương chưa khoá và ứng viên** đang trỏ tới mã bị xoá được chuyển sang mã giữ lại. Tổng lương không đổi.
- **Ngày vào làm bị lùi 1 ngày** do lỗi đọc file lương T9 (đã sửa) cũng được đối chiếu lại với file và sửa trong cùng bước này.
- **Tải danh sách nhân sự lên:** người trùng họ tên được cập nhật vào hồ sơ có sẵn, kể cả khi bộ phận ghi khác, nên không tạo trùng nữa.

### Sửa và xoá dữ liệu

Mỗi dòng ở các mục đều có nút **Sửa** và **Xoá**: hồ sơ nhân sự, yêu cầu tuyển dụng, ứng viên (bảng và thẻ Kanban – nút ✕), phiếu đánh giá phỏng vấn, kết quả thử việc, hợp đồng, Kho CV, việc định kỳ, dòng bảng lương. Trong cửa sổ chi tiết cũng có nút Xoá. Lưu ý:

- **Xoá nhiều cùng lúc:** ở **Hồ sơ nhân sự** và **Ứng viên** (dạng bảng), tích ô đầu dòng (hoặc ô ở tiêu đề để chọn tất cả) rồi bấm **Xoá … dòng đã chọn**.
- Mọi lệnh xoá đều hỏi xác nhận và tự gỡ liên kết liên quan:
  - **Xoá nhân viên:** ứng viên gốc bỏ liên kết; dòng lương ở các tháng đã lập vẫn giữ. Người chỉ nghỉ việc nên chuyển trạng thái "Đã nghỉ việc" thay vì xoá.
  - **Xoá ứng viên:** xoá kèm phiếu đánh giá phỏng vấn; file CV vẫn ở Kho CV.
  - **Xoá yêu cầu tuyển dụng:** các ứng viên vẫn giữ lại, chỉ bỏ liên kết.
  - **Xoá file trong Kho CV:** file chuyển vào thùng rác Google Drive, khôi phục được trong 30 ngày.
  - **Xoá kết quả thử việc:** nhân viên trở về "Thử việc", hợp đồng do phiếu tự tạo cũng bị xoá. Đánh giá lại nhiều lần không tạo hợp đồng trùng.
- Tài khoản **Chỉ xem** không thấy các nút này. Bảng lương **đã khoá** không sửa, xoá được dòng nào.

Các tham số (lương tối thiểu vùng, tỷ lệ BHXH, giảm trừ gia cảnh, biểu thuế, bộ phận, tiêu chí phiếu đánh giá) sửa trong **Cài đặt & dữ liệu** khi nhà nước điều chỉnh.

## 5. Báo cáo gửi Giám đốc

**Báo cáo Giám đốc** → chọn kỳ (tháng này / tháng trước / quý / năm) → nhập đề xuất của HCNS. Báo cáo gồm:

1. Tóm tắt
2. Tuyển dụng theo vị trí
3. Phễu tuyển dụng & nguồn CV
4. Người mới & kết quả thử việc
5. Cơ cấu nhân sự
6. Hợp đồng & tuân thủ pháp luật
7. Quỹ lương
8. Kiến nghị

Có thể **In / Lưu PDF**, **Tải Excel**, hoặc **Gửi email Giám đốc**. Email gửi từ tài khoản Google đang chạy web, kèm file báo cáo.

## Lưu ý

- Dữ liệu nằm ở trang tính **data** của Google Sheet. Không sửa tay trang tính này.
- **Cài đặt & dữ liệu → Tải bản sao lưu** định kỳ; lưu file ở nơi riêng tư.
- Căn cứ pháp lý trong web chỉ để tham khảo nhanh. Trước khi xử lý vụ việc cụ thể, cần đối chiếu văn bản hiện hành.

## Đăng nhập & phân quyền

Web mở cho **mọi tài khoản Google** (máy nào cũng vào được link), nhưng **chỉ người có tài khoản của web mới xem / sửa được dữ liệu**: máy chủ Apps Script kiểm tra đăng nhập ở mọi thao tác.

- **Lần đầu mở web:** tạo tài khoản quản trị bằng **mã khởi tạo** (`SETUP_CODE`, đặt trong file `Setup.gs` riêng của dự án Apps Script – không đưa lên GitHub). Mã chỉ dùng được khi web chưa có tài khoản nào.
- **Quản trị** vào **Cài đặt & dữ liệu → Tài khoản đăng nhập web** để thêm người dùng, đặt lại mật khẩu, khoá / xoá tài khoản. Vai trò:
  - **Quản trị:** toàn quyền, quản lý tài khoản.
  - **Nhân viên HCNS:** xem và sửa dữ liệu.
  - **Chỉ xem:** xem, in phiếu, xuất Excel; không sửa được (VD Ban Giám đốc).
- Mỗi người tự **đổi mật khẩu** ở menu bên trái. Sai mật khẩu 5 lần bị chặn 15 phút. Phiên đăng nhập giữ 30 ngày trên mỗi máy; khoá tài khoản hoặc đặt lại mật khẩu thì phiên cũ mất hiệu lực ngay.
- Tài khoản và mật khẩu (đã mã hoá) lưu trong **Thuộc tính tập lệnh** của dự án Apps Script, không nằm trong Google Sheet.
- Quên mật khẩu quản trị và không còn quản trị nào khác: chủ dự án vào Apps Script → Cài đặt dự án → Thuộc tính tập lệnh, xoá `APP_USERS`, rồi mở web tạo lại quản trị bằng mã khởi tạo.
- Quyền truy cập khi triển khai: **Thực thi dưới dạng: Tôi**, **Người có quyền truy cập: Bất kỳ ai** (`webapp.access = ANYONE_ANONYMOUS` trong `appsscript.json`).
  - Không chọn "Chỉ mình tôi": máy khác sẽ bị chặn.
  - Không nên chọn "Bất kỳ ai có tài khoản Google": trình duyệt đăng nhập nhiều tài khoản Google hay báo "Rất tiếc, không thể mở tệp vào lúc này", máy chưa đăng nhập Google phải đăng nhập trước.
- Máy khác vẫn không vào được: mở bằng cửa sổ ẩn danh hoặc Ctrl+F5; kiểm tra link đúng đuôi `/exec` (link `/dev` chỉ chủ dự án mở được).
