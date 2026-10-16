#!/usr/bin/env python3
"""Web làm việc nội bộ – Kho Ẩm Thực An Tâm (2 kho: Thành phẩm - Hàng hóa và Nguyên vật liệu).

Chỉ dùng thư viện chuẩn của Python 3.8+ (không cần pip install).
Chạy:  python server.py            -> mở http://localhost:8000
Biến môi trường (tùy chọn):
  PORT=8000             cổng web
  HOST=0.0.0.0          0.0.0.0 để máy khác trong mạng LAN truy cập được
  ANTAM_DB=data/kho.db  đường dẫn file dữ liệu
  ANTAM_PASSWORD=...    đặt mật khẩu đăng nhập (tên đăng nhập bất kỳ)
"""
import base64
import csv
import hashlib
import hmac
import io
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import threading
import time
import traceback
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import xlsx_import

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DB_PATH = os.environ.get("ANTAM_DB", os.path.join(BASE_DIR, "data", "kho.db"))
PHOTO_DIR = os.path.join(os.path.dirname(os.path.abspath(DB_PATH)), "anh-giao")  # ảnh giao hàng (chép cùng file .db khi sao lưu)
PASSWORD_FILE = os.path.join(BASE_DIR, "mat-khau.txt")


def _read_password():
    """Mật khẩu: biến môi trường ANTAM_PASSWORD, hoặc dòng đầu của file mat-khau.txt cạnh server.py."""
    if os.environ.get("ANTAM_PASSWORD"):
        return os.environ["ANTAM_PASSWORD"]
    try:
        with open(PASSWORD_FILE, encoding="utf-8-sig") as f:
            return f.readline().strip()
    except OSError:
        return ""


PASSWORD = _read_password()
PORT = int(os.environ.get("PORT", "8000"))


def lan_addresses():
    """Địa chỉ IP của máy này trong mạng nội bộ (để nhân viên mở web từ máy khác)."""
    import socket
    ips = []
    for target in ("10.255.255.255", "192.168.255.255", "8.8.8.8"):
        try:
            sk = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sk.connect((target, 1))  # UDP: không gửi gói tin nào, chỉ để hỏi hệ điều hành dùng card mạng nào
            ip = sk.getsockname()[0]
            sk.close()
            if ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
        except OSError:
            pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    return ips
WRITE_LOCK = threading.Lock()

TYPE_PREFIX = {"N": "PNK", "X": "PXK", "D": "DCK"}
TYPE_LABEL = {"N": "Nhập", "X": "Xuất", "D": "Điều chỉnh"}
# Ảnh hưởng đến tồn kho: nhập cộng, xuất trừ, điều chỉnh cộng theo dấu số lượng
SIGN_SQL = "CASE v.type WHEN 'X' THEN -1 ELSE 1 END"
# Phiếu điều chỉnh nhân viên lập phải chờ Quản lý duyệt: status 'pending' (chờ duyệt) / 'rejected' (từ chối) chưa tính vào tồn kho
POSTED_SQL = "COALESCE(v.status, '') = ''"
APPROVAL_COLS = ("status", "created_by", "approved_by", "approved_at", "review_note")

TP_NAME = "Kho thành phẩm - hàng hóa"
NVL_NAME = "Kho nguyên vật liệu"
OLD_TP_NAME = "Kho tổng"  # tên cũ trong file Excel, được đổi thành TP_NAME

# Cấu hình mặc định từng kho (có thể sửa ở trang Cài đặt)
DEFAULT_WAREHOUSES = {
    "TP": {
        "name": TP_NAME,
        "department": "Kho Thành phẩm & Hàng hóa – An Tâm",
        "routes": True,
        "parties": [TP_NAME, "Xưởng", "Văn phòng", "Nhà cung cấp", "Đóng đơn- giao hàng", "Khách trả hàng", NVL_NAME],
        "defaults": {
            "N": {"from_party": "Xưởng", "to_party": TP_NAME, "reason": "Nhập kho từ bộ phận sản xuất"},
            "X": {"from_party": TP_NAME, "to_party": "Đóng đơn- giao hàng", "reason": ""},
            "D": {"from_party": TP_NAME, "to_party": "", "reason": "Điều chỉnh về theo số kiểm kê thực tế"},
        },
        "adj_signers": ["Người lập phiếu / kiểm duyệt", "Thủ kho", "Kế toán"],
    },
    "NVL": {
        "name": NVL_NAME,
        "department": "Kho Nguyên vật liệu – An Tâm",
        "routes": False,
        "parties": [NVL_NAME, "Xưởng", "Văn phòng", "Nhà cung cấp", TP_NAME],
        "defaults": {
            "N": {"from_party": "Nhà cung cấp", "to_party": NVL_NAME, "reason": "Nhập mua nguyên vật liệu"},
            "X": {"from_party": NVL_NAME, "to_party": "Xưởng", "reason": "Xuất nguyên vật liệu cho sản xuất"},
            "D": {"from_party": NVL_NAME, "to_party": "", "reason": "Điều chỉnh về theo số kiểm kê thực tế"},
        },
        "adj_signers": ["Người lập phiếu", "Thủ kho", "Kế toán", "Giám đốc duyệt"],
    },
}
WAREHOUSE_CODES = list(DEFAULT_WAREHOUSES)

DEFAULT_SETTINGS = {
    "company": "Công Ty TNHH SX- TM Ẩm Thực An Tâm",
    "warehouses": DEFAULT_WAREHOUSES,
    "groups": ["Thành phẩm", "Bán thành phẩm", "Hàng hóa", "Nguyên liệu", "Vật liệu - Bao bì", "Công cụ dụng cụ"],
    "units": ["Cái", "Túi", "Kg", "Gr", "Cây", "Thùng", "Hộp", "Gói", "Lít", "Cuộn"],
    "staff": [],
    "stocktake_threshold": 0.01,
    "kebab_sizes": [50, 45, 40, 35, 30, 25, 20, 15, 10, 5],
    "plan_depts": ["Xưởng", "Văn phòng"],
    "paper": "A4",
    # Phân tuyến giao hàng: quy tắc từ khóa quận/địa chỉ -> mã tuyến, và tuyến đã chọn tay theo mã khách
    "routing": {"rules": [], "memory": {}},
    # Tài khoản web giao hàng: {id: {nick, name, phone, routes: [mã tuyến], active, salt, pin}} – pin = sha256(salt:PIN)
    "drivers": {},
    # Tài khoản nhân viên web kho: {id: {user, name, admin, active, salt, pw}} – pw = sha256(salt:mật khẩu)
    "staff_accounts": {},
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS products (
  wh TEXT NOT NULL DEFAULT 'TP', code TEXT NOT NULL, name TEXT NOT NULL, unit TEXT DEFAULT '', grp TEXT DEFAULT '',
  price REAL DEFAULT 0, supplier TEXT DEFAULT '', note TEXT DEFAULT '',
  opening_qty REAL DEFAULT 0, min_qty REAL, active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0,
  PRIMARY KEY (wh, code)
);
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT NOT NULL, note TEXT DEFAULT '', sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, wh TEXT NOT NULL DEFAULT 'TP', no TEXT NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL,
  route TEXT DEFAULT '', from_party TEXT DEFAULT '', to_party TEXT DEFAULT '',
  giver TEXT DEFAULT '', receiver TEXT DEFAULT '', reason TEXT DEFAULT '',
  bill_count TEXT DEFAULT '', doc_ref TEXT DEFAULT '', note TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT, status TEXT DEFAULT '', created_by TEXT DEFAULT '', approved_by TEXT DEFAULT '',
  approved_at TEXT DEFAULT '', review_note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS voucher_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  line_no INTEGER, product_code TEXT NOT NULL, qty REAL DEFAULT 0, price REAL DEFAULT 0, note TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_lines_voucher ON voucher_lines(voucher_id);
CREATE INDEX IF NOT EXISTS ix_lines_product ON voucher_lines(product_code);
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, wh TEXT NOT NULL DEFAULT 'TP', kind TEXT NOT NULL, date TEXT, title TEXT DEFAULT '',
  data TEXT, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, wh TEXT NOT NULL DEFAULT 'NVL', date TEXT NOT NULL, dept TEXT DEFAULT '',
  product_code TEXT NOT NULL, qty REAL DEFAULT 0, price REAL DEFAULT 0, need_date TEXT DEFAULT '',
  proposer TEXT DEFAULT '', note TEXT DEFAULT '', created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS deliveries (
  date TEXT NOT NULL, cust_key TEXT NOT NULL, route TEXT DEFAULT '', driver TEXT DEFAULT '', status TEXT DEFAULT '',
  note TEXT DEFAULT '', at TEXT, name TEXT DEFAULT '', photos TEXT DEFAULT '[]', gps TEXT DEFAULT '', PRIMARY KEY (date, cust_key)
);
CREATE TABLE IF NOT EXISTS cust_locations (
  cust_key TEXT PRIMARY KEY, lat REAL, lng REAL, acc REAL, name TEXT DEFAULT '', driver TEXT DEFAULT '', at TEXT, url TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, who TEXT, action TEXT, target TEXT, detail TEXT
);
"""

INDEXES = """
CREATE INDEX IF NOT EXISTS ix_vouchers_wh_date ON vouchers(wh, date);
CREATE INDEX IF NOT EXISTS ix_docs_wh_kind ON docs(wh, kind, date);
CREATE INDEX IF NOT EXISTS ix_plans_date ON plans(wh, date);
"""


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def connect():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def _columns(con, table):
    return [r[1] for r in con.execute("PRAGMA table_info(%s)" % table)]


def migrate(con):
    """Nâng cấp dữ liệu của bản 1 kho cũ lên bản 2 kho (dữ liệu cũ thuộc kho TP)."""
    for col in APPROVAL_COLS:
        if col not in _columns(con, "vouchers"):
            con.execute("ALTER TABLE vouchers ADD COLUMN %s TEXT DEFAULT ''" % col)
    if "url" not in _columns(con, "cust_locations"):
        con.execute("ALTER TABLE cust_locations ADD COLUMN url TEXT DEFAULT ''")
    # kết quả giao: thêm tên khách, ảnh giao hàng, vị trí lúc giao
    for col, ddl in (("name", "TEXT DEFAULT ''"), ("photos", "TEXT DEFAULT '[]'"), ("gps", "TEXT DEFAULT ''")):
        if col not in _columns(con, "deliveries"):
            con.execute("ALTER TABLE deliveries ADD COLUMN %s %s" % (col, ddl))
    if "wh" not in _columns(con, "products"):
        con.executescript("""
        ALTER TABLE products RENAME TO products_old;
        CREATE TABLE products (
          wh TEXT NOT NULL DEFAULT 'TP', code TEXT NOT NULL, name TEXT NOT NULL, unit TEXT DEFAULT '', grp TEXT DEFAULT '',
          price REAL DEFAULT 0, supplier TEXT DEFAULT '', note TEXT DEFAULT '',
          opening_qty REAL DEFAULT 0, min_qty REAL, active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0,
          PRIMARY KEY (wh, code));
        INSERT INTO products SELECT 'TP', code, name, unit, grp, price, supplier, note, opening_qty, min_qty, active, sort FROM products_old;
        DROP TABLE products_old;
        """)
    for table in ("vouchers", "docs"):
        if "wh" not in _columns(con, table):
            con.execute("ALTER TABLE %s ADD COLUMN wh TEXT NOT NULL DEFAULT 'TP'" % table)
    if not con.execute("SELECT 1 FROM settings WHERE key='_v2'").fetchone():
        # đổi "Kho tổng" -> "Kho thành phẩm - hàng hóa" trong dữ liệu đã có
        for col in ("from_party", "to_party"):
            con.execute("UPDATE vouchers SET %s=? WHERE wh='TP' AND trim(%s)=?" % (col, col), (TP_NAME, OLD_TP_NAME))
        old = {r["key"]: r["value"] for r in con.execute("SELECT key, value FROM settings")}
        tp = json.loads(json.dumps(DEFAULT_WAREHOUSES["TP"]))
        if "department" in old:
            tp["department"] = json.loads(old["department"])
        if "parties" in old:
            parties = [TP_NAME if p.strip() == OLD_TP_NAME else p for p in json.loads(old["parties"])]
            tp["parties"] = parties + [p for p in tp["parties"] if p not in parties]
        if any(k in old for k in ("department", "parties")):
            whs = json.loads(json.dumps(DEFAULT_WAREHOUSES))
            whs["TP"] = tp
            con.execute("INSERT OR REPLACE INTO settings(key, value) VALUES ('warehouses', ?)", (json.dumps(whs, ensure_ascii=False),))
        con.execute("DELETE FROM settings WHERE key IN ('department', 'parties', 'warehouse')")
        con.execute("INSERT OR REPLACE INTO settings(key, value) VALUES ('_v2', '1')")


def init_db():
    con = connect()
    con.execute("PRAGMA journal_mode = WAL")
    con.executescript(SCHEMA)
    migrate(con)
    con.executescript(INDEXES)
    con.execute("INSERT OR IGNORE INTO settings(key, value) VALUES ('_gh_secret', ?)", (secrets.token_hex(32),))
    con.commit()
    con.close()


def rows(cur):
    return [dict(r) for r in cur.fetchall()]


def num(v, default=0.0):
    if v is None or v == "":
        return default
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(" ", "")
    # chấp nhận cả 1.234,5 và 1234.5
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        raise ApiError(400, "Giá trị số không hợp lệ: %s" % v)


def text(v):
    return "" if v is None else str(v).strip()


def valid_date(v, field="Ngày"):
    s = text(v)
    try:
        datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        raise ApiError(400, "%s không hợp lệ: %s" % (field, s or "(trống)"))
    return s


def get_settings(con):
    s = json.loads(json.dumps(DEFAULT_SETTINGS))
    for r in con.execute("SELECT key, value FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'"):
        try:
            s[r["key"]] = json.loads(r["value"])
        except ValueError:
            pass
    # bổ sung các khóa mới cho cấu hình kho đã lưu từ trước
    whs = s.get("warehouses") or {}
    for code, d in DEFAULT_WAREHOUSES.items():
        merged = json.loads(json.dumps(d))
        merged.update(whs.get(code) or {})
        whs[code] = merged
    s["warehouses"] = whs
    return s


def write_log(con, who, action, target, detail="", wh=""):
    if not isinstance(detail, str):
        detail = json.dumps(detail, ensure_ascii=False)
    if wh:
        target = "[%s] %s" % (wh, target)
    con.execute("INSERT INTO log(at, who, action, target, detail) VALUES (?,?,?,?,?)",
                (now_str(), who, action, target, detail))


# ---------------------------------------------------------------- số phiếu

def _seq_from_no(no, prefix, ddmm):
    """'PXK-0810-03-HM' -> 3 nếu khớp tiền tố + ngày, ngược lại 0."""
    s = no.replace(" ", "").upper()
    head = "%s-%s-" % (prefix, ddmm)
    if not s.startswith(head):
        return 0
    m = re.match(r"(\d+)", s[len(head):])
    return int(m.group(1)) if m else 0


def next_number(con, wh, vtype, d, route_code="", exclude_id=None):
    prefix = TYPE_PREFIX[vtype]
    ddmm = datetime.strptime(d, "%Y-%m-%d").strftime("%d%m")
    seq = 0
    for r in con.execute("SELECT id, no FROM vouchers WHERE wh=? AND type=? AND substr(date,1,4)=?", (wh, vtype, d[:4])):
        if exclude_id and r["id"] == exclude_id:
            continue
        seq = max(seq, _seq_from_no(r["no"], prefix, ddmm))
    no = "%s-%s-%02d" % (prefix, ddmm, seq + 1)
    if vtype == "X":
        code = re.sub(r"\s+", "", route_code or "")
        if code:
            no += "-" + code
    return no


# ---------------------------------------------------------------- tồn kho

def stock_map(con, wh, until_date=None, before_date=None, exclude_voucher=None):
    """Tồn sổ sách theo mã: số dư ban đầu + phát sinh (đến hết until_date hoặc trước before_date)."""
    cond, params = ["v.wh = ?", POSTED_SQL], [wh]
    if until_date:
        cond.append("v.date <= ?")
        params.append(until_date)
    if before_date:
        cond.append("v.date < ?")
        params.append(before_date)
    if exclude_voucher:
        cond.append("v.id <> ?")
        params.append(exclude_voucher)
    res = {r["code"]: r["opening_qty"] or 0 for r in con.execute("SELECT code, opening_qty FROM products WHERE wh=?", (wh,))}
    sql = ("SELECT l.product_code AS code, SUM(%s * l.qty) AS q FROM voucher_lines l "
           "JOIN vouchers v ON v.id = l.voucher_id WHERE %s GROUP BY l.product_code" % (SIGN_SQL, " AND ".join(cond)))
    for r in con.execute(sql, params):
        res[r["code"]] = res.get(r["code"], 0) + (r["q"] or 0)
    return res


def report_nxt(con, wh, d_from, d_to):
    opening = stock_map(con, wh, before_date=d_from)
    per = {}
    sql = ("SELECT l.product_code AS code, v.type AS type, SUM(l.qty) AS q, COUNT(*) AS n "
           "FROM voucher_lines l JOIN vouchers v ON v.id = l.voucher_id "
           "WHERE v.wh = ? AND v.date >= ? AND v.date <= ? AND " + POSTED_SQL + " GROUP BY l.product_code, v.type")
    for r in con.execute(sql, (wh, d_from, d_to)):
        p = per.setdefault(r["code"], {"N": 0, "X": 0, "D": 0, "n": 0})
        p[r["type"]] = r["q"] or 0
        p["n"] += r["n"]
    out = []
    products = rows(con.execute("SELECT * FROM products WHERE wh=? ORDER BY sort, code", (wh,)))
    known = {p["code"] for p in products}
    for code in sorted(set(per) - known):  # mã có trong sổ nhưng đã xóa khỏi danh mục
        products.append({"code": code, "name": "(không có trong danh mục)", "unit": "", "grp": "",
                         "price": 0, "opening_qty": 0, "min_qty": None})
    for p in products:
        code = p["code"]
        m = per.get(code, {"N": 0, "X": 0, "D": 0, "n": 0})
        op = opening.get(code, 0)
        close = op + m["N"] - m["X"] + m["D"]
        warn = ""
        if close < -1e-9:
            warn = "Tồn âm"
        elif p.get("min_qty") is not None and close < p["min_qty"]:
            warn = "Dưới tồn tối thiểu"
        out.append({
            "code": code, "name": p["name"], "unit": p["unit"], "grp": p["grp"],
            "opening_qty": p.get("opening_qty") or 0, "min_qty": p.get("min_qty"),
            "open": op, "in": m["N"], "out": m["X"], "adj": m["D"], "close": close,
            "price": p.get("price") or 0, "value": close * (p.get("price") or 0),
            "warn": warn, "moved": m["n"] > 0,
        })
    return out


def stock_card(con, wh, code, d_from, d_to):
    opening = stock_map(con, wh, before_date=d_from).get(code, 0)
    sql = ("SELECT v.id AS voucher_id, v.no, v.date, v.type, v.from_party, v.to_party, v.reason, "
           "l.qty, l.note FROM voucher_lines l JOIN vouchers v ON v.id = l.voucher_id "
           "WHERE v.wh = ? AND l.product_code = ? AND v.date >= ? AND v.date <= ? AND " + POSTED_SQL + " ORDER BY v.date, v.id, l.line_no")
    lines = rows(con.execute(sql, (wh, code, d_from, d_to)))
    bal = opening
    for ln in lines:
        q = ln["qty"] or 0
        bal += -q if ln["type"] == "X" else q
        ln["balance"] = bal
    return {"opening": opening, "lines": lines, "closing": bal}


# ---------------------------------------------------------------- phiếu

def voucher_full(con, vid):
    v = con.execute("SELECT * FROM vouchers WHERE id = ?", (vid,)).fetchone()
    if not v:
        raise ApiError(404, "Không tìm thấy phiếu")
    v = dict(v)
    v["lines"] = rows(con.execute(
        "SELECT l.*, p.name, p.unit FROM voucher_lines l LEFT JOIN products p ON p.code = l.product_code AND p.wh = ? "
        "WHERE l.voucher_id = ? ORDER BY l.line_no, l.id", (v["wh"], vid)))
    if v["type"] == "D":
        # tồn sổ sách trước khi điều chỉnh (đến hết ngày phiếu, không tính chính phiếu này)
        book = stock_map(con, v["wh"], until_date=v["date"], exclude_voucher=vid)
        for ln in v["lines"]:
            ln["book_qty"] = book.get(ln["product_code"], 0)
    return v


def approval_of(old, vtype, me, who):
    """Trạng thái duyệt của phiếu sau khi lưu. me = (id, tài khoản) đang đăng nhập, None nếu chưa dùng tài khoản nhân viên."""
    cur = {k: (old[k] or "") if old else "" for k in APPROVAL_COLS}
    if old and old["type"] == "D" and not cur["status"] and me and not me[1].get("admin"):
        raise ApiError(403, "Phiếu điều chỉnh %s đã được duyệt – chỉ Quản lý sửa / xóa được" % old["no"])
    if not old:
        cur["created_by"] = who
    if vtype != "D" or not me:
        return dict(cur, status="", review_note="")
    if me[1].get("admin"):
        if not old:  # Quản lý tự lập: duyệt luôn
            cur.update(approved_by=who, approved_at=now_str())
        return cur
    # nhân viên lập / sửa: gửi (lại) cho Quản lý duyệt
    return dict(cur, status="pending", approved_by="", approved_at="")


def review_voucher(con, vid, ok, note, me, who):
    if not me or not me[1].get("admin"):
        raise ApiError(403, "Chỉ tài khoản Quản lý mới duyệt phiếu điều chỉnh")
    v = con.execute("SELECT * FROM vouchers WHERE id=?", (vid,)).fetchone()
    if not v:
        raise ApiError(404, "Không tìm thấy phiếu")
    if v["type"] != "D":
        raise ApiError(400, "Chỉ phiếu điều chỉnh cần duyệt")
    if ok and not (v["status"] or ""):
        raise ApiError(400, "Phiếu %s đã được duyệt" % v["no"])
    note = text(note)[:300]
    if not ok and not note:
        raise ApiError(400, "Hãy ghi lý do từ chối để người lập phiếu sửa lại")
    con.execute("UPDATE vouchers SET status=?, approved_by=?, approved_at=?, review_note=? WHERE id=?",
                ("" if ok else "rejected", who, now_str(), note, vid))
    write_log(con, who, "Duyệt phiếu điều chỉnh" if ok else "Từ chối phiếu điều chỉnh", v["no"], note, v["wh"])
    return voucher_full(con, vid)


def save_voucher(con, wh, data, vid=None, who="", me=None):
    vtype = text(data.get("type"))
    if vtype not in TYPE_PREFIX:
        raise ApiError(400, "Loại phiếu không hợp lệ")
    old_row = None
    if vid:
        old_row = con.execute("SELECT * FROM vouchers WHERE id=?", (vid,)).fetchone()
        if not old_row:
            raise ApiError(404, "Không tìm thấy phiếu")
        wh = old_row["wh"]  # phiếu luôn giữ kho ban đầu
    ap = approval_of(old_row, vtype, me, who)
    d = valid_date(data.get("date"))
    lines = data.get("lines") or []
    clean = []
    for i, ln in enumerate(lines):
        code = text(ln.get("product_code"))
        if not code:
            continue
        if not con.execute("SELECT 1 FROM products WHERE wh=? AND code=?", (wh, code)).fetchone():
            raise ApiError(400, "Dòng %d: mã hàng %s chưa có trong danh mục kho này" % (i + 1, code))
        qty = num(ln.get("qty"))
        if vtype != "D" and qty < 0:
            raise ApiError(400, "Dòng %d: số lượng không được âm (dùng phiếu điều chỉnh)" % (i + 1))
        clean.append((code, qty, num(ln.get("price")), text(ln.get("note"))))
    if not clean:
        raise ApiError(400, "Phiếu chưa có mặt hàng nào")
    no = text(data.get("no")) or next_number(con, wh, vtype, d, data.get("route_code"), exclude_id=vid)
    dup = con.execute("SELECT id FROM vouchers WHERE wh=? AND no=? AND substr(date,1,4)=? AND id<>?",
                      (wh, no, d[:4], vid or 0)).fetchone()
    if dup:
        raise ApiError(409, "Số phiếu %s đã tồn tại – hãy bấm 'Cấp số mới' hoặc sửa số" % no)
    f = {k: text(data.get(k)) for k in
         ("route", "from_party", "to_party", "giver", "receiver", "reason", "bill_count", "doc_ref", "note")}
    ts = now_str()
    vals = (no, vtype, d, f["route"], f["from_party"], f["to_party"], f["giver"], f["receiver"], f["reason"],
            f["bill_count"], f["doc_ref"], f["note"]) + tuple(ap[k] for k in APPROVAL_COLS)
    if vid:
        old = voucher_full(con, vid)
        con.execute("UPDATE vouchers SET no=?, type=?, date=?, route=?, from_party=?, to_party=?, giver=?, receiver=?, "
                    "reason=?, bill_count=?, doc_ref=?, note=?, status=?, created_by=?, approved_by=?, approved_at=?, "
                    "review_note=?, updated_at=? WHERE id=?", vals + (ts, vid))
        con.execute("DELETE FROM voucher_lines WHERE voucher_id = ?", (vid,))
        write_log(con, who, "Sửa phiếu", no, {"trước": _summary(old), "sau": _summary_lines(clean)}, wh)
    else:
        cur = con.execute("INSERT INTO vouchers(wh, no, type, date, route, from_party, to_party, giver, receiver, reason, "
                          "bill_count, doc_ref, note, status, created_by, approved_by, approved_at, review_note, created_at, updated_at) "
                          "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (wh,) + vals + (ts, ts))
        vid = cur.lastrowid
        write_log(con, who, "Lập phiếu" + (" (chờ duyệt)" if ap["status"] == "pending" else ""), no, _summary_lines(clean), wh)
    con.executemany("INSERT INTO voucher_lines(voucher_id, line_no, product_code, qty, price, note) VALUES (?,?,?,?,?,?)",
                    [(vid, i + 1, c, q, p, n) for i, (c, q, p, n) in enumerate(clean)])
    return vid


def _summary(v):
    return {"ngày": v["date"], "dòng": ["%s x %s" % (l["product_code"], _fmt(l["qty"])) for l in v["lines"]]}


def _summary_lines(clean):
    return ["%s x %s" % (c, _fmt(q)) for c, q, _, _ in clean]


def _fmt(x):
    return ("%f" % (x + 0.0)).rstrip("0").rstrip(".") if isinstance(x, float) else str(x)


# ---------------------------------------------------------------- nhập Excel

def detect_warehouse(wb):
    """Đoán file Excel thuộc kho nào dựa vào tiêu đề sheet Sổ Nhập Xuất / tên bộ phận trên phiếu."""
    for name, cells in (("Sổ Nhập Xuất", ("A1",)), ("Phiếu Nhập Xuất", ("A2",)), ("Phiếu Điều chỉnh", ("A2",))):
        sh = wb.get(name)
        if not sh:
            continue
        hay = " ".join(text(sh.get(c)) for c in cells).upper()
        if "NGUYÊN VẬT LIỆU" in hay:
            return "NVL"
        if "THÀNH PHẨM" in hay:
            return "TP"
    return None


def import_excel(con, wh, blob, opts, who=""):
    wb = xlsx_import.read_workbook(blob)
    detected = detect_warehouse(wb)
    if detected and detected != wh and not opts.get("force"):
        names = {"TP": TP_NAME, "NVL": NVL_NAME}
        raise ApiError(409, "File này có vẻ là của %s, nhưng bạn đang nhập vào %s. Hãy chuyển kho ở góc trên bên trái rồi nhập lại."
                       % (names[detected], names[wh]))
    summary = {}
    names = {n.strip().lower(): n for n in wb}

    def sheet(*cands):
        for c in cands:
            if c.lower() in names:
                return wb[names[c.lower()]]
        return None

    def party(v):
        v = text(v)
        return TP_NAME if wh == "TP" and v == OLD_TP_NAME else v

    cat = sheet("Danh mục hàng")
    nxt = sheet("Nhập Xuất Tồn")
    opening = {}
    if nxt:
        for r in range(6, 2000):
            code = text(nxt.get("B%d" % r))
            if code:
                opening[code] = (nxt.get("F%d" % r), nxt.get("G%d" % r))
    if cat and opts.get("products", True):
        n = 0
        for r in range(5, 5000):
            code = text(cat.get("A%d" % r))
            if not code:
                continue
            op, mn = opening.get(code, (None, None))
            vals = (text(cat.get("B%d" % r)) or code, text(cat.get("C%d" % r)), text(cat.get("D%d" % r)),
                    _safe_num(cat.get("E%d" % r)), text(cat.get("F%d" % r)), text(cat.get("G%d" % r)),
                    _safe_num(op), _safe_num(mn, None), r)
            if con.execute("SELECT 1 FROM products WHERE wh=? AND code=?", (wh, code)).fetchone():
                con.execute("UPDATE products SET name=?, unit=?, grp=?, price=?, supplier=?, note=?, opening_qty=?, "
                            "min_qty=?, sort=? WHERE wh=? AND code=?", vals + (wh, code))
            else:
                con.execute("INSERT INTO products(name, unit, grp, price, supplier, note, opening_qty, min_qty, sort, wh, code) "
                            "VALUES (?,?,?,?,?,?,?,?,?,?,?)", vals + (wh, code))
            n += 1
        summary["Mặt hàng"] = n
    rt = sheet("Danh mục tuyến")
    if rt and opts.get("routes", True):
        n = 0
        for r in range(5, 1000):
            name, code = text(rt.get("B%d" % r)), text(rt.get("C%d" % r))
            if not name:
                continue
            ex = con.execute("SELECT id FROM routes WHERE name = ?", (name,)).fetchone()
            if ex:
                con.execute("UPDATE routes SET code=?, note=?, sort=? WHERE id=?", (code, text(rt.get("D%d" % r)), r, ex["id"]))
            else:
                con.execute("INSERT INTO routes(name, code, note, sort) VALUES (?,?,?,?)", (name, code, text(rt.get("D%d" % r)), r))
            n += 1
        summary["Tuyến"] = n
    ledger = sheet("Sổ Nhập Xuất")
    if ledger and opts.get("ledger", True):
        if opts.get("replace_ledger", True):
            con.execute("DELETE FROM voucher_lines WHERE voucher_id IN (SELECT id FROM vouchers WHERE wh=?)", (wh,))
            con.execute("DELETE FROM vouchers WHERE wh=?", (wh,))
        groups, order = {}, []
        skipped = 0
        for r in range(5, ledger.max_row + 1):
            no = text(ledger.get("A%d" % r))
            item = text(ledger.get("F%d" % r))
            if not no and not item:
                continue
            code = text(ledger.get("G%d" % r))
            if (not code or code == "Không có mã") and item:
                code = item.split("|")[0].strip()
            d = ledger.get("B%d" % r)
            if not no or not code or not isinstance(d, date):
                skipped += 1
                continue
            ds = d.strftime("%Y-%m-%d")
            vtype = {"Nhập": "N", "Xuất": "X", "Điều chỉnh": "D"}.get(text(ledger.get("C%d" % r)))
            if not vtype:
                head = no.replace(" ", "").upper()
                vtype = "N" if head.startswith("PN") else "X" if head.startswith("PX") else "D" if head.startswith("DC") else None
            if not vtype:
                skipped += 1
                continue
            key = (no, ds, vtype)
            if key not in groups:
                groups[key] = {"lines": [], "hdr": {}}
                order.append(key)
            g = groups[key]
            for f, col in (("from_party", "D"), ("to_party", "E"), ("reason", "N"), ("giver", "O"), ("receiver", "P")):
                val = party(ledger.get("%s%d" % (col, r))) if f in ("from_party", "to_party") else text(ledger.get("%s%d" % (col, r)))
                if val and not g["hdr"].get(f):
                    g["hdr"][f] = val
            if not con.execute("SELECT 1 FROM products WHERE wh=? AND code=?", (wh, code)).fetchone():
                con.execute("INSERT INTO products(wh, code, name, unit) VALUES (?,?,?,?)",
                            (wh, code, text(ledger.get("H%d" % r)) or item or code, text(ledger.get("J%d" % r))))
            g["lines"].append((code, _safe_num(ledger.get("K%d" % r)), _safe_num(ledger.get("L%d" % r)),
                               text(ledger.get("I%d" % r))))
        ts = now_str()
        for key in order:
            no, ds, vtype = key
            h = groups[key]["hdr"]
            route = ""
            if vtype == "X" and wh == "TP":
                m = re.match(r"PXK-\d{4}-\d+-(.+)$", no.replace(" ", ""), re.I)
                if m:
                    rr = con.execute("SELECT name FROM routes WHERE replace(code,' ','') = ?", (m.group(1),)).fetchone()
                    route = rr["name"] if rr else ""
            cur = con.execute("INSERT INTO vouchers(wh, no, type, date, route, from_party, to_party, giver, receiver, reason, "
                              "created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                              (wh, no, vtype, ds, route, h.get("from_party", ""), h.get("to_party", ""), h.get("giver", ""),
                               h.get("receiver", ""), h.get("reason", ""), ts, ts))
            con.executemany("INSERT INTO voucher_lines(voucher_id, line_no, product_code, qty, price, note) VALUES (?,?,?,?,?,?)",
                            [(cur.lastrowid, i + 1) + ln for i, ln in enumerate(groups[key]["lines"])])
        summary["Phiếu"] = len(order)
        summary["Dòng hàng"] = sum(len(g["lines"]) for g in groups.values())
        if skipped:
            summary["Dòng bỏ qua (thiếu số phiếu/ngày/mã)"] = skipped
    kh = sheet("KH Ngày")
    if kh and opts.get("plans", True):
        con.execute("DELETE FROM plans WHERE wh=?", (wh,))
        n = 0
        ts = now_str()
        for r in range(5, kh.max_row + 1):
            item = text(kh.get("C%d" % r))
            d = kh.get("A%d" % r)
            if not item or not isinstance(d, date):
                continue
            code = text(kh.get("D%d" % r))
            if not code or code == "Không có mã":
                code = item.split("|")[0].strip()
            if not con.execute("SELECT 1 FROM products WHERE wh=? AND code=?", (wh, code)).fetchone():
                con.execute("INSERT INTO products(wh, code, name, unit) VALUES (?,?,?,?)",
                            (wh, code, text(kh.get("E%d" % r)) or item, text(kh.get("F%d" % r))))
            nd = kh.get("J%d" % r)
            con.execute("INSERT INTO plans(wh, date, dept, product_code, qty, price, need_date, proposer, note, created_at, updated_at) "
                        "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                        (wh, d.strftime("%Y-%m-%d"), text(kh.get("B%d" % r)), code, _safe_num(kh.get("G%d" % r)),
                         _safe_num(kh.get("H%d" % r)), nd.strftime("%Y-%m-%d") if isinstance(nd, date) else "",
                         text(kh.get("K%d" % r)), text(kh.get("L%d" % r)), ts, ts))
            n += 1
        summary["Dòng kế hoạch mua hàng"] = n
    if not summary:
        raise ApiError(400, "Không tìm thấy sheet phù hợp (Danh mục hàng, Danh mục tuyến, Sổ Nhập Xuất, KH Ngày)")
    write_log(con, who, "Nhập Excel", "", summary, wh)
    return summary


def _safe_num(v, default=0.0):
    if v is None or v == "":
        return default
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return num(v)
    except ApiError:
        return default


# ---------------------------------------------------------------- file dữ liệu .json (dùng chung với bản online)

def export_backup_json(con):
    """Toàn bộ dữ liệu 2 kho theo định dạng 'kho-antam-backup' của bản online:
    dùng để chuyển dữ liệu qua lại và để cập nhật trang xem công khai."""
    s = get_settings(con)
    out = {"format": "kho-antam-backup", "version": 1, "at": now_str(),
           "settings": {k: v for k, v in s.items() if k in DEFAULT_SETTINGS},
           "routes": {str(r["id"]): {"name": r["name"], "code": r["code"], "note": r["note"] or "", "sort": r["sort"] or 0}
                      for r in con.execute("SELECT * FROM routes")},
           "warehouses": {}, "deliveries": {}}
    for r in con.execute("SELECT * FROM deliveries"):
        out["deliveries"].setdefault(r["date"], {"date": r["date"], "d": {}})["d"][r["cust_key"]] = delivery_rec(r)
    out["locations"] = {"v": locations_all(con)}
    for wh in WAREHOUSE_CODES:
        products = {r["code"]: {"name": r["name"], "unit": r["unit"] or "", "grp": r["grp"] or "", "price": r["price"] or 0,
                                "supplier": r["supplier"] or "", "note": r["note"] or "", "opening_qty": r["opening_qty"] or 0,
                                "min_qty": r["min_qty"], "active": r["active"], "sort": r["sort"] or 0}
                    for r in con.execute("SELECT * FROM products WHERE wh=?", (wh,))}
        days = {}
        lines = {}
        for l in con.execute("SELECT l.* FROM voucher_lines l JOIN vouchers v ON v.id=l.voucher_id WHERE v.wh=? ORDER BY l.line_no, l.id", (wh,)):
            lines.setdefault(l["voucher_id"], []).append({"c": l["product_code"], "q": l["qty"] or 0, "p": l["price"] or 0, "n": l["note"] or ""})
        for v in con.execute("SELECT * FROM vouchers WHERE wh=?", (wh,)):
            rec = {k: (v[k] or "") for k in ("no", "type", "date", "route", "from_party", "to_party", "giver", "receiver", "reason",
                                              "bill_count", "doc_ref", "note", "created_at", "updated_at") + APPROVAL_COLS}
            rec["lines"] = lines.get(v["id"], [])
            days.setdefault(v["date"], {"date": v["date"], "v": {}})["v"][str(v["id"])] = rec
        docs = {str(d["id"]): {"kind": d["kind"], "date": d["date"], "title": d["title"] or "", "data": json.loads(d["data"] or "{}"),
                               "created_at": d["created_at"], "updated_at": d["updated_at"]}
                for d in con.execute("SELECT * FROM docs WHERE wh=?", (wh,))}
        plans = {}
        for r in con.execute("SELECT * FROM plans WHERE wh=?", (wh,)):
            ym = r["date"][:7]
            plans.setdefault(ym, {"ym": ym, "p": {}})["p"][str(r["id"])] = {
                k: r[k] for k in ("date", "dept", "product_code", "qty", "price", "need_date", "proposer", "note", "created_at", "updated_at")}
        out["warehouses"][wh] = {"products": products, "days": days, "docs": docs, "plans": plans}
    return out


def import_backup_json(con, snap, who=""):
    """Thay TOÀN BỘ dữ liệu bằng file .json tải từ bản online (hoặc từ chính bản này)."""
    if not isinstance(snap, dict) or snap.get("format") != "kho-antam-backup" or not isinstance(snap.get("warehouses"), dict):
        raise ApiError(400, "File không đúng: hãy dùng file 'Tải dữ liệu' (.json) của web Kho An Tâm")
    live = lambda m: [(k, v) for k, v in (m or {}).items() if v is not None]
    for t in ("voucher_lines", "vouchers", "products", "routes", "docs", "plans", "deliveries", "cust_locations"):
        con.execute("DELETE FROM %s" % t)
    for _, day in live(snap.get("deliveries")):
        for key, r in live((day or {}).get("d")):
            gps = clean_gps(r.get("gps"))
            con.execute("INSERT OR REPLACE INTO deliveries(date, cust_key, route, driver, status, note, at, name, photos, gps) "
                        "VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (text(day.get("date")), key, text(r.get("route")), text(r.get("driver")), text(r.get("status")),
                         text(r.get("note")), text(r.get("at")), text(r.get("name")),
                         json.dumps([text(x) for x in r.get("photos") or [] if text(x)]), json.dumps(gps) if gps else ""))
    for key, r in live(((snap.get("locations") or {}).get("v"))):
        set_location(con, key, r, text(r.get("name")), text(r.get("driver")), text(r.get("at")))
    for k, v in (snap.get("settings") or {}).items():
        if k in DEFAULT_SETTINGS:
            con.execute("INSERT OR REPLACE INTO settings(key, value) VALUES (?,?)", (k, json.dumps(v, ensure_ascii=False)))
    for _, r in live(snap.get("routes")):
        con.execute("INSERT INTO routes(name, code, note, sort) VALUES (?,?,?,?)", (text(r.get("name")), text(r.get("code")), text(r.get("note")), r.get("sort") or 0))
    summary = {}
    for wh, d in snap["warehouses"].items():
        if wh not in WAREHOUSE_CODES or not isinstance(d, dict):
            continue
        for code, p in live(d.get("products")):
            con.execute("INSERT INTO products(wh, code, name, unit, grp, price, supplier, note, opening_qty, min_qty, active, sort) "
                        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                        (wh, code, text(p.get("name")) or code, text(p.get("unit")), text(p.get("grp")), _safe_num(p.get("price")),
                         text(p.get("supplier")), text(p.get("note")), _safe_num(p.get("opening_qty")), _safe_num(p.get("min_qty"), None),
                         0 if p.get("active") in (0, False) else 1, p.get("sort") or 0))
        nv = nl = 0
        vlist = []
        for day, doc in live(d.get("days")):
            for _, v in live((doc or {}).get("v")):
                vlist.append(v)
        vlist.sort(key=lambda v: (v.get("date") or "", v.get("created_at") or ""))
        for v in vlist:
            cur = con.execute("INSERT INTO vouchers(wh, no, type, date, route, from_party, to_party, giver, receiver, reason, bill_count, "
                              "doc_ref, note, created_at, updated_at, status, created_by, approved_by, approved_at, review_note) "
                              "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                              (wh,) + tuple(text(v.get(k)) for k in ("no", "type", "date", "route", "from_party", "to_party", "giver",
                                                                     "receiver", "reason", "bill_count", "doc_ref", "note", "created_at", "updated_at")
                                                                    + APPROVAL_COLS))
            for i, l in enumerate(v.get("lines") or []):
                code = text(l.get("c"))
                if not con.execute("SELECT 1 FROM products WHERE wh=? AND code=?", (wh, code)).fetchone():
                    con.execute("INSERT INTO products(wh, code, name) VALUES (?,?,?)", (wh, code, code))
                con.execute("INSERT INTO voucher_lines(voucher_id, line_no, product_code, qty, price, note) VALUES (?,?,?,?,?,?)",
                            (cur.lastrowid, i + 1, code, _safe_num(l.get("q")), _safe_num(l.get("p")), text(l.get("n"))))
                nl += 1
            nv += 1
        for _, doc in live(d.get("docs")):
            con.execute("INSERT INTO docs(wh, kind, date, title, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                        (wh, text(doc.get("kind")), text(doc.get("date")), text(doc.get("title")),
                         json.dumps(doc.get("data") or {}, ensure_ascii=False), text(doc.get("created_at")), text(doc.get("updated_at"))))
        np_ = 0
        for _, month in live(d.get("plans")):
            for _, r in live((month or {}).get("p")):
                con.execute("INSERT INTO plans(wh, date, dept, product_code, qty, price, need_date, proposer, note, created_at, updated_at) "
                            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                            (wh, text(r.get("date")), text(r.get("dept")), text(r.get("product_code")), _safe_num(r.get("qty")),
                             _safe_num(r.get("price")), text(r.get("need_date")), text(r.get("proposer")), text(r.get("note")),
                             text(r.get("created_at")), text(r.get("updated_at"))))
                np_ += 1
        summary[wh] = {"Phiếu": nv, "Dòng hàng": nl, "Dòng kế hoạch": np_}
    write_log(con, who, "Nhập file dữ liệu .json", "", summary)
    return summary


def _date_range(q):
    cond, params = [], []
    if q.get("from"):
        cond.append("v.date >= ?")
        params.append(q["from"])
    if q.get("to"):
        cond.append("v.date <= ?")
        params.append(q["to"])
    return cond, params


# ---------------------------------------------------------------- web giao hàng (mỗi người giao 1 tài khoản)

GH_TOKEN_DAYS = 60


def pin_hash(salt, pin):
    """Giống online/backend.js (pinHash) để file dữ liệu .json dùng chung được."""
    return hashlib.sha256(("%s:%s" % (salt, pin)).encode("utf-8")).hexdigest()


def norm_nick(v):
    return re.sub(r"\s+", "", text(v)).lower()


def get_drivers(con):
    # bỏ các mục null (tài khoản đã xóa ở bản online, chuyển qua file .json)
    return {k: v for k, v in (get_settings(con).get("drivers") or {}).items() if isinstance(v, dict)}


def public_driver(did, d):
    return {"id": did, "nick": d.get("nick", ""), "name": d.get("name", ""), "phone": d.get("phone", ""),
            "routes": d.get("routes") or [], "active": d.get("active", True) is not False, "has_pin": bool(d.get("pin"))}


def save_drivers(con, drivers):
    con.execute("INSERT OR REPLACE INTO settings(key, value) VALUES ('drivers', ?)", (json.dumps(drivers, ensure_ascii=False),))


def save_driver(con, data, who=""):
    drivers = get_drivers(con)
    did = text(data.get("id")) or "g" + secrets.token_hex(4)
    nick = norm_nick(data.get("nick"))
    if not re.match(r"^[a-z0-9._-]{2,30}$", nick):
        raise ApiError(400, "Tên đăng nhập (nick) 2–30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch")
    if any(norm_nick(d.get("nick")) == nick and k != did for k, d in drivers.items()):
        raise ApiError(409, "Nick %s đã có người dùng" % nick)
    old = drivers.get(did) or {}
    rec = {"nick": nick, "name": text(data.get("name")) or nick, "phone": text(data.get("phone")),
           "routes": [re.sub(r"\s+", "", text(c)) for c in (data.get("routes") or []) if text(c)],
           "active": data.get("active", True) is not False, "salt": old.get("salt", ""), "pin": old.get("pin", "")}
    pin = text(data.get("pin"))
    if pin:
        if not re.match(r"^\d{4,8}$", pin):
            raise ApiError(400, "Mã PIN gồm 4–8 chữ số")
        rec["salt"] = secrets.token_hex(8)
        rec["pin"] = pin_hash(rec["salt"], pin)
    if not rec["pin"]:
        raise ApiError(400, "Cần đặt mã PIN cho tài khoản mới")
    drivers[did] = rec
    save_drivers(con, drivers)
    write_log(con, who, "Lưu tài khoản giao hàng", nick, "đổi PIN" if pin and old else "", "TP")
    return public_driver(did, rec)


def _gh_secret(con):
    """Khóa ký phiên đăng nhập web giao hàng (tạo 1 lần khi khởi động, không nằm trong file sao lưu .json)."""
    r = con.execute("SELECT value FROM settings WHERE key='_gh_secret'").fetchone()
    if not r:
        raise ApiError(500, "Chưa có khóa phiên giao hàng – hãy chạy lại web")
    return r["value"]


def _gh_sign(con, did, d, exp):
    msg = "%s|%s|%d" % (did, d.get("pin", ""), exp)
    return hmac.new(_gh_secret(con).encode(), msg.encode(), hashlib.sha256).hexdigest()[:32]


def gh_login(con, data):
    nick, pin = norm_nick(data.get("nick")), text(data.get("pin"))
    for did, d in get_drivers(con).items():
        if norm_nick(d.get("nick")) == nick and d.get("active", True) is not False and d.get("pin"):
            if hmac.compare_digest(pin_hash(d.get("salt", ""), pin), d["pin"]):
                exp = int(time.time()) + GH_TOKEN_DAYS * 86400
                token = "%s.%d.%s" % (did, exp, _gh_sign(con, did, d, exp))
                return {"token": token, "driver": public_driver(did, d)}
            break
    time.sleep(0.5)
    raise ApiError(401, "Sai nick hoặc mã PIN")


def gh_auth(con, token):
    try:
        did, exp, sig = text(token).split(".")
        exp = int(exp)
    except ValueError:
        raise ApiError(401, "Hãy đăng nhập lại")
    d = get_drivers(con).get(did)
    if not d or d.get("active", True) is False or exp < time.time() or not hmac.compare_digest(sig, _gh_sign(con, did, d, exp)):
        raise ApiError(401, "Phiên đăng nhập đã hết hạn hoặc tài khoản bị khóa – hãy đăng nhập lại")
    return did, d


def merge_routing(datas):
    """Gộp các bảng phân tuyến cùng ngày (tuyến lẻ, khách tuyến 1-2-3…) – giống mergeRouting ở online/backend.js:
    cột sản phẩm trùng tên cộng chung, khách có nhiều dòng thì mã dòng thêm #2, #3…"""
    cols, idx, rows, assign, seen = [], {}, [], {}, {}
    for data in datas:
        mp = []
        for c in data.get("cols") or []:
            k = re.sub(r"\s+", "", str(c)).lower()
            if k not in idx:
                idx[k] = len(cols)
                cols.append(c)
            mp.append(idx[k])
        assign.update(data.get("assign") or {})
        for r in data.get("rows") or []:
            qty = {}
            for k, n in (r.get("qty") or {}).items():
                try:
                    j = mp[int(k)]
                except (ValueError, IndexError):
                    continue
                qty[str(j)] = qty.get(str(j), 0) + (n or 0)
            base = text(r.get("crm")) or text(r.get("code")) or text(r.get("cust"))
            seen[base] = seen.get(base, 0) + 1
            row = dict(r, qty=qty, key=base if seen[base] == 1 else "%s#%d" % (base, seen[base]))
            rows.append(row)
    return {"cols": cols, "rows": rows, "assign": assign}


def routing_doc(con, d):
    """Các bảng phân tuyến của 1 ngày, gộp lại (None nếu chưa có)."""
    rs = con.execute("SELECT data FROM docs WHERE wh='TP' AND kind='routing' AND date=? ORDER BY created_at, id", (d,)).fetchall()
    return merge_routing([json.loads(r["data"] or "{}") for r in rs]) if rs else None


def route_driver(data, code, drivers):
    """Người giao của 1 tuyến: chọn ở Phân tuyến ngày đó, nếu chưa chọn thì lấy người có tuyến thường chạy là tuyến này."""
    assign = (data or {}).get("assign") or {}
    if code in assign:
        return assign[code] or ""
    for did, d in drivers.items():
        if d.get("active", True) is not False and any(text(c).lower() == code.lower() for c in d.get("routes") or []):
            return did
    return ""


def cust_key(r):
    return text(r.get("key")) or text(r.get("crm")) or text(r.get("code")) or text(r.get("cust"))


def my_routes(con, did, d, drivers=None):
    """Các tuyến được sắp cho người giao did trong ngày d: [{code, name, rows}] theo thứ tự danh mục tuyến."""
    data = routing_doc(con, d)
    if not data:
        return None, []
    drivers = drivers if drivers is not None else get_drivers(con)
    names = {}
    order = []
    for r in con.execute("SELECT name, code FROM routes ORDER BY sort, id"):
        c = re.sub(r"\s+", "", r["code"] or "")
        if c and c.lower() not in names:
            names[c.lower()] = r["name"]
            order.append(c.lower())
    groups = {}
    for row in data.get("rows") or []:
        code = text(row.get("route"))
        if code and route_driver(data, code, drivers) == did:
            groups.setdefault(code, []).append(row)
    out = [{"code": c, "name": names.get(c.lower(), ""), "rows": rs} for c, rs in groups.items()]
    out.sort(key=lambda g: (order.index(g["code"].lower()) if g["code"].lower() in order else 999, g["code"]))
    return data, out


def delivery_rec(r):
    try:
        photos = json.loads(r["photos"] or "[]")
    except ValueError:
        photos = []
    try:
        gps = json.loads(r["gps"]) if r["gps"] else None
    except ValueError:
        gps = None
    return {"status": r["status"], "note": r["note"] or "", "at": r["at"] or "", "driver": r["driver"] or "", "route": r["route"] or "",
            "name": r["name"] or "", "photos": photos, "gps": gps}


def deliveries_of(con, d):
    return {r["cust_key"]: delivery_rec(r) for r in con.execute("SELECT * FROM deliveries WHERE date=?", (d,))}


def clean_gps(v):
    """{lat, lng, acc} hợp lệ hoặc None."""
    if not isinstance(v, dict):
        return None
    try:
        lat, lng = float(v.get("lat")), float(v.get("lng"))
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180) or (lat == 0 and lng == 0):
        return None
    acc = v.get("acc")
    return {"lat": round(lat, 6), "lng": round(lng, 6), "acc": round(float(acc), 1) if isinstance(acc, (int, float)) else None}


def locations_all(con):
    return {r["cust_key"]: {"lat": r["lat"], "lng": r["lng"], "acc": r["acc"], "url": r["url"] or "", "name": r["name"] or "",
                            "driver": r["driver"] or "", "at": r["at"] or ""}
            for r in con.execute("SELECT * FROM cust_locations")}


MAPS_URL_RE = re.compile(r"^https?://(?:maps\.app\.goo\.gl|goo\.gl/maps|(?:www\.)?google\.[a-z.]+/maps|maps\.google\.[a-z.]+)[^\s\"'<>]*$", re.I)


def set_location(con, key, gps, name="", driver="", at=""):
    """Vị trí khách: tọa độ, hoặc link chia sẻ Google Maps (maps.app.goo.gl…) khi không có tọa độ."""
    g = clean_gps(gps)
    url = text((gps or {}).get("url"))
    if not g:
        if not (MAPS_URL_RE.match(url) and len(url) < 500):
            raise ApiError(400, "Vị trí không hợp lệ – dán link Google Maps hoặc tọa độ")
        g = {"lat": None, "lng": None, "acc": None}
    con.execute("INSERT OR REPLACE INTO cust_locations(cust_key, lat, lng, acc, name, driver, at, url) VALUES (?,?,?,?,?,?,?,?)",
                (key, g["lat"], g["lng"], g["acc"], name, driver, at or now_str(), "" if g["lat"] is not None else url))


PHOTO_RE = re.compile(r"^[A-Za-z0-9_.-]{1,120}\.jpg$")


def save_photo(d, key, data_url):
    """Ảnh JPEG (đã thu nhỏ ở điện thoại) gửi dạng data URL -> tên file trong data/anh-giao/."""
    m = re.match(r"^data:image/jpeg;base64,([A-Za-z0-9+/=\s]+)$", text(data_url))
    if not m:
        raise ApiError(400, "Ảnh không hợp lệ (cần ảnh JPEG)")
    raw = base64.b64decode(m.group(1))
    if not raw.startswith(b"\xff\xd8") or len(raw) > 4 * 1024 * 1024:
        raise ApiError(400, "Ảnh không hợp lệ hoặc quá lớn (tối đa 4 MB)")
    name = "%s-%s-%s.jpg" % (d.replace("-", ""), re.sub(r"[^A-Za-z0-9]+", "", key)[:30] or "kh", secrets.token_hex(5))
    os.makedirs(PHOTO_DIR, exist_ok=True)
    with open(os.path.join(PHOTO_DIR, name), "wb") as f:
        f.write(raw)
    return name


def photo_path(ref):
    ref = text(ref)
    full = os.path.join(PHOTO_DIR, ref)
    return full if PHOTO_RE.match(ref) and os.path.isfile(full) else None


def my_row(con, did, d, key):
    """(mã tuyến, dòng khách) nếu khách key thuộc tuyến của người giao did ngày d."""
    _, routes = my_routes(con, did, d)
    for g in routes:
        for r in g["rows"]:
            if cust_key(r) == key:
                return g["code"], r
    raise ApiError(403, "Khách này không thuộc tuyến của bạn ngày %s" % d)


def gh_api(con, method, action, q, body, token):
    if action == "login" and method == "POST":
        return gh_login(con, body)
    did, me = gh_auth(con, token)
    if action == "day" and method == "GET":
        d = valid_date(q.get("date") or date.today().isoformat())
        data, routes = my_routes(con, did, d)
        done = deliveries_of(con, d)
        keys = {cust_key(r) for g in routes for r in g["rows"]}
        locs = locations_all(con)
        return {"date": d, "driver": public_driver(did, me), "planned": data is not None,
                "cols": (data or {}).get("cols") or [], "routes": routes,
                "deliveries": {k: v for k, v in done.items() if k in keys},
                "locations": {k: v for k, v in locs.items() if k in keys}}
    if action == "days" and method == "GET":
        drivers = get_drivers(con)
        out = []
        for r in con.execute("SELECT DISTINCT date FROM docs WHERE wh='TP' AND kind='routing' ORDER BY date DESC LIMIT 45"):
            _, routes = my_routes(con, did, r["date"], drivers)
            if routes:
                done = deliveries_of(con, r["date"])
                keys = [cust_key(x) for g in routes for x in g["rows"]]
                out.append({"date": r["date"], "routes": [g["code"] for g in routes], "count": len(keys),
                            "done": sum(1 for k in keys if k in done and done[k]["status"] == "ok")})
        return out
    if action == "photo" and method == "POST":
        d = valid_date(body.get("date"))
        key = text(body.get("key"))
        my_row(con, did, d, key)
        return {"ref": save_photo(d, key, body.get("data"))}
    if action == "location" and method == "POST":
        d = valid_date(body.get("date"))
        key = text(body.get("key"))
        _, row = my_row(con, did, d, key)
        if body.get("clear"):
            con.execute("DELETE FROM cust_locations WHERE cust_key=?", (key,))
            write_log(con, "🚚 " + me.get("name", ""), "Xóa vị trí khách", key, "", "TP")
            return {"ok": True}
        set_location(con, key, body, text(row.get("name")) or text(row.get("cust")), did)
        write_log(con, "🚚 " + me.get("name", ""), "Lưu vị trí khách", key, text(body.get("url")) or "%s,%s" % (body.get("lat"), body.get("lng")), "TP")
        return {"ok": True, "location": locations_all(con).get(key)}
    if action == "deliver" and method == "POST":
        d = valid_date(body.get("date"))
        key, status = text(body.get("key")), text(body.get("status"))
        route, row = my_row(con, did, d, key)
        if status in ("ok", "fail"):
            photos = [text(x) for x in body.get("photos") or [] if photo_path(x)][:6]
            gps = clean_gps(body.get("gps"))
            con.execute("INSERT OR REPLACE INTO deliveries(date, cust_key, route, driver, status, note, at, name, photos, gps) "
                        "VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (d, key, route, did, status, text(body.get("note"))[:300], now_str(),
                         text(row.get("name")) or text(row.get("cust")), json.dumps(photos), json.dumps(gps) if gps else ""))
        elif status == "":
            con.execute("DELETE FROM deliveries WHERE date=? AND cust_key=?", (d, key))
        else:
            raise ApiError(400, "Trạng thái không hợp lệ")
        write_log(con, "🚚 " + me.get("name", ""), {"ok": "Đã giao", "fail": "Không giao được", "": "Bỏ đánh dấu giao"}[status],
                  "%s %s" % (key, d), text(body.get("note")), "TP")
        return {"ok": True}
    raise ApiError(404, "Không có API này")


# ---------------------------------------------------------------- tài khoản nhân viên web kho

STAFF_TOKEN_DAYS = 30


def get_staff(con):
    return {k: v for k, v in (get_settings(con).get("staff_accounts") or {}).items() if isinstance(v, dict)}


def public_staff(sid, a):
    return {"id": sid, "user": a.get("user", ""), "name": a.get("name", ""), "admin": bool(a.get("admin")),
            "active": a.get("active", True) is not False}


def _staff_sign(con, sid, a, exp):
    msg = "staff|%s|%s|%d" % (sid, a.get("pw", ""), exp)
    return hmac.new(_gh_secret(con).encode(), msg.encode(), hashlib.sha256).hexdigest()[:32]


def staff_auth(con, token):
    """(id, tài khoản) của token đăng nhập web kho, hoặc None."""
    try:
        sid, exp, sig = text(token).split(".")
        exp = int(exp)
    except ValueError:
        return None
    a = get_staff(con).get(sid)
    if not a or a.get("active", True) is False or exp < time.time() or not hmac.compare_digest(sig, _staff_sign(con, sid, a, exp)):
        return None
    return sid, a


def staff_api(con, method, action, body, token, who_fallback):
    accounts = get_staff(con)
    me = staff_auth(con, token)
    if action == "status" and method == "GET":
        return {"count": len(accounts), "me": public_staff(*me) if me else None}
    if action == "login" and method == "POST":
        user = norm_nick(body.get("user"))
        for sid, a in accounts.items():
            if norm_nick(a.get("user")) == user and a.get("active", True) is not False:
                if hmac.compare_digest(pin_hash(a.get("salt", ""), text(body.get("password"))), a.get("pw", "")):
                    exp = int(time.time()) + STAFF_TOKEN_DAYS * 86400
                    write_log(con, a.get("name", ""), "Đăng nhập", user)
                    return {"token": "%s.%d.%s" % (sid, exp, _staff_sign(con, sid, a, exp)), "account": public_staff(sid, a)}
                break
        time.sleep(0.5)
        raise ApiError(401, "Sai tên đăng nhập hoặc mật khẩu")
    if method == "GET" and not action:
        if accounts and not me:
            raise ApiError(401, "Hãy đăng nhập")
        return [public_staff(k, v) for k, v in accounts.items()]
    if action == "password" and method == "POST":
        if not me:
            raise ApiError(401, "Hãy đăng nhập")
        sid, a = me
        if not hmac.compare_digest(pin_hash(a.get("salt", ""), text(body.get("old"))), a.get("pw", "")):
            raise ApiError(400, "Mật khẩu cũ không đúng")
        pw = text(body.get("password"))
        if not 4 <= len(pw) <= 40:
            raise ApiError(400, "Mật khẩu 4–40 ký tự")
        a["salt"] = secrets.token_hex(8)
        a["pw"] = pin_hash(a["salt"], pw)
        accounts[sid] = a
        save_staff(con, accounts)
        write_log(con, a.get("name", ""), "Đổi mật khẩu", a.get("user", ""))
        exp = int(time.time()) + STAFF_TOKEN_DAYS * 86400
        return {"token": "%s.%d.%s" % (sid, exp, _staff_sign(con, sid, a, exp))}
    # tạo / sửa / xóa: người Quản lý; lần đầu (chưa có tài khoản nào) ai cũng tạo được tài khoản Quản lý đầu tiên
    if accounts and not (me and me[1].get("admin")):
        raise ApiError(403, "Chỉ tài khoản Quản lý mới tạo / sửa / xóa tài khoản")
    who = me[1].get("name", "") if me else who_fallback
    if method == "POST":
        sid = text(body.get("id")) or "s" + secrets.token_hex(4)
        user = norm_nick(body.get("user"))
        if not re.match(r"^[a-z0-9._-]{2,30}$", user):
            raise ApiError(400, "Tên đăng nhập 2–30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch")
        if any(norm_nick(a.get("user")) == user and k != sid for k, a in accounts.items()):
            raise ApiError(409, "Tên đăng nhập %s đã có người dùng" % user)
        old = accounts.get(sid) or {}
        rec = {"user": user, "name": text(body.get("name")) or user, "admin": bool(body.get("admin")) or not accounts,
               "active": body.get("active", True) is not False, "salt": old.get("salt", ""), "pw": old.get("pw", "")}
        pw = text(body.get("password"))
        if pw:
            if not 4 <= len(pw) <= 40:
                raise ApiError(400, "Mật khẩu 4–40 ký tự")
            rec["salt"] = secrets.token_hex(8)
            rec["pw"] = pin_hash(rec["salt"], pw)
        if not rec["pw"]:
            raise ApiError(400, "Cần đặt mật khẩu cho tài khoản mới")
        if me and sid == me[0] and (not rec["admin"] or not rec["active"]):
            raise ApiError(400, "Không tự bỏ quyền Quản lý hoặc tự khóa tài khoản đang đăng nhập")
        accounts[sid] = rec
        save_staff(con, accounts)
        write_log(con, who or rec["name"], "Lưu tài khoản nhân viên", user, "đổi mật khẩu" if pw and old else "")
        out = {"account": public_staff(sid, rec)}
        if not me and len(accounts) == 1:  # tài khoản đầu tiên: đăng nhập luôn
            exp = int(time.time()) + STAFF_TOKEN_DAYS * 86400
            out["token"] = "%s.%d.%s" % (sid, exp, _staff_sign(con, sid, rec, exp))
        return out
    if method == "DELETE" and action:
        if me and action == me[0]:
            raise ApiError(400, "Không tự xóa tài khoản đang đăng nhập")
        a = accounts.pop(action, None)
        save_staff(con, accounts)
        write_log(con, who, "Xóa tài khoản nhân viên", (a or {}).get("user", action))
        return {"ok": True}
    raise ApiError(404, "Không có API này")


def save_staff(con, accounts):
    con.execute("INSERT OR REPLACE INTO settings(key, value) VALUES ('staff_accounts', ?)", (json.dumps(accounts, ensure_ascii=False),))


# ---------------------------------------------------------------- HTTP

GH_PUBLIC = ("/giao-hang", "/giao-hang/", "/giao-hang.html", "/giao-hang.js", "/giao-hang.css")


class Handler(BaseHTTPRequestHandler):
    server_version = "AnTamKho/2.0"

    def log_message(self, fmt, *args):
        pass

    # --- tiện ích
    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_bytes(self, body, ctype, filename=None):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if filename:
            self.send_header("Content-Disposition", "attachment; filename*=UTF-8''%s" % filename)
        self.end_headers()
        self.wfile.write(body)

    def send_photo(self, ref):
        full = photo_path(ref)
        if not full:
            raise ApiError(404, "Không có ảnh này")
        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "private, max-age=86400")
        self.end_headers()
        self.wfile.write(body)
        return None

    def read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def read_json(self):
        raw = self.read_body()
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except ValueError:
            raise ApiError(400, "Dữ liệu gửi lên không hợp lệ")

    def who(self):
        return unquote(self.headers.get("X-User") or "")

    def authorized(self):
        if not PASSWORD:
            return True
        h = self.headers.get("Authorization") or ""
        if h.startswith("Basic "):
            try:
                _, pw = base64.b64decode(h[6:]).decode("utf-8").split(":", 1)
                return pw == PASSWORD
            except Exception:
                return False
        return False

    def deny(self):
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="Kho An Tam", charset="UTF-8"')
        self.send_header("Content-Length", "0")
        self.end_headers()

    # --- định tuyến
    def do_GET(self):
        self.dispatch("GET")

    def do_POST(self):
        self.dispatch("POST")

    def do_PUT(self):
        self.dispatch("PUT")

    def do_DELETE(self):
        self.dispatch("DELETE")

    def dispatch(self, method):
        url = urlparse(self.path)
        path = url.path
        # Web giao hàng có đăng nhập riêng (nick + mã PIN) nên không hỏi mật khẩu chung của web kho
        if not self.authorized() and not (path in GH_PUBLIC or path.startswith("/api/gh/")):
            return self.deny()
        q = {k: v[-1] for k, v in parse_qs(url.query).items()}
        try:
            if path.startswith("/api/"):
                return self.api(method, path[5:].strip("/").split("/"), q)
            if method != "GET":
                raise ApiError(405, "Method not allowed")
            return self.static(path)
        except ApiError as e:
            self.send_json({"error": e.message}, e.status)
        except Exception as e:  # pragma: no cover
            traceback.print_exc()
            self.send_json({"error": "Lỗi máy chủ: %s" % e}, 500)

    def static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        if path.rstrip("/") == "/giao-hang":
            path = "/giao-hang.html"
        full = os.path.normpath(os.path.join(STATIC_DIR, path.lstrip("/")))
        if not full.startswith(STATIC_DIR) or not os.path.isfile(full):
            full = os.path.join(STATIC_DIR, "index.html")
        with open(full, "rb") as f:
            body = f.read()
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript",):
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def api(self, method, parts, q):
        res = parts[0]
        arg = parts[1] if len(parts) > 1 else None
        wh = q.get("wh") or self.headers.get("X-Wh") or "TP"
        if wh not in WAREHOUSE_CODES:
            raise ApiError(400, "Kho không hợp lệ: %s" % wh)
        write = method != "GET"
        con = connect()
        try:
            if write:
                WRITE_LOCK.acquire()
            out = self.route(con, method, res, arg, q, wh)
            if write:
                con.commit()
        except Exception:
            con.rollback()
            raise
        finally:
            if write:
                WRITE_LOCK.release()
            con.close()
        if out is not None:
            self.send_json(out)

    def route(self, con, method, res, arg, q, wh):
        who = self.who()
        token = self.headers.get("X-Staff-Token") or q.get("st") or ""
        if res == "staff":
            body = self.read_json() if method == "POST" else {}
            return staff_api(con, method, arg, body, token, who)
        # đã có tài khoản nhân viên: mọi API web kho cần đăng nhập, tên người làm lấy từ tài khoản
        me = None
        if res != "gh" and get_staff(con):
            me = staff_auth(con, token)
            if not me:
                raise ApiError(401, "Hãy đăng nhập lại")
            who = me[1].get("name") or me[1].get("user", "")
        if res == "gh" and arg == "photo" and method == "GET":
            gh_auth(con, q.get("t") or self.headers.get("X-GH-Token") or "")
            return self.send_photo(q.get("ref"))
        if res == "photo" and method == "GET":
            return self.send_photo(q.get("ref"))
        if res == "gh":
            body = self.read_json() if method == "POST" else {}
            return gh_api(con, method, arg, q, body, self.headers.get("X-GH-Token") or "")
        if res == "meta" and method == "GET":
            s = get_settings(con)
            people, parties = set(s.get("staff") or []), set(s["warehouses"][wh].get("parties") or [])
            for r in con.execute("SELECT DISTINCT giver AS a, receiver AS b, from_party AS c, to_party AS d FROM vouchers WHERE wh=?", (wh,)):
                people.update(x.strip() for x in (r["a"], r["b"]) if x and x.strip())
                parties.update(x.strip() for x in (r["c"], r["d"]) if x and x.strip())
            for r in con.execute("SELECT DISTINCT proposer FROM plans WHERE wh=? AND proposer<>''", (wh,)):
                people.add(r[0].strip())
            drivers = s.pop("drivers", None) or {}
            s.pop("staff_accounts", None)
            return {
                "wh": wh,
                "settings": s,
                "drivers": [public_driver(k, v) for k, v in drivers.items()],
                "warehouse": s["warehouses"][wh],
                "products": rows(con.execute("SELECT * FROM products WHERE wh=? ORDER BY sort, code", (wh,))),
                "routes": rows(con.execute("SELECT * FROM routes ORDER BY sort, id")),
                "people": sorted(people, key=str.lower),
                "parties": sorted(parties, key=str.lower),
                "counts": {c: con.execute("SELECT COUNT(*) FROM vouchers WHERE wh=?", (c,)).fetchone()[0] for c in WAREHOUSE_CODES},
                "access": {"urls": ["http://%s:%d" % (ip, PORT) for ip in lan_addresses()], "password": bool(PASSWORD)},
            }
        if res == "settings" and method == "PUT":
            data = self.read_json()
            if "warehouses" in data:
                cur = get_settings(con)["warehouses"]
                for code, d in (data["warehouses"] or {}).items():
                    if code in cur and isinstance(d, dict):
                        cur[code].update({k: v for k, v in d.items() if k in ("name", "department", "parties")})
                data["warehouses"] = cur
            data.pop("drivers", None)  # tài khoản giao hàng sửa ở API /drivers
            data.pop("staff_accounts", None)  # tài khoản nhân viên sửa ở API /staff
            for k, v in data.items():
                if k in DEFAULT_SETTINGS:
                    con.execute("INSERT OR REPLACE INTO settings(key, value) VALUES (?,?)", (k, json.dumps(v, ensure_ascii=False)))
            write_log(con, who, "Sửa cài đặt", "", list(data.keys()))
            return {"ok": True}

        # ---- danh mục hàng (riêng từng kho)
        if res == "products":
            if method == "POST":
                d = self.read_json()
                code = text(d.get("code")).upper().replace(" ", "")
                if not code or not text(d.get("name")):
                    raise ApiError(400, "Cần nhập Mã hàng và Tên hàng")
                orig = text(d.get("original_code"))
                vals = (text(d.get("name")), text(d.get("unit")), text(d.get("grp")), num(d.get("price")),
                        text(d.get("supplier")), text(d.get("note")), num(d.get("opening_qty")),
                        None if text(d.get("min_qty")) == "" else num(d.get("min_qty")), 1 if d.get("active", True) else 0)
                exists = lambda c: con.execute("SELECT 1 FROM products WHERE wh=? AND code=?", (wh, c)).fetchone()
                if orig:
                    if orig != code and exists(code):
                        raise ApiError(409, "Mã %s đã tồn tại" % code)
                    con.execute("UPDATE products SET code=?, name=?, unit=?, grp=?, price=?, supplier=?, note=?, opening_qty=?, "
                                "min_qty=?, active=? WHERE wh=? AND code=?", (code,) + vals + (wh, orig))
                    if orig != code:
                        con.execute("UPDATE voucher_lines SET product_code=? WHERE product_code=? AND voucher_id IN "
                                    "(SELECT id FROM vouchers WHERE wh=?)", (code, orig, wh))
                        con.execute("UPDATE plans SET product_code=? WHERE product_code=? AND wh=?", (code, orig, wh))
                    write_log(con, who, "Sửa mặt hàng", code, "", wh)
                else:
                    if exists(code):
                        raise ApiError(409, "Mã %s đã tồn tại" % code)
                    sort = con.execute("SELECT COALESCE(MAX(sort),0)+1 FROM products WHERE wh=?", (wh,)).fetchone()[0]
                    con.execute("INSERT INTO products(code, name, unit, grp, price, supplier, note, opening_qty, min_qty, active, sort, wh) "
                                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (code,) + vals + (sort, wh))
                    write_log(con, who, "Thêm mặt hàng", code, "", wh)
                return {"ok": True, "code": code}
            if method == "DELETE" and arg:
                code = unquote(arg)
                used = con.execute("SELECT COUNT(*) FROM voucher_lines l JOIN vouchers v ON v.id=l.voucher_id "
                                   "WHERE v.wh=? AND l.product_code=?", (wh, code)).fetchone()[0]
                used += con.execute("SELECT COUNT(*) FROM plans WHERE wh=? AND product_code=?", (wh, code)).fetchone()[0]
                if used:
                    raise ApiError(409, "Mã %s đã có %d dòng trong sổ/kế hoạch – không xóa được (có thể bỏ chọn 'Đang dùng')" % (code, used))
                con.execute("DELETE FROM products WHERE wh=? AND code=?", (wh, code))
                write_log(con, who, "Xóa mặt hàng", code, "", wh)
                return {"ok": True}

        # ---- tuyến (dùng cho kho TP)
        if res == "routes":
            if method == "POST":
                d = self.read_json()
                name, code = text(d.get("name")), re.sub(r"\s+", "", text(d.get("code")))
                if not name or not code:
                    raise ApiError(400, "Cần nhập Tên tuyến và Mã tuyến")
                if d.get("id"):
                    con.execute("UPDATE routes SET name=?, code=?, note=? WHERE id=?", (name, code, text(d.get("note")), d["id"]))
                else:
                    sort = con.execute("SELECT COALESCE(MAX(sort),0)+1 FROM routes").fetchone()[0]
                    con.execute("INSERT INTO routes(name, code, note, sort) VALUES (?,?,?,?)", (name, code, text(d.get("note")), sort))
                write_log(con, who, "Lưu tuyến", name)
                return {"ok": True}
            if method == "DELETE" and arg:
                con.execute("DELETE FROM routes WHERE id=?", (int(arg),))
                write_log(con, who, "Xóa tuyến", arg)
                return {"ok": True}

        # ---- tài khoản web giao hàng + kết quả giao
        if res == "drivers":
            if method == "GET":
                return [public_driver(k, v) for k, v in get_drivers(con).items()]
            if method == "POST":
                return save_driver(con, self.read_json(), who)
            if method == "DELETE" and arg:
                drivers = get_drivers(con)
                d = drivers.pop(arg, None)
                save_drivers(con, drivers)
                write_log(con, who, "Xóa tài khoản giao hàng", (d or {}).get("nick", arg), "", "TP")
                return {"ok": True}
        if res == "deliveries" and method == "GET":
            return deliveries_of(con, valid_date(q.get("date")))
        if res == "locations" and method == "GET":
            return locations_all(con)

        # ---- phiếu
        if res == "next-number" and method == "GET":
            vtype = q.get("type", "N")
            if vtype not in TYPE_PREFIX:
                raise ApiError(400, "Loại phiếu không hợp lệ")
            return {"no": next_number(con, wh, vtype, valid_date(q.get("date")), q.get("route_code", ""),
                                      exclude_id=int(q["exclude"]) if q.get("exclude") else None)}
        if res == "vouchers":
            if method == "GET" and arg == "full":
                if q.get("ids"):
                    ids = [int(x) for x in q["ids"].split(",") if x.strip().isdigit()]
                else:
                    cond, params = ["wh = ?", "date = ?"], [wh, valid_date(q.get("date"))]
                    if q.get("type") in TYPE_PREFIX:
                        cond.append("type = ?")
                        params.append(q["type"])
                    ids = [r[0] for r in con.execute("SELECT id FROM vouchers WHERE %s ORDER BY type, no" % " AND ".join(cond), params)]
                return [voucher_full(con, i) for i in ids]
            if method == "GET" and arg:
                return voucher_full(con, int(arg))
            if method == "GET":
                cond, params = _date_range(q)
                cond.insert(0, "v.wh = ?")
                params.insert(0, wh)
                if q.get("type") in TYPE_PREFIX:
                    cond.append("v.type = ?")
                    params.append(q["type"])
                if q.get("status") in ("pending", "rejected"):
                    cond = ["v.wh = ?", "v.status = ?"]  # việc cần duyệt: mọi ngày
                    params = [wh, q["status"]]
                if q.get("q"):
                    like = "%" + q["q"].strip() + "%"
                    cond.append("(v.no LIKE ? OR v.reason LIKE ? OR v.route LIKE ? OR v.giver LIKE ? OR v.receiver LIKE ? "
                                "OR v.to_party LIKE ? OR EXISTS (SELECT 1 FROM voucher_lines l2 LEFT JOIN products p2 "
                                "ON p2.code=l2.product_code AND p2.wh=v.wh "
                                "WHERE l2.voucher_id=v.id AND (l2.product_code LIKE ? OR p2.name LIKE ? OR l2.note LIKE ?)))")
                    params += [like] * 9
                sql = ("SELECT v.*, COUNT(l.id) AS line_count, SUM(l.qty) AS total_qty, SUM(l.qty*l.price) AS total_amount "
                       "FROM vouchers v LEFT JOIN voucher_lines l ON l.voucher_id = v.id WHERE %s "
                       "GROUP BY v.id ORDER BY v.date DESC, v.type, v.no DESC LIMIT %d" % (" AND ".join(cond), int(q.get("limit") or 1000)))
                return rows(con.execute(sql, params))
            if method == "POST":
                return voucher_full(con, save_voucher(con, wh, self.read_json(), who=who, me=me))
            if method == "PUT" and arg:
                return voucher_full(con, save_voucher(con, wh, self.read_json(), vid=int(arg), who=who, me=me))
            if method == "DELETE" and arg:
                v = voucher_full(con, int(arg))
                if v["type"] == "D" and not v.get("status") and me and not me[1].get("admin"):
                    raise ApiError(403, "Phiếu điều chỉnh %s đã được duyệt – chỉ Quản lý sửa / xóa được" % v["no"])
                con.execute("DELETE FROM vouchers WHERE id=?", (int(arg),))
                write_log(con, who, "Xóa phiếu", v["no"], _summary(v), v["wh"])
                return {"ok": True}

        if res == "review" and method == "POST" and arg:
            body = self.read_json()
            return review_voucher(con, int(arg), bool(body.get("ok")), body.get("note"), me, who)
        if res == "pending" and method == "GET":
            n = lambda s: con.execute("SELECT COUNT(*) FROM vouchers WHERE wh=? AND status=?", (wh, s)).fetchone()[0]
            return {"count": n("pending"), "rejected": n("rejected")}

        # ---- sổ nhập xuất (từng dòng)
        if res == "lines" and method == "GET":
            cond, params = _date_range(q)
            cond.insert(0, POSTED_SQL)
            cond.insert(0, "v.wh = ?")
            params.insert(0, wh)
            if q.get("code"):
                cond.append("l.product_code = ?")
                params.append(q["code"])
            if q.get("type") in TYPE_PREFIX:
                cond.append("v.type = ?")
                params.append(q["type"])
            sql = ("SELECT v.id AS voucher_id, v.no, v.date, v.type, v.from_party, v.to_party, v.giver, v.receiver, v.reason, "
                   "l.product_code, p.name, p.unit, l.qty, l.price, l.note FROM voucher_lines l "
                   "JOIN vouchers v ON v.id = l.voucher_id LEFT JOIN products p ON p.code = l.product_code AND p.wh = v.wh "
                   "WHERE %s ORDER BY v.date DESC, v.id DESC, l.line_no LIMIT 5000" % " AND ".join(cond))
            return rows(con.execute(sql, params))

        # ---- báo cáo
        if res == "report":
            if arg == "nxt":
                return report_nxt(con, wh, valid_date(q.get("from"), "Từ ngày"), valid_date(q.get("to"), "Đến ngày"))
            if arg == "stock":
                return stock_map(con, wh, until_date=valid_date(q.get("date")) if q.get("date") else None,
                                 exclude_voucher=int(q["exclude"]) if q.get("exclude", "").isdigit() else None)
            if arg == "card":
                return stock_card(con, wh, q.get("code", ""), valid_date(q.get("from"), "Từ ngày"), valid_date(q.get("to"), "Đến ngày"))

        # ---- kế hoạch mua hàng (KH Ngày; tuần/tháng tổng hợp ở giao diện)
        if res == "plans":
            if method == "GET":
                cond, params = ["pl.wh = ?"], [wh]
                if q.get("from"):
                    cond.append("pl.date >= ?")
                    params.append(q["from"])
                if q.get("to"):
                    cond.append("pl.date <= ?")
                    params.append(q["to"])
                return rows(con.execute(
                    "SELECT pl.*, p.name, p.unit, p.grp, p.supplier FROM plans pl LEFT JOIN products p ON p.wh=pl.wh AND p.code=pl.product_code "
                    "WHERE %s ORDER BY pl.date DESC, pl.id DESC" % " AND ".join(cond), params))
            if method == "POST":
                d = self.read_json()
                code = text(d.get("product_code"))
                if not con.execute("SELECT 1 FROM products WHERE wh=? AND code=?", (wh, code)).fetchone():
                    raise ApiError(400, "Chưa chọn mặt hàng (hoặc mã không có trong danh mục kho này)")
                vals = (valid_date(d.get("date"), "Ngày đặt"), text(d.get("dept")), code, num(d.get("qty")), num(d.get("price")),
                        valid_date(d.get("need_date"), "Ngày cần hàng") if text(d.get("need_date")) else "",
                        text(d.get("proposer")), text(d.get("note")))
                ts = now_str()
                if d.get("id"):
                    con.execute("UPDATE plans SET date=?, dept=?, product_code=?, qty=?, price=?, need_date=?, proposer=?, note=?, "
                                "updated_at=? WHERE id=? AND wh=?", vals + (ts, int(d["id"]), wh))
                    write_log(con, who, "Sửa kế hoạch mua", "%s x %s" % (code, _fmt(vals[3])), "", wh)
                else:
                    con.execute("INSERT INTO plans(date, dept, product_code, qty, price, need_date, proposer, note, created_at, updated_at, wh) "
                                "VALUES (?,?,?,?,?,?,?,?,?,?,?)", vals + (ts, ts, wh))
                    write_log(con, who, "Thêm kế hoạch mua", "%s x %s" % (code, _fmt(vals[3])), "", wh)
                return {"ok": True}
            if method == "DELETE" and arg:
                con.execute("DELETE FROM plans WHERE id=? AND wh=?", (int(arg), wh))
                write_log(con, who, "Xóa kế hoạch mua", arg, "", wh)
                return {"ok": True}

        # ---- biên bản / sổ phụ (kiểm kê, bàn giao, kebab, kê đơn tuyến)
        if res == "docs":
            if method == "GET" and arg:
                d = con.execute("SELECT * FROM docs WHERE id=?", (int(arg),)).fetchone()
                if not d:
                    raise ApiError(404, "Không tìm thấy")
                d = dict(d)
                d["data"] = json.loads(d["data"] or "{}")
                return d
            if method == "GET":
                return rows(con.execute("SELECT id, wh, kind, date, title, created_at, updated_at FROM docs WHERE wh=? AND kind=? "
                                        "ORDER BY date DESC, id DESC LIMIT 500", (wh, q.get("kind", ""))))
            if method in ("POST", "PUT"):
                d = self.read_json()
                kind = text(d.get("kind"))
                if kind not in ("stocktake", "handover", "kebab", "routeorders", "routing"):
                    raise ApiError(400, "Loại biên bản không hợp lệ")
                ddate = valid_date(d.get("date"))
                payload = json.dumps(d.get("data") or {}, ensure_ascii=False)
                ts = now_str()
                if method == "PUT" and arg:
                    con.execute("UPDATE docs SET date=?, title=?, data=?, updated_at=? WHERE id=?",
                                (ddate, text(d.get("title")), payload, ts, int(arg)))
                    did = int(arg)
                    write_log(con, who, "Sửa biên bản", "%s %s" % (kind, ddate), "", wh)
                else:
                    did = con.execute("INSERT INTO docs(wh, kind, date, title, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                                      (wh, kind, ddate, text(d.get("title")), payload, ts, ts)).lastrowid
                    write_log(con, who, "Lưu biên bản", "%s %s" % (kind, ddate), "", wh)
                return {"ok": True, "id": did}
            if method == "DELETE" and arg:
                con.execute("DELETE FROM docs WHERE id=?", (int(arg),))
                write_log(con, who, "Xóa biên bản", arg, "", wh)
                return {"ok": True}

        if res == "log" and method == "GET":
            return rows(con.execute("SELECT * FROM log ORDER BY id DESC LIMIT 500"))

        if res == "import-backup" and method == "POST":
            return import_backup_json(con, self.read_json(), who)

        # ---- đọc 1 sheet của file Excel (dùng cho Phân tuyến: danh sách khách theo ngày)
        if res == "sheet-rows" and method == "POST":
            blob = self.read_body()
            if not blob:
                raise ApiError(400, "Chưa chọn file")
            try:
                names = xlsx_import.sheet_names(blob)
                name = q.get("sheet") if q.get("sheet") in names else (names[-1] if names else None)
                sh = xlsx_import.read_workbook(blob, only=name).get(name) if name else None
            except xlsx_import.XlsxError as e:
                raise ApiError(400, str(e))
            return {"sheets": names, "sheet": name, "rows": xlsx_import.sheet_rows(sh) if sh else []}

        if res == "import" and method == "POST":
            blob = self.read_body()
            if not blob:
                raise ApiError(400, "Chưa chọn file")
            opts = {k: q.get(k, "1") == "1" for k in ("products", "routes", "ledger", "replace_ledger", "plans")}
            opts["force"] = q.get("force") == "1"
            try:
                return import_excel(con, wh, blob, opts, who)
            except xlsx_import.XlsxError as e:
                raise ApiError(400, str(e))

        if res == "export" and method == "GET":
            if arg == "backup.json":
                body = json.dumps(export_backup_json(con), ensure_ascii=False).encode("utf-8")
                self.send_bytes(body, "application/json", "kho-antam-du-lieu-%s.json" % date.today().strftime("%Y%m%d"))
                return None
            if arg == "lines.csv":
                buf = io.StringIO()
                w = csv.writer(buf)
                w.writerow(["Số phiếu", "Ngày", "Loại", "Bên giao", "Bên nhận", "Mã hàng", "Tên hàng", "Ghi chú", "ĐVT",
                            "Số lượng", "Đơn giá", "Thành tiền", "Lý do / Diễn giải", "Người giao", "Người nhận"])
                cond, params = _date_range(q)
                cond.insert(0, POSTED_SQL)
                cond.insert(0, "v.wh = ?")
                params.insert(0, wh)
                for r in con.execute("SELECT v.*, l.product_code, p.name, p.unit, l.qty, l.price, l.note AS lnote FROM voucher_lines l "
                                     "JOIN vouchers v ON v.id=l.voucher_id LEFT JOIN products p ON p.code=l.product_code AND p.wh=v.wh "
                                     "WHERE %s ORDER BY v.date, v.id, l.line_no" % " AND ".join(cond), params):
                    d = datetime.strptime(r["date"], "%Y-%m-%d").strftime("%d/%m/%Y")
                    w.writerow([r["no"], d, TYPE_LABEL[r["type"]], r["from_party"], r["to_party"], r["product_code"], r["name"],
                                r["lnote"], r["unit"], _fmt(r["qty"]), _fmt(r["price"]), _fmt((r["qty"] or 0) * (r["price"] or 0)),
                                r["reason"], r["giver"], r["receiver"]])
                body = ("﻿" + buf.getvalue()).encode("utf-8")
                self.send_bytes(body, "text/csv; charset=utf-8", "so-nhap-xuat-%s.csv" % wh.lower())
                return None
            if arg == "backup":
                con.execute("PRAGMA wal_checkpoint(FULL)")
                tmp = DB_PATH + ".backup"
                bk = sqlite3.connect(tmp)
                con.backup(bk)
                bk.close()
                with open(tmp, "rb") as f:
                    body = f.read()
                os.remove(tmp)
                self.send_bytes(body, "application/octet-stream", "kho-antam-%s.db" % date.today().strftime("%Y%m%d"))
                return None

        raise ApiError(404, "Không có API này")


def main():
    init_db()
    host = os.environ.get("HOST", "0.0.0.0")
    port = PORT
    httpd = ThreadingHTTPServer((host, port), Handler)
    print("Web kho nội bộ đang chạy: http://localhost:%d  (dữ liệu: %s)" % (port, DB_PATH))
    if host == "0.0.0.0":
        for ip in lan_addresses() or ["<địa-chỉ-IP-máy-này>"]:
            print("Nhân viên (cùng wifi/mạng công ty) mở: http://%s:%d" % (ip, port))
    print("Mật khẩu: %s" % ("ĐANG BẬT (file mat-khau.txt)" if PASSWORD else "chưa đặt – ai cùng mạng cũng vào được"))
    print("Bấm Ctrl+C để dừng.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
