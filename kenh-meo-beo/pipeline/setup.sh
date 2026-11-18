#!/usr/bin/env bash
cd "$(dirname "$0")"; pip install -q edge-tts pillow >/dev/null 2>&1; npm i --silent three@0.149.0 >/dev/null 2>&1; echo setup ok
