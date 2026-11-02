/* ============================================================
 * i18n.js — 轻量国际化层（零依赖）
 *
 * 职责：
 *   1. 语言检测（?lang= > /en/ 路径 > localStorage > 浏览器语言）
 *   2. t(key, params) 文案插值
 *   3. data-i18n / data-i18n-html / data-i18n-attr 静态文案应用
 *   4. 顶部语言切换按钮
 *
 * 业务代码不直接依赖本文件内部结构，只使用 window.I18N。
 * ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'roco-star-dmg:locale:v1';
  const DEFAULT_LOCALE = 'zh-CN';
  const SUPPORTED = ['zh-CN', 'en'];

  const DICTS = {
    'zh-CN': {
      /* ---- Meta / SEO ---- */
      'meta.title': `星陨伤害计算器 - 洛克王国世界 PVP 伤害模拟工具`,
      'meta.description': `在线星陨伤害计算器，支持自定义攻击方/防御方精灵属性、性格、buff、连击数与星陨层数，实时计算 PVP 战斗伤害与剩余血量。数据来自 BWIKI，开源免费。`,
      'meta.keywords': `星陨伤害计算器,星陨,洛克王国世界伤害计算,洛克王国 PVP,星陨层数,伤害模拟,星陨印记,精灵对战计算器`,
      'jsonld.name': `洛克王国星陨伤害计算器`,
      'jsonld.alternateName': `Roco Kingdom Star Damage Calculator`,
      'jsonld.description': `洛克王国世界 PVP 伤害在线模拟工具，支持自定义精灵属性、buff、连击数与星陨层数。`,
      'jsonld.inLanguage': `zh-CN`,

      'seo.h2': `洛克王国星陨伤害计算器使用说明`,
      'seo.intro': `本工具用于模拟《洛克王国：世界》PVP 战斗中的星陨伤害。选择攻击方与防御方精灵，调整种族、性格、努力值、buff、连击数与星陨层数（0~99），即可实时得到伤害数值与剩余血量百分比，并展示完整伤害公式的逐项乘数。数据来源：BWiki。`,
      'seo.h3.features': `主要功能`,
      'seo.feature1': `攻击方 / 防御方双面板，内嵌式精灵选择器（拼音、首字母、图鉴编号搜索）。`,
      'seo.feature2': `18 系属性相克表，实时计算属性克制与弱化。`,
      'seo.feature3': `自动从技能描述中识别连击数增伤与减伤百分比。`,
      'seo.feature4': `双攻 / 双防 / 威力 / 连击等多种 buff 调节。`,
      'seo.feature5': `星陨印记能量层数（0~99）可视化与脉动动画。`,
      'seo.h3.faq': `常见问题`,
      'seo.faq1': `星陨层数最多 99 层，伤害随层数非线性增长。`,
      'seo.faq2': `所有数据开源，可在 GitHub 查看与贡献。`,
      'seo.faq3': `国内主站：https://stardmg.top/ ；备用镜像（GitHub Pages）：https://bartzh.github.io/roco-star-dmg/。`,

      'noscript.title': `星陨伤害计算器需要启用 JavaScript`,
      'noscript.body': `本工具是一个网页应用，需要在浏览器中启用 JavaScript 才能使用。请启用后刷新页面。`,

      /* ---- Header / navigation ---- */
      'app.title': `星陨伤害计算器`,
      'nav.guide': `使用说明`,
      'nav.data': `数据管理`,
      'nav.announcement': `更新公告`,
      'lang.switch': `EN`,

      /* ---- Challenge bar / setup ---- */
      'challenge.aria': `挑战模式`,
      'challenge.progress.init': `第 1 / 5 题`,
      'challenge.progress': `第 {current} / {total} 题 · 累计 {score} 分`,
      'challenge.done': `挑战完成 · 总分 {score} / {max}`,
      'challenge.toggle': `挑战模式`,
      'challenge.exit': `退出挑战`,
      'challenge.submit': `提交答案`,
      'challenge.next': `下一道题`,
      'challenge.viewResults': `查看结果`,
      'challenge.cannotStart': `无法开始挑战`,
      'challenge.fixedNeedsSpirit': `「固定」池需要{side}已选中精灵。请先在精灵面板中选择，或切换为「全部 / 收藏」池。`,
      'challenge.setup.aria': `挑战设置`,
      'challenge.setup.title': `挑战设置`,
      'challenge.preset': `预设`,
      'challenge.preset.aria': `预设难度`,
      'challenge.easy': `简单`,
      'challenge.standard': `标准`,
      'challenge.hard': `困难`,
      'challenge.count': `题数`,
      'challenge.count.aria': `题数`,
      'challenge.start': `开始挑战`,
      'challenge.answer.aria': `答题结果`,
      'challenge.answer.score': `你的得分`,
      'challenge.answer.scoreUnit': `分`,
      'challenge.answer.optimal': `最优层数`,
      'challenge.answer.optimalUnit': `层`,

      /* ---- Battle panels ---- */
      'battle.aria': `对战配置区`,
      'side.attacker': `攻击方`,
      'side.defender': `防御方`,
      'pool.fixed': `固定`,
      'pool.favorite': `收藏`,
      'pool.all': `全部`,
      'favorite.add.title': `加入收藏`,
      'favorite.add.aria': `收藏当前精灵`,
      'favorite.remove.title': `取消收藏`,
      'favorite.remove.aria': `取消收藏当前精灵`,
      'favorite.reset.title': `重置收藏列表`,
      'favorite.reset.aria': `重置收藏列表为默认`,
      'section.stats': `属性配置`,
      'section.attackSkills': `攻击技能`,
      'section.defenseSkills': `防御技能`,
      'section.optional': `（可选）`,
      'memory.label': `记忆`,
      'memory.title': `是否优先使用记忆配置`,
      'buff.attacker.aria': `攻击方 buff 调节`,
      'buff.defender.aria': `防御方 buff 调节`,
      'powerCombo.aria': `连击数 / 威力 调节`,

      /* ---- Seal / result / breakdown ---- */
      'seal.aria': `星陨印记控制与伤害结果`,
      'seal.label': `星陨层数`,
      'seal.hint': `↔ 拖拽 · 滚轮 · 或滑块调节`,
      'seal.slider.aria': `星陨层数（数值滑块）`,
      'result.aria': `伤害结果`,
      'result.label': `伤害结果`,
      'result.waiting': `选择双方精灵`,
      'breakdown.aria': `伤害计算明细`,
      'breakdown.toggle': `伤害计算明细`,

      /* ---- Footer ---- */
      'footer.copyright': `© 2026 Bartzh · <a href='https://www.wtfpl.net/' target='_blank' rel='noopener noreferrer'>WTFPL</a> · <a href='https://github.com/Bartzh/roco-star-dmg' target='_blank' rel='noopener noreferrer'>开源仓库</a>`,
      'footer.data': `精灵数据来自 <a href='https://wiki.biligame.com/nrc' target='_blank' rel='noopener noreferrer'>BWIKI</a> · 2026-09-10 同步`,
      'footer.license': `精灵立绘与游戏数据版权归官方及 <a href='https://wiki.biligame.com/nrc' target='_blank' rel='noopener noreferrer'>BWIKI</a> 贡献者所有`,

      /* ---- Modal shells ---- */
      'modal.close.aria': `关闭`,
      'info.title': `更新公告`,
      'info.confirm': `我知道了`,
      'confirm.title': `确认操作`,
      'confirm.cancel': `取消`,
      'confirm.ok': `确认`,
      'dataMgr.title': `数据管理`,
      'dataMgr.intro': `本站只保存记忆和收藏的精灵数据在你的浏览器里，不会上传到任何服务器。下面可以开关记忆功能，对数据进行备份、导入或清除。`,
      'dataMgr.memory.title': `自动记忆`,
      'dataMgr.memory.desc': `修改精灵配置时自动保存到本地，下次选择同一精灵时自动恢复（关闭后只是暂停保存功能，不影响已保存数据恢复，若需完全清除数据请点击下方的「删除记忆」）`,
      'dataMgr.memory.switch.title': `开启 / 关闭自动记忆`,
      'dataMgr.clearMemory.title': `删除记忆`,
      'dataMgr.clearMemory.desc': `清除所有精灵的自动记忆配置，不影响当前已选精灵的显示`,
      'dataMgr.clearFav.title': `删除收藏`,
      'dataMgr.clearFav.desc': `清空两侧收藏列表，恢复为默认列表（与精灵面板的「重置收藏」等价）`,
      'dataMgr.export.title': `导出数据`,
      'dataMgr.export.desc': `将所有记忆配置与收藏列表导出为 JSON 文件`,
      'dataMgr.import.title': `导入数据`,
      'dataMgr.import.desc': `从 JSON 文件导入数据，将完全替换现有数据并刷新页面`,
      'dataMgr.delete': `删除`,
      'dataMgr.export': `导出`,
      'dataMgr.import': `导入`,
      'dataMgr.close': `关闭`,

      /* ---- Stats / nature / IV ---- */
      'stat.hp': `生命`,
      'stat.atk': `物攻`,
      'stat.matk': `魔攻`,
      'stat.def': `物防`,
      'stat.mdef': `魔防`,
      'stat.spd': `速度`,
      'stat.nature.title': `性格: {state}`,
      'stat.nature.aria': `{stat} 性格：{state}（点击切换）`,
      'nature.up': `正面`,
      'nature.down': `负面`,
      'nature.unset': `未设置`,
      'stat.iv.title': `个体值: {state}`,
      'stat.iv.aria': `{stat} 个体值：{state}（点击切换）`,
      'iv.selected': `已选`,
      'iv.unselected': `未选`,

      /* ---- Spirit picker / card ---- */
      'spirit.changeAria': `更换{side}精灵（当前：{name}）`,
      'spirit.changeHint': `点击更换`,
      'picker.title.attacker': `选择攻击方精灵`,
      'picker.title.defender': `选择防御方精灵`,
      'picker.cancel': `取消`,
      'picker.cancel.aria': `取消更换`,
      'picker.search.placeholder': `搜索：名称 / 拼音 / 首字母 / 图鉴编号`,
      'picker.search.aria': `搜索精灵`,
      'picker.common.on': `取消"收藏"筛选`,
      'picker.common.off': `只显示收藏精灵`,
      'picker.element.title': `{element}（{tip}）`,
      'picker.element.cancel': `点击取消`,
      'picker.element.max': `最多选 2 个系别`,
      'picker.element.filter': `点击筛选`,
      'picker.option.aria': `选择 {name}{current}`,
      'picker.option.current': `（当前）`,
      'picker.empty': `没有匹配的精灵`,
      'picker.clearFilter': `清除筛选`,

      /* ---- Skills / badges ---- */
      'skills.noAttackSkills': `无可用攻击技能`,
      'skills.none': `无`,
      'skills.custom.placeholder': `自定义技能`,
      'badge.atk': `物攻`,
      'badge.matk': `魔攻`,
      'badge.auto': `自适应`,
      'badge.power': `威力 {power}`,
      'badge.reduction': `减伤 {pct}%`,

      /* ---- Result chips / waiting / errors ---- */
      'result.super': `克制`,
      'result.resist': `抵抗`,
      'result.starSuper': `星陨克制`,
      'result.starResist': `星陨抵抗`,
      'result.illusionNone': `幻系不触发`,
      'result.overflow': `溢出 {n}`,
      'result.ignoreResist': `无视抵抗`,
      'result.ignoreResist.title': `原抵抗 ×{eff} 已被虫击·应对状态忽略`,
      'result.dmgLine': `技能 <strong>{skill}</strong> · 星陨 <strong class="star-val">{star}</strong>`,
      'waiting.pickBoth': `选择双方精灵开始计算`,
      'waiting.pickAttacker': `选择攻击方精灵`,
      'waiting.pickDefender': `选择防御方精灵`,
      'waiting.noAttackSkills': `该攻击方无可用攻击技能`,
      'waiting.submitFirst': `提交答案后计算结果`,
      'load.error': `数据加载失败: {msg}<br><br>若用 file:// 打开，请先执行 <code>python build.py</code> 生成 calculator.built.html。`,

      /* ---- Buff chips / mod icon ---- */
      'buffLabel.atk': `物攻`,
      'buffLabel.matk': `魔攻`,
      'buffLabel.def': `物防`,
      'buffLabel.mdef': `魔防`,
      'buffLabel.speed': `速度`,
      'buffLabel.power': `威力`,
      'buffLabel.combo': `连击`,
      'buff.adjust.aria': `{label} 调整（当前 {value}，左右拖动或滚轮调整 / shift+滚轮精细调整 / 双击重置）`,
      'buff.adjust.aria.combo': `{label} 调整（当前 {value}，左右拖动或滚轮调整 / 双击重置）`,
      'buff.title': `左右拖动或滚轮调整 · shift+滚轮精细调整 · 双击重置`,
      'buff.title.combo': `左右拖动或滚轮调整 · 双击重置`,
      'mod.title': `{name}：{desc}`
    },

    en: {
      /* ---- Meta / SEO ---- */
      'meta.title': `Starfall Damage Calculator – Roco Kingdom: World PvP Damage Simulator`,
      'meta.description': `An online Starfall damage calculator with custom attacker/defender stats, natures, buffs, combo counts and Starfall layers. Simulates PvP damage and remaining HP in real time. Data from BWIKI, open source and free.`,
      'meta.keywords': `starfall damage calculator,starfall,Roco Kingdom World damage calculator,Roco Kingdom PvP,starfall layers,damage simulator,starfall mark,spirit battle calculator`,
      'jsonld.name': `Roco Kingdom Starfall Damage Calculator`,
      'jsonld.alternateName': `洛克王国星陨伤害计算器`,
      'jsonld.description': `An online PvP damage simulator for Roco Kingdom: World with custom spirit stats, buffs, combo counts and Starfall layers.`,
      'jsonld.inLanguage': `en`,

      'seo.h2': `How to use the Roco Kingdom Starfall Damage Calculator`,
      'seo.intro': `This tool simulates Starfall damage in Roco Kingdom: World PvP battles. Choose an attacker and a defender, then adjust base stats, nature, IVs, buffs, combo count and Starfall layers (0–99) to see damage, remaining HP percentage and every multiplier in the full damage formula in real time. Data source: BWIKI.`,
      'seo.h3.features': `Key features`,
      'seo.feature1': `Attacker and defender panels with an inline spirit picker (search by name, pinyin, initials or dex number).`,
      'seo.feature2': `An 18-class type effectiveness table with live weakness and resistance calculations.`,
      'seo.feature3': `Automatically reads combo-count power boosts and damage reduction from skill descriptions.`,
      'seo.feature4': `Adjustable attack, defense, power, combo and speed buffs.`,
      'seo.feature5': `Starfall mark energy (0–99) with visualization and pulse animation.`,
      'seo.h3.faq': `FAQ`,
      'seo.faq1': `Starfall layers cap at 99; damage grows non-linearly with each layer.`,
      'seo.faq2': `All data is open source and can be viewed or contributed to on GitHub.`,
      'seo.faq3': `Primary site: https://stardmg.top/ ; mirror (GitHub Pages): https://bartzh.github.io/roco-star-dmg/.`,

      'noscript.title': `The Starfall Damage Calculator requires JavaScript`,
      'noscript.body': `This tool is a web app and requires JavaScript to run. Please enable JavaScript and reload the page.`,

      /* ---- Header / navigation ---- */
      'app.title': `Starfall Damage Calculator`,
      'nav.guide': `How to Use`,
      'nav.data': `Data Management`,
      'nav.announcement': `Updates`,
      'lang.switch': `中文`,

      /* ---- Challenge bar / setup ---- */
      'challenge.aria': `Challenge Mode`,
      'challenge.progress.init': `Question 1 / 5`,
      'challenge.progress': `Question {current} / {total} · Total {score} pts`,
      'challenge.done': `Challenge complete · Total {score} / {max}`,
      'challenge.toggle': `Challenge Mode`,
      'challenge.exit': `Exit Challenge`,
      'challenge.submit': `Submit Answer`,
      'challenge.next': `Next Question`,
      'challenge.viewResults': `View Results`,
      'challenge.cannotStart': `Cannot Start Challenge`,
      'challenge.fixedNeedsSpirit': `The "Fixed" pool requires a selected {side} spirit. Select one in the spirit panel first, or switch to "All / Favorites".`,
      'challenge.setup.aria': `Challenge setup`,
      'challenge.setup.title': `Challenge Setup`,
      'challenge.preset': `Preset`,
      'challenge.preset.aria': `Preset difficulty`,
      'challenge.easy': `Easy`,
      'challenge.standard': `Standard`,
      'challenge.hard': `Hard`,
      'challenge.count': `Questions`,
      'challenge.count.aria': `Number of questions`,
      'challenge.start': `Start Challenge`,
      'challenge.answer.aria': `Answer result`,
      'challenge.answer.score': `Your score`,
      'challenge.answer.scoreUnit': `pts`,
      'challenge.answer.optimal': `Optimal layers`,
      'challenge.answer.optimalUnit': `layers`,

      /* ---- Battle panels ---- */
      'battle.aria': `Battle configuration`,
      'side.attacker': `Attacker`,
      'side.defender': `Defender`,
      'pool.fixed': `Fixed`,
      'pool.favorite': `Favorites`,
      'pool.all': `All`,
      'favorite.add.title': `Add to favorites`,
      'favorite.add.aria': `Favorite this spirit`,
      'favorite.remove.title': `Remove from favorites`,
      'favorite.remove.aria': `Remove this spirit from favorites`,
      'favorite.reset.title': `Reset favorites`,
      'favorite.reset.aria': `Reset favorites to default`,
      'section.stats': `Stats`,
      'section.attackSkills': `Attacking Skills`,
      'section.defenseSkills': `Defending Skills`,
      'section.optional': ` (optional)`,
      'memory.label': `Memory`,
      'memory.title': `Prefer the remembered configuration`,
      'buff.attacker.aria': `Attacker buff adjustments`,
      'buff.defender.aria': `Defender buff adjustments`,
      'powerCombo.aria': `Combo / Power adjustments`,

      /* ---- Seal / result / breakdown ---- */
      'seal.aria': `Starfall seal controls and damage result`,
      'seal.label': `Starfall Layers`,
      'seal.hint': `↔ Drag · scroll · or use the slider`,
      'seal.slider.aria': `Starfall layers (slider)`,
      'result.aria': `Damage result`,
      'result.label': `Damage Result`,
      'result.waiting': `Select both spirits`,
      'breakdown.aria': `Damage breakdown`,
      'breakdown.toggle': `Damage Breakdown`,

      /* ---- Footer ---- */
      'footer.copyright': `© 2026 Bartzh · <a href='https://www.wtfpl.net/' target='_blank' rel='noopener noreferrer'>WTFPL</a> · <a href='https://github.com/Bartzh/roco-star-dmg' target='_blank' rel='noopener noreferrer'>Source Repository</a>`,
      'footer.data': `Spirit data from <a href='https://wiki.biligame.com/nrc' target='_blank' rel='noopener noreferrer'>BWIKI</a> · Synced 2026-09-10`,
      'footer.license': `Spirit artwork and game data are © the official game and <a href='https://wiki.biligame.com/nrc' target='_blank' rel='noopener noreferrer'>BWIKI</a> contributors.`,

      /* ---- Modal shells ---- */
      'modal.close.aria': `Close`,
      'info.title': `Update Announcement`,
      'info.confirm': `Got it`,
      'confirm.title': `Confirm Action`,
      'confirm.cancel': `Cancel`,
      'confirm.ok': `Confirm`,
      'dataMgr.title': `Data Management`,
      'dataMgr.intro': `This site only stores remembered and favorited spirit data in your browser; nothing is uploaded to any server. Below you can toggle memory, back up, import or clear your data.`,
      'dataMgr.memory.title': `Auto Memory`,
      'dataMgr.memory.desc': `Saves spirit configurations locally when you change them and restores them the next time you select the same spirit. Turning it off only pauses saving; existing data can still be restored. To erase data completely, use "Delete Memory" below.`,
      'dataMgr.memory.switch.title': `Toggle auto memory`,
      'dataMgr.clearMemory.title': `Delete Memory`,
      'dataMgr.clearMemory.desc': `Clears all spirits' automatically remembered configurations. Currently selected spirits are not affected.`,
      'dataMgr.clearFav.title': `Delete Favorites`,
      'dataMgr.clearFav.desc': `Clears both favorite lists and restores the default list (same as "Reset Favorites" in the spirit panels).`,
      'dataMgr.export.title': `Export Data`,
      'dataMgr.export.desc': `Exports all remembered configurations and favorite lists as a JSON file`,
      'dataMgr.import.title': `Import Data`,
      'dataMgr.import.desc': `Imports data from a JSON file. This fully replaces existing data and reloads the page.`,
      'dataMgr.delete': `Delete`,
      'dataMgr.export': `Export`,
      'dataMgr.import': `Import`,
      'dataMgr.close': `Close`,

      /* ---- Stats / nature / IV ---- */
      'stat.hp': `HP`,
      'stat.atk': `ATK`,
      'stat.matk': `MATK`,
      'stat.def': `DEF`,
      'stat.mdef': `MDEF`,
      'stat.spd': `SPD`,
      'stat.nature.title': `Nature: {state}`,
      'stat.nature.aria': `{stat} nature: {state} (click to toggle)`,
      'nature.up': `boosted`,
      'nature.down': `reduced`,
      'nature.unset': `not set`,
      'stat.iv.title': `IV: {state}`,
      'stat.iv.aria': `{stat} IV: {state} (click to toggle)`,
      'iv.selected': `selected`,
      'iv.unselected': `not selected`,

      /* ---- Spirit picker / card ---- */
      'spirit.changeAria': `Change {side} spirit (current: {name})`,
      'spirit.changeHint': `Click to change`,
      'picker.title.attacker': `Select attacker spirit`,
      'picker.title.defender': `Select defender spirit`,
      'picker.cancel': `Cancel`,
      'picker.cancel.aria': `Cancel changing spirit`,
      'picker.search.placeholder': `Search: name / pinyin / initials / dex no.`,
      'picker.search.aria': `Search spirits`,
      'picker.common.on': `Remove the favorites filter`,
      'picker.common.off': `Show favorites only`,
      'picker.element.title': `{element} ({tip})`,
      'picker.element.cancel': `click to clear`,
      'picker.element.max': `up to 2 classes`,
      'picker.element.filter': `click to filter`,
      'picker.option.aria': `Select {name}{current}`,
      'picker.option.current': ` (current)`,
      'picker.empty': `No matching spirits`,
      'picker.clearFilter': `Clear filters`,

      /* ---- Skills / badges ---- */
      'skills.noAttackSkills': `No attacking skills available`,
      'skills.none': `None`,
      'skills.custom.placeholder': `Custom skill`,
      'badge.atk': `Physical`,
      'badge.matk': `Magic`,
      'badge.auto': `Adaptive`,
      'badge.power': `Power {power}`,
      'badge.reduction': `Reduction {pct}%`,

      /* ---- Result chips / waiting / errors ---- */
      'result.super': `Super effective`,
      'result.resist': `Resisted`,
      'result.starSuper': `Starfall super effective`,
      'result.starResist': `Starfall resisted`,
      'result.illusionNone': `No Starfall (Stellar skill)`,
      'result.overflow': `Overflow {n}`,
      'result.ignoreResist': `Ignores resistance`,
      'result.ignoreResist.title': `Original resistance ×{eff} ignored by Swarm Strike · Counter`,
      'result.dmgLine': `Skill <strong>{skill}</strong> · Starfall <strong class="star-val">{star}</strong>`,
      'waiting.pickBoth': `Select both spirits to start calculating`,
      'waiting.pickAttacker': `Select an attacker spirit`,
      'waiting.pickDefender': `Select a defender spirit`,
      'waiting.noAttackSkills': `This attacker has no attacking skills`,
      'waiting.submitFirst': `Results appear after you submit`,
      'load.error': `Failed to load data: {msg}<br><br>If you opened this file via <code>file://</code>, run <code>python build.py</code> first to generate <code>calculator.built.html</code>.`,

      /* ---- Buff chips / mod icon ---- */
      'buffLabel.atk': `ATK`,
      'buffLabel.matk': `MATK`,
      'buffLabel.def': `DEF`,
      'buffLabel.mdef': `MDEF`,
      'buffLabel.speed': `SPD`,
      'buffLabel.power': `Power`,
      'buffLabel.combo': `Combo`,
      'buff.adjust.aria': `{label} adjustment (current {value}; drag or scroll to change / Shift+scroll for fine steps / double-click to reset)`,
      'buff.adjust.aria.combo': `{label} adjustment (current {value}; drag or scroll to change / double-click to reset)`,
      'buff.title': `Drag or scroll to adjust · Shift+scroll for fine steps · Double-click to reset`,
      'buff.title.combo': `Drag or scroll to adjust · Double-click to reset`,
      'mod.title': `{name}: {desc}`
    }
  };

  const warned = new Set();

  function normalizeLocale(value) {
    if (!value) return null;
    const v = String(value).toLowerCase();
    if (v.startsWith('zh')) return 'zh-CN';
    if (v.startsWith('en')) return 'en';
    return null;
  }

  function detectLocale() {
    const fromQuery = normalizeLocale(new URLSearchParams(window.location.search).get('lang'));
    if (fromQuery) return fromQuery;
    if (/\/en(\/|$)/.test(window.location.pathname)) return 'en';
    try {
      const saved = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
      if (saved) return saved;
    } catch (_) { /* localStorage 不可用时忽略 */ }
    return normalizeLocale(navigator.language) || DEFAULT_LOCALE;
  }

  const locale = detectLocale();

  function lookup(dictLocale, key) {
    const dict = DICTS[dictLocale];
    return dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : null;
  }

  /**
   * 取文案。当前语言缺失时回退中文；中文也缺失时返回 key 并在控制台告警。
   * 插值格式：{name}
   */
  function t(key, params) {
    let text = lookup(locale, key);
    if (text == null) text = lookup(DEFAULT_LOCALE, key);
    if (text == null) {
      if (!warned.has(key)) {
        warned.add(key);
        console.warn('[i18n] missing key:', key);
      }
      return key;
    }
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    );
  }

  function isEn() {
    return locale === 'en';
  }

  function parsePairs(raw) {
    return String(raw || '')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map(pair => {
        const idx = pair.indexOf(':');
        return idx < 0
          ? [pair.trim(), '']
          : [pair.slice(0, idx).trim(), pair.slice(idx + 1).trim()];
      });
  }

  function applyI18n(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    scope.querySelectorAll('[data-i18n-attr]').forEach(el => {
      parsePairs(el.dataset.i18nAttr).forEach(([attr, key]) => {
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
    scope.querySelectorAll('script[data-i18n-jsonld]').forEach(script => {
      let obj;
      try {
        obj = JSON.parse(script.textContent);
      } catch (_) {
        return;
      }
      parsePairs(script.dataset.i18nJsonld).forEach(([field, key]) => {
        if (field && key) obj[field] = t(key);
      });
      script.textContent = JSON.stringify(obj, null, 2);
    });
    document.documentElement.lang = locale;
  }

  function switchLocale(next) {
    const target = normalizeLocale(next) || (isEn() ? DEFAULT_LOCALE : 'en');
    try {
      window.localStorage.setItem(STORAGE_KEY, target);
    } catch (_) { /* 忽略 */ }
    const url = new URL(window.location.href);
    url.searchParams.set('lang', target === 'en' ? 'en' : 'zh');
    window.location.href = url.toString();
  }

  function bindLangToggle() {
    const btn = document.getElementById('lang-toggle');
    if (!btn || btn.__i18nBound) return;
    btn.__i18nBound = true;
    btn.addEventListener('click', () => switchLocale(isEn() ? DEFAULT_LOCALE : 'en'));
  }

  function boot() {
    applyI18n();
    bindLangToggle();
  }

  window.I18N = {
    locale,
    supported: SUPPORTED.slice(),
    t,
    isEn,
    switchLocale,
    applyI18n
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
