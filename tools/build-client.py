"""把上游原项目的动画资源打成 DSH 客户端插件 bundle。

设计原则：动画逻辑零改动，且沿用上游注入器（extension/payload.mjs + renderer.mjs）的
同一套做法——整页搬进一个同源 about:blank iframe，全局绑成函数形参执行。

- `index.html` 按上游 payload.mjs 的规则剥掉 doctype/html/script/link/meta 与素材路径；
- `style.css` 原文嵌入，不做任何选择器改写（iframe 里有真正的 body）；
- `animation.js`、`assets/contours.js`、`assets/config.js`、`image-settings.js` 逐字节嵌入；
- 两张图片内联成 JPEG data URI。

运行：python tools/build-client.py
输入：..\\codex-startup-animation-windows
输出：lib/client.js
"""

import base64
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.abspath(os.path.join(ROOT, "..", "codex-startup-animation-windows"))
OUT = os.path.join(ROOT, "lib", "client.js")


def read(rel, mode="r"):
    path = os.path.join(REPO, rel)
    with open(path, mode, encoding=None if "b" in mode else "utf-8") as handle:
        return handle.read()


def data_uri(rel, mime):
    return "data:%s;base64,%s" % (mime, base64.b64encode(read(rel, "rb")).decode("ascii"))


def page_html():
    """复刻上游 payload.mjs 对 index.html 的处理。"""
    html = read("index.html")
    html = re.sub(r"<!doctype[^>]*>", "", html, flags=re.I)
    html = re.sub(r"<html[^>]*>|</html>", "", html, flags=re.I)
    html = re.sub(r"<script\b[^>]*>[\s\S]*?</script>", "", html, flags=re.I)
    html = re.sub(r"<link\b[^>]*>", "", html, flags=re.I)
    html = re.sub(r"<meta\b[^>]*http-equiv[^>]*>", "", html, flags=re.I)
    html = re.sub(r'src="assets/[^"]*"', 'src=""', html)
    return html.strip()


# 上游改动限于现有碎屑密度和身份飞散纹理，时间轴保持上游原文。
PATCHES = (
    ("Math.ceil(fragments.length/160)", "Math.ceil(fragments.length/420)"),
    ("Math.ceil(identityPieces.length/24)", "Math.ceil(identityPieces.length/72)"),
    (
        "    ink.strokeStyle='#a397a0';ink.lineWidth=1.3;",
        "    const introRing=window.AEMEATH_IDENTITY_RING;\n"
        "    if(!introRing){\n"
        "    ink.strokeStyle='#a397a0';ink.lineWidth=1.3;",
    ),
    ("    ink.globalAlpha=1;ink.strokeRect(border.x,border.y,border.w,border.h);",
     "    }\n"
     "    ink.globalAlpha=1;ink.strokeStyle=window.getComputedStyle($('.avatar-frame')).borderTopColor;\n"
     "    ink.strokeRect(border.x,border.y,border.w,border.h);"),
    ("      const node=$(selector),r=rect(node),style=window.getComputedStyle(node);",
     "      const node=$(selector),style=window.getComputedStyle(node);\n"
     "      if(style.display==='none')continue;\n"
     "      const r=rect(node);"),
    ("    // Geometric tile selection works for file:// images too, without reading protected pixels.",
     "    if(introRing)introRing(ink,cx,cy,radar.w);\n"
     "    // Geometric tile selection works for file:// images too, without reading protected pixels."),
    ("      const onRing=[.3775,.4425,.48].some",
     "      const onRing=(introRing?[.3125,.4,.485]:[.3775,.4425,.48]).some"),
)


def patched_animation():
    """返回应用了 PATCHES 的 animation.js；找不到片段就构建失败，绝不静默跳过。"""
    source = read("animation.js")
    for old, new in PATCHES:
        if old not in source:
            sys.exit("上游 animation.js 里找不到待替换片段：%s" % old)
        source = source.replace(old, new)
    return source


def main():
    if not os.path.isdir(REPO):
        sys.exit("找不到上游仓库：%s（先把它克隆到该目录）" % REPO)

    parts = {
        "__HTML__": json.dumps(page_html(), ensure_ascii=False),
        "__CSS__": json.dumps(read("style.css"), ensure_ascii=False),
        "__CONTOURS__": json.dumps(read("assets/contours.js"), ensure_ascii=False),
        "__CONFIG__": json.dumps(read("assets/config.js"), ensure_ascii=False),
        "__IMAGE_SETTINGS__": json.dumps(read("image-settings.js"), ensure_ascii=False),
        "__ANIMATION__": json.dumps(patched_animation(), ensure_ascii=False),
        "__ARTWORK__": json.dumps(data_uri("assets/artwork.jpg", "image/jpeg")),
        "__AVATAR__": json.dumps(data_uri("assets/avatar.jpg", "image/jpeg")),
    }

    with open(os.path.join(HERE, "client.template.js"), encoding="utf-8") as handle:
        bundle = handle.read()

    for token, value in parts.items():
        bundle = bundle.replace(token, value)

    leftover = re.findall(r"__[A-Z_]+__", bundle)
    if leftover:
        sys.exit("模板里还有未替换的占位符：%s" % sorted(set(leftover)))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(bundle)
    print("wrote %s (%d bytes)" % (OUT, len(bundle.encode("utf-8"))))


if __name__ == "__main__":
    main()
