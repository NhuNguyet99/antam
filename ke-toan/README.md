# Kế toán bán hàng An Tâm

Trang claude.ai (một file `ke-toan-ban-hang-antam.html`): https://claude.ai/artifact/JvUGzUPjrC93AoNzEbnhC9
Nhập dữ liệu MISA (chi tiết công nợ 131), đơn hàng, hóa đơn, doanh thu, thu tiền, công nợ, khách hàng, checklist ca, nhắc việc.

## Đăng nhập bằng nick
Giống Quỹ tiền mặt: trang khóa bằng nick + mật khẩu (`shared/nick-gate.html`, chép vào bằng `python3 shared/sync_gate.py`).
Chủ trang vào thẳng, bấm nút 👤 ở thanh bên › **+ Thêm tài khoản**. Danh sách tài khoản ở `auth/accounts`, chỉ chủ trang / Editor sửa được
(rules `auth write: admin`, `settings read: view, write: admin`).

## Báo cáo ca

Mục **Báo cáo ca** lập ngay trên web các báo cáo trước đây làm bằng Excel: Số lượng giao hàng theo loại bánh, Tổng hợp đơn hàng (16 chỉ tiêu), Tổng hợp công nợ theo khách hàng, Danh sách đơn chưa thanh toán. Có Copy gửi Zalo, Tải Excel, Chốt báo cáo và khối **Đối chiếu với file Excel**.

- **Nhập file**: kéo file báo cáo Excel của ca. Web đọc đủ 6 sheet, nhận theo tên cột:
  - Đơn đặt hàng → `dh/<ngày>`;
  - BC-CRM → `crm/<ngày>` và `crm/<ngày>-<ca>`;
  - KH chưa thanh toán (gồm cột Số tiền đã thanh toán nhập tay) và Công nợ cũ → sổ công nợ `cnbook/<yyyy-mm>`;
  - KHACH HÀNG HO TRO → `meta/khht`;
  - Báo cáo tổng hợp → `xl/<ngày>-<ca>` (chỉ để đối chiếu).
  Cũng nhận file xuất thẳng từ MISA / CRM.
- **Mỗi ca có sổ Công nợ cũ riêng** (file ca ngày chứa đơn ca ngày, file ca đêm chứa đơn ca đêm). Sổ ghi theo ca đã chọn khi nhập.
- **Sổ công nợ**: mỗi đơn `[ngày, mã KH, giá trị, còn phải thu, đã thanh toán, sổ ca]`. Đơn dán trùng chỉ tính 1 lần, lấy số đã thanh toán lớn nhất. Thực thu MISA tăng ở lần nhập sau được tính là đã thanh toán.
- **Công thức**: dòng 2–11 từ Đơn đặt hàng (bỏ đơn hủy). 12 = Σ còn phải thu các đơn trước ca trong sổ của ca; 13 = Σ đã thanh toán; 14 = 12 − 13; 15 = 11 + 14. Còn nợ kỳ này = còn phải thu − số đã thanh toán ghi ở KH chưa thanh toán.
- **Loại bánh**: TORTILASS gồm TORTILASS, TACOS; BÁNH MỲ KEBAB gồm BÁNH MỲ/BÁNH MÌ; Thịt KEBAB gồm THỊT; bỏ PHỤ PHÍ. Luôn hiện các dòng cố định như file Excel. Đã giao = "Giao thành công".
- **Đối chiếu 24/11/2026**: dòng 2–11 và loại bánh ca đêm khớp Excel. Chỗ lệch đều do lỗi của file Excel:
  - Công nợ cũ: đơn dán 2 lần; ca đêm dư khoảng 25,8 triệu.
  - Ca ngày bỏ sót 24 túi TACOS (dòng kiểm tra của file báo 24).
  - Sheet KH chưa thanh toán ca ngày chỉ có công thức cho 28 dòng nên thiếu 6 đơn.
