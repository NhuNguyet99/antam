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
   - Người có quyền truy cập: **Chỉ mình tôi**, hoặc "Bất kỳ ai có tài khoản Google" nếu cần chia sẻ – khi đó chỉ gửi link cho người được phép xem lương.
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

Web đã có sẵn **16 yêu cầu tuyển dụng** kèm MTCV lấy từ các poster trong thư mục "Hình ảnh poster", ở trạng thái **Chờ duyệt**. Xác nhận số lượng rồi chuyển sang **Đang tuyển**. Poster "nhân viên bảo trì.png" không đọc được chữ nên MTCV vị trí này là bản mẫu, cần sửa lại.

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
  - **Khoá bảng lương** khi đã nhập xong: lần đầu khoá, web yêu cầu đặt **mật khẩu quản lý lương** (tối thiểu 6 ký tự). Bảng đã khoá thì máy chủ Google từ chối mọi lệnh sửa, xoá, nhập đè từ Excel hay khôi phục sao lưu; vẫn xem, in và xuất Excel được. Chỉ mở khoá được bằng mật khẩu (sai 5 lần thì tạm chặn 15 phút). Mật khẩu lưu dạng mã hoá trong Thuộc tính tập lệnh của dự án Apps Script, không nằm trong Google Sheet. Quên mật khẩu: người sở hữu dự án vào Apps Script → Cài đặt dự án → Thuộc tính tập lệnh, xoá `PAY_PIN` rồi đặt lại.
- **Hai cơ cấu lương:** bảng lương đến **T8/2026** tính theo P1/P2/P3 như file lương cũ (giữ nguyên). Từ **T9/2026** tính theo file `AT_BL_T9_2026_TongHopCong`: đơn giá ngày = (LCB + phụ cấp CV) ÷ công chuẩn, đơn giá giờ = đơn giá ngày ÷ 8; lương ngày thường, nghỉ phép, nghỉ lễ theo ngày; đi làm lễ 400%; OT 150% / 200% (ngày off) / 300% (lễ); ca đêm +30%, đêm lễ +90%; hỗ trợ cơm và hỗ trợ khác (= thoả thuận − LCB − PC − cơm) chia theo công; trừ đi trễ theo giờ; Kho vận & Giao hàng, Sản xuất tính tối đa 28 công thường; BHXH 10,5% / 21,5% chỉ cho HĐ chính thức đi làm từ 14 công, trên LCB + PC; KPCĐ 2% công ty; thuế: CT luỹ tiến (không tính OT, cơm, ca đêm), thử việc 10%, dưới 5 triệu không khấu trừ. Tháng bắt đầu cơ cấu mới chỉnh ở Cài đặt (`paySchemeFrom`). Nhập file lương T9 ở **Cài đặt & dữ liệu → Nhập từ file lương Excel**: web tự nhận ra mẫu mới.
- **Cơ cấu tính lương** (menu Nhân sự): lưu riêng 2 cơ cấu – T8/2026 (P1/P2/P3) và T9/2026 (ngày công/giờ) – với bảng so sánh, tháng áp dụng, tham số (công chuẩn, giờ chuẩn, hệ số OT/lễ/ca đêm, số công tối thiểu đóng BHXH, KPCĐ, ngưỡng thuế). Mỗi bảng lương lưu kèm bản sao tham số lúc tạo/nhập, nên sửa cơ cấu không làm đổi tháng đã tính; tháng chưa khoá có nút "Áp dụng tham số hiện hành".
- **Cơ cấu nhân sự & lương:** số người, quỹ lương, lương bình quân theo khối và cấp bậc; thâm niên; biến động vào/nghỉ 12 tháng.

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
- Quyền truy cập khi triển khai: **Thực thi dưới dạng: Tôi**, **Người có quyền truy cập: Bất kỳ ai có tài khoản Google** (`webapp.access = ANYONE` trong `appsscript.json`).
