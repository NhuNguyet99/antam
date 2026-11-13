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

## Đăng nhập bằng nick
Trang khóa bằng nick + mật khẩu (phần dùng chung `shared/nick-gate.html`, chép vào trang bằng `python3 shared/sync_gate.py`).
Chủ trang vào thẳng, bấm nút 👤 trên đầu trang › **+ Thêm tài khoản** để tạo nick cho từng người; nhân viên đăng nhập bằng nick đó
(nhớ 30 ngày trên máy). Danh sách ở `auth/accounts` `{a: {id: {user, name, salt, pw (PBKDF2), active, at}}, ep}` – chỉ chủ trang / Editor
sửa được (rules `auth write: admin`). Khóa tài khoản, đổi mật khẩu hoặc "Đăng xuất tất cả máy" thì máy đang dùng nick đó bị đăng xuất ngay.
Phiếu ghi thêm tên nick người lập / sửa / hủy (`tao_nick`, `sua_nick`, `huy.nick`), biên bản kiểm quỹ ghi `nick`.

## Sổ kế toán bán hàng và tổng tiền mặt công ty

- Mỗi quỹ trong `cfg/main.quy` có `bp`: `tq` (Thủ quỹ, mặc định) hoặc `kt` (Kế toán bán hàng). Chưa có quỹ `kt` thì trang tự thêm quỹ
  `{id: 'kt', ten: 'Tiền mặt kế toán bán hàng', ngay_dau: '2026-11-01'}` (lưu thật khi admin bấm Lưu cài đặt).
- Nút "Sổ của: Thủ quỹ | Kế toán bán hàng" trên đầu trang chọn sổ; Tổng quan, Sổ quỹ, Báo cáo chi tiêu, Kiểm quỹ và nút lập phiếu chỉ theo quỹ của sổ đó.
  Khoản mục riêng: `dm_thu_kt`, `dm_chi_kt`. Số phiếu sổ kế toán bán hàng: `PTBH-ddmm-NN` / `PCBH-ddmm-NN`.
- **⇄ Chuyển tiền** (VD: kế toán bán hàng nộp tiền hàng về thủ quỹ): lập cùng lúc phiếu chi ở quỹ đi và phiếu thu ở quỹ nhận, khoản mục
  "Chuyển tiền nội bộ", `chuyen: {cap: mã phiếu cặp, quy: quỹ bên kia}`; không cần duyệt, không cần hóa đơn, không tính vào thu – chi; hủy 1 phiếu thì hủy cả cặp.
- **Báo cáo tổng tiền mặt công ty**: mục riêng, mở bằng nút "📊 Báo cáo tổng công ty" trên đầu trang ("← Về sổ quỹ" để quay lại);
  có thanh mục riêng: Tổng hợp theo quỹ (`#tong`: đầu kỳ, thu, chi, nhận chuyển, chuyển đi, cuối kỳ), Tồn theo ngày (`#tong-ngay`),
  Thu – chi theo khoản mục theo bộ phận (`#tong-km`), Chuyển tiền nội bộ (`#tong-cq`); chung kỳ xem và 1 file CSV gồm cả 3 bảng.
- **Phân quyền theo nick** (Cài đặt, chỉ admin lưu): `cfg/main.phan_quyen = {mã tài khoản: {tq, kt, tong}}`. Nick chỉ thấy / nhập sổ được tích;
  `tong` mở mục Tổng tiền mặt. Nick chưa phân quyền, chủ trang, Editor: tất cả.
- Số dư đầu kỳ của quỹ luôn tính vào tồn đầu kỳ (kể cả khi kỳ xem bắt đầu trước ngày bắt đầu quỹ).
