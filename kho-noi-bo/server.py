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
import io
import json
import mimetypes
import os
import re
import sqlite3
import threading
import traceback
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import xlsx_import

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DB_PATH = os.environ.get("ANTAM_DB", os.path.join(BASE_DIR, "data", "kho.db"))
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
  created_at TEXT, updated_at TEXT
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
    cond, params = ["v.wh = ?"], [wh]
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
           "WHERE v.wh = ? AND v.date >= ? AND v.date <= ? GROUP BY l.product_code, v.type")
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
           "WHERE v.wh = ? AND l.product_code = ? AND v.date >= ? AND v.date <= ? ORDER BY v.date, v.id, l.line_no")
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


def save_voucher(con, wh, data, vid=None, who=""):
    vtype = text(data.get("type"))
    if vtype not in TYPE_PREFIX:
        raise ApiError(400, "Loại phiếu không hợp lệ")
    if vid:
        old_wh = con.execute("SELECT wh FROM vouchers WHERE id=?", (vid,)).fetchone()
        if not old_wh:
            raise ApiError(404, "Không tìm thấy phiếu")
        wh = old_wh["wh"]  # phiếu luôn giữ kho ban đầu
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
            f["bill_count"], f["doc_ref"], f["note"])
    if vid:
        old = voucher_full(con, vid)
        con.execute("UPDATE vouchers SET no=?, type=?, date=?, route=?, from_party=?, to_party=?, giver=?, receiver=?, "
                    "reason=?, bill_count=?, doc_ref=?, note=?, updated_at=? WHERE id=?", vals + (ts, vid))
        con.execute("DELETE FROM voucher_lines WHERE voucher_id = ?", (vid,))
        write_log(con, who, "Sửa phiếu", no, {"trước": _summary(old), "sau": _summary_lines(clean)}, wh)
    else:
        cur = con.execute("INSERT INTO vouchers(wh, no, type, date, route, from_party, to_party, giver, receiver, reason, "
                          "bill_count, doc_ref, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          (wh,) + vals + (ts, ts))
        vid = cur.lastrowid
        write_log(con, who, "Lập phiếu", no, _summary_lines(clean), wh)
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
           "warehouses": {}}
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
                                              "bill_count", "doc_ref", "note", "created_at", "updated_at")}
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
    for t in ("voucher_lines", "vouchers", "products", "routes", "docs", "plans"):
        con.execute("DELETE FROM %s" % t)
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
                              "doc_ref, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                              (wh,) + tuple(text(v.get(k)) for k in ("no", "type", "date", "route", "from_party", "to_party", "giver",
                                                                     "receiver", "reason", "bill_count", "doc_ref", "note", "created_at", "updated_at")))
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


# ---------------------------------------------------------------- HTTP

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
        if not self.authorized():
            return self.deny()
        url = urlparse(self.path)
        path = url.path
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
        if res == "meta" and method == "GET":
            s = get_settings(con)
            people, parties = set(s.get("staff") or []), set(s["warehouses"][wh].get("parties") or [])
            for r in con.execute("SELECT DISTINCT giver AS a, receiver AS b, from_party AS c, to_party AS d FROM vouchers WHERE wh=?", (wh,)):
                people.update(x.strip() for x in (r["a"], r["b"]) if x and x.strip())
                parties.update(x.strip() for x in (r["c"], r["d"]) if x and x.strip())
            for r in con.execute("SELECT DISTINCT proposer FROM plans WHERE wh=? AND proposer<>''", (wh,)):
                people.add(r[0].strip())
            return {
                "wh": wh,
                "settings": s,
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
                return voucher_full(con, save_voucher(con, wh, self.read_json(), who=who))
            if method == "PUT" and arg:
                return voucher_full(con, save_voucher(con, wh, self.read_json(), vid=int(arg), who=who))
            if method == "DELETE" and arg:
                v = voucher_full(con, int(arg))
                con.execute("DELETE FROM vouchers WHERE id=?", (int(arg),))
                write_log(con, who, "Xóa phiếu", v["no"], _summary(v), v["wh"])
                return {"ok": True}

        # ---- sổ nhập xuất (từng dòng)
        if res == "lines" and method == "GET":
            cond, params = _date_range(q)
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
                if kind not in ("stocktake", "handover", "kebab", "routeorders"):
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
