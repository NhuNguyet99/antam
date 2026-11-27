#!/usr/bin/env bash
# Lấy tệp mô hình nhận diện khuôn mặt (@vladmandic/face-api 1.7.15) để đăng kèm trang ở thư mục model/.
# Trang không phục vụ đuôi .bin nên đổi tệp trọng số sang .wasm (chỉ là đuôi tệp) và sửa "paths" trong manifest.
# Dùng: bash cham-cong/lay-mo-hinh.sh <thư mục ra>   rồi đăng: files {"model/<tên>": "<thư mục ra>/<tên>"}
set -euo pipefail
OUT="${1:?thư mục ra}"; TMP="$(mktemp -d)"
( cd "$TMP" && npm pack @vladmandic/face-api@1.7.15 --silent >/dev/null && tar xzf vladmandic-face-api-1.7.15.tgz )
mkdir -p "$OUT"
for m in ssd_mobilenetv1 face_landmark_68 face_recognition; do
  cp "$TMP/package/model/${m}_model.bin" "$OUT/${m}_model.wasm"
  sed "s/${m}_model.bin/${m}_model.wasm/" "$TMP/package/model/${m}_model-weights_manifest.json" > "$OUT/${m}_model-weights_manifest.json"
done
rm -rf "$TMP"; ls -la "$OUT"
