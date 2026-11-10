#!/usr/bin/env python3
"""Chép phần dùng chung vào các web An Tâm.

- shared/nick-gate.html (đăng nhập bằng nick) giữa <!-- nick-gate:start --> … <!-- nick-gate:end -->
- shared/err-log.html (ghi lỗi trang cho agent Báo cáo lỗi) giữa <!-- err-log:start --> … <!-- err-log:end -->
Trang chung An Tâm (Đóng hàng · Kho · Giao hàng) lấy err-log khi build: kho-noi-bo/online/build.py --hop.
Chạy:  python3 shared/sync_gate.py
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def read(name):
    return open(os.path.join(ROOT, 'shared', name), encoding='utf-8').read().strip()


GATE, ERRLOG = read('nick-gate.html'), read('err-log.html')
# (file, cấu hình đăng nhập nick – None nếu web không khóa bằng nick, tên web trong báo cáo lỗi)
SITES = [
    ('quy-tien-mat/quy-tien-mat-antam.html', {'site': 'qtm', 'title': 'Quỹ tiền mặt An Tâm', 'slot': '#gate-slot'}, 'Quỹ tiền mặt'),
    ('ke-toan/ke-toan-ban-hang-antam.html', {'site': 'ktbh', 'title': 'Kế toán bán hàng An Tâm', 'slot': '#gate-slot'}, 'Kế toán bán hàng'),
    ('kho-van/kho-van-antam.html', None, 'Kho vận'),
]


def put(src, rel, tag, block):
    mark = re.compile(r'<!-- %s:start -->.*?<!-- %s:end -->' % (tag, tag), re.S)
    if len(mark.findall(src)) != 1:
        raise SystemExit(f'{rel}: cần đúng 1 cặp dấu {tag}')
    return mark.sub(lambda m: '<!-- %s:start -->\n%s\n<!-- %s:end -->' % (tag, block, tag), src)


for rel, gate, web in SITES:
    path = os.path.join(ROOT, rel)
    src = open(path, encoding='utf-8').read()
    src = put(src, rel, 'err-log', '<script>window.ANTAM_ERRLOG = ' + json.dumps({'web': web}, ensure_ascii=False) + ';</script>\n' + ERRLOG)
    if gate:
        src = put(src, rel, 'nick-gate', '<script>window.NICK_GATE = ' + json.dumps(gate, ensure_ascii=False) + ';</script>\n' + GATE)
    open(path, 'w', encoding='utf-8').write(src)
    print('Đã cập nhật', rel)
