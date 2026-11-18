#!/usr/bin/env bash
# ./make.sh <episode-id> [preview]   (chạy từ thư mục pipeline)
set -e; cd "$(dirname "$0")"; ID=$1; MODE=$2; B=build/$ID; ROOT=..
[ -d node_modules/three ] || bash setup.sh
python3 tts.py $ROOT/episodes/$ID.json $B
node render.js $B $MODE
OUT=$ROOT/../video/$ID.mp4; [ "$MODE" = preview ] && OUT=$B/preview.mp4
python3 compose.py $B $OUT
echo "DONE $OUT  (contact sheet: $B/contact.jpg)"
