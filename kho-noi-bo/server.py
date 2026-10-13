#!/usr/bin/env python3
"""Web làm việc nội bộ – Kho Thành phẩm & Hàng hóa (Ẩm Thực An Tâm).

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
PASSWORD = os.environ.get("ANTAM_PASSWORD", "")
WRITE_LOCK = threading.Lock()

TYPE_PREFIX = {"N": "PNK", "X": "PXK", "D": "DCK"}
TYPE_LABEL = {"N": "Nhập", "X": "Xuất", "D": "Điều chỉnh"}
# Ảnh hưởng đến tồn kho: nhập cộng, xuất trừ, điều chỉnh cộng theo dấu số lượng
SIGN_SQL = "CASE v.type WHEN 'X' THEN -1 ELSE 1 END"

DEFAULT_SETTINGS = {
    "company": "Công Ty TNHH SX- TM Ẩm Thực An Tâm",
    "department": "Kho Thành phẩm & Hàng hóa – An Tâm",
    "warehouse": "Kho Thành phẩm & Hàng hóa",
    "parties": ["Kho tổng", "Xưởng", "Văn phòng", "Nhà cung cấp", "Đóng đơn- giao hàng", "Khách trả hàng"],
    "groups": ["Thành phẩm", "Bán thành phẩm", "Hàng hóa", "Nguyên liệu", "Vật liệu - Bao bì", "Công cụ dụng cụ"],
    "units": ["Cái", "Túi", "Kg", "Cây", "Thùng", "Hộp", "Gói", "Lít"],
    "staff": [],
    "stocktake_threshold": 0.01,
    "kebab_sizes": [50, 45, 40, 35, 30, 25, 20, 15, 10, 5],
    "paper": "A4",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS products (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT DEFAULT '', grp TEXT DEFAULT '',
  price REAL DEFAULT 0, supplier TEXT DEFAULT '', note TEXT DEFAULT '',
  opening_qty REAL DEFAULT 0, min_qty REAL, active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT NOT NULL, note TEXT DEFAULT '', sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, no TEXT NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL,
  route TEXT DEFAULT '', from_party TEXT DEFAULT '', to_party TEXT DEFAULT '',
  giver TEXT DEFAULT '', receiver TEXT DEFAULT '', reason TEXT DEFAULT '',
  bill_count TEXT DEFAULT '', doc_ref TEXT DEFAULT '', note TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_vouchers_date ON vouchers(date);
CREATE TABLE IF NOT EXISTS voucher_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  line_no INTEGER, product_code TEXT NOT NULL, qty REAL DEFAULT 0, price REAL DEFAULT 0, note TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_lines_voucher ON voucher_lines(voucher_id);
CREATE INDEX IF NOT EXISTS ix_lines_product ON voucher_lines(product_code);
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, date TEXT, title TEXT DEFAULT '',
  data TEXT, created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_docs_kind ON docs(kind, date);
CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, who TEXT, action TEXT, target TEXT, detail TEXT
);
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


def init_db():
    con = connect()
    con.execute("PRAGMA journal_mode = WAL")
    con.executescript(SCHEMA)
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
    s = dict(DEFAULT_SETTINGS)
    for r in con.execute("SELECT key, value FROM settings"):
        try:
            s[r["key"]] = json.loads(r["value"])
        except ValueError:
            pass
    return s


def write_log(con, who, action, target, detail=""):
    if not isinstance(detail, str):
        detail = json.dumps(detail, ensure_ascii=False)
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


def next_number(con, vtype, d, route_code="", exclude_id=None):
    prefix = TYPE_PREFIX[vtype]
    dt = datetime.strptime(d, "%Y-%m-%d")
    ddmm = dt.strftime("%d%m")
    seq = 0
    for r in con.execute("SELECT id, no FROM vouchers WHERE type=? AND substr(date,1,4)=?", (vtype, d[:4])):
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

def stock_map(con, until_date=None, before_date=None, exclude_voucher=None):
    """Tồn sổ sách theo mã: số dư ban đầu + phát sinh (đến hết until_date hoặc trước before_date)."""
    cond, params = [], []
    if until_date:
        cond.append("v.date <= ?")
        params.append(until_date)
    if before_date:
        cond.append("v.date < ?")
        params.append(before_date)
    if exclude_voucher:
        cond.append("v.id <> ?")
        params.append(exclude_voucher)
    where = ("WHERE " + " AND ".join(cond)) if cond else ""
    res = {r["code"]: r["opening_qty"] or 0 for r in con.execute("SELECT code, opening_qty FROM products")}
    sql = ("SELECT l.product_code AS code, SUM(%s * l.qty) AS q FROM voucher_lines l "
           "JOIN vouchers v ON v.id = l.voucher_id %s GROUP BY l.product_code" % (SIGN_SQL, where))
    for r in con.execute(sql, params):
        res[r["code"]] = res.get(r["code"], 0) + (r["q"] or 0)
    return res


def report_nxt(con, d_from, d_to):
    opening = stock_map(con, before_date=d_from)
    per = {}
    sql = ("SELECT l.product_code AS code, v.type AS type, SUM(l.qty) AS q, COUNT(*) AS n "
           "FROM voucher_lines l JOIN vouchers v ON v.id = l.voucher_id "
           "WHERE v.date >= ? AND v.date <= ? GROUP BY l.product_code, v.type")
    for r in con.execute(sql, (d_from, d_to)):
        p = per.setdefault(r["code"], {"N": 0, "X": 0, "D": 0, "n": 0})
        p[r["type"]] = r["q"] or 0
        p["n"] += r["n"]
    out = []
    products = rows(con.execute("SELECT * FROM products ORDER BY sort, code"))
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


def stock_card(con, code, d_from, d_to):
    opening = stock_map(con, before_date=d_from).get(code, 0)
    sql = ("SELECT v.id AS voucher_id, v.no, v.date, v.type, v.from_party, v.to_party, v.reason, "
           "l.qty, l.note FROM voucher_lines l JOIN vouchers v ON v.id = l.voucher_id "
           "WHERE l.product_code = ? AND v.date >= ? AND v.date <= ? ORDER BY v.date, v.id, l.line_no")
    lines = rows(con.execute(sql, (code, d_from, d_to)))
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
        "SELECT l.*, p.name, p.unit FROM voucher_lines l LEFT JOIN products p ON p.code = l.product_code "
        "WHERE l.voucher_id = ? ORDER BY l.line_no, l.id", (vid,)))
    if v["type"] == "D":
        # tồn sổ sách trước khi điều chỉnh (đến hết ngày phiếu, không tính chính phiếu này)
        book = stock_map(con, until_date=v["date"], exclude_voucher=vid)
        for ln in v["lines"]:
            ln["book_qty"] = book.get(ln["product_code"], 0)
    return v


def save_voucher(con, data, vid=None, who=""):
    vtype = text(data.get("type"))
    if vtype not in TYPE_PREFIX:
        raise ApiError(400, "Loại phiếu không hợp lệ")
    d = valid_date(data.get("date"))
    lines = data.get("lines") or []
    clean = []
    for i, ln in enumerate(lines):
        code = text(ln.get("product_code"))
        if not code:
            continue
        if not con.execute("SELECT 1 FROM products WHERE code = ?", (code,)).fetchone():
            raise ApiError(400, "Dòng %d: mã hàng %s chưa có trong danh mục" % (i + 1, code))
        qty = num(ln.get("qty"))
        if vtype != "D" and qty < 0:
            raise ApiError(400, "Dòng %d: số lượng không được âm (dùng phiếu điều chỉnh)" % (i + 1))
        clean.append((code, qty, num(ln.get("price")), text(ln.get("note"))))
    if not clean:
        raise ApiError(400, "Phiếu chưa có mặt hàng nào")
    no = text(data.get("no")) or next_number(con, vtype, d, data.get("route_code"), exclude_id=vid)
    dup = con.execute("SELECT id FROM vouchers WHERE no = ? AND substr(date,1,4) = ? AND id <> ?",
                      (no, d[:4], vid or 0)).fetchone()
    if dup:
        raise ApiError(409, "Số phiếu %s đã tồn tại – hãy bấm 'Cấp số mới' hoặc sửa số" % no)
    fields = {k: text(data.get(k)) for k in
              ("route", "from_party", "to_party", "giver", "receiver", "reason", "bill_count", "doc_ref", "note")}
    ts = now_str()
    if vid:
        old = voucher_full(con, vid)
        con.execute("UPDATE vouchers SET no=?, type=?, date=?, route=?, from_party=?, to_party=?, giver=?, receiver=?, "
                    "reason=?, bill_count=?, doc_ref=?, note=?, updated_at=? WHERE id=?",
                    (no, vtype, d, fields["route"], fields["from_party"], fields["to_party"], fields["giver"],
                     fields["receiver"], fields["reason"], fields["bill_count"], fields["doc_ref"], fields["note"],
                     ts, vid))
        con.execute("DELETE FROM voucher_lines WHERE voucher_id = ?", (vid,))
        write_log(con, who, "Sửa phiếu", no, {"trước": _summary(old), "sau": _summary_lines(clean)})
    else:
        cur = con.execute("INSERT INTO vouchers(no, type, date, route, from_party, to_party, giver, receiver, reason, "
                          "bill_count, doc_ref, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          (no, vtype, d, fields["route"], fields["from_party"], fields["to_party"], fields["giver"],
                           fields["receiver"], fields["reason"], fields["bill_count"], fields["doc_ref"],
                           fields["note"], ts, ts))
        vid = cur.lastrowid
        write_log(con, who, "Lập phiếu", no, _summary_lines(clean))
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

def import_excel(con, blob, opts, who=""):
    wb = xlsx_import.read_workbook(blob)
    summary = {}
    names = {n.strip().lower(): n for n in wb}

    def sheet(*cands):
        for c in cands:
            if c.lower() in names:
                return wb[names[c.lower()]]
        return None

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
            if con.execute("SELECT 1 FROM products WHERE code=?", (code,)).fetchone():
                con.execute("UPDATE products SET name=?, unit=?, grp=?, price=?, supplier=?, note=?, opening_qty=?, "
                            "min_qty=?, sort=? WHERE code=?", vals + (code,))
            else:
                con.execute("INSERT INTO products(name, unit, grp, price, supplier, note, opening_qty, min_qty, sort, code) "
                            "VALUES (?,?,?,?,?,?,?,?,?,?)", vals + (code,))
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
            con.execute("DELETE FROM voucher_lines")
            con.execute("DELETE FROM vouchers")
        groups, order = {}, []
        skipped = 0
        for r in range(5, 100000):
            no = text(ledger.get("A%d" % r))
            item = text(ledger.get("F%d" % r))
            if not no and not item:
                if r > ledger.max_row:
                    break
                continue
            code = text(ledger.get("G%d" % r))
            if (not code or code == "Không có mã") and item:
                code = item.split("|")[0].strip()
            d = ledger.get("B%d" % r)
            if not no or not code or not isinstance(d, date):
                skipped += 1
                continue
            ds = d.strftime("%Y-%m-%d")
            ctype = text(ledger.get("C%d" % r))
            vtype = {"Nhập": "N", "Xuất": "X", "Điều chỉnh": "D"}.get(ctype)
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
                val = text(ledger.get("%s%d" % (col, r)))
                if val and not g["hdr"].get(f):
                    g["hdr"][f] = val
            if not con.execute("SELECT 1 FROM products WHERE code=?", (code,)).fetchone():
                con.execute("INSERT INTO products(code, name, unit) VALUES (?,?,?)",
                            (code, text(ledger.get("H%d" % r)) or item or code, text(ledger.get("J%d" % r))))
            g["lines"].append((code, _safe_num(ledger.get("K%d" % r)), _safe_num(ledger.get("L%d" % r)),
                               text(ledger.get("I%d" % r))))
        ts = now_str()
        for key in order:
            no, ds, vtype = key
            g = groups[key]
            h = g["hdr"]
            route = ""
            if vtype == "X":
                m = re.match(r"PXK-\d{4}-\d+-(.+)$", no.replace(" ", ""), re.I)
                if m:
                    rr = con.execute("SELECT name FROM routes WHERE replace(code,' ','') = ?", (m.group(1),)).fetchone()
                    route = rr["name"] if rr else ""
            cur = con.execute("INSERT INTO vouchers(no, type, date, route, from_party, to_party, giver, receiver, reason, "
                              "created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                              (no, vtype, ds, route, h.get("from_party", ""), h.get("to_party", ""), h.get("giver", ""),
                               h.get("receiver", ""), h.get("reason", ""), ts, ts))
            con.executemany("INSERT INTO voucher_lines(voucher_id, line_no, product_code, qty, price, note) VALUES (?,?,?,?,?,?)",
                            [(cur.lastrowid, i + 1) + ln for i, ln in enumerate(g["lines"])])
        summary["Phiếu"] = len(order)
        summary["Dòng hàng"] = sum(len(g["lines"]) for g in groups.values())
        if skipped:
            summary["Dòng bỏ qua (thiếu số phiếu/ngày/mã)"] = skipped
    if not summary:
        raise ApiError(400, "Không tìm thấy sheet phù hợp (Danh mục hàng, Danh mục tuyến, Sổ Nhập Xuất)")
    write_log(con, who, "Nhập Excel", "", summary)
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


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    server_version = "AnTamKho/1.0"

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
        write = method != "GET"
        con = connect()
        try:
            if write:
                WRITE_LOCK.acquire()
            out = self.route(con, method, res, arg, q)
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

    def route(self, con, method, res, arg, q):
        who = self.who()
        if res == "meta" and method == "GET":
            people = set()
            parties = set()
            for r in con.execute("SELECT DISTINCT giver AS a, receiver AS b, from_party AS c, to_party AS d FROM vouchers"):
                people.update(x.strip() for x in (r["a"], r["b"]) if x and x.strip())
                parties.update(x.strip() for x in (r["c"], r["d"]) if x and x.strip())
            s = get_settings(con)
            people.update(s.get("staff") or [])
            parties.update(s.get("parties") or [])
            return {
                "settings": s,
                "products": rows(con.execute("SELECT * FROM products ORDER BY sort, code")),
                "routes": rows(con.execute("SELECT * FROM routes ORDER BY sort, id")),
                "people": sorted(people, key=str.lower),
                "parties": sorted(parties, key=str.lower),
                "counts": {"vouchers": con.execute("SELECT COUNT(*) FROM vouchers").fetchone()[0]},
            }
        if res == "settings" and method == "PUT":
            data = self.read_json()
            for k, v in data.items():
                if k in DEFAULT_SETTINGS:
                    con.execute("INSERT OR REPLACE INTO settings(key, value) VALUES (?,?)", (k, json.dumps(v, ensure_ascii=False)))
            write_log(con, who, "Sửa cài đặt", "", list(data.keys()))
            return {"ok": True}

        # ---- danh mục hàng
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
                if orig:
                    if orig != code and con.execute("SELECT 1 FROM products WHERE code=?", (code,)).fetchone():
                        raise ApiError(409, "Mã %s đã tồn tại" % code)
                    con.execute("UPDATE products SET code=?, name=?, unit=?, grp=?, price=?, supplier=?, note=?, opening_qty=?, "
                                "min_qty=?, active=? WHERE code=?", (code,) + vals + (orig,))
                    if orig != code:
                        con.execute("UPDATE voucher_lines SET product_code=? WHERE product_code=?", (code, orig))
                    write_log(con, who, "Sửa mặt hàng", code)
                else:
                    if con.execute("SELECT 1 FROM products WHERE code=?", (code,)).fetchone():
                        raise ApiError(409, "Mã %s đã tồn tại" % code)
                    sort = con.execute("SELECT COALESCE(MAX(sort),0)+1 FROM products").fetchone()[0]
                    con.execute("INSERT INTO products(code, name, unit, grp, price, supplier, note, opening_qty, min_qty, active, sort) "
                                "VALUES (?,?,?,?,?,?,?,?,?,?,?)", (code,) + vals + (sort,))
                    write_log(con, who, "Thêm mặt hàng", code)
                return {"ok": True, "code": code}
            if method == "DELETE" and arg:
                code = unquote(arg)
                used = con.execute("SELECT COUNT(*) FROM voucher_lines WHERE product_code=?", (code,)).fetchone()[0]
                if used:
                    raise ApiError(409, "Mã %s đã có %d dòng trong sổ – không xóa được (có thể bỏ chọn 'Đang dùng')" % (code, used))
                con.execute("DELETE FROM products WHERE code=?", (code,))
                write_log(con, who, "Xóa mặt hàng", code)
                return {"ok": True}

        # ---- tuyến
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
            return {"no": next_number(con, vtype, valid_date(q.get("date")), q.get("route_code", ""),
                                      exclude_id=int(q["exclude"]) if q.get("exclude") else None)}
        if res == "vouchers":
            if method == "GET" and arg == "full":
                if q.get("ids"):
                    ids = [int(x) for x in q["ids"].split(",") if x.strip().isdigit()]
                else:
                    cond, params = ["date = ?"], [valid_date(q.get("date"))]
                    if q.get("type") in TYPE_PREFIX:
                        cond.append("type = ?")
                        params.append(q["type"])
                    ids = [r[0] for r in con.execute("SELECT id FROM vouchers WHERE %s ORDER BY type, no" % " AND ".join(cond), params)]
                return [voucher_full(con, i) for i in ids]
            if method == "GET" and arg:
                return voucher_full(con, int(arg))
            if method == "GET":
                cond, params = [], []
                if q.get("from"):
                    cond.append("v.date >= ?")
                    params.append(q["from"])
                if q.get("to"):
                    cond.append("v.date <= ?")
                    params.append(q["to"])
                if q.get("type") in TYPE_PREFIX:
                    cond.append("v.type = ?")
                    params.append(q["type"])
                if q.get("q"):
                    like = "%" + q["q"].strip() + "%"
                    cond.append("(v.no LIKE ? OR v.reason LIKE ? OR v.route LIKE ? OR v.giver LIKE ? OR v.receiver LIKE ? "
                                "OR v.to_party LIKE ? OR EXISTS (SELECT 1 FROM voucher_lines l2 LEFT JOIN products p2 ON p2.code=l2.product_code "
                                "WHERE l2.voucher_id=v.id AND (l2.product_code LIKE ? OR p2.name LIKE ? OR l2.note LIKE ?)))")
                    params += [like] * 9
                where = ("WHERE " + " AND ".join(cond)) if cond else ""
                sql = ("SELECT v.*, COUNT(l.id) AS line_count, SUM(l.qty) AS total_qty, SUM(l.qty*l.price) AS total_amount "
                       "FROM vouchers v LEFT JOIN voucher_lines l ON l.voucher_id = v.id %s "
                       "GROUP BY v.id ORDER BY v.date DESC, v.type, v.no DESC LIMIT %d" % (where, int(q.get("limit") or 1000)))
                return rows(con.execute(sql, params))
            if method == "POST":
                vid = save_voucher(con, self.read_json(), who=who)
                return voucher_full(con, vid)
            if method == "PUT" and arg:
                vid = save_voucher(con, self.read_json(), vid=int(arg), who=who)
                return voucher_full(con, vid)
            if method == "DELETE" and arg:
                v = voucher_full(con, int(arg))
                con.execute("DELETE FROM vouchers WHERE id=?", (int(arg),))
                write_log(con, who, "Xóa phiếu", v["no"], _summary(v))
                return {"ok": True}

        # ---- sổ nhập xuất (từng dòng)
        if res == "lines" and method == "GET":
            cond, params = [], []
            for key, sql in (("from", "v.date >= ?"), ("to", "v.date <= ?"), ("code", "l.product_code = ?")):
                if q.get(key):
                    cond.append(sql)
                    params.append(q[key])
            if q.get("type") in TYPE_PREFIX:
                cond.append("v.type = ?")
                params.append(q["type"])
            if q.get("q"):
                like = "%" + q["q"].strip() + "%"
                cond.append("(v.no LIKE ? OR l.product_code LIKE ? OR p.name LIKE ? OR l.note LIKE ? OR v.reason LIKE ? "
                            "OR v.giver LIKE ? OR v.receiver LIKE ?)")
                params += [like] * 7
            where = ("WHERE " + " AND ".join(cond)) if cond else ""
            sql = ("SELECT v.id AS voucher_id, v.no, v.date, v.type, v.from_party, v.to_party, v.giver, v.receiver, v.reason, "
                   "l.product_code, p.name, p.unit, l.qty, l.price, l.note FROM voucher_lines l "
                   "JOIN vouchers v ON v.id = l.voucher_id LEFT JOIN products p ON p.code = l.product_code "
                   "%s ORDER BY v.date DESC, v.id DESC, l.line_no LIMIT 5000" % where)
            return rows(con.execute(sql, params))

        # ---- báo cáo
        if res == "report":
            if arg == "nxt":
                return report_nxt(con, valid_date(q.get("from"), "Từ ngày"), valid_date(q.get("to"), "Đến ngày"))
            if arg == "stock":
                return stock_map(con, until_date=valid_date(q.get("date")) if q.get("date") else None,
                                 exclude_voucher=int(q["exclude"]) if q.get("exclude", "").isdigit() else None)
            if arg == "card":
                return stock_card(con, q.get("code", ""), valid_date(q.get("from"), "Từ ngày"), valid_date(q.get("to"), "Đến ngày"))

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
                out = rows(con.execute("SELECT id, kind, date, title, created_at, updated_at FROM docs WHERE kind=? "
                                       "ORDER BY date DESC, id DESC LIMIT 500", (q.get("kind", ""),)))
                return out
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
                    write_log(con, who, "Sửa biên bản", "%s %s" % (kind, ddate))
                else:
                    did = con.execute("INSERT INTO docs(kind, date, title, data, created_at, updated_at) VALUES (?,?,?,?,?,?)",
                                      (kind, ddate, text(d.get("title")), payload, ts, ts)).lastrowid
                    write_log(con, who, "Lưu biên bản", "%s %s" % (kind, ddate))
                return {"ok": True, "id": did}
            if method == "DELETE" and arg:
                con.execute("DELETE FROM docs WHERE id=?", (int(arg),))
                write_log(con, who, "Xóa biên bản", arg)
                return {"ok": True}

        if res == "log" and method == "GET":
            return rows(con.execute("SELECT * FROM log ORDER BY id DESC LIMIT 500"))

        if res == "import" and method == "POST":
            blob = self.read_body()
            if not blob:
                raise ApiError(400, "Chưa chọn file")
            opts = {k: q.get(k, "1") == "1" for k in ("products", "routes", "ledger", "replace_ledger")}
            try:
                return import_excel(con, blob, opts, who)
            except xlsx_import.XlsxError as e:
                raise ApiError(400, str(e))

        if res == "export" and method == "GET":
            if arg == "lines.csv":
                buf = io.StringIO()
                w = csv.writer(buf)
                w.writerow(["Số phiếu", "Ngày", "Loại", "Bên giao", "Bên nhận", "Mã hàng", "Tên hàng", "Ghi chú", "ĐVT",
                            "Số lượng", "Đơn giá", "Thành tiền", "Lý do / Diễn giải", "Người giao", "Người nhận"])
                cond, params = [], []
                if q.get("from"):
                    cond.append("v.date >= ?")
                    params.append(q["from"])
                if q.get("to"):
                    cond.append("v.date <= ?")
                    params.append(q["to"])
                where = ("WHERE " + " AND ".join(cond)) if cond else ""
                for r in con.execute("SELECT v.*, l.product_code, p.name, p.unit, l.qty, l.price, l.note AS lnote FROM voucher_lines l "
                                     "JOIN vouchers v ON v.id=l.voucher_id LEFT JOIN products p ON p.code=l.product_code "
                                     "%s ORDER BY v.date, v.id, l.line_no" % where, params):
                    d = datetime.strptime(r["date"], "%Y-%m-%d").strftime("%d/%m/%Y")
                    w.writerow([r["no"], d, TYPE_LABEL[r["type"]], r["from_party"], r["to_party"], r["product_code"], r["name"],
                                r["lnote"], r["unit"], _fmt(r["qty"]), _fmt(r["price"]), _fmt((r["qty"] or 0) * (r["price"] or 0)),
                                r["reason"], r["giver"], r["receiver"]])
                body = ("﻿" + buf.getvalue()).encode("utf-8")
                self.send_bytes(body, "text/csv; charset=utf-8", "so-nhap-xuat.csv")
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
    port = int(os.environ.get("PORT", "8000"))
    httpd = ThreadingHTTPServer((host, port), Handler)
    print("Web kho nội bộ đang chạy: http://localhost:%d  (dữ liệu: %s)" % (port, DB_PATH))
    if host == "0.0.0.0":
        print("Máy khác trong mạng LAN mở: http://<địa-chỉ-IP-máy-này>:%d" % port)
    print("Bấm Ctrl+C để dừng.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
