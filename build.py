"""
build.py — Inject sprites.json / skills.json / types.json into calculator.html
to produce a self-contained calculator.built.html that works on file:// without
a local HTTP server.

Usage:
    python build.py

Output:
    calculator.built.html   (gitignored; what you open in a browser)
"""
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


def main():
    with open(SRC, 'r', encoding='utf-8') as f:
        html = f.read()

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
