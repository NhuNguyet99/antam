"""Đọc file .xlsx chỉ bằng thư viện chuẩn (zipfile + xml).

Lấy giá trị đã tính sẵn (cached value) của ô công thức, nên đọc được các cột
Mã hàng / Loại / Số lượng mà file Excel tính bằng công thức.
"""
import io
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
BUILTIN_DATE_FMTS = set(range(14, 23)) | {45, 46, 47}
EXCEL_EPOCH = datetime(1899, 12, 30)


class XlsxError(Exception):
    pass


class Sheet:
    def __init__(self, cells, max_row):
        self.cells = cells
        self.max_row = max_row

    def get(self, ref):
        return self.cells.get(ref)


def _is_date_format(code):
    code = re.sub(r'"[^"]*"|\[[^\]]*\]|\\.', "", code or "").lower()
    return bool(re.search(r"[dy]", code)) or bool(re.search(r"m.*[dy]|[dy].*m", code))


def _date_styles(z):
    try:
        root = ET.fromstring(z.read("xl/styles.xml"))
    except KeyError:
        return set()
    custom = {}
    for nf in root.findall("m:numFmts/m:numFmt", NS):
        custom[int(nf.get("numFmtId"))] = nf.get("formatCode")
    out = set()
    for i, xf in enumerate(root.findall("m:cellXfs/m:xf", NS)):
        fid = int(xf.get("numFmtId") or 0)
        if fid in BUILTIN_DATE_FMTS or (fid in custom and _is_date_format(custom[fid])):
            out.add(i)
    return out


def _text(el):
    return "".join(t.text or "" for t in el.iter("{%s}t" % NS["m"]))


def read_workbook(blob, only=None):
    """Đọc mọi sheet (hoặc chỉ sheet tên `only`) -> {tên: Sheet}."""
    try:
        z = zipfile.ZipFile(io.BytesIO(blob))
    except zipfile.BadZipFile:
        raise XlsxError("File không phải định dạng .xlsx (hãy lưu lại file bằng Excel dạng .xlsx)")
    try:
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    except KeyError:
        raise XlsxError("File .xlsx bị thiếu thành phần workbook")
    targets = {r.get("Id"): r.get("Target") for r in rels.iter(PKG_REL_NS + "Relationship")}
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append(_text(si))
    date_styles = _date_styles(z)
    sheets = {}
    for s in wb.findall("m:sheets/m:sheet", NS):
        target = targets.get(s.get("{%s}id" % REL_NS), "")
        target = target.lstrip("/")
        path = target if target.startswith("xl/") else "xl/" + target
        if path not in z.namelist() or (only is not None and s.get("name") != only):
            continue
        sheets[s.get("name")] = _read_sheet(z.read(path), shared, date_styles)
    return sheets


def sheet_names(blob):
    try:
        z = zipfile.ZipFile(io.BytesIO(blob))
        wb = ET.fromstring(z.read("xl/workbook.xml"))
    except (zipfile.BadZipFile, KeyError):
        raise XlsxError("File không phải định dạng .xlsx (hãy lưu lại file bằng Excel dạng .xlsx)")
    return [s.get("name") for s in wb.findall("m:sheets/m:sheet", NS)]


def _col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def sheet_rows(sheet):
    """Sheet -> danh sách dòng (mỗi dòng là list giá trị, ô trống = "")."""
    grid = {}
    width = 0
    for ref, val in sheet.cells.items():
        m = re.match(r"([A-Z]+)(\d+)$", ref)
        if not m:
            continue
        r, c = int(m.group(2)) - 1, _col_index(m.group(1))
        if hasattr(val, "isoformat"):
            val = val.strftime("%d/%m/%Y")
        grid.setdefault(r, {})[c] = val
        width = max(width, c + 1)
    return [[grid.get(r, {}).get(c, "") for c in range(width)] for r in range(sheet.max_row)]


def _read_sheet(xml, shared, date_styles):
    cells = {}
    max_row = 0
    c_tag = "{%s}c" % NS["m"]
    v_tag = "{%s}v" % NS["m"]
    is_tag = "{%s}is" % NS["m"]
    for _, el in ET.iterparse(io.BytesIO(xml)):
        if el.tag != c_tag:
            continue
        ref = el.get("r")
        t = el.get("t")
        v = el.find(v_tag)
        val = None
        if t == "s" and v is not None:
            val = shared[int(v.text)]
        elif t == "inlineStr":
            node = el.find(is_tag)
            val = _text(node) if node is not None else None
        elif t in ("str", "e") and v is not None:
            val = v.text if t == "str" else None
        elif t == "b" and v is not None:
            val = v.text == "1"
        elif v is not None and v.text is not None:
            try:
                n = float(v.text)
            except ValueError:
                n = None
            if n is not None and int(el.get("s") or 0) in date_styles:
                val = (EXCEL_EPOCH + timedelta(days=n)).date()
            elif n is not None:
                val = int(n) if n.is_integer() else n
        if val is not None and val != "":
            cells[ref] = val
            row = int(re.sub(r"[A-Z]+", "", ref))
            max_row = max(max_row, row)
        el.clear()
    return Sheet(cells, max_row)


if __name__ == "__main__":
    import sys
    wb = read_workbook(open(sys.argv[1], "rb").read())
    for name, sh in wb.items():
        print(name, sh.max_row, len(sh.cells))
