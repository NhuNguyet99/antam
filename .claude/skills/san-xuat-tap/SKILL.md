---
name: san-xuat-tap
description: Quy trình sản xuất trọn gói một (hoặc nhiều) tập video cho kênh TikTok "Mèo Béo Văn Phòng": ý tưởng → kịch bản hài góc khuất văn phòng → dựng 3D, giọng đọc, phụ đề → video hoàn chỉnh, caption, affiliate. Dùng khi người dùng nói "làm tập mới", "sản xuất video", "/san-xuat-tap <ý tưởng hoặc số tập>".
---
# Sản xuất tập mới

Đầu vào: ý tưởng, tuyến nội dung hoặc số tập cần làm (mặc định 1). Nếu người dùng không nói gì thêm, tự chọn tuyến chưa làm gần đây trong `kenh-meo-beo/BIBLE.md`.

1. **Chuẩn bị** (một lần mỗi phiên): `bash kenh-meo-beo/pipeline/setup.sh`. Giọng đọc cần mạng tới `speech.platform.bing.com` (môi trường cloud "antam").
2. **Kịch bản:** gọi agent `bien-kich-van-phong` với ý tưởng. Nếu làm nhiều tập, gọi một lần cho tất cả để các tập nối nhau (trường `end` của tập trước giới thiệu tập sau).
3. **Duyệt nhanh:** đọc file `.md` vừa tạo; tóm tắt cho người dùng mỗi tập 1–2 dòng. Không chờ duyệt, trừ khi người dùng đã yêu cầu duyệt trước.
4. **Dựng:** gọi agent `dao-dien-video` cho từng tập (có thể chạy song song 2 tập).
5. **Giao:** gửi file `video/<id>.mp4` cho người dùng, kèm caption, hashtag, bình luận ghim và gợi ý affiliate lấy từ `.md`. Commit `kenh-meo-beo/episodes/*` và `video/*` rồi push lên nhánh làm việc.

Nếu người dùng chỉ cần kịch bản, dừng sau bước 2. Nếu chỉ cần dựng lại tập có sẵn, bỏ qua bước 2.
