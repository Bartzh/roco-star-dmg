# Roco Star DMG — Starfall Damage Calculator

[中文](./README.md) | **English**

A browser-based damage calculator for **Roco Kingdom: World** (洛克王国：世界), focused on the **Starfall (星陨)** PVP mechanic. It combines spirit/skill/type data extracted from the BWiki Lua modules with a small Python data pipeline, and ships as a static web page that runs entirely in the browser.

Live sites:

- Chinese: <https://stardmg.top/>
- English: <https://stardmg.top/en/>
- GitHub Pages mirror: <https://bartzh.github.io/roco-star-dmg/>

Chinese is the default locale; the page also detects the browser language and ships an English localization/static build. The current data snapshot is dated **2026-11-05** (see the page footer and the in-app announcement).

## Features

- **Attacker and defender panels** with an inline spirit picker: search by Chinese name, pinyin, pinyin initials, English name, or illustration number (图鉴编号); filter by element; use the fixed / favorite / all pools.
- **Favorites and per-spirit memory**: the favorite lists and every spirit's nature, IVs, buffs, and selected skill are stored in `localStorage`. The data manager can toggle auto-memory, clear memory/favorites, and export/import everything as JSON.
- **18-element type chart** (`普通 / 草 / 火 / 水 / 光 / 地 / 冰 / 龙 / 电 / 毒 / 虫 / 武 / 翼 / 萌 / 幽 / 恶 / 机械 / 幻`) with real-time effectiveness, dual-type handling, and STAB.
- **Stat configuration**: nature (×1.2 / ×0.9), up to three IVs (+60 each), and chips for attack, magic attack, defense, magic defense, speed, power, and combo count.
- **Skill handling**:
  - Attack and defense skills are selected from each spirit's learnset.
  - The pipeline extracts `combo` from “N连击” descriptions and `reduction` from defensive descriptions.
  - “Counter state” (应对状态) activation is detected from descriptions; each counter skill's effect and several traits are handled by explicit modifiers in `calculator.js` (e.g. 铁蒺藜, 龙卷风, 追打, 虫击, 突袭, 多维击打, 天体吸积, 展翅, 和弦共振).
  - 18 fixed “愿力冲击” (Wishpower Blast) attack skills are always available, plus the “聚能” (Rest) pseudo-skill for triggering counter effects.
  - A custom skill slot lets a spirit use a skill it cannot normally learn (for 借用 / 取念 / 复写 / 过山车 / 奇异 scenarios).
- **Starfall layer control (0–99)**: drag, wheel, or slider input, with a glowing/pulsing seal, particle effects, and a “minimum lethal layer” readout.
- **Damage breakdown panel** showing every multiplier in the formula.
- **Challenge mode**: randomized matchups with easy / standard / hard presets, 3 / 5 / 10 / 20 questions, weighted random stats/buffs/skills, and scoring against the optimal starfall layer.
- **Visuals and layout**: dark glass UI, a three-layer parallax starfield that follows the mouse, particle animations, and a mobile carousel layout.
- **Localization**: Chinese and English dictionaries in `i18n.js`; language can be switched with `?lang=zh` / `?lang=en` or the `/en/` static page.

## Tech stack

| Layer | Used in this repository |
| --- | --- |
| Frontend | Plain HTML, CSS, and vanilla JavaScript. Canvas 2D for the starfield/particles, Web Animations API for transitions, `localStorage` for persistence. No framework, bundler, or third-party JS/CSS runtime dependency. Images are loaded from the BWiki CDN, with local icons in `images/`. |
| Data pipeline | Python **3.13**, managed with [uv](https://docs.astral.sh/uv/); `lupa` to evaluate Lua tables, `pypinyin` to generate search keys, `requests` for the BWiki MediaWiki API. |
| Optional English data crawl | `nodriver` driving a real Microsoft Edge window (because rocopedia.org is behind Cloudflare Turnstile). Not installed by default; run it with `uv run --with nodriver`. |
| Build | `build.py`, Python standard library only (`json`, `os`, `re`, `shutil`, `html`). |
| CI / hosting | GitHub Actions builds `dist/` and deploys it to GitHub Pages on pushes to `master`. |

## Repository layout

Tracked files:

```
.
├── README.md                  # Chinese README (primary)
├── README.en.md               # English README (this file)
├── calculator.html            # Source page (contains the <!-- INJECT_DATA_HERE --> marker)
├── calculator.js              # Application logic (data loading, calculation, UI, challenge mode)
├── i18n.js                    # zh-CN / en dictionaries and language switching
├── styles.css                 # Styles, responsive layout, animations
├── favicon.ico
├── robots.txt
├── sitemap.xml
├── build.py                   # Injects final JSON and generates dist/
├── lua2json.py                # Converts datas/src Lua modules to JSON
├── crawling_image_urls.py     # Fetches image URLs from the BWiki MediaWiki API
├── crawl_rocopedia.py         # Fetches English trait names/effects from rocopedia.org
├── make_final_jsons.py        # Merges intermediate data into datas/final
├── helper.lua                 # Lua helper used by lua2json.py (is_lua_array)
├── pyproject.toml             # Python project metadata and dependencies
├── uv.lock                    # Locked Python dependency versions
├── .python-version            # 3.13
├── datas/
│   ├── src/                   # Lua source data (core, learnset_catalog, skill_catalog,
│   │   │                      #   rocopedia_links, and s5/*.lua)
│   ├── intermediate/          # Generated/merged JSON, s5/, rocopedia/
│   ├── final/                 # Final JSON consumed by the page
│   └── README.md              # Note: files here are large; avoid reading them in full
├── images/                    # Local icons (聚能 and the 18 愿力冲击 icons)
└── .github/workflows/
    └── deploy-page.yml        # GitHub Pages build/deploy workflow
```

Generated (not tracked):

```
calculator.built.html          # Self-contained page produced by build.py
dist/                          # Static site: index.html, en/index.html, assets, datas, images
```

Generated artifacts are ignored by Git: `calculator.built.html` and `dist/` are listed in `.gitignore`. The working copy may also contain gitignored local files such as `package.json`, `package-lock.json`, and `test_*.py`; they are not part of the tracked project and are not required, so no Node.js step is needed.

> `datas/**/*.json` and `datas/**/*.lua` are tracked with **Git LFS** (see `.gitattributes`). A clone without LFS will contain pointer files instead of data.

## Getting started

### Prerequisites

- [Git](https://git-scm.com/) with Git LFS
- [uv](https://docs.astral.sh/uv/) (it installs Python 3.13 and the dependencies)
- Network access to `wiki.biligame.com` (and optionally `rocopedia.org`)

No environment variables, API keys, or secrets are required. The only environment read is `TEMP` in `crawl_rocopedia.py`, used for the browser profile directory.

### Clone and install

```bash
git clone https://github.com/bartzh/roco-star-dmg.git
cd roco-star-dmg
git lfs install
git lfs pull
uv sync
```

### Data pipeline

```
datas/src/*.lua + datas/src/s5/*.lua
    │  lua2json.py  (lupa evaluates Lua; S5 "dragon-tuples-1" data is decoded)
    ▼
datas/intermediate/*.json + datas/intermediate/s5/*.json
    │  crawling_image_urls.py  (MediaWiki API → image URLs, with checkpoints)
    ▼
datas/intermediate/*_urls.json
    │  crawl_rocopedia.py  (optional: English trait names/effects)
    ▼
datas/intermediate/rocopedia/traits_en.json
    │  make_final_jsons.py  (merges S5, resolves names, parses combo/reduction,
    │                        builds pinyin keys, attaches English metadata)
    ▼
datas/final/{sprites,skills,types,others}.json
    │  build.py  (inlines JSON into calculator.built.html and generates dist/)
    ▼
calculator.built.html / dist/
```

Important details:

- `lua2json.py` merges the S5 data into the base tables: S5 learnsets into `learnset_catalog`, S5 pets into `core`, and S5 skills/traits into `skill_catalog`.
- `make_final_jsons.py` reads the checked-in English snapshots `datas/intermediate/rocopedia/jinies_en.json` and `skills_en.json`, plus `traits_en.json` and `rocopedia_links.json`. `crawl_rocopedia.py` only refreshes the **trait** data; the spirit and skill snapshots are already in the repository.
- `crawling_image_urls.py` has feature flags at the top. By default only `crawling_s5_jinies` and `crawling_s5_skills` are enabled; `crawling_core`, `crawling_skill_catalog`, and `crawling_types` are disabled. It sleeps **30–60 seconds** between API batches and writes a `.checkpoint.json` file. The S5 crawls merge into the existing `pet_illustration_urls.json` / `skill_icon_urls.json`; the core and skill-catalog crawls write their own output files. Enabling `crawling_types` updates `datas/final/types.json` in place.
- `crawl_rocopedia.py` requires a visible Microsoft Edge window (Cloudflare blocks headless requests). It uses the hard-coded `EDGE` path near the top of the file; adjust it if Edge is installed elsewhere.

### Full rebuild

```bash
uv run lua2json.py
uv run crawling_image_urls.py
# Optional, only if you need to refresh English trait text:
# uv run --with nodriver -- python crawl_rocopedia.py
uv run make_final_jsons.py
python build.py
```

`build.py` uses only the Python standard library, so `uv run build.py` and plain `python build.py` both work.

### Rebuild only

If `datas/final/` is already present and unchanged:

```bash
python build.py
```

This produces:

- `calculator.built.html` — a single self-contained file with the four JSON datasets inlined; open it directly in a browser.
- `dist/index.html` — Chinese static page for deployment.
- `dist/en/index.html` — English static page for deployment.
- `dist/` copies of `styles.css`, `i18n.js`, `calculator.js`, `favicon.ico`, `robots.txt`, `sitemap.xml`, `datas/final/`, and `images/`.

The `dist/` pages are generated from the source HTML and load `datas/final/*.json` via `fetch`; they do not inline the data. `calculator.built.html` is not used by the CI deployment.

### Local debugging of the source page

`calculator.html` loads data in this order:

1. Inline `<script type="application/json" id="sprites-data">` blocks, if present (the `calculator.built.html` build).
2. Otherwise `fetch('./datas/final/*.json')`.

Because `fetch` is blocked on `file://`, do not open the source `calculator.html` directly. Use a local HTTP server:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/calculator.html>. To test the production-style page, run `python build.py` and open `calculator.built.html`.

## Script reference

| Command | Purpose |
| --- | --- |
| `uv sync` | Install the Python dependencies from `pyproject.toml` / `uv.lock`. |
| `uv run lua2json.py` | Convert `datas/src/*.lua` and `datas/src/s5/*.lua` into `datas/intermediate/`. |
| `uv run crawling_image_urls.py` | Fetch spirit/skill/type image URLs from BWiki. Defaults to the S5 spirit and skill crawls only. |
| `uv run --with nodriver -- python crawl_rocopedia.py` | Refresh `datas/intermediate/rocopedia/traits_en.json` using a real Edge window. |
| `uv run make_final_jsons.py` | Merge intermediate data into `datas/final/{sprites,skills,types,others}.json`. |
| `python build.py` / `uv run build.py` | Build `calculator.built.html` and `dist/`. Standard library only. |
| `python -m http.server 8000` | Serve the repository for source-page debugging. |

There are no npm scripts that are part of the tracked project.

## Data formats (`datas/final/`)

As of the 2026-11-05 snapshot: 663 spirits, 870 skill-catalog entries (attack / defense / trait / status), 18 types, 14 common attackers, and 27 common defenders.

| File | Shape | Purpose |
| --- | --- | --- |
| `sprites.json` | `{ [spirit_name]: Sprite }` | Stats, types, learnset, search keys, illustration URL, English name. |
| `skills.json` | `{ [skill_name]: Skill }` | Skill metadata plus parsed `combo` / `reduction` and English metadata. |
| `types.json` | `{ [element]: TypeInfo }` | Type chart and element icon URL. |
| `others.json` | Object with four keys | Favorite presets and weighted random pools for challenge mode. |

### `sprites.json`

```jsonc
{
  "迪莫": {
    "id": "迪莫",
    "name": "迪莫",
    "types": ["光系"],
    "hp": 120, "atk": 80, "matk": 80,
    "def": 105, "mdef": 105, "spd": 92,
    "skills": ["最好的伙伴", "猛烈撞击", "..."],
    "pinyin": "dimo",
    "pinyin_initials": "dm",
    "hbid": 1,
    "illustration_url": "https://patchwiki.biligame.com/...",
    "name_en": "Dimo"
  }
}
```

Keys are the Chinese spirit names; `id` equals the key. `hbid` is the illustration number used by the picker. `illustration_url` and `name_en` are optional when the source data is missing.

### `skills.json`

```jsonc
{
  "投毒": {
    "id": "投毒",
    "name": "投毒",
    "category": "攻击",          // 攻击 / 防御 / 特性 / 状态
    "damage_class": "物攻",      // 物攻 / 魔攻 / 自适应
    "element": "毒系",
    "power": 90,
    "energy": 3,
    "desc": "造成物伤，使敌方获得至少2次中毒后……",
    "catalog_tags": ["异常", "强化"],
    "desc_notes": ["..."],
    "icon_url": "https://patchwiki.biligame.com/...",
    "name_en": "...",
    "desc_en": "..."
  }
}
```

Defensive skills also have `reduction` (a multiplier such as `0.5`). Attack skills with a combo have `combo` (an integer). Duplicate skill names are disambiguated with numeric suffixes (`name2`, `name3`, …) by `make_final_jsons.py`.

### `types.json`

Keys are element names without the `系` suffix (`普通`, `草`, `火`, …). Each value has `attackStrong`, `attackWeak`, `defendStrong`, `defendWeak`, `iconUrl`, `name_en`.

### `others.json`

```jsonc
{
  "common_attackers": ["龙息帕尔", "..."],
  "common_defenders": ["贝古斯", "..."],
  "attacker_random_pools": { "龙息帕尔": { "stats": {}, "buffs": {}, "skills": {} } },
  "defender_random_pools": { "...": {} }
}
```

The two `*_random_pools` maps power the challenge mode's weighted random stats, buffs, and skill selection.

## Damage model

The calculation lives in `computeFinalDamage` in `calculator.js`. In short:

```
skill damage = floor(
  power × (attack / defense) × (37 / 41) × STAB × effectiveness
  × defenseSkill.reduction × combo
)

starfall damage = floor(
  (n² + 24n − 24) × (attack / defense) × (37 / 41)
  × starfall effectiveness × defenseSkill.reduction
)

total = skill damage + starfall damage
```

`n` is the starfall layer (0–99). Starfall damage is not applied when the skill itself is 幻-element. Final stats include nature (×1.2 / ×0.9) and up to three IVs (+60 each); the HP formula has its own adjustment. The breakdown panel shows each of these terms.

## Deployment

`.github/workflows/deploy-page.yml` runs on every push to `master`:

1. Check out the repository with LFS.
2. Set up Python 3.13.
3. Run `python build.py`.
4. Upload `dist/` as a GitHub Pages artifact and deploy it.

## TODO

No planned TODO items.

## License and attribution

- The source code in this repository is released under the **WTFPL** (see `LICENSE`).
- Game data, spirit names, illustrations, and skill icons belong to the official game and the BWiki contributors. The page footer credits the official rights holders and BWiki; no separate data license file is included in this repository.
