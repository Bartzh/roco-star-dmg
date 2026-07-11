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
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'calculator.html')
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

    # 复制到 dist 目录（GitHub Pages 镜像部署）
    for seo_file in ('calculator.html', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'styles.css', 'calculator.js'):
        src = os.path.join(ROOT, seo_file)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(ROOT, 'dist', 'index.html' if seo_file == 'calculator.html' else seo_file))
            print(f'Copied {seo_file} to dist/')
        else:
            print(f'Warning: {seo_file} not found in root directory')
    # 复制 datas/final 目录到 dist 目录
    shutil.copytree(os.path.join(ROOT, 'datas', 'final'), os.path.join(ROOT, 'dist', 'datas', 'final'), dirs_exist_ok=True)
    print(f'Copied datas/final/ to dist/datas/final/')
    # 复制 images 目录到 dist 目录
    shutil.copytree(os.path.join(ROOT, 'images'), os.path.join(ROOT, 'dist', 'images'), dirs_exist_ok=True)
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
