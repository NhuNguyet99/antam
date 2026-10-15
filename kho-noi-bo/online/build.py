#!/usr/bin/env python3
"""Ghép giao diện (static/) + online/backend.js thành trang HTML cho bản online trên claude.ai.

    python online/build.py                        -> online/kho-antam.html      (web chính, dữ liệu dùng chung)
    python online/build.py --view du-lieu.json    -> online/kho-antam-xem.html  (trang xem công khai, chỉ xem,
                                                     chứa sẵn số liệu – KHÔNG commit file này)
`du-lieu.json` là file "Tải dữ liệu" ở mục Cài đặt & dữ liệu của web chính.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SHEETJS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
MAIN_TITLE = "Kho An Tâm"
MAIN_DESC = "Web làm việc nội bộ kho Thành phẩm - Hàng hóa và Nguyên vật liệu"
VIEW_TITLE = "Sổ Kho An Tâm"
VIEW_DESC = "Trang xem công khai số liệu kho Thành phẩm - Hàng hóa và Nguyên vật liệu (chỉ xem)"


def read(*p):
    with open(os.path.join(*p), encoding="utf-8") as f:
        return f.read()


def parts():
    index = read(ROOT, "static", "index.html")
    markup = re.search(r"<body>(.*?)<script src=\"app.js\"></script>", index, re.S).group(1).strip()
    css = read(ROOT, "static", "style.css")
    backend = read(HERE, "backend.js")
    app = read(ROOT, "static", "app.js")
    # web giao hàng chạy ngay trong trang (dùng chung dữ liệu): CSS nối sau, JS đặt trước app.js
    css += "\n" + read(ROOT, "static", "giao-hang.css")
    app = read(ROOT, "static", "giao-hang.js") + "\n" + app
    for name, code, tag in (("backend.js", backend, "</script"), ("app.js", app, "</script"), ("style.css", css, "</style")):
        if tag in code.lower():
            raise SystemExit("%s chứa %s – không nhúng được" % (name, tag))
    return markup, css, backend, app


def build_main():
    markup, css, backend, app = parts()
    return "\n".join([
        "<title>%s</title>" % MAIN_TITLE,
        '<meta name="description" content="%s">' % MAIN_DESC,
        '<style id="app-style">%s</style>' % css,
        markup,
        '<script src="%s"></script>' % SHEETJS,
        '<script id="antam-backend">%s</script>' % backend,
        '<script id="antam-app">%s</script>' % app,
    ])


def build_view(snapshot_path):
    markup, css, backend, app = parts()
    with open(snapshot_path, encoding="utf-8") as f:
        snap = json.load(f)
    if snap.get("format") != "kho-antam-backup":
        raise SystemExit("File số liệu không đúng định dạng kho-antam-backup")
    snap_text = json.dumps(snap, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    boot = "window.ANTAM_VIEW=true;window.ANTAM_TITLE=%s;window.ANTAM_DESC=%s;window.ANTAM_SHEETJS=%s;window.ANTAM_MARKUP=%s;" % (
        json.dumps(VIEW_TITLE, ensure_ascii=False), json.dumps(VIEW_DESC, ensure_ascii=False), json.dumps(SHEETJS),
        json.dumps(markup, ensure_ascii=False).replace("</", "<\\/"))
    # Cùng thứ tự với viewPageSource() trong app.js (trang tự đăng lại chính nó theo đúng khung này)
    return "\n".join([
        "<title>%s</title>" % VIEW_TITLE,
        '<meta name="description" content="%s">' % VIEW_DESC,
        '<style id="app-style">%s</style>' % css,
        markup,
        '<script type="application/json" id="antam-snapshot">%s</script>' % snap_text,
        '<script id="antam-boot">%s</script>' % boot,
        '<script src="%s"></script>' % SHEETJS,
        '<script id="antam-backend">%s</script>' % backend,
        '<script id="antam-app">%s</script>' % app,
    ])


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--view":
        page, out = build_view(sys.argv[2]), os.path.join(HERE, "kho-antam-xem.html")
    else:
        page, out = build_main(), os.path.join(HERE, "kho-antam.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    print("Đã tạo %s (%d KB)" % (out, len(page.encode("utf-8")) // 1024))


if __name__ == "__main__":
    main()
