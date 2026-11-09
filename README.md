# 洛克王国星陨伤害计算器 (roco-star-dmg)

**中文** | [English](./README.en.md)

一个面向《洛克王国：世界》PVP 星陨机制的浏览器端伤害计算器。它把从 BWiki Lua 模块中提取的精灵 / 技能 / 属性数据，通过一条小型 Python 数据流水线整合，最终生成完全在浏览器中运行的静态网页。

在线地址：

- 中文站：<https://stardmg.top/>
- 英文站：<https://stardmg.top/en/>
- GitHub Pages 镜像：<https://bartzh.github.io/roco-star-dmg/>

中文为默认语言；页面也会检测浏览器语言，并提供英文国际化和静态页。当前数据快照日期为 **2026-11-05**（见页面页脚和应用内公告）。

## 功能

- **攻击方 / 防御方双面板**，内嵌式精灵选择器：支持中文名、拼音、拼音首字母、英文名、图鉴编号搜索；可按属性筛选；提供固定 / 收藏 / 全部三种池。
- **收藏与按精灵记忆**：收藏列表，以及每只精灵的性格、个体、buff、已选技能都会存入 `localStorage`。数据管理面板可开关自动记忆、清空记忆 / 收藏，并以 JSON 导出 / 导入全部配置。
- **18 系属性相克表**（`普通 / 草 / 火 / 水 / 光 / 地 / 冰 / 龙 / 电 / 毒 / 虫 / 武 / 翼 / 萌 / 幽 / 恶 / 机械 / 幻`），实时计算克制效果，支持双属性和 STAB。
- **数值配置**：性格（×1.2 / ×0.9）、最多 3 个个体（每个 +60），以及攻击、魔攻、防御、魔防、速度、威力、连击等 buff。
- **技能处理**：
  - 攻击 / 防御技能从精灵的学习表中选取。
  - 流水线从“N连击”描述中提取 `combo`，从防御技能描述中提取 `reduction`。
  - “应对状态”的触发会从描述中检测；每个应对技能的具体效果和部分特性由 `calculator.js` 中的显式修正处理（例如 铁蒺藜、龙卷风、追打、虫击、突袭、多维击打、天体吸积、展翅、和弦共振）。
  - 始终提供 18 个固定“愿力冲击”攻击技能，以及用于触发应对效果的“聚能”伪技能。
  - 自定义技能槽可让精灵使用其通常无法学习的技能（用于借用 / 取念 / 复写 / 过山车 / 奇异等场景）。
- **星陨层数控制（0–99）**：支持拖拽、滚轮或滑条输入，带印记辉光 / 脉动、粒子效果和“最低致死层数”读数。
- **伤害明细面板**：逐项展示公式中的每一个乘数。
- **挑战模式**：随机精灵对位，简单 / 标准 / 困难预设，3 / 5 / 10 / 20 题，按权重随机数值 / buff / 技能，并按最优星陨层数评分。
- **视觉与布局**：深色玻璃拟态 UI、三层视差星空（跟随鼠标）、粒子动画、移动端 carousel 布局。
- **国际化**：`i18n.js` 内置中英词典；可通过 `?lang=zh` / `?lang=en` 或 `/en/` 静态页切换语言。

## 技术栈

| 层级 | 本仓库使用的技术 |
| --- | --- |
| 前端 | 原生 HTML、CSS 和 JavaScript。Canvas 2D 绘制星空 / 粒子，Web Animations API 处理过渡，`localStorage` 做持久化。没有框架、打包器或第三方 JS/CSS 运行时依赖。图片从 BWiki CDN 加载，本地图标位于 `images/`。 |
| 数据流水线 | Python **3.13**，使用 [uv](https://docs.astral.sh/uv/) 管理；`lupa` 执行 Lua 表，`pypinyin` 生成搜索键，`requests` 访问 BWiki MediaWiki API。 |
| 可选的英文数据抓取 | `nodriver` 驱动真实的 Microsoft Edge 窗口（rocopedia.org 受 Cloudflare Turnstile 保护）。默认不安装；用 `uv run --with nodriver` 运行。 |
| 构建 | `build.py`，仅使用 Python 标准库（`json`、`os`、`re`、`shutil`、`html`）。 |
| CI / 托管 | GitHub Actions 构建 `dist/`，并在推送到 `master` 时部署到 GitHub Pages。 |

## 目录结构

已跟踪文件：

```
.
├── README.md                  # 中文 README（主文件）
├── README.en.md               # 英文 README
├── calculator.html            # 源码页面（含 <!-- INJECT_DATA_HERE --> 标记）
├── calculator.js              # 应用逻辑（数据加载、计算、UI、挑战模式）
├── i18n.js                    # zh-CN / en 词典与语言切换
├── styles.css                 # 样式、响应式布局、动画
├── favicon.ico
├── robots.txt
├── sitemap.xml
├── build.py                   # 注入最终 JSON，并生成 dist/
├── lua2json.py                # 把 datas/src 下的 Lua 模块转为 JSON
├── crawling_image_urls.py     # 通过 BWiki MediaWiki API 抓取图片 URL
├── crawl_rocopedia.py         # 从 rocopedia.org 抓取英文特性名 / 效果
├── make_final_jsons.py        # 把 intermediate 数据合并为 datas/final
├── helper.lua                 # lua2json.py 用到的 Lua 帮助函数（is_lua_array）
├── pyproject.toml             # Python 项目元数据与依赖
├── uv.lock                    # uv 锁定的依赖版本
├── .python-version            # 3.13
├── datas/
│   ├── src/                   # Lua 源数据（core、learnset_catalog、skill_catalog、
│   │   │                      #   rocopedia_links，以及 s5/*.lua）
│   ├── intermediate/          # 生成的 / 合并后的 JSON，s5/、rocopedia/
│   ├── final/                 # 页面最终读取的 JSON
│   └── README.md              # 提示：这里的文件较大，不要整体读取
├── images/                    # 本地图标（聚能和 18 个愿力冲击图标）
└── .github/workflows/
    └── deploy-page.yml        # GitHub Pages 构建 / 部署工作流
```

生成物（不跟踪）：

```
calculator.built.html          # build.py 生成的自包含页面
dist/                          # 静态站点：index.html、en/index.html、资源、datas、images
```

生成物已被 Git 忽略：`calculator.built.html` 和 `dist/` 都在 `.gitignore` 中。工作区里还可能存在被忽略的本地文件，例如 `package.json`、`package-lock.json`、`test_*.py`；它们不属于跟踪的项目，也不需要，因此构建不依赖 Node.js。

> `datas/**/*.json` 和 `datas/**/*.lua` 由 **Git LFS** 跟踪（见 `.gitattributes`）。没有 LFS 的克隆会得到指针文件，而不是数据。

## 快速开始

### 环境要求

- [Git](https://git-scm.com/)，并安装 Git LFS
- [uv](https://docs.astral.sh/uv/)（它会安装 Python 3.13 和依赖）
- 可访问 `wiki.biligame.com`（可选访问 `rocopedia.org`）

不需要任何环境变量、API Key 或 Secret。唯一读取的环境变量是 `crawl_rocopedia.py` 中的 `TEMP`，用于浏览器 profile 目录。

### 克隆与安装

```bash
git clone https://github.com/bartzh/roco-star-dmg.git
cd roco-star-dmg
git lfs install
git lfs pull
uv sync
```

### 数据流水线

```
datas/src/*.lua + datas/src/s5/*.lua
    │  lua2json.py（lupa 执行 Lua；解码 S5 "dragon-tuples-1" 数据）
    ▼
datas/intermediate/*.json + datas/intermediate/s5/*.json
    │  crawling_image_urls.py（MediaWiki API → 图片 URL，带 checkpoint）
    ▼
datas/intermediate/*_urls.json
    │  crawl_rocopedia.py（可选：英文特性名 / 效果）
    ▼
datas/intermediate/rocopedia/traits_en.json
    │  make_final_jsons.py（合并 S5、解析名称、提取 combo/reduction、
    │                       生成拼音键、附加英文元数据）
    ▼
datas/final/{sprites,skills,types,others}.json
    │  build.py（把 JSON 内联到 calculator.built.html，并生成 dist/）
    ▼
calculator.built.html / dist/
```

关键细节：

- `lua2json.py` 会把 S5 数据合并进基础表：S5 学习表并入 `learnset_catalog`，S5 精灵并入 `core`，S5 技能 / 特性并入 `skill_catalog`。
- `make_final_jsons.py` 会读取仓库中已有的英文快照 `datas/intermediate/rocopedia/jinies_en.json` 和 `skills_en.json`，以及 `traits_en.json` 和 `rocopedia_links.json`。`crawl_rocopedia.py` 只刷新**特性**数据；精灵和技能快照已经在仓库里。
- `crawling_image_urls.py` 顶部有功能开关。默认只开启 `crawling_s5_jinies` 和 `crawling_s5_skills`；`crawling_core`、`crawling_skill_catalog`、`crawling_types` 均为关闭。它每批请求之间随机等待 **30–60 秒**，并写入 `.checkpoint.json`。S5 抓取会合并进已有的 `pet_illustration_urls.json` / `skill_icon_urls.json`；core 和 skill catalog 抓取会写入各自的输出文件。开启 `crawling_types` 会直接更新 `datas/final/types.json`。
- `crawl_rocopedia.py` 需要可见的 Microsoft Edge 窗口（Cloudflare 会拦截无头请求）。脚本顶部硬编码了 `EDGE` 路径；如果 Edge 安装在其他位置，需要自行修改。

### 完整重建

```bash
uv run lua2json.py
uv run crawling_image_urls.py
# 可选：仅在需要刷新英文特性文本时运行
# uv run --with nodriver -- python crawl_rocopedia.py
uv run make_final_jsons.py
python build.py
```

`build.py` 只使用 Python 标准库，因此 `uv run build.py` 和直接 `python build.py` 都可以。

### 仅重新打包

如果 `datas/final/` 已存在且没有变化：

```bash
python build.py
```

会生成：

- `calculator.built.html`：把四份 JSON 数据内联进去的自包含文件，可直接用浏览器打开。
- `dist/index.html`：用于部署的中文静态页。
- `dist/en/index.html`：用于部署的英文静态页。
- `dist/` 下的 `styles.css`、`i18n.js`、`calculator.js`、`favicon.ico`、`robots.txt`、`sitemap.xml`、`datas/final/` 和 `images/` 副本。

`dist/` 页面由源码 HTML 生成，并通过 `fetch` 加载 `datas/final/*.json`，不会内联数据。`calculator.built.html` 不用于 CI 部署。

### 源码调试

`calculator.html` 按以下顺序加载数据：

1. 如果存在内联的 `<script type="application/json" id="sprites-data">` 等数据块，则优先使用（`calculator.built.html` 产物会有）。
2. 否则 `fetch('./datas/final/*.json')`。

由于 `file://` 下 `fetch` 会被浏览器阻止，不要直接打开源码版 `calculator.html`。请用本地 HTTP 服务器：

```bash
python -m http.server 8000
```

然后打开 <http://localhost:8000/calculator.html>。如果要测试生产样式页面，运行 `python build.py` 后打开 `calculator.built.html`。

## 脚本命令

| 命令 | 用途 |
| --- | --- |
| `uv sync` | 根据 `pyproject.toml` / `uv.lock` 安装 Python 依赖。 |
| `uv run lua2json.py` | 把 `datas/src/*.lua` 和 `datas/src/s5/*.lua` 转换为 `datas/intermediate/`。 |
| `uv run crawling_image_urls.py` | 从 BWiki 抓取精灵 / 技能 / 属性图片 URL；默认只抓 S5 精灵和 S5 技能。 |
| `uv run --with nodriver -- python crawl_rocopedia.py` | 用真实 Edge 窗口刷新 `datas/intermediate/rocopedia/traits_en.json`。 |
| `uv run make_final_jsons.py` | 把中间数据合并为 `datas/final/{sprites,skills,types,others}.json`。 |
| `python build.py` / `uv run build.py` | 生成 `calculator.built.html` 和 `dist/`；仅依赖标准库。 |
| `python -m http.server 8000` | 启动本地服务器，用于调试源码页面。 |

跟踪的项目中没有 npm 脚本。

## 数据格式（`datas/final/`）

截至 2026-11-05 快照：663 只精灵、870 条技能目录条目（攻击 / 防御 / 特性 / 状态）、18 种属性、14 个常用攻击方、27 个常用防御方。

| 文件 | 形状 | 用途 |
| --- | --- | --- |
| `sprites.json` | `{ [spirit_name]: Sprite }` | 种族值、属性、学习表、搜索键、图鉴图片 URL、英文名。 |
| `skills.json` | `{ [skill_name]: Skill }` | 技能元数据，以及解析出的 `combo` / `reduction` 和英文元数据。 |
| `types.json` | `{ [element]: TypeInfo }` | 属性相克表和属性图标 URL。 |
| `others.json` | 包含四个键的对象 | 收藏预设，以及挑战模式用的加权随机池。 |

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

键是中文精灵名，`id` 与键相同。`hbid` 是选择器使用的图鉴编号；`illustration_url` 和 `name_en` 在源数据缺失时可以不存在。

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

防御技能还会有 `reduction`（例如 `0.5` 这样的乘数）。带连击的攻击技能会有 `combo`（整数）。同名技能由 `make_final_jsons.py` 用数字后缀（`name2`、`name3`……）区分。

### `types.json`

键是不带“系”后缀的属性名（`普通`、`草`、`火`……）。每个值包含 `attackStrong`、`attackWeak`、`defendStrong`、`defendWeak`、`iconUrl`、`name_en`。

### `others.json`

```jsonc
{
  "common_attackers": ["龙息帕尔", "..."],
  "common_defenders": ["贝古斯", "..."],
  "attacker_random_pools": { "龙息帕尔": { "stats": {}, "buffs": {}, "skills": {} } },
  "defender_random_pools": { "...": {} }
}
```

两个 `*_random_pools` 映射用于挑战模式的加权随机数值、buff 和技能选择。

## 伤害模型

计算逻辑位于 `calculator.js` 的 `computeFinalDamage`。简而言之：

```
技能伤害 = floor(
  威力 × (攻击 / 防御) × (37 / 41) × STAB × 克制倍率
  × 防御技能.reduction × 连击数
)

星陨伤害 = floor(
  (n² + 24n − 24) × (攻击 / 防御) × (37 / 41)
  × 星陨克制倍率 × 防御技能.reduction
)

总伤害 = 技能伤害 + 星陨伤害
```

`n` 是星陨层数（0–99）。当技能本身为幻系时，不计算星陨伤害。最终数值包含性格（×1.2 / ×0.9）和最多 3 个个体（每个 +60）；HP 公式另有调整。伤害明细面板会展示上述每一项。

## 部署

`.github/workflows/deploy-page.yml` 在每次推送到 `master` 时运行：

1. 使用 LFS 检出仓库。
2. 配置 Python 3.13。
3. 执行 `python build.py`。
4. 上传 `dist/` 作为 GitHub Pages artifact 并部署。

## TODO

暂无计划中的待办项。

## 许可证与致谢

- 本仓库源码使用 **WTFPL** 许可证（见 `LICENSE`）。
- 游戏数据、精灵名称、插画和技能图标归官方游戏及 BWiki 贡献者所有。页面页脚已注明官方版权方和 BWiki；仓库中没有单独的数据许可证文件。
