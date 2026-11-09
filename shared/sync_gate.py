#!/usr/bin/env python3
"""Chép phần đăng nhập bằng nick (shared/nick-gate.html) vào các web dùng nó.

Mỗi web có sẵn 2 dấu <!-- nick-gate:start --> … <!-- nick-gate:end -->; phần giữa được thay bằng
cấu hình của web đó (site, tiêu đề, chỗ đặt nút tài khoản) + nội dung nick-gate.html.
Chạy:  python3 shared/sync_gate.py
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GATE = open(os.path.join(ROOT, 'shared', 'nick-gate.html'), encoding='utf-8').read().strip()
SITES = [
    ('quy-tien-mat/quy-tien-mat-antam.html', {'site': 'qtm', 'title': 'Quỹ tiền mặt An Tâm', 'slot': '#gate-slot'}),
    ('ke-toan/ke-toan-ban-hang-antam.html', {'site': 'ktbh', 'title': 'Kế toán bán hàng An Tâm', 'slot': '#gate-slot'}),
]
MARK = re.compile(r'<!-- nick-gate:start -->.*?<!-- nick-gate:end -->', re.S)

for rel, conf in SITES:
    path = os.path.join(ROOT, rel)
    src = open(path, encoding='utf-8').read()
    if len(MARK.findall(src)) != 1:
        raise SystemExit(f'{rel}: cần đúng 1 cặp dấu nick-gate')
    block = ('<!-- nick-gate:start -->\n<script>window.NICK_GATE = ' + json.dumps(conf, ensure_ascii=False) + ';</script>\n'
             + GATE + '\n<!-- nick-gate:end -->')
    out = MARK.sub(lambda m: block, src)
    open(path, 'w', encoding='utf-8').write(out)
    print('Đã cập nhật', rel)
