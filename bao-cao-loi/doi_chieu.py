#!/usr/bin/env python3
"""Đối chiếu đơn Đóng hàng (ngày D) với Kho thành phẩm (ngày D+1): số đặt – số sản xuất nhập kho – số xuất kho.

Cách dùng:  python3 -I doi_chieu.py <thư mục dữ liệu> <D: yyyy-mm-dd> <map.json>  > ket_qua.json
Thư mục dữ liệu có: khoout/<D>.json, khoout/<D>-t123.json (đơn Đóng hàng, có thể thiếu 1 trong 2),
kho/TP/days/*.json (TẤT CẢ ngày phiếu Kho TP – để tính tồn; tối thiểu ngày D+1), kho/TP/meta/products.json (danh mục, số dư ban đầu)
– tải bằng ArtifactData out_dir. Tồn tính như web Kho: số dư ban đầu + nhập − xuất + điều chỉnh, bỏ phiếu chờ duyệt / bị từ chối.
map.json: {"cols": {TÊN CỘT (viết hoa, bỏ khoảng trắng): {"code": mã Kho, "he_so": số}}, "bo_qua": [TÊN CỘT …], "sai_lech": {"tuyet_doi": 2, "ty_le": 0.02}}
Agent "Đối chiếu Đóng hàng – Kho" chạy bản chép của script này (dán trong lời nhắc của tác vụ).
"""
import json
import os
import sys
import unicodedata
from datetime import date, timedelta

base, D, map_path = sys.argv[1], sys.argv[2], sys.argv[3]
D1 = (date.fromisoformat(D) + timedelta(days=1)).isoformat()
M = json.load(open(map_path, encoding='utf-8'))
key = lambda s: unicodedata.normalize('NFC', str(s)).upper().replace(' ', '').replace('\u00a0', '')
cols = {key(k): v for k, v in M.get('cols', {}).items()}
skip = {key(k) for k in M.get('bo_qua', [])}
TOL = M.get('sai_lech', {'tuyet_doi': 2, 'ty_le': 0.02})
KHONG_SX = set(M.get('khong_sx', []))  # mã không làm phiếu nhập sản xuất ở Kho TP (hàng mua, thịt, phô mai…): chỉ so số xuất
NOT_QTY = {key(x) for x in ['QUẬN', 'TUYẾN', 'CRM', 'KHÁCH HÀNG', 'TÊN KHÁCH HÀNG', 'SĐT', 'GHI CHÚ', 'BILL', 'NGƯỜI TẠO ĐƠN', 'TÀI XẾ',
                               'TRẠNG THÁI', 'TÌNH TRẠNG', 'HỖ TRỢ', 'STT', 'ĐỊA CHỈ']}


def num(x):
    x = str(x or '').strip().replace(',', '.')
    try:
        return float(x)
    except ValueError:
        return None


dat, chua_ma, nguon = {}, {}, []
for suffix in ['', '-t123']:
    p = os.path.join(base, 'khoout', D + suffix + '.json')
    if not os.path.exists(p):
        continue
    doc = json.load(open(p, encoding='utf-8'))
    nguon.append((D + suffix, doc.get('stamp', ''), doc.get('at', '')))
    rows = [r.split('\t') for r in str(doc.get('tsv', '')).split('\n') if r.strip()]
    if not rows:
        continue
    head = [key(h) for h in rows[0]]
    for r in rows[1:]:
        for i, h in enumerate(head):
            if i >= len(r) or h in NOT_QTY or h in skip:
                continue
            q = num(r[i])
            if not q:
                continue
            m = cols.get(h)
            if not m:
                chua_ma[rows[0][i].strip()] = chua_ma.get(rows[0][i].strip(), 0) + q
                continue
            dat[m['code']] = dat.get(m['code'], 0) + q * float(m.get('he_so', 1))

prod_p = os.path.join(base, 'kho', 'TP', 'meta', 'products.json')
prods = (json.load(open(prod_p, encoding='utf-8')).get('p') or {}) if os.path.exists(prod_p) else {}
days_dir = os.path.join(base, 'kho', 'TP', 'days')
days_p = os.path.join(days_dir, D1 + '.json')
nhap, xuat, dchinh, cho_duyet = {}, {}, {}, 0
ton_dau = {c: float(p.get('opening_qty') or 0) for c, p in prods.items()}
day_files = sorted(f for f in os.listdir(days_dir) if f.endswith('.json')) if os.path.isdir(days_dir) else []
co_ton = bool(prods) and any(f[:-5] < D1 for f in day_files)  # có lịch sử trước D1 thì mới tính được tồn đầu
for f in day_files:
    day = f[:-5]
    if day > D1:
        continue
    for v in (json.load(open(os.path.join(days_dir, f), encoding='utf-8')).get('v') or {}).values():
        if not v:
            continue
        t, dt = v.get('type'), v.get('date') or day
        if dt > D1:
            continue
        if v.get('status'):  # pending / rejected: chưa tính vào tồn
            if dt == D1:
                cho_duyet += 1
            continue
        sg = -1 if t == 'X' else 1
        for l in v.get('lines') or []:
            q = float(l.get('q') or 0)
            if dt < D1:
                ton_dau[l['c']] = ton_dau.get(l['c'], 0) + sg * q
            else:
                tgt = nhap if t == 'N' else xuat if t == 'X' else dchinh if t == 'D' else None
                if tgt is not None:
                    tgt[l['c']] = tgt.get(l['c'], 0) + q


def fmt(x):
    return ('%g' % round(x, 3)) if abs(x) < 1e6 else str(round(x))


def lech(a, b):  # a so với b (đặt): 'khop' | 'thieu' | 'thua'
    d = a - b
    if abs(d) <= max(TOL.get('tuyet_doi', 2), abs(b) * TOL.get('ty_le', 0.02)):
        return 'khop'
    return 'thieu' if d < 0 else 'thua'


codes = sorted(set(dat) | {c for c in set(nhap) | set(xuat) if c in {m['code'] for m in cols.values()}})
rows = []
for c in codes:
    p = prods.get(c) or {}
    d0, n0, x0 = round(dat.get(c, 0), 3), round(nhap.get(c, 0), 3), round(xuat.get(c, 0), 3)
    r = {'code': c, 'ten': p.get('name', ''), 'dvt': p.get('unit', ''), 'dat': d0, 'nhap': n0, 'xuat': x0,
         'lech_sx': round(n0 - d0, 3), 'lech_xuat': round(x0 - d0, 3),
         'sx': 'khong' if c in KHONG_SX else lech(n0, d0), 'xk': lech(x0, d0)}
    if co_ton:
        t0, a0 = round(ton_dau.get(c, 0), 3), round(dchinh.get(c, 0), 3)
        t1 = round(t0 + n0 - x0 + a0, 3)
        co = t0 + n0 + a0  # hàng có để giao trong ngày = tồn đầu + sản xuất nhập + điều chỉnh
        dc_txt = (' (có điều chỉnh %s%s)' % ('+' if a0 > 0 else '', fmt(a0))) if abs(a0) > 0.001 else ''
        r.update(ton_dau=t0, dieu_chinh=a0, ton_cuoi=t1, co_hang=round(co, 3))
        if t1 < -0.001:
            dg, ds_ = 'ton_am', 'Tồn cuối âm %s: xuất nhiều hơn hàng có – thiếu phiếu nhập sản xuất hoặc xuất sai số' % fmt(t1)
        elif d0 > 0 and lech(co, d0) == 'thieu':
            dg, ds_ = 'thieu_hang', 'Tồn đầu + sản xuất = %s%s, không đủ %s đặt (thiếu %s)' % (fmt(co), dc_txt, fmt(d0), fmt(d0 - co))
        elif r['xk'] == 'thieu':
            dg, ds_ = 'xuat_thieu', 'Đủ hàng (%s%s) nhưng xuất ít hơn đặt %s' % (fmt(co), dc_txt, fmt(d0 - x0))
        elif r['xk'] == 'thua':
            dg, ds_ = 'xuat_thua', 'Xuất nhiều hơn đặt %s (đơn phát sinh ngoài bảng?)' % fmt(x0 - d0)
        elif r['sx'] == 'thieu':
            dg, ds_ = 'bu_ton', 'Sản xuất ít hơn đặt nhưng tồn đầu %s%s bù đủ' % (fmt(t0), dc_txt)
        elif dc_txt:
            dg, ds_ = 'dung', 'Đúng' + dc_txt
        else:
            dg, ds_ = 'dung', 'Đúng'
        r.update(danh_gia=dg, danh_gia_text=ds_)
    rows.append(r)
bad_sx = [r for r in rows if r['sx'] in ('thieu', 'thua')]
bad_xk = [r for r in rows if r['xk'] != 'khop']


def ds(lst, k):
    lst = sorted(lst, key=lambda r: -abs(r[k]))
    return ', '.join('%s %s%s' % (r['ten'] or r['code'], '+' if r[k] > 0 else '', fmt(r[k])) for r in lst[:4]) + (' và %d mã khác' % (len(lst) - 4) if len(lst) > 4 else '')


if not nguon:
    tom = 'Chưa có đơn Đóng hàng ngày ' + D
elif not os.path.exists(days_p):
    tom = 'Kho chưa có phiếu ngày ' + D1
else:
    tom = ('Sản xuất khớp đơn' if not bad_sx else 'Sản xuất lệch %d mã: %s' % (len(bad_sx), ds(bad_sx, 'lech_sx'))) + '. ' + \
          ('Xuất kho khớp đơn' if not bad_xk else 'Xuất lệch %d mã: %s' % (len(bad_xk), ds(bad_xk, 'lech_xuat'))) + '.'
    if co_ton:
        ta = [r for r in rows if r.get('danh_gia') == 'ton_am']
        th = [r for r in rows if r.get('danh_gia') == 'thieu_hang']
        tom += ' ' + ('Tồn kho: đủ hàng, không âm.' if not ta and not th else 'Tồn kho:' +
                      (' %d mã thiếu hàng (%s)' % (len(th), ', '.join(r['ten'] or r['code'] for r in th[:4])) if th else '') +
                      (';' if th and ta else '') +
                      (' %d mã tồn âm (%s)' % (len(ta), ', '.join(r['ten'] or r['code'] for r in ta[:4])) if ta else '') + '.')
    if chua_ma:
        tom += ' %d cột đơn chưa gán mã Kho.' % len(chua_ma)
out = {'dh_ngay': D, 'kho_ngay': D1, 'nguon_dh': [{'ma': a, 'stamp': b, 'at': c} for a, b, c in nguon],
       'co_phieu_kho': os.path.exists(days_p), 'co_ton': co_ton,
       'so_ton_am': sum(r.get('danh_gia') == 'ton_am' for r in rows), 'so_thieu_hang': sum(r.get('danh_gia') == 'thieu_hang' for r in rows), 'phieu_cho_duyet': cho_duyet, 'rows': rows,
       'chua_ma': [{'cot': k, 'sl': v} for k, v in sorted(chua_ma.items())],
       'so_lech_sx': len(bad_sx), 'so_lech_xuat': len(bad_xk), 'tom_tat': tom}
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
