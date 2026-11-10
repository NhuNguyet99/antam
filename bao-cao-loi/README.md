# Báo cáo lỗi An Tâm

Trang https://claude.ai/artifact/Pra6DjARdoAaRrLEGiLA93 – đọc `bc/<yyyy-mm-dd-HHMM>` do agent ghi
(`{at, ky, tom_tat, so_loi, so_canh_bao, webs, muc: [{web, muc_do: loi|canh_bao|ok, nhom, tieu_de, chi_tiet}]}`; rules `bc write: admin`).

- **Agent**: tác vụ định kỳ "Báo cáo lỗi An Tâm (11:47, 21:47)" (mỗi lần chạy một phiên mới, báo về điện thoại khi xong).
  Đọc lỗi trang + kiểm tra dữ liệu của An Tâm (Đóng hàng · Kho · Giao), Quỹ tiền mặt, Kế toán bán hàng, Kho vận và tác vụ cập nhật Kho vận;
  chỉ đọc các web, chỉ ghi vào trang này; xóa báo cáo cũ hơn 30 ngày.
- **Lỗi trang**: `shared/err-log.html` gắn vào các web (An Tâm qua `build.py --hop`, 3 web còn lại qua `python3 shared/sync_gate.py`) ghi lỗi chưa bắt được,
  promise bị từ chối và lỗi kho dữ liệu vào `errlog/<ngày>` `{e: {mã: {at, web, bo_phan, who, msg, src, view}}}` của từng web (tối đa 15 lỗi mỗi lần mở trang, lỗi trùng ghi 1 lần).
- **Kiểm tra dữ liệu**: tồn âm, phiếu điều chỉnh chờ duyệt, đơn Đóng hàng chưa sang Kho, bảng phân tuyến trùng; quỹ âm, phiếu chi chờ duyệt / quá 3 ngày chưa có hóa đơn,
  kiểm quỹ lệch, chưa tạo nick; dữ liệu MISA cũ; Kho vận không được cập nhật.
