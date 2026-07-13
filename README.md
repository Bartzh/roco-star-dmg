# 洛克王国星陨伤害计算器 (roco-star-dmg)

一个专为星陨设计的《洛克王国：世界》精灵对战伤害计算器。基于 BWiki 的精灵 / 技能 / 属性数据，配合一条 Python 数据流水线，最终产出一个网页。

[国内网站](https://stardmg.top/) / [GitHub Pages](https://bartzh.github.io/roco-star-dmg/) / 自行构建：见下方 [构建与运行](#构建与运行)。

---

## 功能

- 攻击方 / 防御方双面板，**内嵌式**精灵选择器（无需弹窗）
- 18 系属性相克表，实时计算 `effectiveness`
- 技能区分攻击 / 防御两类：
  - 攻击技能：自动从技能描述中识别**连击数**增伤修正
  - 防御技能：自动从描述中识别**减伤百分比**
- 完整的伤害计算明细面板，逐项展示公式里每一项的乘数
- 物理 / 魔法 / 化劲 / 羽化等多种 buff 调节
- 「星陨印记」能量层数可视化（带辉光与脉动动画）
- 三层视差星空背景 + 鼠标视差跟随
- 拼音 / 首字母 / 图鉴编号搜索精灵
- 玻璃拟态深色 UI，零外部资源依赖（图片直接从 Wiki CDN 加载）
- 为部分星陨常见精灵 / 技能特别适配（仪式 / 祭礼巨像、落陨星兔、粉耳星兔、多维击打、天体吸积）

---

## 目录结构

```
.
├── calculator.html           # 源码 HTML（含 <!-- INJECT_DATA_HERE --> 标记）
├── calculator.built.html     # build.py 产物，内联 JSON，可直接打开（gitignore）
├── build.py                  # 把 datas/final/*.json 注入到 calculator.html
├── lua2json.py               # 把 datas/src/*.lua 转为 datas/intermediate/*.json
├── crawling_image_urls.py    # 通过 BWiki 的 MediaWiki API 抓取精灵/技能/属性图标 URL
├── make_final_jsons.py       # 合并 intermediate 数据，生成 datas/final/{sprites,skills,types,others}.json
├── helper.lua                # lua2json.py 用到的 Lua 帮助函数（is_lua_array）
├── pyproject.toml            # Python 依赖：lupa / pypinyin / requests
├── uv.lock                   # uv 锁定的依赖版本
└── datas/
    ├── src/                  # 原始 Lua 源数据（来自BWiki）
    ├── intermediate/         # lua2json + image crawl 的中间产物
    ├── final/                # 给 calculator.html 用的最终 JSON
    └── README.md             # ⚠️ 提示 AI 不要轻易完整读 datas/ 下的文件
```

---

## 数据流水线

```
datas/src/*.lua
    │  lua2json.py  (lupa 把 Lua table 转 Python dict)
    ▼
datas/intermediate/*.json
    │  crawling_image_urls.py  (MediaWiki API 抓图标 URL)
    ▼
datas/intermediate/*_urls.json
    │  make_final_jsons.py  (合并 + 解析技能描述生成 reduction/combo + 拼音搜索键)
    ▼
datas/final/{sprites,skills,types,others}.json
    │  build.py  (内联进 calculator.html)
    ▼
calculator.built.html   ← 双击即可使用
```

> `datas` 中文件体积较大，已通过 Git LFS 跟踪（见 `.gitattributes`）。

---

## 构建与运行

### 克隆

```bash
git clone https://github.com/bartzh/roco-star-dmg.git
git lfs pull
```

### 环境

- [uv](https://docs.astral.sh/uv/)（uv会自动安装所有依赖）

```bash
# 安装依赖
uv sync

# 完整流水线（从 Lua 源一路到内联 HTML）
uv run lua2json.py
uv run crawling_image_urls.py
uv run make_final_jsons.py
uv run build.py
```

`make_final_jsons.py` 会向 `wiki.biligame.com` 发起 MediaWiki 请求，**注意礼貌抓取**（脚本已带 `2~4s` 随机 sleep）。

### 仅重新打包

如果 `datas/final/` 已经存在且未变，直接：

```bash
uv run build.py
```

输出 `calculator.built.html`，双击即可在任意现代浏览器中运行。

### 源码调试

`calculator.html` 会按以下顺序加载数据：

1. 检查是否存在内联的 `<script type="application/json" id="sprites-data">` 等（build 产物会有）
2. 退化到 `fetch('./datas/final/*.json')`（需要本地 HTTP 服务器，例如 `python -m http.server`）

> 因 `fetch` 走 `file://` 协议会被浏览器阻止，**不要直接双击 `calculator.html` 源码版**。

---

## 数据字段说明（`datas/final/`）

| 文件              | 形状                                                        | 说明                                   |
| ----------------- | ----------------------------------------------------------- | -------------------------------------- |
| `sprites.json`    | `{ [pet_id]: Sprite }`                                      | 精灵种族值、属性、技能列表、拼音搜索键 |
| `skills.json`     | `{ [skill_id]: Skill }`                                    | 技能元数据 + 解析出的 `reduction` / `combo` |
| `types.json`      | `{ [element]: TypeInfo }`                                   | 18 系相克表 + 图标 URL                 |
| `others.json`     | `{ common_attackers: [...], common_defenders: [...] }`     | 精灵选择器中的「常用」快捷筛选预设     |

`Sprite` 关键字段：
```jsonc
{
  "id": "pet_000175",
  "name": "龙息帕尔",
  "types": ["恶系"],
  "hp": 130, "atk": 127, "matk": 57,
  "def": 131,  "mdef": 87, "spd": 100,
  "skills": ["skill_000xxx", ...],
  "pinyin": "longxipaer",
  "pinyin_initials": "lxpe",
  "illustration_url": "https://..."
}
```

---

## 开发提示

- 改完 `datas/src/*.lua` → 重跑 `lua2json.py` → `make_final_jsons.py` → `build.py`
- 改完 `calculator.html` → 直接重跑 `build.py` 即可
- 想要新增/调整「常用精灵」预设 → 编辑 `make_final_jsons.py` 顶部的 `COMMON_ATTACKERS` / `COMMON_DEFENDERS`

---

## TODO

- 过山车/奇异
- 测验游戏

---

## 致谢

- 数据和图像来源：[B站洛克王国Wiki](https://wiki.biligame.com/rocom/)（CC BY-NC-SA 4.0）
