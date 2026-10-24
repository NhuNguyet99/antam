# GPS An Tâm – đọc GPS điện thoại người giao

Trang Giao hàng An Tâm chạy trên claude.ai, mà claude.ai không cấp quyền **Vị trí** cho trang, nên điện thoại không đọc được GPS ở đó.
GPS An Tâm là một trang nhỏ chạy bằng Google Apps Script (có `https`, nên điện thoại cho đọc GPS):

```
Điện thoại người giao ── link riêng …/exec?t=mã&n=tên ──▶ trang GPS An Tâm (gps.html)
        │ mỗi phút gửi các điểm GPS (google.script.run.save)
        ▼
Google Sheet "GPS An Tâm" (trang tính đầu tiên: mỗi mã link 1 dòng, giữ 24 giờ gần nhất)
        │ chủ trang mở Giao hàng An Tâm › Người giao & kết quả giao: trang đọc Sheet qua kết nối Google Drive
        │ của chủ trang (capability mcp, mỗi phút, chỉ tải lại khi Sheet đổi) – static/app.js gpsPull
        ▼
Giao hàng An Tâm: POST /gps/sync → kho/TP/hanhtrinh/<ngày>-<mã người giao>  →  mục 🛰 Hành trình giao hàng
```

| File | Dùng ở đâu |
|---|---|
| `Code.gs` | Apps Script của Sheet "GPS An Tâm" – mở trang (`doGet`), ghi điểm GPS (`save`) |
| `gps.html` | Apps Script – trang GPS người giao mở trên điện thoại (Bật / Tắt GPS) |

## Cài một lần

1. Mở Google Sheet **GPS An Tâm** trong Google Drive (đã tạo sẵn: `1icIATdG_hZxIv3MCkEJh1Gv3Bk0Uv_mCMiAO90OOF80`).
2. **Tiện ích mở rộng › Apps Script**. Xóa hết code mẫu trong `Code.gs`, dán toàn bộ `Code.gs`.
3. Bấm **＋ › HTML**, đặt tên đúng `gps` (thành `gps.html`), dán toàn bộ `gps.html`. Bấm 💾 Lưu.
4. **Triển khai › Tùy chọn triển khai mới** › bánh răng chọn **Ứng dụng web**:
   - Thực thi dưới dạng: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai**
   bấm **Triển khai**, cho phép quyền truy cập (Google hỏi lần đầu – chọn tài khoản, *Nâng cao › Đi tới … › Cho phép*).
5. Sao chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`).
6. Giao hàng An Tâm › **Người giao & kết quả giao** › **🛰 GPS An Tâm**: dán URL vào ô, bấm **Lưu link**, rồi **Tạo link** cho từng người giao
   và gửi link (Zalo) cho đúng người. Người giao cũng thấy nút **🛰 Mở GPS An Tâm** ngay trên web giao hàng sau khi đăng nhập.
7. Lần đầu bấm **↻ Đọc GPS ngay** ở mục 🛰 GPS An Tâm: claude.ai hỏi cho phép trang dùng **Google Drive** → **Cho phép**
   (kết nối Google Drive phải bật ở claude.ai › Cài đặt › Kết nối, đúng tài khoản Google sở hữu Sheet). Từ đó, mỗi lần mở mục này
   trang tự đọc GPS mỗi phút.

Vì sao không dùng tác vụ định kỳ: tác vụ định kỳ của tổ chức chưa được dùng kết nối Google Drive, và trang claude.ai không gọi được
Apps Script trực tiếp – nên trang đọc Sheet bằng Google Drive của chủ trang lúc đang mở. Sheet giữ 24 giờ nên mở trang lúc nào cũng đủ đường đi
của ngày (mở muộn hơn 24 giờ thì phần cũ hơn bị mất).

Sửa `Code.gs` / `gps.html` sau này: **Triển khai › Quản lý các bản triển khai › ✎ › Phiên bản: Phiên bản mới › Triển khai** (giữ nguyên URL).

## Người giao dùng

Mở link → **▶ Bật GPS** → điện thoại hỏi quyền Vị trí → **Cho phép**. Giữ trang mở, màn hình sáng trong lúc đi giao
(trình duyệt ngừng đọc GPS khi tắt màn hình hoặc chạy nền lâu). Mất sóng thì điểm GPS được giữ lại, có mạng tự gửi. Giao xong bấm **■ Tắt GPS**.

## Bảo mật

- Mỗi người giao 1 link có mã ngẫu nhiên 24 ký tự (không dùng PIN đăng nhập). **Đổi link** ở Giao hàng An Tâm thì link cũ hết hiệu lực
  (trang không chép điểm của mã đã bỏ).
- Sheet chỉ chủ tài khoản Google xem được; trang GPS chỉ ghi, không đọc được dữ liệu của người khác.
