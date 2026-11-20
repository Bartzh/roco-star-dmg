"""
build.py — Inject sprites.json / skills.json / types.json into calculator.html
to produce a self-contained calculator.built.html that works on file:// without
a local HTTP server.

Usage:
    python build.py

Output:
    calculator.built.html   (gitignored; what you open in a browser)
"""
import argparse
import json
import os
import re
import shutil
from html import escape

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'calculator.html')
I18N_SRC = os.path.join(ROOT, 'i18n.js')
OUT = os.path.join(ROOT, 'calculator.built.html')
if not os.path.exists(os.path.join(ROOT, 'dist')):
    os.makedirs(os.path.join(ROOT, 'dist'))

DATA_FILES = [
    ('sprites-data',      'sprites.json'),
    ('skills-data',       'skills.json'),
    ('types-data',        'types.json'),
    ('others-data',        'others.json'),
]

MARKER = '<!-- INJECT_DATA_HERE -->'


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def build_data_blocks():
    """Return a string with three <script type="application/json"> blocks."""
    out = []
    for elem_id, fname in DATA_FILES:
        path = os.path.join(ROOT, 'datas/final',fname)
        if not os.path.exists(path):
            raise FileNotFoundError(f'Missing data file: {path}')
        with open(path, 'r', encoding='utf-8') as f:
            raw = f.read().strip()
        out.append(
            f'<script type="application/json" id="{elem_id}">\n'
            f'{raw}\n'
            f'</script>'
        )
    return '\n'.join(out)


# ============================================================
# Static locale page generation
# ============================================================
def _load_i18n_dict(locale_key):
    """Parse the flat zh/en dictionaries from i18n.js.

    Values in i18n.js are single-line template literals without backticks
    or ${} interpolation, so a small regex is enough for the build step.
    """
    with open(I18N_SRC, 'r', encoding='utf-8') as f:
        src = f.read()

    if locale_key == 'en':
        start = src.index('en: {')
        end = src.index('const warned', start)
    else:
        start = src.index("'zh-CN': {")
        end = src.index('en: {', start)

    block = src[start:end]
    entries = dict(re.findall(r"'([^']+)':\s*`([^`]*)`", block, re.S))
    if 'app.title' not in entries or len(entries) < 150:
        raise RuntimeError(
            f'Failed to parse the {locale_key} dictionary from i18n.js; '
            'keep dictionary values as single-line template literals.'
        )
    return entries


def _translate_text_nodes(html, mapping, attr, raw=False):
    """Replace the inner text of elements carrying attr="key"."""
    pattern = re.compile(
        r'(<([A-Za-z][A-Za-z0-9]*)\b[^>]*\b' + re.escape(attr) + r'="([^"]+)"[^>]*>)(.*?)(</\2>)',
        re.S
    )

    def repl(match):
        key = match.group(3)
        if key not in mapping:
            return match.group(0)
        value = mapping[key] if raw else escape(mapping[key], quote=False)
        return match.group(1) + value + match.group(5)

    return pattern.sub(repl, html)


def _translate_attrs(html, mapping):
    """Replace attributes listed in data-i18n-attr="attr:key;attr2:key2"."""
    tag_pattern = re.compile(r'<[^>]*\bdata-i18n-attr="[^"]+"[^>]*>')

    def repl_tag(match):
        tag = match.group(0)
        raw_pairs = re.search(r'data-i18n-attr="([^"]+)"', tag).group(1)
        for pair in raw_pairs.split(';'):
            if ':' not in pair:
                continue
            attr, key = pair.split(':', 1)
            attr, key = attr.strip(), key.strip()
            if key not in mapping:
                continue
            attr_pattern = re.compile(r'(\b' + re.escape(attr) + r'=")[^"]*(")')
            tag = attr_pattern.sub(
                lambda m: m.group(1) + escape(mapping[key], quote=True) + m.group(2),
                tag,
                count=1
            )
        return tag

    return tag_pattern.sub(repl_tag, html)


def _translate_jsonld(html, mapping, page_url):
    """Update the JSON-LD WebApplication fields for the target locale."""
    pattern = re.compile(
        r'(<script[^>]*\bdata-i18n-jsonld="[^"]+"[^>]*>)(.*?)(</script>)',
        re.S
    )

    def repl(match):
        open_tag, body, close_tag = match.group(1), match.group(2), match.group(3)
        try:
            obj = json.loads(body)
        except json.JSONDecodeError as exc:
            raise RuntimeError('Invalid JSON-LD in calculator.html') from exc

        raw_pairs = re.search(r'data-i18n-jsonld="([^"]+)"', open_tag).group(1)
        for pair in raw_pairs.split(';'):
            if ':' not in pair:
                continue
            field, key = pair.split(':', 1)
            field, key = field.strip(), key.strip()
            if key in mapping:
                obj[field] = mapping[key]
        obj['url'] = page_url
        return open_tag + '\n' + json.dumps(obj, ensure_ascii=False, indent=2) + '\n  ' + close_tag

    return pattern.sub(repl, html)


def build_locale_page(source_html, locale_key):
    """Return a static HTML page for the given locale.

    The zh page is the source file itself. The en page gets its static text,
    metadata, JSON-LD, lang and canonical URL rewritten at build time, so
    search engines see English content before JavaScript runs.
    """
    if locale_key != 'en':
        return source_html

    mapping = _load_i18n_dict('en')
    page_url = 'https://stardmg.top/en/'
    out = source_html

    # Relative assets/data resolve from the site root when the page lives in /en/.
    out = out.replace('<head>', '<head>\n  <base href="../">', 1)
    out = re.sub(r'<html\s+lang="[^"]+"', '<html lang="en"', out, count=1)
    out = out.replace(
        '<link rel="canonical" href="https://stardmg.top/">',
        f'<link rel="canonical" href="{page_url}">'
    )

    out = _translate_text_nodes(out, mapping, 'data-i18n-html', raw=True)
    out = _translate_text_nodes(out, mapping, 'data-i18n', raw=False)
    out = _translate_attrs(out, mapping)
    out = _translate_jsonld(out, mapping, page_url)
    return out


# ============================================================
# Toy build：单独产出 toy/ 发布包
# ------------------------------------------------------------
# 与网页版 dist/ 的区别：
#   1. 去掉 SEO 相关标签与文案（canonical / hreflang / robots / JSON-LD / sr-only）；
#   2. 外部链接降级为纯文本（App WebView 内点开外链后无法返回）；
#   3. 注入 Toy JS SDK、toy.css、toy-boot.js（沉浸模式 + 安全区 + 隐藏导出）；
#   4. 不复制 en/、robots.txt、sitemap.xml。
# 入口 index.html 与 dist 同源，约 30KB，远低于 1MB 上限。
# ============================================================
TOY_DIR = os.path.join(ROOT, 'toy')

_EXTERNAL_ANCHOR_RE = re.compile(
    r'<a\b[^>]*\bhref=(["\'])https?://[^"\']*\1[^>]*>(.*?)</a>',
    re.S | re.I
)

# Toy 环境文案差异（精确替换；改 i18n.js 原文后需同步这里）
_TOY_COPY = [
    (
        '本站只保存记忆和收藏的精灵数据在你的浏览器里，不会上传到任何服务器。'
        '下面可以开关记忆功能，对数据进行备份、导入或清除。',
        '记忆和收藏的精灵配置保存在本机，清除 B站 缓存后可能丢失。'
        '下面可以开关记忆功能，对数据进行导入或清除。'
    ),
    (
        'This site only stores remembered and favorited Jinie data in your browser; '
        'nothing is uploaded to any server. Below you can toggle memory, back up, '
        'import or clear your data.',
        'Remembered configurations and favorites are stored on this device and may be '
        'lost if the Bilibili app cache is cleared. Below you can toggle memory and '
        'import or clear your data.'
    ),
    (
        '数据加载失败: {msg}<br><br>若用 file:// 打开，请先执行 '
        '<code>python build.py</code> 生成 calculator.built.html。',
        '数据加载失败: {msg}<br><br>请稍后重试，或反馈给作者。'
    ),
    (
        'Failed to load data: {msg}<br><br>If you opened this file via '
        '<code>file://</code>, run <code>python build.py</code> first to generate '
        '<code>calculator.built.html</code>.',
        'Failed to load data: {msg}<br><br>Please try again later.'
    ),
]


def unwrap_external_links(text):
    """把指向外域站点的 <a> 降级为纯文本，保留可见文案。"""
    return _EXTERNAL_ANCHOR_RE.sub(lambda m: m.group(2), text)


def apply_toy_copy(text):
    for old, new in _TOY_COPY:
        text = text.replace(old, new)
    return text


def strip_toy_seo(html):
    """移除只对搜索引擎 / 网页版有意义的标签与文案。"""
    out = html
    out = re.sub(r'\n\s*<meta name="robots"[^>]*>', '', out)
    out = re.sub(r'\n\s*<meta name="keywords"[^>]*>', '', out)
    out = re.sub(r'\n\s*<link rel="canonical"[^>]*>', '', out)
    out = re.sub(r'\n\s*<link rel="alternate" hreflang="[^"]*"[^>]*>', '', out)
    out = re.sub(
        r'\n\s*<!-- JSON-LD[^\n]*-->\s*<script type="application/ld\+json"[\s\S]*?</script>',
        '', out, count=1
    )
    out = re.sub(
        r'\n\s*<!-- SEO[^\n]*-->\s*<div class="sr-only"[\s\S]*?</div>',
        '', out, count=1
    )
    return out


def build_toy(source_html):
    """生成可直接上传的 toy/ 目录（不含 en/、robots.txt、sitemap.xml）。"""
    if os.path.isdir(TOY_DIR):
        shutil.rmtree(TOY_DIR)
    os.makedirs(TOY_DIR)

    html = strip_toy_seo(source_html)
    html = re.sub(
        r'\n*<!-- Data injection marker[^\n]*-->\n*<!-- INJECT_DATA_HERE -->\n*',
        '\n\n', html
    )
    html = html.replace(
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">'
    )
    html = html.replace(
        '<link rel="stylesheet" href="./styles.css">',
        '<link rel="stylesheet" href="./styles.css">\n'
        '  <link rel="stylesheet" href="./toy.css">'
    )
    html = html.replace(
        '</head>',
        '  <script src="https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js" defer></script>\n'
        '</head>'
    )
    html = html.replace(
        '<script src="./calculator.js" defer></script>',
        '<script src="./calculator.js" defer></script>\n'
        '<script src="./toy-boot.js" defer></script>'
    )
    # 语言切换链接指向显式 index.html，避免 Toy 下裸路径 / 纯 query 的解析差异
    html = html.replace('href="?lang=zh"', 'href="./index.html?lang=zh"')
    html = html.replace('href="?lang=en"', 'href="./index.html?lang=en"')
    html = apply_toy_copy(unwrap_external_links(html))
    with open(os.path.join(TOY_DIR, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print('Wrote toy/index.html')

    for name in ('calculator.js', 'i18n.js'):
        with open(os.path.join(ROOT, name), 'r', encoding='utf-8') as f:
            text = f.read()
        text = apply_toy_copy(unwrap_external_links(text))
        with open(os.path.join(TOY_DIR, name), 'w', encoding='utf-8') as f:
            f.write(text)
        print(f'Wrote toy/{name}')

    for name in ('styles.css', 'toy.css', 'toy-boot.js', 'favicon.ico'):
        shutil.copy2(os.path.join(ROOT, name), os.path.join(TOY_DIR, name))
        print(f'Copied {name} to toy/')

    shutil.copytree(os.path.join(ROOT, 'datas', 'final'), os.path.join(TOY_DIR, 'datas', 'final'))
    shutil.copytree(os.path.join(ROOT, 'images'), os.path.join(TOY_DIR, 'images'))
    print('Copied datas/final/ and images/ to toy/')

    size = os.path.getsize(os.path.join(TOY_DIR, 'index.html'))
    print(f'Toy entry index.html: {size:,} bytes ({size / 1024:.1f} KB, limit 1024 KB)')


def main():
    parser = argparse.ArgumentParser(description='Build the Star Damage Calculator site.')
    parser.add_argument(
        '--toy', action='store_true',
        help='只构建 B站 Toy 发布包到 toy/（不生成 dist/ 与 calculator.built.html）'
    )
    args = parser.parse_args()

    with open(SRC, 'r', encoding='utf-8') as f:
        html = f.read()

    if args.toy:
        build_toy(html)
        return

    if MARKER not in html:
        raise RuntimeError(
            f'Marker {MARKER!r} not found in {SRC}. '
            f'Did someone remove it? Re-add it before the main <script> block.'
        )

    blocks = build_data_blocks()
    out_html = html.replace(MARKER, blocks, 1)

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(out_html)

    # 写入 dist 的中英文静态页面（GitHub Pages 镜像部署）
    dist_dir = os.path.join(ROOT, 'dist')
    zh_html = build_locale_page(html, 'zh')
    with open(os.path.join(dist_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(zh_html)
    print('Wrote dist/index.html (zh-CN)')

    en_dir = os.path.join(dist_dir, 'en')
    os.makedirs(en_dir, exist_ok=True)
    en_html = build_locale_page(html, 'en')
    with open(os.path.join(en_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(en_html)
    print('Wrote dist/en/index.html (en)')

    # 复制到 dist 目录
    for seo_file in ('favicon.ico', 'robots.txt', 'sitemap.xml', 'styles.css', 'i18n.js', 'calculator.js'):
        src = os.path.join(ROOT, seo_file)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dist_dir, seo_file))
            print(f'Copied {seo_file} to dist/')
        else:
            print(f'Warning: {seo_file} not found in root directory')
    # 复制 datas/final 目录到 dist 目录
    shutil.copytree(os.path.join(ROOT, 'datas', 'final'), os.path.join(dist_dir, 'datas', 'final'), dirs_exist_ok=True)
    print(f'Copied datas/final/ to dist/datas/final/')
    # 复制 images 目录到 dist 目录
    shutil.copytree(os.path.join(ROOT, 'images'), os.path.join(dist_dir, 'images'), dirs_exist_ok=True)
    print(f'Copied images/ to dist/')

    src_size = os.path.getsize(SRC)
    out_size = os.path.getsize(OUT)
    delta = out_size - src_size
    print(f'Built: {OUT}')
    print(f'  source  size: {src_size:>9,} bytes  ({src_size / 1024:.1f} KB)')
    print(f'  built   size: {out_size:>9,} bytes  ({out_size / 1024:.1f} KB)')
    print(f'  injected  : {delta:>9,} bytes  ({delta / 1024:.1f} KB of JSON)')


if __name__ == '__main__':
    main()
