# Quỹ tiền mặt An Tâm

Trang claude.ai (một file `quy-tien-mat-antam.html`) quản lý tiền mặt và chi tiêu của công ty:
https://claude.ai/artifact/1PqLezLBJk3zZqRSvEs4wT

- **Phiếu thu / phiếu chi**: số phiếu tự đánh `PT-ddmm-01`, `PC-ddmm-01` theo ngày; số tiền viết bằng chữ; khoản mục,
  người nộp / nhận, lý do, chứng từ gốc kèm theo, ảnh hóa đơn (thu nhỏ còn ~1600px trước khi tải lên kho ảnh của trang).
  Tải phiếu để in theo mẫu 01-TT / 02-TT (file HTML, mở bằng trình duyệt rồi in).
- **Nhà cung cấp / đơn vị** trên phiếu thu và phiếu chi: tên, mã số thuế (10 số, chi nhánh 10-3 số), điện thoại, địa chỉ.
  Gõ tên đã dùng thì trang gợi ý và tự điền MST / điện thoại / địa chỉ còn trống (lấy từ phiếu gần nhất của nhà cung cấp đó).
- **Hóa đơn của phiếu chi**: Có hóa đơn (số, ký hiệu, ngày, thuế GTGT) / Chưa có – sẽ bổ sung (mặc định) / Không có hóa đơn.
  Phiếu đã duyệt hoặc của người khác: nút **Cập nhật hóa đơn** chỉ đổi phần hóa đơn, không đổi số tiền.
  Sổ quỹ lọc theo hóa đơn; Báo cáo có mục Hóa đơn của phiếu chi (tiền có / chưa có / không có HĐ, danh sách chưa có HĐ) và chi theo nhà cung cấp.
- **Duyệt chi**: phiếu chi từ ngưỡng trong Cài đặt (mặc định 2.000.000 đ) hiện "Chờ duyệt" cho tới khi chủ trang / Editor duyệt.
  Phiếu chờ duyệt vẫn tính vào tồn quỹ (tiền đã ra khỏi quỹ).
- **Hủy phiếu**: không xóa – phiếu gạch ngang, ghi người hủy, lúc hủy, lý do; không tính vào tồn quỹ.
- **Sổ quỹ tiền mặt** (mẫu S07-DN): tồn đầu kỳ, thu, chi, tồn sau từng phiếu, tồn cuối kỳ; lọc theo ngày, quỹ, loại, khoản mục,
  tìm kiếm; tải Excel (CSV). Điện thoại: bảng gọn (diễn giải + số tiền + tồn).
- **Báo cáo chi tiêu** theo tháng: chi / thu theo khoản mục, khoản chi lớn nhất, chi theo người nhận, thu – chi 6 tháng.
- **Kiểm quỹ** (biên bản mẫu 08a-TT): đếm số tờ từng mệnh giá 500.000 → 500 đ, so với tồn sổ, lưu chênh lệch.
- **Cài đặt** (chỉ chủ trang / Editor): các quỹ + số dư đầu kỳ + ngày bắt đầu, khoản mục thu / chi, ngưỡng duyệt.

## Quyền
Mời bằng nút *Share*: **Contributor** lập phiếu, sửa / hủy phiếu của chính mình khi chưa duyệt, tải ảnh; **Editor** (và chủ trang)
duyệt phiếu, sửa mọi phiếu, đổi cài đặt; **Viewer** chỉ xem. Người lập / duyệt / hủy lưu bằng mã người dùng claude.ai, tên hiện theo tài khoản.

## Dữ liệu (`db` của trang)
| Tài liệu | Nội dung | Ai ghi |
|---|---|---|
| `cfg/main` | `{quy: [{id, ten, sodu_dau, ngay_dau}], dm_thu, dm_chi, nguong}` | Editor (rules `write: admin`) |
| `thang/<yyyy-mm>` | `{v: {<mã phiếu>: {so, loai, ngay, quy, dm, tien, doi_tuong, noidung, chungtu, anh, ncc: {ten, mst, sdt, dia_chi}, hd: {tt: co|cho|khong, so, ky_hieu, ngay, thue}, tao_boi, tao_luc, sua_*, huy}}}` | Contributor |
| `duyet/<yyyy-mm>` | `{d: {<mã phiếu>: {ok, boi, luc}}}` | Editor (rules `write: admin`) |
| `kiemquy/<yyyy-mm>` | `{k: {<mã>: {ngay, luc, quy, so_sach, thuc_te, chenh, to, thanhphan, ghichu, boi}}}` | Contributor |
| `khoa/so` | khóa ngắn (lease) khi đánh số phiếu để 2 người lập cùng lúc không trùng số | trang tự ghi |
