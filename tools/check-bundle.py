"""校验生成的 client.js 是否忠实搬运了上游资源。

断言：
1. animation.js 只应用构建脚本中声明的替换，其他脚本与上游一致；
2. style.css 逐字节一致，没有被改写选择器；
3. 页面标记等于上游 index.html 按 payload.mjs 规则剥离后的结果（无脚本、无素材路径）；
4. 两张图是内联 JPEG data URI；
5. animation.js 取用的每个选择器都能在标记里找到（含设置面板与滑杆）。

运行：python tools/check-bundle.py
"""

import json
import os
import re
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.abspath(os.path.join(ROOT, "..", "codex-startup-animation-windows"))
BUNDLE = os.path.join(ROOT, "lib", "client.js")

failures = []

PATCHES = runpy.run_path(os.path.join(HERE, "build-client.py"))["PATCHES"]


def check(condition, message):
    print(("PASS  " if condition else "FAIL  ") + message)
    if not condition:
        failures.append(message)


def read_repo(rel):
    with open(os.path.join(REPO, rel), encoding="utf-8") as handle:
        return handle.read()


def extract(name):
    source = open(BUNDLE, encoding="utf-8").read()
    marker = "\t\tconst %s = " % name
    start = source.index(marker) + len(marker)
    value, _ = json.JSONDecoder().raw_decode(source, start)
    return value


def page_html():
    html = read_repo("index.html")
    html = re.sub(r"<!doctype[^>]*>", "", html, flags=re.I)
    html = re.sub(r"<html[^>]*>|</html>", "", html, flags=re.I)
    html = re.sub(r"<script\b[^>]*>[\s\S]*?</script>", "", html, flags=re.I)
    html = re.sub(r"<link\b[^>]*>", "", html, flags=re.I)
    html = re.sub(r"<meta\b[^>]*http-equiv[^>]*>", "", html, flags=re.I)
    html = re.sub(r'src="assets/[^"]*"', 'src=""', html)
    return html.strip()


def main():
    if not os.path.exists(BUNDLE):
        sys.exit("找不到 %s" % BUNDLE)

    # animation.js 是唯一被显式改动的上游文件：仅允许 PATCHES 表里的替换。
    embedded_animation = extract("ANIMATION")
    upstream_animation = read_repo("animation.js")
    patched = upstream_animation
    for old, new in PATCHES:
        check(old in upstream_animation, "上游存在可替换片段：%s" % old)
        patched = patched.replace(old, new)
    check(embedded_animation == patched, "ANIMATION 等于上游加已声明的 PATCHES")
    check(embedded_animation.count("Math.ceil(fragments.length/420)") == 1, "移动线段密度已提到 420")
    check(embedded_animation.count("Math.ceil(identityPieces.length/72)") == 1, "身份碎片密度已提到 72")
    check(embedded_animation.count("if(introRing)introRing(ink,cx,cy,radar.w);") == 1,
          "身份碎片复用前半段橙色环")

    for name, rel in (
        ("CONTOURS", "assets/contours.js"),
        ("CONFIG", "assets/config.js"),
        ("IMAGE_SETTINGS", "image-settings.js"),
    ):
        embedded = extract(name)
        original = read_repo(rel)
        check(embedded == original, "%s 与上游 %s 逐字节一致 (%d 字符)" % (name, rel, len(original)))

    css = extract("CSS")
    original_css = read_repo("style.css")
    check(css == original_css, "CSS 与上游 style.css 逐字节一致（选择器未改写）")
    check(".dsh-body" not in css, "CSS 里没有移植层自造的选择器")
    check("body.embedded" in css, "上游的 embedded 全屏规则保持原样")

    html = extract("HTML")
    check(html == page_html(), "HTML 等于上游 index.html 按 payload.mjs 规则剥离的结果")
    check("<script" not in html.lower(), "标记里没有 <script>（脚本由宿主注入）")
    check("assets/" not in html, "标记里没有指向 assets/ 的素材路径")
    check('id="settings-dialog"' in html, "设置对话框在标记里")

    artwork = extract("ARTWORK")
    avatar = extract("AVATAR")
    check(artwork.startswith("data:image/jpeg;base64,") and len(artwork) > 100000, "背景图已内联为 JPEG data URI")
    check(avatar.startswith("data:image/jpeg;base64,") and len(avatar) > 30000, "头像已内联为 JPEG data URI")

    selectors = set()
    for match in re.finditer(r"\$\(\s*'([^']+)'\s*\)", read_repo("animation.js")):
        selectors.add(match.group(1))
    for match in re.finditer(r"querySelectorAll?\(\s*'([^']+)'\s*\)", read_repo("animation.js")):
        selectors.add(match.group(1))

    classes, ids, tags = set(), set(), set()
    for match in re.finditer(r'class="([^"]*)"', html):
        classes.update(match.group(1).split())
    ids.update(re.findall(r'id="([^"]*)"', html))
    tags.update(re.findall(r"<([a-zA-Z0-9]+)", html))

    missing = []
    for selector in sorted(selectors):
        for group in selector.split(","):
            for token in group.split():
                token = token.strip()
                if not token:
                    continue
                if token.startswith("#"):
                    ok = token[1:] in ids
                elif token.startswith("."):
                    ok = token[1:].split(":")[0] in classes
                else:
                    tag = re.match(r"[a-zA-Z0-9]+", token)
                    ok = bool(tag) and tag.group(0) in tags
                if not ok:
                    missing.append(token)
    check(not missing, "animation.js 取用的 %d 个选择器全部存在于标记中%s"
          % (len(selectors), "" if not missing else "（缺 %s）" % sorted(set(missing))))

    check("wallpaper-setting" in classes, "常驻背景用的挂载点 .wallpaper-setting 存在")

    print()
    if failures:
        print("结果：%d 项失败" % len(failures))
        return 1
    print("结果：全部通过（%d 个选择器已核对）" % len(selectors))
    return 0


if __name__ == "__main__":
    sys.exit(main())
