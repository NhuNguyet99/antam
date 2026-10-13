#!/usr/bin/env python3
"""Ghép giao diện (static/) + online/backend.js thành 1 trang HTML cho bản online trên claude.ai.

    python online/build.py            -> online/kho-antam.html
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SHEETJS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"


def read(*p):
    with open(os.path.join(*p), encoding="utf-8") as f:
        return f.read()


def main():
    index = read(ROOT, "static", "index.html")
    body = re.search(r"<body>(.*?)<script src=\"app.js\"></script>", index, re.S).group(1).strip()
    css = read(ROOT, "static", "style.css")
    backend = read(HERE, "backend.js")
    app = read(ROOT, "static", "app.js")
    for name, code in (("backend.js", backend), ("app.js", app)):
        if "</script" in code.lower():
            raise SystemExit("%s chứa '</script' – không nhúng được" % name)
    page = "\n".join([
        "<title>Kho An Tâm</title>",
        '<meta name="description" content="Web làm việc nội bộ kho Thành phẩm - Hàng hóa và Nguyên vật liệu">',
        "<style>", css, "</style>",
        body,
        '<script src="%s"></script>' % SHEETJS,
        "<script>", backend, "</script>",
        "<script>", app, "</script>",
    ])
    out = os.path.join(HERE, "kho-antam.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    print("Đã tạo %s (%d KB)" % (out, len(page.encode("utf-8")) // 1024))


if __name__ == "__main__":
    main()
