// ============================================================
// DATA: 18 element types
// ============================================================
const ELEMENTS = {
  '普通': { name: '普通', emoji: '⚪', color: '#3f89b4' },
  '草':   { name: '草',   emoji: '🌿', color: '#4ebc73' },
  '火':   { name: '火',   emoji: '🔥', color: '#db5525' },
  '水':   { name: '水',   emoji: '🌊', color: '#6aa9fe' },
  '光':   { name: '光',   emoji: '✨', color: '#50c0ff' },
  '地':   { name: '地',   emoji: '⛰️', color: '#9a7e3f' },
  '冰':   { name: '冰',   emoji: '❄️', color: '#5faddd' },
  '龙':   { name: '龙',   emoji: '🐉', color: '#ed4962' },
  '电':   { name: '电',   emoji: '⚡', color: '#e7c506' },
  '毒':   { name: '毒',   emoji: '☠️', color: '#ba62e0' },
  '虫':   { name: '虫',   emoji: '🐛', color: '#9ece21' },
  '武':   { name: '武',   emoji: '🥊', color: '#ff9636' },
  '翼':   { name: '翼',   emoji: '🦅', color: '#3ec7ca' },
  '萌':   { name: '萌',   emoji: '🌸', color: '#fc7cac' },
  '幽':   { name: '幽',   emoji: '👻', color: '#9446ec' },
  '恶':   { name: '恶',   emoji: '😈', color: '#cf467a' },
  '机械': { name: '机械', emoji: '⚙️', color: '#40cba9' },
  '幻':   { name: '幻',   emoji: '🔮', color: '#9fa7f8' }
};
const FALLBACK_EL = { name: '无', emoji: '❔', color: '#666666' };

// elOf 的预计算查找表：把 rawName 直接映射到元素对象。
// 预填：每个 ELEMENTS key 的 "X" 和 "X系" 两种写法 + 3 个会回落到 FALLBACK_EL 的特殊输入。
// 存的是对象引用，augmentElementsWithTypes 后续追加的 iconUrl 也能透出。
const ELEMENT_BY_RAW = new Map();
(function buildElementAliasMap() {
  for (const key of Object.keys(ELEMENTS)) {
    ELEMENT_BY_RAW.set(key, ELEMENTS[key]);
    ELEMENT_BY_RAW.set(key + '系', ELEMENTS[key]);
  }
  ELEMENT_BY_RAW.set('无系别', FALLBACK_EL);
  ELEMENT_BY_RAW.set('空', FALLBACK_EL);
  ELEMENT_BY_RAW.set('', FALLBACK_EL);
})();

// Strip trailing 系 (e.g. "草系" -> "草")
function stripXi(name) {
  if (!name) return '';
  return name.endsWith('系') ? name.slice(0, -1) : name;
}
function elOf(rawName) {
  if (rawName == null) return FALLBACK_EL;
  return ELEMENT_BY_RAW.get(rawName) || FALLBACK_EL;
}

// ============================================================
// DATA: Load from inline <script type="application/json"> if present,
// else fetch from the same directory (requires a local server).
// ============================================================
let SPRITES = {};
let SKILLS = {};
let TYPES = {};
let OTHERS = {};

// 预计算的 sprite 列表。filterSpirits 在每次按键/筛选时遍历。
// 一次性 Object.entries 即可避免每次按键都重新分配临时数组。
let SPRITES_ENTRIES = [];

async function loadData() {
  const inlineSprites = document.getElementById('sprites-data');
  if (inlineSprites) {
    // Built version: data was injected by build.py
    SPRITES = JSON.parse(inlineSprites.textContent);
    SKILLS  = JSON.parse(document.getElementById('skills-data').textContent);
    TYPES   = JSON.parse(document.getElementById('types-data').textContent);
    OTHERS  = JSON.parse(document.getElementById('others-data').textContent);
  } else {
    // Source version: fetch from the same directory
    const f = (p) => fetch(p).then(r => {
      if (!r.ok) throw new Error(p + ' -> HTTP ' + r.status);
      return r.json();
    });
    [SPRITES, SKILLS, TYPES, OTHERS] = await Promise.all([
      f('datas/final/sprites.json'),
      f('datas/final/skills.json'),
      f('datas/final/types.json'),
      f('datas/final/others.json')
    ]);
  }
  augmentElementsWithTypes();
  // 此时 SPRITES 已是最终值，预计算 entries 供 filterSpirits 复用。
  SPRITES_ENTRIES = Object.entries(SPRITES);
}

// Merge iconUrl from TYPES into ELEMENTS (so elOf(...).iconUrl works for skill-card overlays)
function augmentElementsWithTypes() {
  for (const key of Object.keys(TYPES || {})) {
    if (ELEMENTS[key] && TYPES[key] && TYPES[key].iconUrl) {
      ELEMENTS[key].iconUrl = TYPES[key].iconUrl;
    }
  }
}

// Build skill arrays (ATTACK / DEFENSE category index)
const ATTACK_SKILLS = {};
const DEFENSE_SKILLS = {};
function buildSkillIndices() {
  ATTACK_SKILLS && Object.keys(ATTACK_SKILLS).forEach(k => delete ATTACK_SKILLS[k]);
  DEFENSE_SKILLS && Object.keys(DEFENSE_SKILLS).forEach(k => delete DEFENSE_SKILLS[k]);
  for (const [id, s] of Object.entries(SKILLS)) {
    if (s.category === '攻击') ATTACK_SKILLS[id] = s;
    else if (s.category === '防御') DEFENSE_SKILLS[id] = s;
  }
}

// ============================================================
// STATE
// ============================================================
// Stat keys in display order
const STAT_KEYS = ['hp', 'atk', 'matk', 'def', 'mdef', 'spd'];
const STAT_LABELS = { hp: '生命', atk: '物攻', matk: '魔攻', def: '物防', mdef: '魔防', spd: '速度' };
const MAX_IV = 3;
const IV_BONUS = 60;

// Defaults: attacker = +SPD/-HP nature, IVs in [ATK, MATK, SPD]
//           defender = +HP/-ATK nature, IVs in [HP, DEF, MDEF]
const DEFAULT_NATURE = {
  attacker: { up: 'spd', down: 'hp' },
  defender: { up: 'hp',  down: 'atk' }
};
const DEFAULT_IVS = {
  attacker: ['atk', 'matk', 'spd'],
  defender: ['hp',  'def',  'mdef']
};

// ============================================================
// 按精灵 × side 维度的性格 / 个体值自动保存（localStorage）。无 UI：
// 每次修改后写入独立的 localStorage key；下次选中同一只精灵
// 同一侧时优先加载；若无存档则回退到该侧默认值。同一只精灵
// 在攻击方 / 防御方各存一份独立配置，互不干扰。
// 存储键格式 `spirit-config:v1:<id>:<side>`：每条 entry 一个 key，
// 读写都是 O(1)，不需要 parse / stringify 整个 store。
// ============================================================
const SPIRIT_CONFIG_KEY_PREFIX = 'roco-star-dmg:spirit-config:v1:';
const VALID_SIDES = new Set(['attacker', 'defender']);
const VALID_STAT_KEYS = new Set(['hp', 'atk', 'matk', 'def', 'mdef', 'spd']);

function _spiritConfigKey(id, side) {
  return SPIRIT_CONFIG_KEY_PREFIX + id + ':' + side;
}

// 返回 { nature: {up, down}, ivs: [statKey,...] }；无存档或数据
// 不合法时返回 null。
function loadSpiritConfig(id, side) {
  if (!id || !VALID_SIDES.has(side)) return null;
  let raw;
  try {
    raw = localStorage.getItem(_spiritConfigKey(id, side));
  } catch (_) {
    return null;
  }
  if (!raw) return null;
  let entry;
  try {
    entry = JSON.parse(raw);
  } catch (_) {
    return null;
  }
  if (!entry || typeof entry !== 'object') return null;
  const natureRaw = entry.nature;
  if (!natureRaw || typeof natureRaw !== 'object') return null;
  const up   = VALID_STAT_KEYS.has(natureRaw.up)   ? natureRaw.up   : null;
  const down = VALID_STAT_KEYS.has(natureRaw.down) ? natureRaw.down : null;
  // 合法性格要求 up ≠ down（两者都可为 null 表示"未设置"）。
  if (up && up === down) return null;
  const ivsRaw = Array.isArray(entry.ivs) ? entry.ivs : null;
  if (!ivsRaw) return null;
  const ivs = [];
  for (const k of ivsRaw) {
    if (VALID_STAT_KEYS.has(k) && ivs.length < MAX_IV && !ivs.includes(k)) {
      ivs.push(k);
    }
  }
  return { nature: { up, down }, ivs };
}

function saveSpiritConfig(id, side, nature, ivs) {
  if (!id || !VALID_SIDES.has(side)) return;
  const entry = {
    nature: { up: nature.up ?? null, down: nature.down ?? null },
    ivs: ivs.slice()
  };
  try {
    localStorage.setItem(_spiritConfigKey(id, side), JSON.stringify(entry));
  } catch (_) { /* 配额超限 / 存储被禁用 —— 静默忽略 */ }
}

let state = {
  attacker: null,        // {id, ...SPRITES[id]}
  defender: null,
  attackSkill: null,     // full skill object (SKILLS[id])
  attackSkillIdx: -1,
  defenseSkill: null,    // full skill object (SKILLS[id]) or null = "无"
  defenseSkillIdx: 0,    // 0 = "无"
  starLayer: 0,
  // 精灵面板是否处于“选择中”状态（true 时渲染内嵌选择器而非卡片）
  spiritPicking: { attacker: false, defender: false },
  // 精灵选择器内临时筛选/搜索状态。每次进入选择器时重置；
  // 退出选择器（选中或取消）后丢弃。
  //   text    : 搜索框原文（实时、原文大小写）
  //   common  : 是否启用"常见"过滤
  //   elements: 当前选中的系别 key 集合（最多 2 个；OR 关系）
  spiritPickerFilter: {
    attacker: { text: '', common: false, elements: new Set() },
    defender: { text: '', common: false, elements: new Set() },
  },
  // Per-side nature { up: statKey|null, down: statKey|null } and IVs (array of statKeys)
  attackerNature: { up: null, down: null },
  defenderNature: { up: null, down: null },
  attackerIVs: [],
  defenderIVs: [],
  // Per-side adjustable buff (in %): attacker buffs attack stats; defender buffs defense stats
  // Range [-990, +990], step 10; default 0 (no modification)
  attackerBuff: { atk: 0, matk: 0 },
  defenderBuff: { def: 0, mdef: 0 },
  // Attacker's 威力 chip: flat addition to skill power (in absolute
  // damage points, not %). Range [-990, +990], step 10; default 0.
  // Always shown in the attacker panel regardless of pet selection.
  attackerPowerBoost: 0,
  // Attacker's 连击数 chip: flat addition to skill combo count.
  // Range [-99, +99], step 1; default 0. Always shown in the
  // attacker panel regardless of pet selection.
  attackerCombo: 0,
  // Per-side 速度 (speed) chip: flat addition to the pet's speed stat.
  // Range [-990, +990], step 10; default 0. Always shown on BOTH
  // attacker and defender panels.
  attackerSpeed: 0,
  defenderSpeed: 0,
  // 挑战模式状态（UI 控件 + 用户偏好 + 答题运行时）
  //   active      : 是否处于挑战设置阶段（chip 可见）
  //   preset/count/pool/randomStats/randomSkill：用户偏好，退出答题时保留
  //   running     : 是否处于答题阶段（精灵面板锁定）
  //   phase       : 'idle' | 'picking'（已出题未提交）| 'answered'（已提交）
  //   current     : 当前题号（0-based）
  //   total       : 总题数（备份 = count，便于无依赖显示）
  //   questions   : 全部题目快照（生成时确定下来），每元素含双方精灵/性格/IVs/buffs/speed/skillId/defHP
  //   scores      : 每题 {layer, optimal, isKill, score}，提交时 push
  //   totalScore  : 累计分
  //   transitionGen  : 启动任何"挑战相关过渡动画"时 +1；onfinish 回调里检查 token
  //                    是否还匹配，不匹配说明已被新动画接管、本次回调 no-op。
  //                    修复快速连点 toggle / submit 时多组 onfinish 互相反扑。
  //   answerShown    : 答题结果区（.challenge-answer-result）是否"应在显示中"。
  //                    替代原来"body.classList.contains('challenge-answered')"判断——
  //                    后者在 _showAnswerResult 的 fadeOut 还没结束时为 false，
  //                    导致 _hideAnswerResult 早返回 → exitChallenge 提前清 body class
  //                    → 220ms 后 _showAnswerResult 反向加回 → 答案信息残留。
  //   answerAnimating: _showAnswerResult / _hideAnswerResult 正在播 220ms 过渡动画。
  //                    submit/toggle 按钮 click handler 在此期间忽略点击，
  //                    防止快速连点串起"submit → nextQuestion → 下一题 submit"链。
  //   toggleAnimating: enterChallengeMode / exitChallengeMode 正在播 440ms 过渡动画。
  //                    toggle 按钮 click handler 在此期间忽略点击（2026-07-18 加），
  //                    防止连点触发"enter + exit 完整 880ms 动画、视觉上闪两次"。
  //                    末尾 onfinish 内释放（gen 守卫，与 transitionGen 配套）。
  challenge: {
    active: false,
    preset: 'easy',
    count: 5,
    pool: { attacker: 'common', defender: 'common' },
    randomStats: { attacker: true, defender: true },
    randomSkill: { attacker: true, defender: true },
    running: false,
    phase: 'idle',
    current: 0,
    total: 0,
    questions: [],
    scores: [],
    totalScore: 0,
    transitionGen: 0,
    answerShown: false,
    answerAnimating: false,
    toggleAnimating: false,
  },
};

function getNature(side)  { return side === 'attacker' ? state.attackerNature : state.defenderNature; }
function getIVs(side)     { return side === 'attacker' ? state.attackerIVs    : state.defenderIVs; }
function setNature(side, n) {
  if (side === 'attacker') state.attackerNature = n;
  else                     state.defenderNature = n;
}
function setIVs(side, ivs) {
  if (side === 'attacker') state.attackerIVs = ivs;
  else                     state.defenderIVs = ivs;
}
function getBuff(side, stat) {
  const obj = side === 'attacker' ? state.attackerBuff : state.defenderBuff;
  return obj[stat] || 0;
}
function setBuff(side, stat, val) {
  const clamped = Math.max(-990, Math.min(990, Math.round(val / 10) * 10));
  if (side === 'attacker') state.attackerBuff[stat] = clamped;
  else                     state.defenderBuff[stat] = clamped;
}
function formatBuff(val) {
  if (val > 0) return '+' + val + '%';
  if (val < 0) return val + '%';   // already has minus sign
  return '+0%';
}

// ============================================================
// 固定攻击技能：愿力冲击（每个系别一种，共18种）
// 类似防御方的"无"和"聚能"，始终附加在攻击技能列表末尾。
// 特殊机制：伤害类型由精灵当前最终物攻/魔攻（含 buff）中
// 较高者决定（物攻 ≥ 魔攻 → 物攻；否则魔攻）。在 SKILL_MODS
// 中以 modKey='__yuanli__' 注册共用效果：应对状态 +150% 威力。
// ============================================================
const YUANLI_SKILLS = Object.keys(ELEMENTS).map(el => ({
  id: '__yuanli_' + el + '__',
  name: '愿力冲击',
  category: '攻击',
  element: el + '系',
  damage_class: '自适应',
  power: 80,
  modKey: '__yuanli__',
  desc: '造成伤害，伤害类型取决于精灵双攻更高的一项，应对状态：本次威力+150%。',
  icon_url: `./images/愿力冲击_${el}.webp`
}));

// Build defense skill list for a given defender (defense category only, plus "无" pseudo)
function getDefenseSkillOptions(defender) {
  const opts = [
    { id: '__none__', name: '无', reduction: 1, _pseudo: true },
    { id: '__state__', name: '聚能', category: '状态', desc: '用于使攻击方能够应对状态。', icon_url: './images/聚能.webp' }
  ];
  if (!defender) return opts;
  for (const sid of (defender.skills || [])) {
    const s = SKILLS[sid];
    if (s && s.category === '防御') opts.push(s);
  }
  return opts;
}
function getAttackSkillOptions(attacker) {
  if (!attacker) return YUANLI_SKILLS.slice();
  const out = [];
  for (const sid of (attacker.skills || [])) {
    const s = SKILLS[sid];
    if (s && s.category === '攻击') out.push(s);
  }
  // Append fixed 愿力冲击 skills (one per element) at the end.
  out.push(...YUANLI_SKILLS);
  return out;
}

// ============================================================
// STAT MODIFIERS: nature (×1.2 / ×0.9) and IVs (+60 each, max 3)
// Final stat formula (rounded):
//   HP:    (base * 1.7 + ivBonus * 0.85 + 70) * natureMult + 100
//   other: (base * 1.1 + ivBonus * 0.55 + 10) * natureMult + 50
// ============================================================
function getNatureMultiplier(nature, statKey) {
  if (!nature) return 1;
  if (nature.up   === statKey) return 1.2;
  if (nature.down === statKey) return 0.9;
  return 1;
}
function getIVBonus(statKey, ivs) {
  if (!ivs || !ivs.includes(statKey)) return 0;
  return IV_BONUS;
}
function getFinalStat(spirit, statKey, nature, ivs) {
  if (!spirit) return 0;
  const base = spirit[statKey] || 0;
  const iv = getIVBonus(statKey, ivs);
  const mult = getNatureMultiplier(nature, statKey);
  let val;
  if (statKey === 'hp') {
    val = (base * 1.7 + iv * 0.85 + 70) * mult + 100;
  } else {
    // 特殊情况：向下取整
    if (base === 105 && iv === 0 && mult === 1) {
      val = 175;
    }
    else {
      val = Math.round(base * 1.1 + iv * 0.55 + 10) * mult + 50;
    }
  }
  return Math.round(val);
}

// ============================================================
// STAB (Same-Type Attack Bonus): ×1.25 if the skill's element
// matches any of the attacker's types. Applied BEFORE type
// effectiveness. Star damage does NOT receive STAB.
// `elementOverride` (optional) replaces skill.element — used by
// dynamic modifiers (e.g. 展翅) to change the effective element
// without mutating the underlying skill data.
// ============================================================
function getStabMultiplier(attacker, skill, elementOverride) {
  const element = elementOverride || (skill && skill.element);
  if (!attacker || !element) return 1;
  const skillEl = stripXi(element);
  if (!skillEl || !ELEMENTS[skillEl]) return 1;
  const attackerTypes = (attacker.types || []).map(t => stripXi(t));
  if (attackerTypes.includes(skillEl)) return 1.25;
  return 1;
}

// ============================================================
// EFFECTIVENESS: 攻击方属性 vs 防御方属性
// 双重克制：3倍，双重抵抗：0.25倍
// ============================================================
function effectiveness(skillElementRaw, defenderTypesRaw) {
  if (!skillElementRaw || skillElementRaw === '无系别' || skillElementRaw === '空') return 1;
  const atkName = stripXi(skillElementRaw);
  if (!TYPES[atkName]) return 1;
  let weak = 0, resist = 0;
  for (const dt of (defenderTypesRaw || [])) {
    const def = TYPES[stripXi(dt)];
    if (!def) continue;
    // 防御方的弱点列表中包含攻击方属性 ⇒ 攻击方克制防御方
    if (def.defendWeak && def.defendWeak.includes(atkName)) weak++;
    // 防御方的强防列表中包含攻击方属性 ⇒ 防御方抵抗攻击方
    if (def.defendStrong && def.defendStrong.includes(atkName)) resist++;
  }
  const diff = weak - resist;
  if (diff === 0) return 1;
  else if (diff === 1) return 2;
  else if (diff === -1) return 0.5;
  else if (diff === 2) return 3;
  else if (diff === -2) return 0.25;
  return (1 + weak) / (1 + resist);
}

// ============================================================
// STAR BACKGROUND, PARTICLES, SEAL
// ============================================================
// STAR BACKGROUND — multi-layer parallax
// 概念：Stellar Stratigraphy — 星空按深度分三层（远/中/近），
//   每层有独立的密度、大小、闪烁节奏与色彩温度。
//   鼠标位置作为"视点"驱动每层以不同比例的偏移（视差）。
//   颜色与圆盘 seal-glow 严格同步，呼应"星陨"主题。
// 种子化随机：固定种子保证每次刷新星空布局可复现。
// ============================================================
let starLayers = [];
let starCanvas, starCtx;
let mouseParallax = { x: 0, y: 0 };
let starTargetParallax = { x: 0, y: 0 };

const STAR_SEED = 0x5A7C0E;          // 固定种子：星空布局每次刷新都一致
const PARALLAX_EASE = 0.06;          // 鼠标→视差平滑系数（越小越柔）

// mulberry32：可种子化的伪随机生成器，确定性优于 Math.random。
function mulberry32(seed) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initStarCanvas() {
  starCanvas = document.getElementById('star-canvas');
  starCtx = starCanvas.getContext('2d');

  // 仅在有精细指针（鼠标）的设备上追踪移动 —— 触屏设备保持居中避免抖动。
  if (window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('mousemove', onStarMouseMove, { passive: true });
  }
  window.addEventListener('resize', resizeStarCanvas);
  resizeStarCanvas();
  requestAnimationFrame(drawStarCanvas);
}

function onStarMouseMove(e) {
  // 归一化到 [-1, 1]：屏幕中心 = 0；左/上边缘 = -1；右/下边缘 = +1。
  starTargetParallax.x = (e.clientX / window.innerWidth)  * 2 - 1;
  starTargetParallax.y = (e.clientY / window.innerHeight) * 2 - 1;
}

function resizeStarCanvas() {
  starCanvas.width  = window.innerWidth;
  starCanvas.height = window.innerHeight;
  buildStarLayers();
}

function buildStarLayers() {
  const w = starCanvas.width;
  const h = starCanvas.height;
  const area = w * h;
  starLayers = [];

  // 三层配置：近层视差响应最强烈、远层几乎不动。
  // 色彩温度随深度变化：远 = 冷蓝紫，近 = 偏白蓝 —— 呼应"近大远小"的视觉直觉。
  const layerConfigs = [
    {
      name: 'far',                                       // 远景：密而小
      count: Math.floor(area / 5500),
      radiusMin: 0.3, radiusMax: 0.8,
      alphaBase: 0.25, alphaVar: 0.4,
      parallax: 6,                                       // 边缘最大偏移（像素）
      twinkleSpeedMin: 0.4, twinkleSpeedMax: 1.0,
      colorHueRange: [205, 245],                         // 冷蓝紫
      glowThreshold: 0,                                  // 全部为无光晕的小点
    },
    {
      name: 'mid',                                       // 中景
      count: Math.floor(area / 12000),
      radiusMin: 0.6, radiusMax: 1.4,
      alphaBase: 0.4, alphaVar: 0.5,
      parallax: 14,
      twinkleSpeedMin: 0.8, twinkleSpeedMax: 1.6,
      colorHueRange: [200, 235],
      glowThreshold: 1.1,                                // 较亮的星有淡淡光晕
    },
    {
      name: 'near',                                      // 近景：稀而亮
      count: Math.floor(area / 30000),
      radiusMin: 1.0, radiusMax: 2.2,
      alphaBase: 0.5, alphaVar: 0.5,
      parallax: 26,
      twinkleSpeedMin: 1.2, twinkleSpeedMax: 2.2,
      colorHueRange: [195, 220],
      glowThreshold: 1.2,
    },
  ];

  layerConfigs.forEach((cfg, layerIdx) => {
    // 每层独立种子 → 布局确定但各层之间分布不同。
    const rng = mulberry32(STAR_SEED + layerIdx * 1009);
    const stars = [];
    for (let i = 0; i < cfg.count; i++) {
      stars.push({
        x: rng() * w,
        y: rng() * h,
        r: cfg.radiusMin + rng() * (cfg.radiusMax - cfg.radiusMin),
        alpha: cfg.alphaBase + rng() * cfg.alphaVar,
        twinkleSpeed: cfg.twinkleSpeedMin + rng() * (cfg.twinkleSpeedMax - cfg.twinkleSpeedMin),
        twinklePhase: rng() * Math.PI * 2,
        hue: cfg.colorHueRange[0] + rng() * (cfg.colorHueRange[1] - cfg.colorHueRange[0]),
      });
    }
    starLayers.push({ ...cfg, stars });
  });
}

function drawStarCanvas() {
  const ctx = starCtx;
  const w = starCanvas.width;
  const h = starCanvas.height;
  const time = performance.now() * 0.001;

  // 视差平滑跟随 —— 指数缓动，给出柔软的"凝望"感。
  mouseParallax.x += (starTargetParallax.x - mouseParallax.x) * PARALLAX_EASE;
  mouseParallax.y += (starTargetParallax.y - mouseParallax.y) * PARALLAX_EASE;

  // 全局星陨强度（0..1），驱动背景星亮度 / 闪烁节奏。
  const layerT = (typeof state !== 'undefined' && state.starLayer != null)
    ? state.starLayer / 99 : 0;
  // 整体提亮 1.0 → 1.5（高层数时整片星空微微"燃烧"）
  const globalGain = 1 + layerT * 0.5;
  // 共振脉冲：高层数时整片星空以约 0.25Hz 做轻微呼吸（+0..0.18 振幅）
  const pulse = layerT > 0.2
    ? (0.09 * (1 + Math.sin(time * 1.6)) * layerT)
    : 0;

  ctx.clearRect(0, 0, w, h);

  // 远 → 近顺序绘制（深景在下）。
  for (let i = 0; i < starLayers.length; i++) {
    const layer = starLayers[i];
    const offsetX = -mouseParallax.x * layer.parallax;
    const offsetY = -mouseParallax.y * layer.parallax;
    // 闪烁节奏在高层数时略微加快，避免长时间高数时画面"死板"
    const twinkleBoost = 1 + layerT * 0.6;

    for (let j = 0; j < layer.stars.length; j++) {
      const s = layer.stars[j];
      // 闪烁 = 全局时间 × 每颗星独立速度 + 独立相位 → 不同步的呼吸。
      const tw = 0.55 + 0.45 * Math.sin(time * s.twinkleSpeed * twinkleBoost + s.twinklePhase);
      const a  = Math.min(1, s.alpha * tw * globalGain + pulse);

      // 视差把星推出视区时做环形卷绕，避免边缘出现空缺。
      let px = s.x + offsetX;
      let py = s.y + offsetY;
      const wrapX = w + 80, wrapY = h + 80;
      px = ((px % wrapX) + wrapX) % wrapX - 40;
      py = ((py % wrapY) + wrapY) % wrapY - 40;

      // 大星加一层柔光（径向光晕），强化"近大远小"的层次。
      if (s.r > layer.glowThreshold) {
        ctx.beginPath();
        ctx.arc(px, py, s.r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 70%, 90%, ${a * 0.18})`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${s.hue}, 60%, 88%, ${a})`;
      ctx.fill();
    }
  }

  requestAnimationFrame(drawStarCanvas);
}

// ============================================================
// STAR METEORITE DISC (replaces the old "floating dots" particle system)
//
// 算法哲学：Stellar Resonance（星陨共振）
//   圆盘 = 微型星核的取景窗。state.starLayer (0..99) 充当"共振强度"参数：
//     · 在低层数（0..30）时，3 圈轨道粒子缓慢流转，像平静的星系；
//     · 在中段（30..70）时，环境火花增多，冲击波涟漪频繁出现；
//     · 在高层数（70..99）时，色彩由冷蓝转向金红，射出强列的"星陨冲击"。
//   与 updateSealGlow() 共享同一条 RGB 渐变曲线（冷蓝紫 → 金黄 → 乳白），
//   让圆盘粒子和星空与圆盘中心主色严格同步，不再出现"蓝→绿→白"漂移。
// ============================================================
const DISC = {
  cx: 140, cy: 140,
  orbitals: [],       // 8..32 颗粒，3 圈嵌套轨道
  sparks: [],         // 偶发的环境火花（中心外缘起，向中心漂）
  jets: [],           // 高层数时从中心径向射出的高速粒子
  shockwaves: [],     // 触发时扩散的环
  tick: 0,
};
// 与 updateSealGlow() 完全同构的 RGB 三元组（每帧由 updateStarTheme 刷新）
//   t=0.0 → rgb(100,140,255)  冷蓝紫
//   t=0.5 → rgb(255,215,  0)  金黄
//   t=1.0 → rgb(255,255,200)  乳白
let sealR = 100, sealG = 140, sealB = 255;
let discIntensity = 0;
// 轨道粒子的"数量桶"哨兵：仅在 count = 8 + floor(t*24) 跨桶时重建，避免
// 拖拽期间每像素用新 Math.random() 重洗已有粒子的 angle/radius/size/speed/twinkle。
// 初始值 -1 保证 initParticles 的首次调用一定会重建。
let orbitalBucket = -1;

// 计算与 seal-glow-color 严格同步的色温。setStarLayer 每次层数变化都会调用。
function updateStarTheme() {
  const layer = (typeof state !== 'undefined' && state.starLayer != null)
    ? state.starLayer : 0;
  const t = layer / 99;
  discIntensity = t;
  if (t < 0.5) {
    const p = t / 0.5;
    sealR = Math.round(100 + 155 * p);
    sealG = Math.round(140 + 75 * p);
    sealB = Math.round(255 - 255 * p);
  } else {
    const p = (t - 0.5) / 0.5;
    sealR = 255;
    sealG = Math.round(215 + 40 * p);
    sealB = Math.round(0 + 200 * p);
  }
}

// 按当前星陨层数重建轨道粒子。层数变化时由 setStarLayer 调用。
// 仅在 count 桶变化时真正执行：拖拽中同一桶内 layer 连续变化会保持粒子实例
// 稳定（不再每像素重洗），消除闪烁；只在跨桶（约每 4 层）时生成新一组。
function rebuildOrbitals() {
  const bucket = Math.floor(discIntensity * 24);
  if (bucket === orbitalBucket) return;
  orbitalBucket = bucket;
  DISC.orbitals = [];
  const t = discIntensity;
  const count = 8 + Math.floor(t * 24);     // 8..32
  for (let i = 0; i < count; i++) {
    const ring = i % 3;                      // 三圈：66 / 82 / 98
    const baseR = 66 + ring * 16;
    const rJitter = (Math.random() - 0.5) * 8;
    const radius = baseR + rJitter;
    const size = ring === 0 ? 1.4 + Math.random() * 1.2
                           : 0.8 + Math.random() * 1.0;
    const speed = 0.0035 + ring * 0.0018 + Math.random() * 0.0015;
    const dir = (i % 2 === 0) ? 1 : -1;       // 交替方向，避免整齐
    DISC.orbitals.push({
      angle: Math.random() * Math.PI * 2,
      radius,
      size,
      speed: speed * dir,
      twinklePhase: Math.random() * Math.PI * 2,
      ring,
    });
  }
}

// 触发一次冲击波（setStarLayer 在跳跃变化时调用）
function emitShockwave() {
  DISC.shockwaves.push({
    radius: 22,
    maxRadius: 130 + discIntensity * 20,
    life: 1,
    decay: 0.014 + Math.random() * 0.006,
    r: sealR, g: sealG, b: sealB,        // 跟随 seal-glow 主色
  });
  // 限制同屏冲击波数量，避免连续操作刷屏
  if (DISC.shockwaves.length > 4) DISC.shockwaves.shift();
}

// 从中心径向射出一颗高速粒子（仅在高层数时）
function spawnJet() {
  const angle = Math.random() * Math.PI * 2;
  const speed = 1.4 + Math.random() * 1.6;
  DISC.jets.push({
    x: DISC.cx, y: DISC.cy,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 1,
    decay: 0.012 + Math.random() * 0.01,
    size: 1.2 + Math.random() * 1.4,
  });
  if (DISC.jets.length > 14) DISC.jets.shift();
}

function initParticles() {
  particleCanvas = document.getElementById('particle-canvas');
  particleCtx = particleCanvas.getContext('2d');
  updateStarTheme();
  rebuildOrbitals();
  animateParticles();
}

function animateParticles() {
  const ctx = particleCtx;
  ctx.clearRect(0, 0, 280, 280);
  DISC.tick++;
  const tick = DISC.tick;

  // 1) 中心径向辉光：根据 discIntensity 渲染微弱光晕，给圆盘深度
  const haloGrad = ctx.createRadialGradient(
    DISC.cx, DISC.cy, 8,
    DISC.cx, DISC.cy, 138
  );
  haloGrad.addColorStop(0, `rgba(${sealR},${sealG},${sealB},${0.04 + discIntensity * 0.18})`);
  // 中段稍暗一档，模拟径向衰减
  haloGrad.addColorStop(0.55, `rgba(${Math.round(sealR*0.5)},${Math.round(sealG*0.5)},${Math.round(sealB*0.5)},${0.02 + discIntensity * 0.07})`);
  haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = haloGrad;
  ctx.fillRect(0, 0, 280, 280);

  // 2) 冲击波（最底层，在轨道粒子之下）
  for (let i = DISC.shockwaves.length - 1; i >= 0; i--) {
    const s = DISC.shockwaves[i];
    s.radius += (s.maxRadius - s.radius) * 0.055 + 0.4;
    s.life -= s.decay;
    if (s.life <= 0) { DISC.shockwaves.splice(i, 1); continue; }
    ctx.beginPath();
    ctx.arc(DISC.cx, DISC.cy, s.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${s.r},${s.g},${s.b},${s.life * 0.35})`;
    ctx.lineWidth = 1.6 * s.life;
    ctx.stroke();
  }

  // 3) 轨道粒子
  for (const o of DISC.orbitals) {
    o.angle += o.speed;
    const tw = 0.55 + 0.45 * Math.sin(tick * 0.045 + o.twinklePhase);
    const x = DISC.cx + Math.cos(o.angle) * o.radius;
    const y = DISC.cy + Math.sin(o.angle) * o.radius;
    // 大粒子加柔光晕
    if (o.size > 1.5) {
      ctx.beginPath();
      ctx.arc(x, y, o.size * 3.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${sealR},${sealG},${sealB},${0.10 * tw})`;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, o.size * (0.7 + 0.3 * tw), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${sealR},${sealG},${sealB},${0.85 * tw})`;
    ctx.fill();
  }

  // 4) 环境火花：在轨道边缘出现，缓慢向中心漂，体现"星尘被吸入"
  //    生成数量随 discIntensity 提升。
  const sparkSpawnRate = 0.04 + discIntensity * 0.32;
  if (Math.random() < sparkSpawnRate) {
    const angle = Math.random() * Math.PI * 2;
    const r = 100 + Math.random() * 32;
    DISC.sparks.push({
      x: DISC.cx + Math.cos(angle) * r,
      y: DISC.cy + Math.sin(angle) * r,
      vx: -Math.cos(angle) * (0.18 + Math.random() * 0.25),
      vy: -Math.sin(angle) * (0.18 + Math.random() * 0.25),
      life: 1,
      decay: 0.008 + Math.random() * 0.012,
      size: 0.8 + Math.random() * 1.6,
    });
    if (DISC.sparks.length > 60) DISC.sparks.shift();
  }
  for (let i = DISC.sparks.length - 1; i >= 0; i--) {
    const p = DISC.sparks[i];
    p.x += p.vx; p.y += p.vy;
    // 越靠近中心速度越快（向心加速），模拟引力
    const distToCenter = Math.hypot(p.x - DISC.cx, p.y - DISC.cy);
    if (distToCenter > 6) {
      const accel = 0.012 + (140 - Math.min(140, distToCenter)) * 0.0004;
      p.vx += (-(p.x - DISC.cx) / distToCenter) * accel;
      p.vy += (-(p.y - DISC.cy) / distToCenter) * accel;
    }
    p.life -= p.decay;
    if (p.life <= 0 || distToCenter < 8) { DISC.sparks.splice(i, 1); continue; }
    // 拖尾（用渐变短线代替模糊以节省性能）
    const tailLen = 6;
    const speed = Math.hypot(p.vx, p.vy) || 1;
    const tx = p.x - (p.vx / speed) * tailLen;
    const ty = p.y - (p.vy / speed) * tailLen;
    const grad = ctx.createLinearGradient(p.x, p.y, tx, ty);
    grad.addColorStop(0, `rgba(${sealR},${sealG},${sealB},${p.life * 0.85})`);
    grad.addColorStop(1, `rgba(${sealR},${sealG},${sealB},0)`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = p.size * p.life;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }

  // 5) 径向喷射（高层数时偶发）
  if (discIntensity > 0.55 && Math.random() < (discIntensity - 0.55) * 0.45) {
    spawnJet();
  }
  for (let i = DISC.jets.length - 1; i >= 0; i--) {
    const j = DISC.jets[i];
    j.x += j.vx; j.y += j.vy;
    j.life -= j.decay;
    if (j.life <= 0
        || j.x < -10 || j.x > 290
        || j.y < -10 || j.y > 290) {
      DISC.jets.splice(i, 1); continue;
    }
    ctx.beginPath();
    ctx.arc(j.x, j.y, j.size * (0.6 + 0.4 * j.life), 0, Math.PI * 2);
    // 喷射粒子稍亮：每个通道 +25 后封顶 255
    const jr = Math.min(255, sealR + 25);
    const jg = Math.min(255, sealG + 25);
    const jb = Math.min(255, sealB + 25);
    ctx.fillStyle = `rgba(${jr},${jg},${jb},${j.life * 0.9})`;
    ctx.fill();
  }

  requestAnimationFrame(animateParticles);
}

function generateSealSVG() {
  const ticks = document.getElementById('seal-ticks');
  let ticksHTML = '';
  for (let i = 0; i < 36; i++) {
    const angle = i * 10;
    const len = i % 3 === 0 ? 8 : 4;
    const r1 = 95;
    const r2 = r1 - len;
    const x1 = 100 + r1 * Math.cos(angle * Math.PI / 180);
    const y1 = 100 + r1 * Math.sin(angle * Math.PI / 180);
    const x2 = 100 + r2 * Math.cos(angle * Math.PI / 180);
    const y2 = 100 + r2 * Math.sin(angle * Math.PI / 180);
    ticksHTML += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/>`;
  }
  ticks.innerHTML = ticksHTML;
  const runes = document.getElementById('seal-runes');
  let runesHTML = '';
  for (let i = 0; i < 6; i++) {
    const angle = i * 60 - 90;
    const r = 70;
    const x = 100 + r * Math.cos(angle * Math.PI / 180);
    const y = 100 + r * Math.sin(angle * Math.PI / 180);
    const x2 = 100 + r * Math.cos((angle + 60) * Math.PI / 180);
    const y2 = 100 + r * Math.sin((angle + 60) * Math.PI / 180);
    runesHTML += `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>`;
    runesHTML += `<circle cx="${x}" cy="${y}" r="2" fill="rgba(255,255,255,0.1)"/>`;
  }
  runes.innerHTML = runesHTML;
}

function initSealInteraction() {
  const wrapper = document.getElementById('seal-wrapper');
  const slider = document.getElementById('seal-slider');
  let isDragging = false;
  let startX = 0;
  let startLayer = 0;
  wrapper.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startLayer = state.starLayer;
    document.body.style.cursor = 'ew-resize';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const newLayer = Math.max(0, Math.min(99, startLayer + Math.round(dx / 4)));
    setStarLayer(newLayer);
  });
  document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.cursor = '';
  });
  wrapper.addEventListener('touchstart', (e) => {
    isDragging = true;
    startX = e.touches[0].clientX;
    startLayer = state.starLayer;
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - startX;
    const newLayer = Math.max(0, Math.min(99, startLayer + Math.round(dx / 4)));
    setStarLayer(newLayer);
  }, { passive: false });
  document.addEventListener('touchend', () => { isDragging = false; });
  wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    setStarLayer(Math.max(0, Math.min(99, state.starLayer + delta)));
  }, { passive: false });
  slider.addEventListener('input', (e) => {
    setStarLayer(parseInt(e.target.value));
  });
  wrapper.addEventListener('dblclick', () => { setStarLayer(0); });
}

function setStarLayer(value) {
  const old = state.starLayer;
  state.starLayer = Math.round(value);
  const numberEl = document.getElementById('seal-number');
  const slider = document.getElementById('seal-slider');
  animateNumber(numberEl, old, state.starLayer, 200);
  slider.value = state.starLayer;
  updateSealGlow();
  // 同步星空 / 圆盘主题：色相、明度、轨道粒子数量都跟层数挂钩。
  updateStarTheme();
  rebuildOrbitals();
  if (old !== state.starLayer) {
    numberEl.classList.remove('number-pop');
    void numberEl.offsetWidth;
    numberEl.classList.add('number-pop');
    // 一次操作内仅在跳跃幅度 ≥ 3 时触发冲击波，避免拖拽时刷屏。
    const jump = Math.abs(state.starLayer - old);
    if (jump >= 3) {
      emitShockwave();
    }
  }
  // 挑战模式答题阶段（picking）不实时计算伤害：保持空圆环直到用户提交。
  // 提交后（answered）或非挑战模式才计算。
  if (state.challenge.phase !== 'picking') {
    calculateDamage();
  }
}

function updateSealGlow() {
  const layer = state.starLayer;
  const t = layer / 99;
  let r, g, b;
  if (t < 0.5) {
    const p = t / 0.5;
    r = Math.round(100 + 155 * p);
    g = Math.round(140 + 75 * p);
    b = Math.round(255 - 255 * p);
  } else {
    const p = (t - 0.5) / 0.5;
    r = 255;
    g = Math.round(215 + 40 * p);
    b = Math.round(0 + 200 * p);
  }
  const glowSize = 8 + layer * 1.5;
  const glowAlpha = 0.15 + t * 0.5;
  const pulseSpeed = 3 - t * 2;
  const root = document.documentElement;
  root.style.setProperty('--seal-glow-color', `rgba(${r},${g},${b},${glowAlpha})`);
  root.style.setProperty('--seal-glow-size', `${glowSize}px`);
  root.style.setProperty('--seal-pulse-speed', `${pulseSpeed}s`);
  const runes = document.getElementById('seal-runes');
  if (runes) runes.setAttribute('opacity', (0.2 + t * 0.8).toFixed(2));
  const svgCircles = document.querySelectorAll('#seal-svg circle');
  svgCircles.forEach(c => {
    c.setAttribute('stroke', `rgba(${r},${g},${b},${0.05 + t * 0.15})`);
  });
}

function animateNumber(el, from, to, duration) {
  const start = performance.now();
  const diff = to - from;
  function update(time) {
    const elapsed = time - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + diff * eased);
    el.textContent = current;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ============================================================
// INLINE SPIRIT PICKER
// 精灵选择直接渲染在精灵面板中（不再使用模态弹窗）
//   - 未选或进入“选择中”状态 → 渲染内嵌选择器
//   - 选中后 → 渲染精灵卡，点击卡片可切回选择器
//   - 选择器中支持搜索（名称/拼音/首字母）和筛选（常见 + 系别）
// ============================================================

// Picker 中可作为筛选 chip 使用的系别 key 列表（按 ELEMENTS 声明顺序）。
// 排除 FALLBACK_EL ("无")。
const PICKER_ELEMENT_KEYS = Object.keys(ELEMENTS).filter(k => k !== FALLBACK_EL.name);

// HTML attribute 简单转义。搜索框文本会原样写入 input 的 value 属性，
// 用户输入的 < > & " ' 都需要转义，否则会破坏 HTML。
function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

// 把一组 [id, sprite] 列表渲染为 picker grid 内部 HTML（不含外层 grid 容器）。
// 这样既能在 renderSpiritPicker 中复用，也能在 refreshPickerGrid 中增量更新。
function _renderPickerOptionsHTML(side, list) {
  const spirit = side === 'attacker' ? state.attacker : state.defender;
  if (list.length === 0) {
    return `<div class="spirit-picker-empty">没有匹配的精灵<button type="button" onclick="resetPickerFilter('${side}')">清除筛选</button></div>`;
  }
  return list.map(([id, s]) => {
    const types = (s.types || []).map(t => elOf(t));
    const primaryColor = types[0]?.color || '#888';
    const tagsHTML = types.map(t =>
      t.iconUrl
        ? `<img class="type-icon" src="${t.iconUrl}" loading="lazy" alt="${t.name}">`
        : `<span class="type-tag" style="--tag-color:${t.color};--tag-bg:${t.color}20;">${t.emoji} ${t.name}</span>`
    ).join('');
    const illus = s.illustration_url
      ? `<img src="${s.illustration_url}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'placeholder',textContent:'${(s.name||'').slice(0,1)}',style:'--el-color:${primaryColor}'}))">`
      : `<div class="placeholder" style="--el-color:${primaryColor}">${(s.name||'').slice(0,1)}</div>`;
    const isCurrent = !!(spirit && spirit.id === id);
    return `
      <div class="spirit-picker-option ${isCurrent ? 'current' : ''}" role="button" tabindex="0"
           aria-label="选择 ${s.name}${isCurrent ? '（当前）' : ''}"
           data-spirit-id="${id}"
           style="--el-color:${primaryColor}"
           onclick="selectSpirit('${side}', '${id}')"
           onkeydown="onSpiritPickerOptionKey(event, '${side}', '${id}')">
        <div class="picker-image">${illus}</div>
        <div class="picker-name">${s.name}</div>
        <div class="picker-types">${tagsHTML}</div>
      </div>
    `;
  }).join('');
}

// 按当前 filter 过滤 SPRITES，返回 [id, sprite] 列表。
//   - common   : 命中 OTHERS 中对应侧的 id
//   - elements : 精灵必须同时包含所有选中的系别（AND 关系；选 2 个系别
//                即可筛出"双系精灵"，单系精灵会被排除）
//   - text     : 精灵名 / pinyin / pinyin_initials 三者任一 includes 命中
// common / elements / text 三组筛选条件之间也是 AND 关系（必须同时满足）。
function filterSpirits(side, filter) {
  // 兼容中文/英文括号：把"（）"统一为"()"，避免用户用半角括号搜不到数据
  const normParens = str => (str || '').replace(/[（）]/g, ch => ch === '（' ? '(' : ')');
  // 精灵名/拼音/首字母/图鉴 id 都不含空格，因此搜索时同时去掉查询与字段
  // 中的所有空格，避免用户误打/复制时多一个空格导致搜不到。
  const stripSpaces = str => (str || '').replace(/\s+/g, '');
  const text = stripSpaces(normParens((filter.text || '').trim())).toLowerCase();
  const commonList = (side === 'attacker' ? OTHERS.common_attackers : OTHERS.common_defenders) || [];
  const commonSet = new Set(commonList);
  const wantEls = filter.elements;   // Set<string>
  const all = SPRITES_ENTRIES;        // loadData 末尾预计算，避免每次按键重新分配
  const out = [];
  for (let i = 0; i < all.length; i++) {
    const [id, s] = all[i];
    if (filter.common && !commonSet.has(id)) continue;
    if (wantEls.size > 0) {
      const spiritEls = (s.types || []).map(t => stripXi(t));
      // AND：精灵必须包含每一个被选中的系别。
      // 例：选了"火"和"飞行"，只有同时是火系和飞行系的精灵才命中。
      let allMatch = true;
      for (const want of wantEls) {
        if (!spiritEls.includes(want)) { allMatch = false; break; }
      }
      if (!allMatch) continue;
    }
    if (text) {
      const name = stripSpaces(normParens(s.name || '')).toLowerCase();
      const py = stripSpaces(normParens(s.pinyin || ''));
      const ini = stripSpaces(normParens(s.pinyin_initials || ''));
      let matched = name.includes(text) || py.includes(text) || ini.includes(text);
      // 纯数字输入时，也按图鉴 id (hbid) 搜索
      if (!matched && /^\d+$/.test(text)) {
        matched = String(s.hbid ?? '').includes(text);
      }
      if (!matched) continue;
    }
    out.push(all[i]);
  }
  return out;
}

// 渲染 picker 顶部的 toolbar：搜索框（内含"常见"chip + × 清空按钮）+ 系别 chip 行。
function renderPickerToolbar(side, filter) {
  const commonActive = filter.common ? ' active' : '';
  const commonList = (side === 'attacker' ? OTHERS.common_attackers : OTHERS.common_defenders) || [];

  const elementChips = PICKER_ELEMENT_KEYS.map(key => {
    const el = ELEMENTS[key];
    if (!el) return '';
    const isActive = filter.elements.has(key);
    const iconHTML = el.iconUrl
      ? `<img class="chip-icon" src="${el.iconUrl}" loading="lazy" alt="${el.name}">`
      : `<span class="chip-emoji" aria-hidden="true">${el.emoji}</span>`;
    return `<button type="button" class="spirit-picker-chip element-chip${isActive ? ' active' : ''}"
              data-element="${key}"
              onclick="togglePickerElement('${side}', '${key}')"
              aria-pressed="${isActive ? 'true' : 'false'}"
              title="${el.name}（${filter.elements.has(key) ? '点击取消' : (filter.elements.size >= 2 ? '最多选 2 个系别' : '点击筛选')}）">${iconHTML}</button>`;
  }).join('');

  const searchVal = escapeAttr(filter.text || '');

  return `
    <div class="spirit-picker-toolbar">
      <div class="spirit-picker-search">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        </svg>
        <input id="${side}-picker-search" type="text" inputmode="search"
               value="${searchVal}"
               oninput="onPickerSearchInput('${side}', this.value)"
               placeholder="搜索：名称 / 拼音 / 首字母 / 图鉴编号"
               aria-label="搜索精灵">
      </div>
      <button type="button" class="spirit-picker-chip common${commonActive}"
              onclick="togglePickerCommon('${side}')"
              aria-pressed="${filter.common ? 'true' : 'false'}"
              title="${filter.common ? '取消"常见"筛选' : '只显示常见精灵'}">
        <svg class="chip-icon" xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z"></path></svg>
      </button>
      ${elementChips}
    </div>
  `;
}

// ============ Picker Toolbar 自适应布局 ============
// 目标：让搜索行 + 18 个系别 chip（+ "常" chip = 20 个 grid item）
// 在任意容器宽度下，元素等大且无右边缘留白，且 toolbar 背景/边框能
// 完整包裹所有行（不溢出到下方内容）；同时避免"最后一行只塞 2 个徽章"
// 这类视觉不平衡的残缺布局，强制选择行行填满的方案（3 行×9 或 4 行×6）。
//
// 实现要点：
// - .spirit-picker-toolbar 是 `repeat(N, 1fr)` 的 grid，列数 N 由 JS 写入 --cols。
// - 1fr 列在数学上必然填满容器宽度，所以 N 变化时不会出现"右边少一截"。
// - 搜索行 grid-column: span (N-1) 跨多列，"常" chip 占 1 列。
// - 每个 chip 内部用 width: 100% + aspect-ratio: 1 保证正方形。
// - N 的选取：根据当前内宽 + gap 反算 chip 边长，在所有合法 N 中
//   选"chip 边长最接近理想值、且最后一行无残留徽章"的那个：
//     评分 = -|chip-理想| - uglinessPenalty*25 - rowPenalty*2
//   uglinessPenalty = 最后一行缺格数 / N（0 表示 clean，越大越残缺），
//   重罚使 N=8/7/5 等"残缺"方案被淘汰，只剩 N=9（3 行）或 N=6（4 行）。
// - toolbar 高度 = (1 + ceil(18/N)) 行 × chip 边长 + 行间 gap + 上下 padding，
//   这个高度必须严格覆盖所有 grid item，否则背景/边框不会包裹溢出的行。
const PICKER_CHIP_IDEAL = 34;   // 理想 chip 边长
const PICKER_CHIP_MIN   = 22;   // 最小可接受 chip 边长
const PICKER_CHIP_TOTAL = 18;   // 系别 chip 总数（grid item 之一）

function fitPickerToolbar(toolbar) {
  if (!toolbar || !toolbar.isConnected) return;
  const cs = getComputedStyle(toolbar);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  // CSS 里 grid 的 gap
  const gap = parseFloat(cs.rowGap || cs.gap) || 6;
  const innerW = toolbar.clientWidth - padX;
  if (innerW <= 0) return;

  // 遍历候选 N（从大到小），挑 chip 边长最接近理想值、
  // 且最后一行无"残留徽章"（要么 0，要么满行）的那个。
  //
  // 为什么加"丑陋度"惩罚：N=8 会产生 4 行但最后一行只剩 2 个徽章的"残缺"布局
  // （rows 2-3 = 8, row 4 = 2）。这种布局视觉上不平衡，用户偏好以下两种之一：
  //   A. 3 行 × 9 列（chip 小一些，N=9），18 个徽章填满 2 行
  //   B. 4 行 × 6 列（chip 大一些，N=6），18 个徽章填满 3 行
  // 两者都"行行满"。N=8/7 等"残缺"方案重罚淘汰。
  let bestN = 3, bestSize = 0, bestScore = -Infinity;
  for (let n = 18; n >= 3; n--) {
    const size = (innerW - (n - 1) * gap) / n;
    if (size < PICKER_CHIP_MIN) continue;
    // 行数 = 1（search+常）+ ceil(18/n)（18 个系别占的行数）
    const elementRows = Math.ceil(PICKER_CHIP_TOTAL / n);
    const totalRows = 1 + elementRows;
    // 最后一行的"空缺"格数 = n*elementRows - 18
    //   = 0  → 最后一行满（clean，例如 N=9→2×9=18，N=6→3×6=18）
    //   > 0  → 最后一行不满，缺 (n - lastRowCount) 个徽章
    const lastRowCount = n * elementRows - PICKER_CHIP_TOTAL;
    // 丑陋度 = 缺格数 / n（0=clean, 越大越不平衡）
    const ugliness = lastRowCount > 0 ? lastRowCount / n : 0;
    // 丑陋惩罚：每缺 1% 的格子扣 40 分（重罚，让 clean 方案在 chip 大小相近时必胜）
    const uglinessPenalty = ugliness * 40;
    // 行数惩罚：每超出 3 行扣 2 分（轻微，避免 5+ 行布局）
    const rowPenalty = Math.max(0, totalRows - 3) * 2;
    // 越接近理想值越好；同等接近时偏好 N 大的
    const score = -Math.abs(size - PICKER_CHIP_IDEAL) - uglinessPenalty - rowPenalty + n * 0.001;
    if (score > bestScore) {
      bestN = n;
      bestSize = size;
      bestScore = score;
    }
  }
  // 兜底：若所有 N 都不满足最小边长（极端窄），用最小 N
  if (bestSize === 0) {
    bestN = 3;
    bestSize = (innerW - (bestN - 1) * gap) / bestN;
  }

  toolbar.style.setProperty('--cols', String(bestN));
  // search 跨 N-1 列，剩 1 列给 "常" chip。
  toolbar.style.setProperty('--search-span', String(Math.max(1, bestN - 1)));

  // 关键修复：行数必须 = 1（search+常）+ ceil(18/N)（系别占的行），
  // 之前用 ceil(20/N) 算错，导致 N<=8 时高度少了 1 行，4 行的内容
  // 溢出 toolbar 边界、背景不包裹、第 4 行 chip 落到下面的卡片上重叠。
  const elementRows = Math.ceil(PICKER_CHIP_TOTAL / bestN);
  const totalRows = 1 + elementRows;
  const targetH = totalRows * bestSize + (totalRows - 1) * gap + padY;
  toolbar.style.height = `${targetH}px`;
}

// 监听所有 toolbar 的尺寸变化；toolbar 是动态创建的（renderSpiritPicker 重建），
// 所以用 MutationObserver 跟踪新增/移除的 toolbar。
const _pickerToolbarSet = new Set();
const _pickerToolbarRO = new ResizeObserver(entries => {
  for (const e of entries) fitPickerToolbar(e.target);
});
const _pickerToolbarMO = new MutationObserver(() => {
  document.querySelectorAll('.spirit-picker-toolbar').forEach(t => {
    if (!_pickerToolbarSet.has(t)) {
      _pickerToolbarSet.add(t);
      _pickerToolbarRO.observe(t);
      fitPickerToolbar(t);
    }
  });
  // 清理已移除的
  for (const t of _pickerToolbarSet) {
    if (!t.isConnected) {
      _pickerToolbarRO.unobserve(t);
      _pickerToolbarSet.delete(t);
    }
  }
});

// 启动观察（DOMContentLoaded 后保证 body 已存在）
function startPickerToolbarAutoFit() {
  _pickerToolbarMO.observe(document.body, { childList: true, subtree: true });
  // 兜底：立即跑一遍 + 监听 window resize
  document.querySelectorAll('.spirit-picker-toolbar').forEach(t => {
    if (!_pickerToolbarSet.has(t)) {
      _pickerToolbarSet.add(t);
      _pickerToolbarRO.observe(t);
    }
    fitPickerToolbar(t);
  });
  window.addEventListener('resize', () => {
    document.querySelectorAll('.spirit-picker-toolbar').forEach(fitPickerToolbar);
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startPickerToolbarAutoFit);
} else {
  startPickerToolbarAutoFit();
}

function renderSpiritArea(side, opts) {
  const spirit = side === 'attacker' ? state.attacker : state.defender;
  // 处于“选择中”或尚未选精灵 → 渲染选择器
  if (state.spiritPicking[side] || !spirit) {
    renderSpiritPicker(side, opts);
  } else {
    renderSpiritCard(side, opts);
  }
}

function renderSpiritPicker(side, opts) {
  const selectArea = document.getElementById(`${side}-select-area`);
  const skillsSection = document.getElementById(`${side}-skills`);
  const statsSection = document.getElementById(`${side}-stats`);
  const spirit = side === 'attacker' ? state.attacker : state.defender;

  // 处于选择中时，属性配置与技能列表应隐藏（待新精灵确定后再渲染）
  skillsSection.style.display = 'none';
  statsSection.style.display = 'none';

  const titleText = side === 'attacker' ? '选择攻击方精灵' : '选择防御方精灵';
  // 始终渲染“取消”按钮，未选精灵时用 is-hidden 保留占位，避免排版跳动
  const cancelHiddenCls = spirit ? '' : ' is-hidden';
  const cancelBtn = `<button class="picker-btn${cancelHiddenCls}" type="button" onclick="exitSpiritPicker('${side}')" aria-label="取消更换" tabindex="${spirit ? 0 : -1}">取消</button>`;

  const filter = state.spiritPickerFilter[side];
  const toolbarHTML = renderPickerToolbar(side, filter);
  const filtered = filterSpirits(side, filter);
  const optionsHTML = _renderPickerOptionsHTML(side, filtered);
  // skipAnimation 走 inline style：element 创建时就抑制 spiritAreaIn，
  // 比 body class 路线可靠（body class 移除时浏览器会重新计算 style，可能反而触发动画）。
  const animAttr = (opts && opts.skipAnimation) ? ' style="animation: none"' : '';

  selectArea.innerHTML = `
    <div class="spirit-picker"${animAttr}>
      <div class="spirit-picker-header">
        <span class="picker-title">${titleText}</span>
        ${cancelBtn}
      </div>
      ${toolbarHTML}
      <div class="spirit-picker-grid" id="${side}-picker-grid">${optionsHTML}</div>
    </div>
  `;
  // 立即算一次列数（避免 MutationObserver 异步触发导致的视觉跳动）
  const tb = selectArea.querySelector('.spirit-picker-toolbar');
  if (tb) fitPickerToolbar(tb);
}

// 增量更新 grid（仅在搜索/筛选输入变化时调用，避免重渲 toolbar 失去焦点）。
function refreshPickerGrid(side) {
  const grid = document.getElementById(`${side}-picker-grid`);
  if (!grid) return;
  const filter = state.spiritPickerFilter[side];
  const filtered = filterSpirits(side, filter);
  grid.innerHTML = _renderPickerOptionsHTML(side, filtered);
}

// 增量更新 toolbar 中各 chip 的 active 状态（不重建 DOM，因此 spirit-picker
// 上的 spiritAreaIn 动画不会被重播）。搜索框 input 不在此处触碰。
function refreshPickerToolbar(side) {
  const toolbar = document.querySelector(`#${side}-select-area .spirit-picker-toolbar`);
  if (!toolbar) return;
  const filter = state.spiritPickerFilter[side];

  // 常见 chip
  const commonChip = toolbar.querySelector('.spirit-picker-chip.common');
  if (commonChip) {
    commonChip.classList.toggle('active', filter.common);
    commonChip.setAttribute('aria-pressed', filter.common ? 'true' : 'false');
    commonChip.title = filter.common
      ? '点击取消"常见"筛选'
      : '点击只显示常见精灵';
  }

  // 系别 chip
  toolbar.querySelectorAll('.element-chip').forEach(chip => {
    const key = chip.dataset.element;
    const el = ELEMENTS[key];
    if (!el) return;
    const active = filter.elements.has(key);
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    const tip = active
      ? '点击取消'
      : (filter.elements.size >= 2 ? '最多选 2 个系别' : '点击筛选');
    chip.title = `${el.name}（${tip}）`;
  });
}

// --- Picker interactions (search + filter chips) ---

function onPickerSearchInput(side, val) {
  state.spiritPickerFilter[side].text = val;
  refreshPickerGrid(side);
}
// chip 切换和清除筛选全部走增量更新：仅刷新 chip 高亮 + grid，
// 不重建 spirit-picker 容器，避免重播 spiritAreaIn 动画。
function togglePickerCommon(side) {
  state.spiritPickerFilter[side].common = !state.spiritPickerFilter[side].common;
  refreshPickerToolbar(side);
  refreshPickerGrid(side);
}
function togglePickerElement(side, elKey) {
  const filter = state.spiritPickerFilter[side];
  if (filter.elements.has(elKey)) {
    filter.elements.delete(elKey);
  } else {
    // 最多选 2 个：第 3 次点击直接忽略（用户需先取消一个）
    if (filter.elements.size >= 2) return;
    filter.elements.add(elKey);
  }
  refreshPickerToolbar(side);
  refreshPickerGrid(side);
}
function resetPickerFilter(side) {
  const f = state.spiritPickerFilter[side];
  f.text = '';
  f.common = false;
  f.elements = new Set();
  // 同步搜索框 UI
  const input = document.getElementById(`${side}-picker-search`);
  if (input) input.value = '';
  refreshPickerToolbar(side);
  refreshPickerGrid(side);
}

function renderSpiritCard(side, opts) {
  const spirit = side === 'attacker' ? state.attacker : state.defender;
  if (!spirit) return;
  const selectArea = document.getElementById(`${side}-select-area`);
  const skillsSection = document.getElementById(`${side}-skills`);
  const types = (spirit.types || []).map(t => elOf(t));
  const primaryColor = types[0]?.color || '#888';
  const tagsHTML = types.map(t =>
    t.iconUrl
      ? `<img class="type-icon" src="${t.iconUrl}" loading="lazy" alt="${t.name}">`
      : `<span class="type-tag" style="--tag-color:${t.color};--tag-bg:${t.color}20;">${t.emoji} ${t.name}</span>`
  ).join('');
  const illus = spirit.illustration_url
    ? `<img src="${spirit.illustration_url}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'placeholder',textContent:'${(spirit.name||'').slice(0,1)}',style:'--el-color:${primaryColor}'}))">`
    : `<div class="placeholder" style="--el-color:${primaryColor}">${(spirit.name||'').slice(0,1)}</div>`;
  // skipAnimation 走 inline style：element 创建时就抑制 spiritAreaIn，
  // 比 body class 路线可靠（见 renderSpiritPicker 注释）。
  const skipAnim = !!(opts && opts.skipAnimation);
  const animStyle = skipAnim ? '; animation: none' : '';
  selectArea.innerHTML = `
    <div class="spirit-card" role="button" tabindex="0"
         aria-label="更换${side === 'attacker' ? '攻击方' : '防御方'}精灵（当前：${spirit.name}）"
         onclick="enterSpiritPicker('${side}')"
         onkeydown="onSpiritCardKey(event, '${side}')"
         style="--el-color:${primaryColor}${animStyle}">
      <div class="spirit-image">${illus}</div>
      <div class="name">${spirit.name}</div>
      <div class="type-tags">${tagsHTML}</div>
      <div class="change-hint">点击更换</div>
    </div>
  `;
  skillsSection.style.display = 'block';
  renderSkills(side);
  renderStatsConfig(side);
  if (side === 'attacker') renderPowerBoostChip();
}

// 进入/退出“选择中”状态
function enterSpiritPicker(side) {
  state.spiritPicking[side] = true;
  // 每次重新进入选择器时重置筛选/搜索状态（关闭时丢弃）
  state.spiritPickerFilter[side] = { text: '', common: false, elements: new Set() };
  renderSpiritArea(side);
}
function exitSpiritPicker(side) {
  state.spiritPicking[side] = false;
  renderSpiritArea(side);
}

// 选择一个精灵
function selectSpirit(side, id) {
  const s = SPRITES[id];
  if (!s) return;
  // 给精灵对象附带 id 字段（便于在选择器中识别当前选中项）
  const spirit = { id, ...s };
  if (side === 'attacker') {
    state.attacker = spirit;
    const opts = getAttackSkillOptions(spirit);
    state.attackSkill = opts[0] || null;
    state.attackSkillIdx = state.attackSkill ? 0 : -1;
    // 应用攻击方的性格 / 个体值（若该精灵在该侧有本地存档则优先加载）
    const savedA = loadSpiritConfig(id, 'attacker');
    if (savedA) {
      state.attackerNature = { up: savedA.nature.up, down: savedA.nature.down };
      state.attackerIVs    = savedA.ivs.slice();
    } else {
      state.attackerNature = { ...DEFAULT_NATURE.attacker };
      state.attackerIVs    = DEFAULT_IVS.attacker.slice();
    }
    // Reset attacker buffs on spirit change
    state.attackerBuff   = { atk: 0, matk: 0 };
    // Reset 威力 chip value
    state.attackerPowerBoost = 0;
    // Reset 连击数 chip value
    state.attackerCombo = 0;
    // Reset 速度 chip values on both sides
    state.attackerSpeed = 0;
    state.defenderSpeed = 0;
    state.spiritPicking.attacker = false;
    renderSpiritArea('attacker');
    // 速度 chip is always shown on both sides, so re-render the
    // defender's chips too (the displayed value is unchanged, but
    // the click handlers were rebuilt when the chip was cleared).
    renderBuffChips('defender');
  } else if (side === 'defender') {
    state.defender = spirit;
    const opts = getDefenseSkillOptions(spirit);
    state.defenseSkill = opts[0]; // "无"
    state.defenseSkillIdx = 0;
    // 应用防御方的性格 / 个体值（若该精灵在该侧有本地存档则优先加载）
    const savedD = loadSpiritConfig(id, 'defender');
    if (savedD) {
      state.defenderNature = { up: savedD.nature.up, down: savedD.nature.down };
      state.defenderIVs    = savedD.ivs.slice();
    } else {
      state.defenderNature = { ...DEFAULT_NATURE.defender };
      state.defenderIVs    = DEFAULT_IVS.defender.slice();
    }
    // Reset defender buffs on spirit change
    state.defenderBuff   = { def: 0, mdef: 0 };
    // Reset defender 速度 chip value (should not carry over to a new pet).
    state.defenderSpeed = 0;
    state.spiritPicking.defender = false;
    renderSpiritArea('defender');
    // Defender changed → attacker's power-badge colors need to refresh
    if (state.attacker) renderSkills('attacker');
  }
  calculateDamage();
}

// ============================================================
// STATS CONFIG: 3x2 grid, clickable nature & IV slots
// ============================================================
function renderStatsConfig(side) {
  const spirit = side === 'attacker' ? state.attacker : state.defender;
  if (!spirit) return;
  const statsSection = document.getElementById(`${side}-stats`);
  const grid = document.getElementById(`${side}-stats-grid`);
  statsSection.style.display = 'block';

  const nature = getNature(side);
  const ivs = getIVs(side);
  const ivFull = ivs.length >= MAX_IV;

  // Buff chips in title (replaces old "个体 X/3 / 性格 ↑A / ↓B" text)
  renderBuffChips(side);

  // Build 3x2 grid
  grid.innerHTML = STAT_KEYS.map(statKey => {
    const isUp   = nature.up   === statKey;
    const isDown = nature.down === statKey;
    const hasIV  = ivs.includes(statKey);
    const finalVal = getFinalStat(spirit, statKey, nature, ivs);
    // Determine if this slot can be assigned (only if both natures are not yet set, and slot is empty)
    // The slot is "available" if: (no up and no down) OR (only up set and this slot is not the up) OR (only down set and this slot is not the down)
    const noNature = !nature.up && !nature.down;
    const onlyUp   = nature.up && !nature.down;
    const onlyDown = !nature.up && nature.down;
    const natureAvailable = (isUp || isDown)
      ? false // already set, click clears
      : (noNature || onlyUp || onlyDown);
    const ivAddable = !hasIV && !ivFull;
    return `
      <div class="stat-cell" data-stat="${statKey}">
        <div class="nature-slot ${isUp ? 'up' : ''} ${isDown ? 'down' : ''} ${!isUp && !isDown && !natureAvailable ? 'disabled' : ''}"
             role="button" tabindex="${(!isUp && !isDown && !natureAvailable) ? -1 : 0}"
             aria-label="${STAT_LABELS[statKey]} 性格：${isUp ? '正面' : isDown ? '负面' : '未设置'}（点击切换）"
             aria-pressed="${(isUp || isDown) ? 'true' : 'false'}"
             title="性格: ${isUp ? '正面' : isDown ? '负面' : '未设置'}"
             onclick="onNatureSlotClick('${side}', '${statKey}', event)"
             onkeydown="onNatureSlotKey(event, '${side}', '${statKey}')">
          ${isUp ? '▲' : isDown ? '▼' : ''}
        </div>
        <div class="stat-center">
          <div class="stat-label">${STAT_LABELS[statKey]}</div>
          <div class="stat-value">${finalVal}</div>
        </div>
        <div class="iv-slot ${hasIV ? 'active' : ''} ${!hasIV && !ivAddable ? 'disabled' : ''}"
             role="button" tabindex="${!hasIV && !ivAddable ? -1 : 0}"
             aria-label="${STAT_LABELS[statKey]} 个体值：${hasIV ? '已选' : '未选'}（点击切换）"
             aria-pressed="${hasIV ? 'true' : 'false'}"
             title="个体值: ${hasIV ? '已选' : '未选'}"
             onclick="onIVSlotClick('${side}', '${statKey}', event)"
             onkeydown="onIVSlotKey(event, '${side}', '${statKey}')">
          ${hasIV ? '(+60)' : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Nature slot click behavior (E2):
// - If slot has value (▲/▼): clear that side
// - If slot is empty:
//     - no up & no down: assign ▲ (up)
//     - only up set: assign ▼ (down)
//     - only down set: assign ▲ (up)
//     - both set: do nothing
function onNatureSlotClick(side, statKey, ev) {
  ev.stopPropagation();
  const nature = { ...getNature(side) };
  if (nature.up === statKey) {
    nature.up = null;
  } else if (nature.down === statKey) {
    nature.down = null;
  } else {
    // slot is empty
    if (nature.up && nature.down) return; // both already set
    if (!nature.up && !nature.down) {
      nature.up = statKey;       // first → up
    } else if (nature.up) {
      nature.down = statKey;      // missing negative
    } else {
      nature.up = statKey;        // missing positive
    }
  }
  setNature(side, nature);
  // 写入该精灵该侧的性格 / 个体值存档（未选精灵时为 no-op）。
  const id = state[side] && state[side].id;
  if (id) saveSpiritConfig(id, side, getNature(side), getIVs(side));
  renderStatsConfig(side);
  calculateDamage();
}

// IV slot click: toggle on/off (subject to MAX_IV)
function onIVSlotClick(side, statKey, ev) {
  ev.stopPropagation();
  const ivs = getIVs(side).slice();
  const idx = ivs.indexOf(statKey);
  if (idx >= 0) {
    ivs.splice(idx, 1);
  } else {
    if (ivs.length >= MAX_IV) return;
    ivs.push(statKey);
  }
  setIVs(side, ivs);
  // 写入该精灵该侧的性格 / 个体值存档（未选精灵时为 no-op）。
  const id = state[side] && state[side].id;
  if (id) saveSpiritConfig(id, side, getNature(side), getIVs(side));
  renderStatsConfig(side);
  calculateDamage();
}

// ============================================================
// CHIP DRAG INFRA: shared press-and-drag horizontal adjust +
// wheel + dblclick-reset for `.buff-chip` elements. Pure glue —
// the factory owns event wiring, pointer capture, the
// "dragging" class, and live DOM updates (text +
// positive/negative/neutral class). The caller supplies the
// value model: how a drag delta or wheel tick maps to a new
// value, plus the read/write/format hooks.
//
// Two callers in this file:
//   - BUFF CHIP:        continuous pct, range [-990, 990], step 10
//   - POWER-BOOST CHIP: discrete-level step (40 or 20), range [0, 990]
// ============================================================
function attachChipDrag(chip, opts) {
  const {
    shiftMultiplier,   // wheel: shift+wheel = ×N of one tick
    getVal,            // () => currentValue
    setVal,            // (newVal) => void  (writes to state)
    formatVal,         // (val) => string
    prepareDrag,       // () => startExtra object | null | false (false = abort)
    dragValue,         // (dx, startVal, startExtra) => newVal | null
    wheelValue,        // (curVal, dirMult) => newVal | null
    reset,             // () => void  (writes 0, full re-render)
    onChange,          // () => void  (e.g. calculateDamage)
  } = opts;
  let drag = null;

  function applyLive(newVal) {
    const span = chip.querySelector('.buff-val');
    if (span) span.textContent = formatVal(newVal);
    chip.classList.remove('positive', 'negative', 'neutral');
    chip.classList.add(_buffChipClass(newVal));
  }

  function onDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const startExtra = prepareDrag ? prepareDrag() : null;
    if (startExtra === false) return;   // caller aborted (e.g. no config)
    drag = { startX: e.clientX, startVal: getVal(), pointerId: e.pointerId, startExtra };
    try { chip.setPointerCapture(e.pointerId); } catch (_) {}
    chip.classList.add('dragging');
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    const newVal = dragValue(e.clientX - drag.startX, drag.startVal, drag.startExtra);
    if (newVal == null || newVal === getVal()) return;
    setVal(newVal);
    applyLive(newVal);
    onChange && onChange();
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    try { chip.releasePointerCapture(e.pointerId); } catch (_) {}
    chip.classList.remove('dragging');
    drag = null;
  }
  function onWheel(e) {
    e.preventDefault();
    const dirMult = (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? shiftMultiplier : 1);
    const newVal = wheelValue(getVal(), dirMult);
    if (newVal == null || newVal === getVal()) return;
    setVal(newVal);
    applyLive(newVal);
    onChange && onChange();
  }
  function onDbl(e) {
    e.stopPropagation();
    e.preventDefault();
    if (getVal() === 0) return;
    reset();
    onChange && onChange();
  }

  chip.addEventListener('pointerdown',   onDown);
  chip.addEventListener('pointermove',   onMove);
  chip.addEventListener('pointerup',     onUp);
  chip.addEventListener('pointercancel', onUp);
  chip.addEventListener('wheel',         onWheel, { passive: false });
  chip.addEventListener('dblclick',      onDbl);
}

// ============================================================
// BUFF CHIPS: press-and-drag horizontal to adjust the atk/matk
// (or def/mdef) stat by ±10% per 8px; double-click to reset.
// ============================================================
const BUFF_STAT_CONFIGS = {
  attacker: [{ key: 'atk',  label: '物攻' }, { key: 'matk', label: '魔攻' }],
  defender: [{ key: 'def',  label: '物防' }, { key: 'mdef', label: '魔防' }]
};
const BUFF_DRAG_PX_PER_STEP = 8;   // 8px → 10% step
const BUFF_STEP_PCT = 10;
const BUFF_MAX_PCT = 990;
const BUFF_MIN_PCT = -100;

function _buffChipClass(val) {
  return val > 0 ? 'positive' : val < 0 ? 'negative' : 'neutral';
}

function renderBuffChips(side) {
  const container = document.getElementById(`${side}-buff-chips`);
  if (!container) return;
  const configs = BUFF_STAT_CONFIGS[side] || [];

  // Speed chip comes FIRST so it visually appears on the left of the
  // atk/matk (or def/mdef) chips. Always present on both sides.
  const val = getSpeed(side);
  const cls = _buffChipClass(val);
  const speedHTML = `<div class="buff-chip ${cls}"
                          aria-label="${SPEED_LABEL} 调整（当前 ${formatSpeed(val)}，拖动 / 滚轮 / 双击重置）"
                          data-side="${side}" data-stat="speed"
                          title="拖动 · 滚轮 · 双击重置">${SPEED_LABEL} <span class="buff-val">${formatSpeed(val)}</span></div>`;

  const buffsHTML = configs.map(c => {
    const bv = getBuff(side, c.key);
    const bcls = _buffChipClass(bv);
    return `<div class="buff-chip ${bcls}"
                 aria-label="${c.label} 调整（当前 ${formatBuff(bv)}，拖动 / 滚轮 / 双击重置）"
                 data-side="${side}" data-stat="${c.key}"
                 title="拖动 · 滚轮 · 双击重置">${c.label} <span class="buff-val">${formatBuff(bv)}</span></div>`;
  }).join('');

  container.innerHTML = speedHTML + buffsHTML;

  const speedChip = container.querySelector(`.buff-chip[data-stat="speed"]`);
  if (speedChip) {
    attachChipDrag(speedChip, {
      shiftMultiplier: 5,
      getVal: () => getSpeed(side),
      setVal: (v) => setSpeed(side, v),
      formatVal: formatSpeed,
      dragValue: (dx, startVal) => {
        const delta = Math.round(dx / SPEED_DRAG_PX_PER_STEP) * SPEED_STEP;
        return Math.max(SPEED_MIN, Math.min(SPEED_MAX, startVal + delta));
      },
      wheelValue: (cur, dirMult) => {
        return Math.max(SPEED_MIN, Math.min(SPEED_MAX, cur + dirMult * SPEED_STEP));
      },
      reset: () => { setSpeed(side, 0); renderBuffChips(side); },
      onChange: calculateDamage,
    });
  }

  for (const c of configs) {
    const chip = container.querySelector(`.buff-chip[data-stat="${c.key}"]`);
    if (!chip) continue;
    attachChipDrag(chip, {
      shiftMultiplier: 5,
      getVal: () => getBuff(side, c.key),
      setVal: (v) => setBuff(side, c.key, v),
      formatVal: formatBuff,
      dragValue: (dx, startVal) => {
        const delta = Math.round(dx / BUFF_DRAG_PX_PER_STEP) * BUFF_STEP_PCT;
        return Math.max(BUFF_MIN_PCT, Math.min(BUFF_MAX_PCT, startVal + delta));
      },
      wheelValue: (cur, dirMult) => {
        return Math.max(BUFF_MIN_PCT, Math.min(BUFF_MAX_PCT, cur + dirMult * BUFF_STEP_PCT));
      },
      reset: () => { setBuff(side, c.key, 0); renderBuffChips(side); },
      onChange: calculateDamage,
    });
  }
}

// ============================================================
// 威力 / 连击数 CHIPS
// Both chips live in the attacker's skill header (the same DOM
// container). 连击数 sits to the LEFT of 威力. They are always
// visible, share the .buff-chip visual style, and behave like the
// stat-buff chips (press-and-drag horizontal, wheel, dblclick to
// reset).
//
//   威力:    flat addition to skill base power.  Range [-990, +990], step 10.
//   连击数:  flat addition to skill combo count. Range [-99,  +99], step  1.
//
//   Replaces the old 化劲/羽化 chips (which had per-pet step
//   values of 40 and 20 respectively and a [0, 990] range) with a
//   single always-visible 威力 chip, and adds a symmetric
//   连击数 chip for adjusting the hit count.
// ============================================================
const POWER_LABEL = '威力';
const POWER_MIN = -990;
const POWER_MAX = 990;
const POWER_STEP = 10;
const POWER_DRAG_PX_PER_STEP = 8;

const COMBO_LABEL = '连击';
const COMBO_MIN = -99;
const COMBO_MAX = 99;
const COMBO_STEP = 1;
const COMBO_DRAG_PX_PER_STEP = 8;

function getPowerBoost() { return state.attackerPowerBoost; }
function setPowerBoost(val) {
  const clamped = Math.max(POWER_MIN, Math.min(POWER_MAX, Math.round(val / POWER_STEP) * POWER_STEP));
  state.attackerPowerBoost = clamped;
}
function formatPowerBoost(val) {
  if (val > 0) return '+' + val;
  if (val < 0) return String(val);   // already has minus sign
  return '+0';
}

function getComboBoost() { return state.attackerCombo; }
function setComboBoost(val) {
  const clamped = Math.max(COMBO_MIN, Math.min(COMBO_MAX, Math.round(val / COMBO_STEP) * COMBO_STEP));
  state.attackerCombo = clamped;
}
function formatComboBoost(val) {
  if (val > 0) return '+' + val;
  if (val < 0) return String(val);   // already has minus sign
  return '+0';
}

function renderPowerBoostChip() {
  const container = document.getElementById('attacker-power-boost-chip');
  if (!container) return;
  // Defensive: clamp stale out-of-range values before displaying.
  setPowerBoost(getPowerBoost());
  setComboBoost(getComboBoost());

  // 连击数 chip — rendered first so it sits to the LEFT of 威力.
  const comboVal = getComboBoost();
  const comboCls = _buffChipClass(comboVal);
  const comboHTML = `<div class="buff-chip ${comboCls}"
                            aria-label="${COMBO_LABEL} 调整（当前 ${formatComboBoost(comboVal)}，拖动 / 滚轮 / 双击重置）"
                            data-stat="combo"
                            title="拖动 · 滚轮 · 双击重置">${COMBO_LABEL} <span class="buff-val">${formatComboBoost(comboVal)}</span></div>`;

  // 威力 chip.
  const powerVal = getPowerBoost();
  const powerCls = _buffChipClass(powerVal);
  const powerHTML = `<div class="buff-chip ${powerCls}"
                            aria-label="${POWER_LABEL} 调整（当前 ${formatPowerBoost(powerVal)}，拖动 / 滚轮 / 双击重置）"
                            data-stat="power"
                            title="拖动 · 滚轮 · 双击重置">${POWER_LABEL} <span class="buff-val">${formatPowerBoost(powerVal)}</span></div>`;

  container.innerHTML = comboHTML + powerHTML;

  const comboChip = container.querySelector('.buff-chip[data-stat="combo"]');
  if (comboChip) {
    attachChipDrag(comboChip, {
      shiftMultiplier: 5,
      getVal: getComboBoost,
      setVal: (v) => { state.attackerCombo = v; },
      formatVal: formatComboBoost,
      dragValue: (dx, startVal) => {
        const delta = Math.round(dx / COMBO_DRAG_PX_PER_STEP) * COMBO_STEP;
        return Math.max(COMBO_MIN, Math.min(COMBO_MAX, startVal + delta));
      },
      wheelValue: (cur, dirMult) => {
        return Math.max(COMBO_MIN, Math.min(COMBO_MAX, cur + dirMult * COMBO_STEP));
      },
      reset: () => { state.attackerCombo = 0; renderPowerBoostChip(); },
      onChange: calculateDamage,
    });
  }

  const powerChip = container.querySelector('.buff-chip[data-stat="power"]');
  if (powerChip) {
    attachChipDrag(powerChip, {
      shiftMultiplier: 5,
      getVal: getPowerBoost,
      setVal: (v) => { state.attackerPowerBoost = v; },
      formatVal: formatPowerBoost,
      dragValue: (dx, startVal) => {
        const delta = Math.round(dx / POWER_DRAG_PX_PER_STEP) * POWER_STEP;
        return Math.max(POWER_MIN, Math.min(POWER_MAX, startVal + delta));
      },
      wheelValue: (cur, dirMult) => {
        return Math.max(POWER_MIN, Math.min(POWER_MAX, cur + dirMult * POWER_STEP));
      },
      reset: () => { state.attackerPowerBoost = 0; renderPowerBoostChip(); },
      onChange: calculateDamage,
    });
  }
}

// ============================================================
// SPEED CHIP: 速度 — flat addition to the pet's speed stat.
// Always shown on BOTH attacker and defender sides (each side
// stores its own value). Reuses the .buff-chip visual style;
// behaviour mirrors the buff chips (press-and-drag horizontal,
// wheel, dblclick to reset). Range [-990, +990], step 10.
// ============================================================
const SPEED_LABEL = '速度';
const SPEED_MIN = -990;
const SPEED_MAX = 990;
const SPEED_STEP = 10;
const SPEED_DRAG_PX_PER_STEP = 8;

function getSpeed(side) {
  return side === 'attacker' ? state.attackerSpeed : state.defenderSpeed;
}
function setSpeed(side, val) {
  const clamped = Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(val / SPEED_STEP) * SPEED_STEP));
  if (side === 'attacker') state.attackerSpeed = clamped;
  else                     state.defenderSpeed = clamped;
}
function formatSpeed(val) {
  if (val > 0) return '+' + val;
  if (val < 0) return String(val);   // already has minus sign
  return '+0';
}

// Keyboard support for spirit-card (Enter/Space to open the picker)
function onSpiritCardKey(e, side) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    enterSpiritPicker(side);
  }
}

// Keyboard support for spirit-picker-option (Enter/Space to select)
function onSpiritPickerOptionKey(e, side, id) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    selectSpirit(side, id);
  }
}

// Keyboard support for nature slot (Enter/Space to toggle)
function onNatureSlotKey(e, side, statKey) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onNatureSlotClick(side, statKey, e);
  }
}

// Keyboard support for IV slot (Enter/Space to toggle)
function onIVSlotKey(e, side, statKey) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onIVSlotClick(side, statKey, e);
  }
}

function renderSkillIconHTML(sk, el) {
  // Main skill icon (real url or element-emoji placeholder)
  let main;
  if (sk.icon_url) {
    main = `<img src="${sk.icon_url}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'placeholder',textContent:'${el.emoji}',style:'--el-color:${el.color}'}))">`;
  } else {
    main = `<div class="placeholder" style="--el-color:${el.color}">${el.emoji}</div>`;
  }
  // Element icon overlay at top-left corner (only when an iconUrl is available)
  let elOverlay = '';
  if (el && el.iconUrl) {
    elOverlay = `<div class="el-overlay"><img src="${el.iconUrl}" loading="lazy" alt="${el.name}"></div>`;
  }
  return main + elOverlay;
}

// Build the badge row (物攻/魔攻 + 威力 * 减伤) — multiple badges
// `powerClass` optionally adds 'super-effective' / 'not-effective' to the power badge
function renderInlineBadge(sk, powerClass = '') {
  if (sk._pseudo) return '';
  const badges = [];
  if (sk.damage_class === '物攻') {
    badges.push(`<span class="skill-badge atk">物攻</span>`);
  } else if (sk.damage_class === '魔攻') {
    badges.push(`<span class="skill-badge matk">魔攻</span>`);
  } else if (sk.damage_class === '自适应') {
    // 愿力冲击：伤害类型由精灵当前最终物攻/魔攻中较高者决定
    badges.push(`<span class="skill-badge auto">自适应</span>`);
  }
  if (sk.damage_class) {
    // attack skill: show power
    const cls = powerClass ? `skill-badge power ${powerClass}` : 'skill-badge power';
    const comboSuffix = sk.combo != null ? `x${sk.combo}` : '';
    badges.push(`<span class="${cls}">威力 ${sk.power}${comboSuffix}</span>`);
  }
  if (sk.reduction !== undefined) {
    // defense skill: show reduction
    const pct = Math.round((1 - (sk.reduction ?? 0)) * 100);
    badges.push(`<span class="skill-badge reduction">减伤 ${pct}%</span>`);
  }
  return badges.join('');
}

function renderSkills(side) {
  // .skill-list 是外层（高度对齐 + 宽度补偿），实际 grid 在
  // .skill-list-inner 里（见 styles.css .skill-list 结构注释）。
  // 这里拿到 inner，renderSkills 的输出直接进 grid。
  const _inner = (list) => list.querySelector('.skill-list-inner') || list;
  if (side === 'attacker') {
    const list = document.getElementById('attacker-skill-list');
    const inner = _inner(list);
    const opts = getAttackSkillOptions(state.attacker);
    if (!opts.length) {
      inner.innerHTML = `<div style="grid-column:1/-1;color:var(--text-secondary);font-size:0.8rem;padding:8px;">无可用攻击技能</div>`;
      return;
    }
    // For each attack skill, determine power-badge color based on
    // type-effectiveness against the (current) defender's types.
    // 3  = 双重克制 (darker green)
    // 2  = 单重克制 (light green)
    // 0.5 = 单重抵抗 (light red)
    // 0.25 = 双重抵抗 (darker red)
    const defenderTypes = state.defender ? (state.defender.types || []) : [];
    inner.innerHTML = opts.map((sk, idx) => {
      const el = elOf(sk.element);
      const eff = effectiveness(sk.element, defenderTypes);
      let powerClass = '';
      if (eff === 3)        powerClass = 'super-effective double';
      else if (eff === 2)   powerClass = 'super-effective';
      else if (eff === 0.5) powerClass = 'not-effective';
      else if (eff === 0.25) powerClass = 'not-effective double';
      return `
        <button class="skill-btn ${idx === state.attackSkillIdx ? 'active' : ''}"
                data-idx="${idx}"
                onclick="selectAttackSkill(${idx})">
          <div class="skill-icon"${sk.desc ? ` title="${sk.desc}"` : ''}>${renderSkillIconHTML(sk, el)}</div>
          <div class="skill-content">
            <span class="skill-name">${sk.name}</span>
            <div class="skill-badges-row">${renderInlineBadge(sk, powerClass)}</div>
          </div>
        </button>
      `;
    }).join('');
  } else {
    const list = document.getElementById('defender-skill-list');
    const inner = _inner(list);
    const opts = getDefenseSkillOptions(state.defender);
    inner.innerHTML = opts.map((sk, idx) => {
      const isNone = sk._pseudo;
      const el = elOf(isNone ? '' : sk.element);
      const iconHTML = isNone
        ? `<div class="placeholder" style="--el-color:#666">—</div>`
        : renderSkillIconHTML(sk, el);
      return `
        <button class="skill-btn ${idx === state.defenseSkillIdx ? 'active' : ''}"
                data-idx="${idx}"
                onclick="selectDefenseSkill(${idx})">
          <div class="skill-icon"${sk.desc ? ` title="${sk.desc}"` : ''}>${iconHTML}</div>
          <div class="skill-content">
            <span class="skill-name">${isNone ? '无' : sk.name}</span>
            <div class="skill-badges-row">${renderInlineBadge(sk)}</div>
          </div>
        </button>
      `;
    }).join('');
  }
}

function selectAttackSkill(idx) {
  const opts = getAttackSkillOptions(state.attacker);
  if (idx < 0 || idx >= opts.length) return;
  // 仅切换 active class；不要重渲 list —— 重渲会把所有 <img> 重新插入 DOM，
  // 在 iOS Safari 滚动容器 + display:grid 内会触发图标整体闪烁（cached
  // image 短暂回到底色再重绘）。list 真正变化时（精灵切换 / 防御方切
  // 换 / 挑战切题 / 退出挑战）renderSkills 仍会被调用。
  const prevIdx = state.attackSkillIdx;
  if (prevIdx === idx) return;
  state.attackSkillIdx = idx;
  state.attackSkill = opts[idx];
  _setActiveSkill('attacker', prevIdx, idx);
  calculateDamage();
}
function selectDefenseSkill(idx) {
  const opts = getDefenseSkillOptions(state.defender);
  if (idx < 0 || idx >= opts.length) return;
  // 同 selectAttackSkill：仅切 active class，不重渲。
  const prevIdx = state.defenseSkillIdx;
  if (prevIdx === idx) return;
  state.defenseSkillIdx = idx;
  state.defenseSkill = opts[idx];
  _setActiveSkill('defender', prevIdx, idx);
  calculateDamage();
}

// 切换 .skill-btn 的 active class；list 元素必须是当前已渲染的子集
// （prevIdx / newIdx 在 list 范围内）。找不到对应按钮时静默失败。
// 注意：.skill-btn 现在挂在 .skill-list-inner 里（见 styles.css
// .skill-list 结构注释），所以 querySelector 要走 inner。
function _setActiveSkill(side, prevIdx, newIdx) {
  const list = document.getElementById(side + '-skill-list');
  if (!list) return;
  const scope = list.querySelector('.skill-list-inner') || list;
  if (prevIdx >= 0) {
    const prevBtn = scope.querySelector('.skill-btn[data-idx="' + prevIdx + '"]');
    if (prevBtn) prevBtn.classList.remove('active');
  }
  const newBtn = scope.querySelector('.skill-btn[data-idx="' + newIdx + '"]');
  if (newBtn) newBtn.classList.add('active');
}

// ============================================================
// DYNAMIC SKILL MODIFIERS: skill-id-keyed function dictionary.
// Each entry takes (ctx, fromAttacker) and returns either null or
//   {
//     comboAdd?: number, comboMult?: number, powerMult?: number, powerAdd?: number,
//     ignoreResist?: boolean, elementOverride?: string,
//     notes?: string[],
//   }.
// ignoreResist: true ⇒ the defender's type resistance (effectiveness < 1)
//   is neutralized to 1 (weak/super-effective multipliers are preserved).
// elementOverride: if set, replaces skill.element for STAB / effectiveness /
//   幻-element checks during damage calculation (e.g. 展翅 changes
//   普通系 → 翼系). The original skill.element is preserved.
// The aggregator (computeSkillDynamicModifiers) merges them.
//
// The ctx object always carries:
//   starLayer, activeSkill, attacker, defender
//   attackerNature, defenderNature, attackerIVs, defenderIVs
//   attackerSpeedBonus, defenderSpeedBonus
//   attackerEffectiveSpeed, defenderEffectiveSpeed
// (effective speed = finalSpeed(stat-block) + speedChip bonus)
// ============================================================
function isFirstStrike(ctx) {
  const firstStrike = !!FIRST_STRIKE_SKILLS[ctx.attackSkill.id];
  const lastStrike = !!LAST_STRIKE_SKILLS[ctx.attackSkill.id];
  const faster = ctx.attackerEffectiveSpeed > ctx.defenderEffectiveSpeed;
  const reacted = ctx.attackSkill.desc.includes('应对状态：') && ctx.defenseSkill.category === '状态';
  if (ctx.defenseSkill.category === '防御' || lastStrike) return [false, ''];
  if (!(firstStrike || faster || reacted)) return [false, ''];
  const reason = firstStrike
    ? `先手技能 ${ctx.attackSkill.name}`
    : reacted
    ? '应对必定先手'
    : `速度 ${ctx.attackerEffectiveSpeed} > ${ctx.defenderEffectiveSpeed}`;
  return [true, reason];
}
const SKILL_MODS = {
  // 多维击打：敌方每有 1 层星陨，本次连击 +1
  多维击打(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (!ctx.starLayer) return null;
    return {
      comboAdd: ctx.starLayer,
      notes: [`连击 +${ctx.starLayer}（星陨 ${ctx.starLayer} 层）`],
    };
  },
  // 观星：地系技能威力每层星陨 +20%
  观星(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (stripXi(ctx.attackSkill.element) !== '地') return null;
    if (!ctx.starLayer) return null;
    const multAdd = 0.2 * ctx.starLayer;
    return {
      powerMultAdd: multAdd,
      notes: [`威力 +${Math.floor(multAdd*100)}%（星陨 ${ctx.starLayer} 层 ×20%）`],
    };
  },
  // 坠星：全技能威力每层星陨 +20%
  坠星(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (!ctx.starLayer) return null;
    const multAdd = 0.2 * ctx.starLayer;
    return {
      powerMultAdd: multAdd,
      notes: [`威力 +${Math.floor(multAdd*100)}%（星陨 ${ctx.starLayer} 层 ×20%）`],
    };
  },
  // 天体吸积：每 1 层星陨印记，技能威力 +20
  天体吸积(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (!ctx.starLayer) return null;
    const add = 20 * ctx.starLayer;
    return {
      powerAdd: add,
      notes: [`威力 +${add}（星陨 ${ctx.starLayer} 层 ×20）`],
    };
  },
  // 星痕：若对手有印记，本次技能威力 +40
  星痕(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (!ctx.starLayer) return null;
    return {
      powerAdd: 40,
      notes: ['威力 +40（有至少一层印记）'],
    };
  },
  // 狂欢开始：本精灵受到的克制伤害+25%
  狂欢开始(ctx, fromAttacker) {
    if (fromAttacker) return null;
    if (effectiveness(ctx.attackSkill.element, ctx.defender.types) <= 1) return null;
    return {
      powerMult: 1.25,
      notes: ['威力 ×1.25（额外克制伤害）'],
    };
  },
  // 顺风（岚鸟特性）：若先于敌方攻击，本次技能威力 +50%。
  // 判定"先于敌方攻击"的条件（任一满足即触发）：
  //   (a) 攻击技能本身是必先手技能（FIRST_STRIKE_SKILLS）
  //   (b) 攻击方有效速度严格大于防御方有效速度（平速在游戏内会拼速，在这里直接不算）
  //   (c) 防御方没有使用防御技能（应对成功必定先手）
  // 有效速度 = 性格/个体修正后的最终速度 + 速度 chip 调整。
  顺风(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    const [firstStrike, reason] = isFirstStrike(ctx);
    if (!firstStrike) return null;
    return {
      powerMultAdd: 0.5,
      notes: [`威力 +50%（先于敌方攻击 · ${reason}）`],
    };
  },
  // 破空（霜翼领主特性）：若先于敌方攻击，本次技能威力 +75%
  破空(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    const [firstStrike, reason] = isFirstStrike(ctx);
    if (!firstStrike) return null;
    return {
      powerMultAdd: 0.75,
      notes: [`威力 +75%（先于敌方攻击 · ${reason}）`],
    };
  },
  // 扇风：若先于敌方攻击，本次技能威力 +50%
  扇风(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    const [firstStrike, reason] = isFirstStrike(ctx);
    if (!firstStrike) return null;
    return {
      powerMultAdd: 0.5,
      notes: [`威力 +50%（先于敌方攻击 · ${reason}）`],
    };
  },
  // 疾风刺：若先于敌方攻击，改为3连击
  疾风刺(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    const [firstStrike, reason] = isFirstStrike(ctx);
    if (!firstStrike) return null;
    return {
      comboAdd: 2,
      notes: [`变为3连击（先于敌方攻击 · ${reason}）`],
    };
  },
  // 展翅：自己携带的普通系技能变为翼系技能，若后于对手行动，自己受到的伤害+25%
  展翅(ctx, fromAttacker) {
    if (fromAttacker) {
      // 通过 elementOverride 在伤害计算时把 effective element 替换为翼系，
      if (stripXi(ctx.attackSkill.element) !== '普通') return null;
      return {
        elementOverride: '翼系',
        notes: ['普通系技能变为翼系'],
      };
    }
    else {
      const [firstStrike, reason] = isFirstStrike(ctx);
      if (!firstStrike) return null;
      return {
        powerMult: 1.25,
        notes: [`威力 ×1.25（后于对手行动 · ${reason}）`],
      };
    }
  },
  // 铁蒺藜：应对状态：本次伤害翻倍
  铁蒺藜(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 2,
      notes: [`威力翻倍（应对状态）`],
    };
  },
  // 龙卷风：应对状态：本次技能威力变为1.5倍
  龙卷风(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 1.5,
      notes: [`威力 ×1.5（应对状态）`],
    };
  },
  // 追打：应对状态：本技能变为3连击
  追打(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      comboAdd: 2,
      notes: [`技能变为3连击（应对状态）`],
    };
  },
  // 炙热波动：应对状态：本次技能威力和赋予灼烧翻倍
  炙热波动(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 2,
      notes: [`威力翻倍（应对状态）`],
    };
  },
  // 虫击：应对状态：本次技能威力变为2倍，无视敌方系别抵抗
  虫击(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 2,
      ignoreResist: true,
      notes: [`威力 ×2，无视敌方系别抵抗（应对状态）`],
    };
  },
  // 突袭：应对状态：本次技能威力变为3倍
  突袭(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 3,
      notes: [`威力 ×3（应对状态）`],
    };
  },
  // 暗突袭：应对状态：本次技能威力翻倍
  暗突袭(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 2,
      notes: [`威力翻倍（应对状态）`],
    };
  },
  // 爆冲：应对状态：本次技能威力变为5倍
  爆冲(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 5,
      notes: [`威力 ×5（应对状态）`],
    };
  },
  // 技巧打击：应对状态：本次技能威力变为10倍
  技巧打击(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 10,
      notes: [`威力 ×10（应对状态）`],
    };
  },
  // 无影脚：应对状态：本次技能威力变为2倍
  无影脚(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 2,
      notes: [`威力 ×2（应对状态）`],
    };
  },
  // 偷袭：应对状态：本次技能威力变为3倍
  偷袭(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 3,
      notes: [`威力 ×3（应对状态）`],
    };
  },
  // 散手：应对状态：本技能改为6连击
  散手(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      comboAdd: 4,
      notes: [`变为6连击（应对状态）`],
    };
  },
  // 连续爪击：应对状态：本次技能连击数翻倍
  连续爪击(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      comboMult: 2,
      notes: [`连击数翻倍（应对状态）`],
    };
  },
  // 滚雪球：应对状态：额外获得2层，本次技能威力翻倍
  滚雪球(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 2,
      notes: [`威力翻倍（应对状态）`],
    };
  },
  // 吹炎：应对状态：本次技能威力翻倍
  吹炎(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 2,
      notes: [`威力翻倍（应对状态）`],
    };
  },
  // 地陷：应对状态：本次技能威力翻倍，且物防额外+70%
  地陷(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 2,
      notes: [`威力翻倍（应对状态）`],
    };
  },
  // 闪燃：应对状态：本次技能威力变为4倍
  闪燃(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      powerMult: 4,
      notes: [`威力 ×4（应对状态）`],
    };
  },
  // 灾厄：对自己造成物伤，应对状态：改为对敌方造成物伤，且本次技能威力+120
  灾厄(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') {
      return {
        // 相当于不造成伤害
        powerAdd: -9999,
        notes: [`威力 -9999（对自己造成物伤）`],
      };
    }
    else {
      return {
        powerAdd: 120,
        notes: [`威力 +120（应对状态）`],
      };
    }
  },
  // 变形活画：敌方每有1层增益，本次技能威力+10%
  变形活画(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    const speedLayers = Math.max(0, Math.floor(ctx.defenderSpeedBonus / 10));
    const defLayers   = Math.max(0, Math.floor(getBuff('defender', 'def')  / 10));
    const mdefLayers  = Math.max(0, Math.floor(getBuff('defender', 'mdef') / 10));
    const layers = speedLayers + defLayers + mdefLayers;
    if (layers === 0) return null;
    return {
      powerMultAdd: layers * 0.1,
      notes: [`威力 +${layers * 10}%（${layers} 层增益 ×10%）`],
    };
  },
  // 急中生智：自己有减益时，本次技能威力 +40
  急中生智(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    const speed = ctx.attackerSpeedBonus;
    const atk   = getBuff('attacker', 'atk');
    const matk  = getBuff('attacker', 'matk');
    const powerBoost = state.attackerPowerBoost;
    const combo = state.attackerCombo;
    for (const b of [speed, atk, matk, powerBoost, combo]) {
      if (b < 0) {
        return {
          powerAdd: 40,
          notes: ['威力 +40（自身有减益）'],
        };
      }
    }
    return null;
  },
  // 闪击：速度比敌方越高，本次技能威力越高
  闪击(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    const spdGap = ctx.attackerEffectiveSpeed - ctx.defenderEffectiveSpeed;
    if (spdGap <= 0) return null;
    let powerAdd;
    if (spdGap <= 120) {
      powerAdd = (1 + Math.floor((spdGap - 1) / 30)) * 20;
    }
    else {
      powerAdd = Math.min(140, 80 + (1 + Math.floor((spdGap - 121) / 30)) * 10);
    }
    return {
      powerAdd,
      notes: [`威力 +${powerAdd}（速度差 ${spdGap}）`],
    };
  },
  // 鸣沙陷阱：物防比敌方越高，本次技能威力越高
  鸣沙陷阱(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    const attackerDef = Math.max(0, Math.round(getFinalStat(ctx.attacker, 'def', ctx.attackerNature, ctx.attackerIVs) * (1 + getBuff('attacker', 'def') / 100)));
    const defenderDef = Math.max(0, Math.round(getFinalStat(ctx.defender, 'def', ctx.defenderNature, ctx.defenderIVs) * (1 + getBuff('defender', 'def') / 100)));
    const defGap = attackerDef - defenderDef;
    if (defGap <= 0) return null;
    let powerAdd;
    if (defGap <= 120) {
      powerAdd = (1 + Math.floor((defGap - 1) / 30)) * 20;
    }
    else {
      powerAdd = Math.min(140, 80 + (1 + Math.floor((defGap - 121) / 30)) * 10);
    }
    return {
      powerAdd,
      notes: [`威力 +${powerAdd}（物防差 ${defGap}）`],
    };
  },
  // 愿力冲击：应对状态：技能威力 +150%。伤害类型由精灵当前最终
  // 物攻/魔攻中的较高者决定（在 calculateDamage 中通过 modKey 命中）。
  // modKey 共享 __yuanli__，apply() 会按 modKey 回退查找。
  __yuanli__(ctx, fromAttacker) {
    if (!fromAttacker) return null;
    if (ctx.defenseSkill.category !== '状态') return null;
    return {
      // 愿力是乘算
      powerMult: 2.5,
      notes: [`威力 ×2.5（应对状态）`],
    };
  },
  // Add more skills here as they're introduced.
};

// 必先手技能：使用这些技能时无视双方速度差，必定先于敌方行动。
// 与 skill_000049（顺风）配合：先手技能让顺风必定触发威力 +50%。
const FIRST_STRIKE_SKILLS = {
  'skill_000654': true, // 俯冲
  'skill_000304': true, // 先发制人
  'skill_000305': true, // 天旋地转
};
// 后手技能：使用这些技能时无视双方速度差，必定后于敌方行动。
const LAST_STRIKE_SKILLS = {
  'skill_000309': true, // 后发制人
};

// Returns { powerMult, powerAdd, comboAdd, comboMult, notes: [{source, text}, ...] }.
// Iterates the attacker's skills (category === '特性') to collect
// passive characteristics; no positional assumption is made.
//
// The ctx object passed to each SKILL_MODS function carries:
//   - starLayer, attackSkill, attacker, defender, defenseSkill
//   - attackerNature, defenderNature, attackerIVs, defenderIVs
//   - attackerSpeedBonus, defenderSpeedBonus   (the 速度 chip values)
//   - attackerEffectiveSpeed, defenderEffectiveSpeed
//     (finalSpeed from stat-block + speed chip; this is the value
//      used by 顺风 / FIRST_STRIKE logic to decide who moves first)
function computeSkillDynamicModifiers(
  attacker, attackSkill,  attackerNature, attackerIVs,
  defender, defenseSkill, defenderNature, defenderIVs,
  starLayer
) {
  const atkSpeedBonus = state.attackerSpeed;
  const defSpeedBonus = state.defenderSpeed;
  const atkEffectiveSpeed = getFinalStat(attacker, 'spd', attackerNature, attackerIVs) + atkSpeedBonus;
  const defEffectiveSpeed = getFinalStat(defender, 'spd', defenderNature, defenderIVs) + defSpeedBonus;
  const ctx = {
    starLayer, attackSkill, attacker, defender, defenseSkill,
    attackerNature, defenderNature, attackerIVs, defenderIVs,
    attackerSpeedBonus: atkSpeedBonus, defenderSpeedBonus: defSpeedBonus,
    attackerEffectiveSpeed: atkEffectiveSpeed, defenderEffectiveSpeed: defEffectiveSpeed,
  };
  const result = { powerMultAdd: 1, powerMult: 1, powerAdd: 0, comboAdd: 0, comboMult: 1, ignoreResist: false, elementOverride: null, notes: [] };

  const apply = (skill, fromAttacker) => {
    // 优先用 modKey（用于把多个"同族"技能共享到同一条 SKILL_MODS），
    // 找不到时回退到 skill.id。
    const fn = SKILL_MODS[skill?.modKey] || SKILL_MODS[skill?.id];
    if (!fn) return;
    const mod = fn(ctx, fromAttacker);
    if (!mod) return;
    if (mod.comboAdd)     result.comboAdd     += mod.comboAdd;
    if (mod.powerAdd)     result.powerAdd     += mod.powerAdd;
    if (mod.powerMultAdd) result.powerMultAdd += mod.powerMultAdd;
    if (mod.powerMult)    result.powerMult    *= mod.powerMult;
    if (mod.comboMult)    result.comboMult    *= mod.comboMult;
    if (mod.ignoreResist) result.ignoreResist  = true;
    if (mod.elementOverride != null) result.elementOverride = mod.elementOverride;
    for (const text of (mod.notes || [])) {
      result.notes.push({ source: skill.name, text });
    }
  };

  // (1) Attacker's 特性 (characteristics).
  for (const sid of (attacker.skills || [])) {
    const sk = SKILLS[sid];
    if (!sk || sk.category !== '特性') continue;
    apply(sk, true);
    // 只存在一个特性
    break;
  }

  // (2) Attack skill self-modifier.
  apply(attackSkill, true);

  // (3) Defender's 特性 (characteristics).
  for (const sid of (defender.skills || [])) {
    const sk = SKILLS[sid];
    if (!sk || sk.category !== '特性') continue;
    apply(sk, false);
    // 只存在一个特性
    break;
  }

  // (4) Power multiplier.
  result.powerMult = result.powerMultAdd * result.powerMult;
  delete result.powerMultAdd;
  return result;
}

// ============================================================
// DAMAGE CALCULATION
// ============================================================
// 伤害计算：拆为两个函数。
//   computeFinalDamage(ctx) — 纯函数。读 ctx.*（不读全局 state），返回 data 对象。
//   calculateDamage()      — 副作用层。读 state，构造 ctx 调 computeFinalDamage，
//                           然后 renderResult + updateAtmosphere。
// 拆出的好处：挑战模式二分查找/最优点计算可重复调 computeFinalDamage，
// 不污染 DOM、不污染全局 state。
function computeFinalDamage(ctx) {
  const atk = ctx.attacker;
  const def = ctx.defender;
  const skill = ctx.attackSkill;
  const defSkill = ctx.defenseSkill || { reduction: 1, _pseudo: true };
  const n = ctx.starLayer;

  // 伤害类型决定：
  //   - damage_class === '自适应'（愿力冲击）：按精灵当前最终物攻/魔攻
  //     （含 buff）中较高者决定，物攻 ≥ 魔攻 → 物攻，否则魔攻。
  //   - 其他：保持原行为（'魔攻' → 魔攻，其余 → 物攻）。
  const atkNature = ctx.attackerNature;
  const defNature = ctx.defenderNature;
  const atkIVs    = ctx.attackerIVs;
  const defIVs    = ctx.defenderIVs;
  const atkBaseNoBuff  = getFinalStat(atk, 'atk',  atkNature, atkIVs);
  const matkBaseNoBuff = getFinalStat(atk, 'matk', atkNature, atkIVs);
  let isMagic;
  if (skill.damage_class === '自适应') {
    const atkFull  = atkBaseNoBuff  * (1 + (ctx.attackerBuff.atk  || 0) / 100);
    const matkFull = matkBaseNoBuff * (1 + (ctx.attackerBuff.matk || 0) / 100);
    // 物攻 ≥ 魔攻 → 物攻；只有魔攻严格更高时才用魔攻。
    isMagic = matkFull > atkFull;
  } else {
    isMagic = skill.damage_class === '魔攻';
  }
  const atkStatKey = isMagic ? 'matk' : 'atk';
  const defStatKey = isMagic ? 'mdef' : 'def';
  // Buff (in %) is applied on top of final stat. Floored at 0 to avoid
  // nonsensical negative stats from extreme debuffs.
  const atkBuffPct = (isMagic ? (ctx.attackerBuff.matk || 0) : (ctx.attackerBuff.atk || 0));
  const defBuffPct = (isMagic ? (ctx.defenderBuff.mdef || 0) : (ctx.defenderBuff.def  || 0));
  const atkStat = Math.max(0, Math.round((isMagic ? matkBaseNoBuff : atkBaseNoBuff) * (1 + atkBuffPct / 100)));
  const defStat = Math.max(0, Math.round(getFinalStat(def, defStatKey, defNature, defIVs) * (1 + defBuffPct / 100)));
  // Defender's max HP for HP bar / kill check uses final HP (NOT buffed)
  const defHP = getFinalStat(def, 'hp', defNature, defIVs);

  // Dynamic modifiers from special skills (power boost / extra hits tied to star layer, etc.)
  const dyn = computeSkillDynamicModifiers(atk, skill, atkNature, atkIVs, def, defSkill, defNature, defIVs, n);
  // 威力 chip — flat addition to base power (always shown).
  const powerBoost = ctx.attackerPowerBoost || 0;
  // 连击数 chip — flat addition to base combo count (always shown).
  const attackerCombo = ctx.attackerCombo || 0;
  // Effective element for STAB / effectiveness / 幻 checks. Dynamic modifiers
  // (e.g. 展翅) can override the skill's original element (普通 → 翼) without
  // mutating the skill data.
  const effectiveElement = dyn.elementOverride || skill.element;
  // Skill damage (STAB applied BEFORE type effectiveness)
  const stab = getStabMultiplier(atk, skill, dyn.elementOverride);
  const skillEffRaw = effectiveness(effectiveElement, def.types);
  // ignoreResist（如 虫击：应对状态）：把敌方的系别抵抗（< 1）中和为 1，
  // 但保留克制/双重克制等 > 1 的加成不变。
  const skillEff = (dyn.ignoreResist && skillEffRaw < 1) ? 1 : skillEffRaw;
  // 连击数 chip only takes effect for skills with a defined combo count
  // (skill.combo != null). Single-hit skills (no combo) are unaffected
  // by the chip; they still pick up dyn.comboAdd from skill modifiers
  // (e.g. 多维击打's starLayer-based extra hits) but never the chip.
  const hasCombo = skill.combo != null;
  const chipCombo = hasCombo ? attackerCombo : 0;
  const combo = Math.max(0, ((skill.combo ?? 1) + dyn.comboAdd + chipCombo) * dyn.comboMult);
  const power = Math.max(0, ((skill.power ?? 0) + powerBoost + dyn.powerAdd) * dyn.powerMult);
  const skillDmg = Math.floor(
    power * (atkStat / defStat) * (37 / 41) * stab * skillEff * (defSkill.reduction ?? 1) * combo
  );

  // Starfall damage (幻 element)
  const starPower = n * n + 24 * n - 24;
  const isSkillIllusion = stripXi(effectiveElement) === '幻';
  const starTriggered = n > 0 && !isSkillIllusion;
  const starEff = effectiveness('幻系', def.types);
  let starDmg = 0;
  if (starTriggered) {
    starDmg = Math.floor(
      starPower * (atkStat / defStat) * (37 / 41) * starEff * (defSkill.reduction ?? 1)
    );
  }
  const finalDamage = skillDmg + starDmg;

  const hpPercent = (finalDamage / defHP) * 100;
  const remainingHP = Math.max(0, defHP - finalDamage);
  const remainingPercent = (remainingHP / defHP) * 100;
  const isKill = finalDamage >= defHP;
  const overflow = isKill ? finalDamage - defHP : 0;

  return {
    finalDamage, skillDmg, starDmg, starPower,
    skillEff, skillEffRaw, starEff, stab, combo,
    hpPercent, remainingHP, remainingPercent, isKill, overflow,
    defHP, skill, defSkill, atk, def,
    isSkillIllusion, starTriggered, n,
    atkStat, defStat, isMagic, dyn,
    atkBuffPct, defBuffPct,
    powerBoost, attackerCombo, hasCombo
  };
}

function calculateDamage() {
  if (!state.attacker || !state.defender || !state.attackSkill) {
    renderWaiting();
    return;
  }
  // 构造 ctx 并调纯计算函数。挑战模式下，state 可能反映"上一题提交时的快照"，
  // 但 state.starLayer 仍随用户拖滑块实时变化，因此正常计算路径无需特殊处理。
  const data = computeFinalDamage({
    attacker: state.attacker,
    defender: state.defender,
    attackSkill: state.attackSkill,
    defenseSkill: state.defenseSkill,
    attackerNature: state.attackerNature,
    defenderNature: state.defenderNature,
    attackerIVs: state.attackerIVs,
    defenderIVs: state.defenderIVs,
    attackerBuff: state.attackerBuff,
    defenderBuff: state.defenderBuff,
    attackerSpeed: state.attackerSpeed,
    defenderSpeed: state.defenderSpeed,
    attackerPowerBoost: state.attackerPowerBoost,
    attackerCombo: state.attackerCombo,
    starLayer: state.starLayer,
  });
  renderResult(data);
  updateAtmosphere(data.hpPercent, data.isKill);
}

// ============================================================
// RENDER RESULT (Result Ring + Info + Breakdown)
// ============================================================
// SVG arc geometry: r=80, circumference = 2*pi*80 = 502.65
const RESULT_RING_CIRC = 2 * Math.PI * 80;

// Ring now visualises DAMAGE taken (more intuitive):
// 0% damage = empty ring, 100% damage (kill) = full red ring.
function ringBarColor(data) {
  if (data.isKill) return '#ff3b3b';
  const d = data.hpPercent;
  if (d < 25) return '#00e676';   // low damage — safe
  if (d < 50) return '#ffcc00';   // moderate
  if (d < 75) return '#ff8c00';   // heavy
  return '#ff3b3b';               // critical (≥75% or kill)
}

function renderResult(data) {
  const barColor = ringBarColor(data);
  document.documentElement.style.setProperty('--hp-bar-color', barColor);

  // --- Update the HP ring (SVG arc) — shows damage %, fills as damage grows ---
  const ringFill = document.getElementById('result-ring-fill');
  if (ringFill) {
    const damageRatio = Math.min(data.hpPercent, 100) / 100;   // 0 → empty, 1 → full
    const offset = (1 - damageRatio) * RESULT_RING_CIRC;
    ringFill.style.strokeDashoffset = String(offset);
    ringFill.style.stroke = barColor;
    ringFill.style.filter = `drop-shadow(0 0 8px ${barColor})`;
  }

  // --- Update the center text ---
  const pctEl = document.getElementById('result-pct');
  const dmgEl = document.getElementById('result-dmg');
  const displayPercent = Math.min(data.hpPercent, 999.9);
  if (pctEl) {
    pctEl.textContent = displayPercent.toFixed(1) + '%';
    pctEl.style.textShadow = `0 0 18px ${barColor}`;
    pctEl.classList.remove('number-pop');
    void pctEl.offsetWidth;
    pctEl.classList.add('number-pop');
  }
  if (dmgEl) {
    dmgEl.textContent = data.finalDamage.toLocaleString();
  }

  // --- Update the info section (below the ring) ---
  const infoEl = document.getElementById('result-info');
  if (infoEl) {
    // Chips: 克制 / 幻系触发 / 击杀溢出 (all share the same row; the row
    // has a fixed min-height so toggling the kill chip does not reflow
    // the damage ring above).
    let chipsHTML = '';
    const ignoredResist = data.dyn && data.dyn.ignoreResist && (data.skillEffRaw ?? 1) < 1;
    if (data.skillEff > 1) {
      chipsHTML += `<span class="result-chip super-effective">克制 ×${data.skillEff}</span>`;
    } else if (data.skillEff < 1 && !ignoredResist) {
      chipsHTML += `<span class="result-chip not-effective">抵抗 ×${data.skillEff}</span>`;
    }
    if (ignoredResist) {
      chipsHTML += `<span class="result-chip not-effective" title="原抵抗 ×${data.skillEffRaw} 已被虫击·应对状态忽略">无视抵抗</span>`;
    }
    if (data.n > 0) {
      if (data.isSkillIllusion) {
        chipsHTML += `<span class="result-chip not-effective">幻系不触发</span>`;
      } else if (data.starEff !== 1) {
        const cls = data.starEff > 1 ? 'super-effective' : 'not-effective';
        const label = data.starEff > 1 ? '星陨克制' : '星陨抵抗';
        chipsHTML += `<span class="result-chip ${cls}">${label} ×${data.starEff}</span>`;
      }
    }
    if (data.isKill) {
      chipsHTML += `<span class="result-chip overflow">溢出 ${data.overflow.toLocaleString()}</span>`;
    }
    // Always render the chips row (even when empty) so its height is
    // always the same — adding/removing chips does not push the ring.
    const chipsRow = `<div class="result-chips">${chipsHTML}</div>`;

    // Damage lines
    const dmgLinesHTML = `
      <div class="result-dmg-line">技能 <strong>${data.skillDmg.toLocaleString()}</strong> · 星陨 <strong class="star-val">${data.starDmg.toLocaleString()}</strong></div>
    `;

    infoEl.innerHTML = chipsRow + dmgLinesHTML;
  }

  // --- Show the breakdown section ---
  const breakdownSection = document.getElementById('breakdown-section');
  if (breakdownSection) breakdownSection.style.display = 'block';

  // --- Build the breakdown list (full math) ---
  // 折叠（max-height: 0）时不重写 innerHTML —— 拖动星层时折叠的 DOM 是不可见的，
  // 反复拼接/解析字符串完全是浪费。展开时由 toggleBreakdown 用最新 data 兜底渲染。
  const breakdownList = document.getElementById('breakdown-list');
  _lastBreakdownData = data;
  const breakdownContent = document.getElementById('breakdown-content');
  const breakdownOpen = breakdownContent && breakdownContent.classList.contains('open');
  if (breakdownList && breakdownOpen) {
    renderBreakdownList(breakdownList, data);
  }

  if (data.isKill) triggerKillEffects();
}

function renderBreakdownList(breakdownList, data) {
  // Use the overridden element (e.g. 展翅: 普通 → 翼) for the displayed name.
  const skillElementRaw = (data.dyn && data.dyn.elementOverride) || data.skill.element;
  const skillNameEl = skillElementRaw ? elOf(skillElementRaw).name : '无';
  const stabBadge = data.stab > 1
    ? ' <span class="skill-badge stab">本系 ×1.25</span>'
    : '';
  const stabCoef = data.stab > 1 ? ' × ' + data.stab + ' (本系)' : '';
  const dynMods = data.dyn || { powerMult: 1, powerAdd: 0, comboAdd: 0, comboMult: 1, notes: [] };
  const powerBoost = data.powerBoost || 0;
  const comboChip = data.attackerCombo || 0;
  const basePower = data.skill.power ?? 0;
  const dynAdd = dynMods.powerAdd || 0;
  const basePowerWithBoost = Math.max(0, basePower + powerBoost + dynAdd);
  const hasCombo = data.hasCombo !== false;   // default true for legacy callers
  const baseCombo = hasCombo ? (data.skill.combo ?? 1) : 1;
  // The 连击数 chip is an additive term, so it lives inside the
  // multiplication, alongside dynMods.comboAdd. The chip is gated on
  // hasCombo — non-combo skills ignore it but still pick up
  // dynMods.comboAdd from skill modifiers (e.g. 多维击打). The final
  // combo (effCombo) is floored at 0 to match the damage formula.
  const comboChipGated = hasCombo ? comboChip : 0;
  const preMultCombo = Math.max(0, baseCombo + comboChipGated + dynMods.comboAdd);
  const effComboNoChip = preMultCombo * dynMods.comboMult;
  const effCombo  = Math.max(0, effComboNoChip);
  const effPowerStr = (basePowerWithBoost * dynMods.powerMult).toFixed(2).replace(/\.00$/, '');
  // Compose the 威力 line so it reflects the flat power boost, the dynamic
  // additive bonus, and the dynamic multiplier, e.g.
  //   100                                          (no boost, no add, no mult)
  //   100 × 1.20 = 120                             (mult only)
  //   100 + 40（威力） = 140                       (boost only)
  //   100 + 40（威力） + 60（天体吸积） = 200      (boost + add)
  //   100 + 40（威力） = 140 × 1.20 = 168          (boost + mult)
  //   100 + 40（威力） + 60（天体吸积） = 200 × 1.20 = 240 (all three)
  //   100 + 60（天体吸积） = 160                    (add only — no powerBoost)
  //   100 - 30（威力） = 70                        (negative 威力)
  // Build the additive step "<base> + <term1> + <term2> = <sum>", or null
  // when there's no additive term (so we don't render a stray " + 0" line).
  const addTerms = [];
  if (powerBoost > 0) addTerms.push(`+ ${powerBoost}`);
  else if (powerBoost < 0) addTerms.push(`- ${Math.abs(powerBoost)}`);
  if (dynAdd > 0) addTerms.push(`+ ${dynAdd}`);
  else if (dynAdd < 0) addTerms.push(`- ${Math.abs(dynAdd)}`);
  const additiveExpr = addTerms.length
    ? `${basePower} ${addTerms.join(' ')} = ${basePowerWithBoost}`
    : null;
  let multExpr;
  if (dynMods.powerMult !== 1) {
    multExpr = ` × ${dynMods.powerMult.toFixed(2)} = ${effPowerStr}`;
  }
  let powerText;
  if (additiveExpr && multExpr)      powerText = `${additiveExpr}${multExpr}`;
  else if (additiveExpr)             powerText = additiveExpr;
  else if (multExpr)                 powerText = `${basePower}${multExpr}`;
  else                               powerText = String(basePower);

  // Compose the 连击 line — same additive-then-multiplier style as 威力.
  //   1                                            (no chip, no add, no mult)
  //   1 + 2（连击数） = 3                          (chip only)
  //   1 + 2（连击数） + 1（星陨） = 4              (chip + add)
  //   1 (×2 勇击) = 2                              (mult only)
  //   1 - 3（连击数） = -2 (clamped to 0)
  //
  // When the skill has no inherent combo (hasCombo === false), the
  // 连击数 chip is ignored (per the damage formula) and we render
  // "无连击" to make it explicit. dynMods.comboAdd from skill
  // modifiers (e.g. 多维击打) still applies, since those are not the
  // user's chip input.
  // The chip's effective contribution, already gated on hasCombo above.
  // Format an additive term: positive → "+N", negative → "-N", zero skipped.
  const fmtTerm = (n) => {
    if (n > 0) return `+ ${n}`;
    if (n < 0) return `- ${Math.abs(n)}`;
    return null;
  };
  const comboAddTerms = [];
  const chipTerm = fmtTerm(comboChipGated);
  if (chipTerm) comboAddTerms.push(chipTerm);
  const dynAddTerm = fmtTerm(dynMods.comboAdd);
  if (dynAddTerm) comboAddTerms.push(dynAddTerm);
  const comboAdditiveExpr = comboAddTerms.length
    ? `${baseCombo} ${comboAddTerms.join(' ')} = ${preMultCombo}`
    : null;
  let comboMultExpr;
  if (dynMods.comboMult !== 1) {
    comboMultExpr = ` × ${dynMods.comboMult.toFixed(2)} = ${effComboNoChip}`;
  }
  let comboText;
  if (!hasCombo) {
    // No inherent combo: the chip is suppressed.
    comboText = '无连击';
  } else if (comboAdditiveExpr && comboMultExpr) comboText = `${comboAdditiveExpr}${comboMultExpr}`;
  else if (comboAdditiveExpr)            comboText = comboAdditiveExpr;
  else if (comboMultExpr)                comboText = `${baseCombo}${comboMultExpr}`;
  else                                  comboText = String(baseCombo);
  const dynNotesHTML = dynMods.notes.length
    ? `<div><span class="label">动态修正:</span></div>` +
      dynMods.notes.map(n =>
        `<div style="padding-left:1.4em"><span class="multiplier">· ${n.source}: ${n.text}</span></div>`
      ).join('')
    : '';
  const atkStatLabel = data.isMagic ? '魔攻' : '物攻';
  const defStatLabel = data.isMagic ? '魔防' : '物防';
  const buffBits = [];
  if (data.atkBuffPct) buffBits.push(`${atkStatLabel} ${formatBuff(data.atkBuffPct)}`);
  if (data.defBuffPct) buffBits.push(`${defStatLabel} ${formatBuff(data.defBuffPct)}`);
  const buffLineHTML = buffBits.length
    ? `<div><span class="label">buff 调整:</span> <span class="multiplier">${buffBits.join(' · ')}</span></div>`
    : '';
  const ignoredResist = (dynMods.ignoreResist || (data.dyn && data.dyn.ignoreResist))
    && (data.skillEffRaw ?? 1) < 1;
  const effExpr = ignoredResist
    ? `${data.skillEff} <span class="label" style="font-size:0.7rem">(原 ×${data.skillEffRaw} 抵抗已无视)</span>`
    : `${data.skillEff}`;
  breakdownList.innerHTML = `
    <div class="label" style="color:var(--accent-cyan);font-weight:600;">—— 技能伤害 ——</div>
    <div><span class="label">攻击方:</span> <span class="value">${data.atk.name}</span></div>
    <div><span class="label">技能:</span> <span class="value">${data.skill.name}</span> <span class="label" style="font-size:0.7rem">(${data.skill.damage_class || '?'} · ${skillNameEl})</span>${stabBadge}</div>
    <div><span class="label">${data.isMagic ? '魔攻' : '物攻'}:</span> <span class="value">${data.atkStat}</span></div>
    <div><span class="label">${data.isMagic ? '魔防' : '物防'}:</span> <span class="value">${data.defStat}</span></div>
    ${buffLineHTML}
    <div><span class="label">威力:</span> <span class="value">${powerText}</span></div>
    <div><span class="label">连击:</span> <span class="value">${comboText}</span></div>
    <div><span class="label">系数:</span> <span class="multiplier">${data.atkStat} / ${data.defStat} × (37/41)${stabCoef} × ${effExpr} × ${(data.defSkill.reduction ?? 1).toFixed(2)}${effCombo !== 1 ? ' × ' + effCombo + ' (连击)' : ''}</span></div>
    ${dynNotesHTML}
    <div class="final-line"><span class="label">技能伤害小计:</span> <span class="value">${data.skillDmg.toLocaleString()}</span></div>
    <hr class="divider">
    <div class="label" style="color:var(--accent-gold);font-weight:600;">—— 星陨伤害 ——</div>
    <div><span class="label">星陨层数:</span> <span class="value">${data.n}</span></div>
    <div><span class="label">星陨 power:</span> <span class="value">${data.n}² + 24×${data.n} - 24 = ${data.starPower}</span></div>
    ${data.isSkillIllusion ? `<div><span class="label">触发:</span> <span class="value" style="color:#ff8c00">否 (技能为幻系)</span></div>`
      : (data.n > 0
        ? `<div><span class="label">${data.isMagic ? '魔攻' : '物攻'}:</span> <span class="value">${data.atkStat}</span></div>
           <div><span class="label">${data.isMagic ? '魔防' : '物防'}:</span> <span class="value">${data.defStat}</span></div>
           <div><span class="label">克制(幻系):</span> <span class="multiplier">×${data.starEff}</span></div>
           <div><span class="label">系数:</span> <span class="multiplier">${data.starPower} × ${data.atkStat}/${data.defStat} × (37/41) × ${data.starEff} × ${(data.defSkill.reduction ?? 1).toFixed(2)}</span></div>`
        : `<div><span class="label">触发:</span> <span class="value" style="color:var(--text-secondary)">否 (层数为 0)</span></div>`)}
    <div class="final-line"><span class="label">星陨伤害小计:</span> <span class="value">${data.starDmg.toLocaleString()}</span></div>
    <hr class="divider">
    <div class="final-line"><span class="label">最终合计伤害:</span> <span class="value" style="color:var(--accent-cyan);font-size:1.1rem">${data.finalDamage.toLocaleString()}</span>
      <span class="label" style="font-size:0.7rem"> / ${data.defHP.toLocaleString()} HP (${data.hpPercent.toFixed(1)}%)</span></div>
  `;
}

function renderWaiting() {
  // 挑战模式答题阶段（c.running && c.phase === 'picking'）：双方精灵已就位、
  // 攻击技能也已确定，伤害要等用户点"提交答案"才计算。
  //   - 复用空圆环 + "—" 占位（用户调星陨层数时 ring 仍空、不闪烁）
  //   - 但提示语必须换成"提交答案后计算结果"，否则会沿用普通模式的
  //     "选择双方精灵开始计算"，与"双方已就位"的当前状态矛盾，误导用户。
  //   - 这条 check 放在最前面：进 if 后直接 return（不落到下面的 fallback 链），
  //     避免被 "state.attacker && state.defender && state.attackSkill 都在"
  //     的逻辑又覆盖回"选择双方精灵开始计算"。
  if (state.challenge.running && state.challenge.phase === 'picking') {
    // Reset ring
    const ringFill = document.getElementById('result-ring-fill');
    if (ringFill) {
      ringFill.style.strokeDashoffset = String(RESULT_RING_CIRC);
      ringFill.style.stroke = 'rgba(255,255,255,0.15)';
      ringFill.style.filter = 'none';
    }
    // Reset center text
    const pctEl = document.getElementById('result-pct');
    if (pctEl) {
      pctEl.textContent = '—';
      pctEl.style.textShadow = 'none';
      pctEl.classList.remove('number-pop');
    }
    const dmgEl = document.getElementById('result-dmg');
    if (dmgEl) dmgEl.textContent = '—';
    // Info 文案：覆盖默认"选择双方精灵开始计算"
    const infoEl = document.getElementById('result-info');
    if (infoEl) infoEl.innerHTML = `<div class="result-waiting-mini">提交答案后计算结果</div>`;
    // Hide breakdown
    const breakdownSection = document.getElementById('breakdown-section');
    if (breakdownSection) breakdownSection.style.display = 'none';
    const breakdownContent = document.getElementById('breakdown-content');
    if (breakdownContent) breakdownContent.classList.remove('open');
    updateAtmosphere(0, false);
    return;
  }

  // 普通模式（不在挑战答题中）的提示语
  let msg = '选择双方精灵开始计算';
  if (state.attacker && !state.defender) msg = '选择防御方精灵';
  if (!state.attacker && state.defender) msg = '选择攻击方精灵';
  if (state.attacker && state.defender && !state.attackSkill) msg = '该攻击方无可用攻击技能';

  // Reset ring
  const ringFill = document.getElementById('result-ring-fill');
  if (ringFill) {
    ringFill.style.strokeDashoffset = String(RESULT_RING_CIRC);   // empty arc
    ringFill.style.stroke = 'rgba(255,255,255,0.15)';
    ringFill.style.filter = 'none';
  }
  // Reset center text
  const pctEl = document.getElementById('result-pct');
  if (pctEl) {
    pctEl.textContent = '—';
    pctEl.style.textShadow = 'none';
    pctEl.classList.remove('number-pop');
  }
  const dmgEl = document.getElementById('result-dmg');
  if (dmgEl) dmgEl.textContent = '—';
  // Reset info
  const infoEl = document.getElementById('result-info');
  if (infoEl) infoEl.innerHTML = `<div class="result-waiting-mini">${msg}</div>`;
  // Hide breakdown
  const breakdownSection = document.getElementById('breakdown-section');
  if (breakdownSection) breakdownSection.style.display = 'none';
  const breakdownContent = document.getElementById('breakdown-content');
  if (breakdownContent) breakdownContent.classList.remove('open');
  updateAtmosphere(0, false);
}

// ============================================================
// KILL EFFECTS, ATMOSPHERE, BREAKDOWN TOGGLE
// ============================================================
// 折叠期间 renderBreakdownList 被跳过；为保证下次展开时内容是最新的，
// 在 renderResult 里把 data 存到这里，toggleBreakdown 展开时兜底重渲染。
let _lastBreakdownData = null;
let lastKillState = false;
function triggerKillEffects() {
  if (lastKillState) return;
  lastKillState = true;
  const container = document.getElementById('main-container');
  container.classList.add('shake');
  setTimeout(() => container.classList.remove('shake'), 500);
  const flash = document.getElementById('flash-overlay');
  flash.classList.remove('flash');
  void flash.offsetWidth;
  flash.classList.add('flash');
}
function resetKillEffects() { lastKillState = false; }

function updateAtmosphere(damagePercent, isKill) {
  const root = document.documentElement;
  if (!state.attacker || !state.defender) {
    root.style.setProperty('--atmosphere-color', 'transparent');
    root.style.setProperty('--atmosphere-intensity', '0');
    resetKillEffects();
    return;
  }
  if (isKill) {
    root.style.setProperty('--atmosphere-color', 'rgba(255,30,30,0.15)');
    root.style.setProperty('--atmosphere-intensity', '1');
    triggerKillEffects();
  } else if (damagePercent >= 75) {
    root.style.setProperty('--atmosphere-color', 'rgba(255,140,0,0.1)');
    root.style.setProperty('--atmosphere-intensity', '1');
    resetKillEffects();
  } else if (damagePercent >= 50) {
    root.style.setProperty('--atmosphere-color', 'rgba(255,200,0,0.06)');
    root.style.setProperty('--atmosphere-intensity', '1');
    resetKillEffects();
  } else if (damagePercent >= 25) {
    root.style.setProperty('--atmosphere-color', 'rgba(0,230,118,0.03)');
    root.style.setProperty('--atmosphere-intensity', '1');
    resetKillEffects();
  } else {
    root.style.setProperty('--atmosphere-color', 'transparent');
    root.style.setProperty('--atmosphere-intensity', '0');
    resetKillEffects();
  }
}

function toggleBreakdown() {
  const content = document.getElementById('breakdown-content');
  const toggle = document.getElementById('breakdown-toggle');
  const isOpen = content.classList.toggle('open');
  toggle.classList.toggle('open', isOpen);
  toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  // 刚展开：用最新 data 兜底渲染。折叠期间 renderBreakdownList 被跳过，
  // 这里确保用户能看到当前最新的计算结果而不是旧的 DOM。
  if (isOpen && _lastBreakdownData) {
    const breakdownList = document.getElementById('breakdown-list');
    if (breakdownList) renderBreakdownList(breakdownList, _lastBreakdownData);
  }
}

// ============================================================
// INFO MODAL: 公告 / 使用说明
// ============================================================
// 维护指南：在数组开头追加新版本，html 字段支持 h3 / ul / li / code / a / hr 等行内结构。
// 修改后无需改 HTML：所有渲染都由 initInfoModal() 注入。
const MODAL_CONTENT = {
  announcement: {
    title: '更新公告',
    html: `
      <h3>挑战模式 <span class="modal-date">· 2026-07-21</span></h3>
      <ul>
        <li>挑战模式上线：这是一个考验你对星陨斩杀线的把握，辅助记忆斩杀线的小游戏。</li>
        <li>基本流程：挑战设置 → 开始挑战 → 自动出题 → 拖动星陨层数 → 提交答案 → 评分 → 下一道题 / 结算。</li>
        <li>双方精灵池支持「全部 / 常见 / 自选」；属性配置与技能选择支持「固定当前 / 随机每题」；防御技能按相同减伤率兜底匹配。</li>
        <li>答题阶段精灵面板自动锁定（灰显、不可点），仅星陨层数可调；随时可「退出挑战」回到计算器状态。</li>
        <li>适配了「星痕」和「急中生智」两个技能。</li>
        <li>以及其他一些细节优化和bug修复。</li>
      </ul>
      <hr>
      <h3>性格个体自动保存 <span class="modal-date">· 2026-07-20</span></h3>
      <ul>
        <li>现在在每次修改性格和个体后都会自动保存（到localStorage），下次选择精灵时会自动加载。</li>
      </ul>
      <hr>
      <h3>S3 数据更新 <span class="modal-date">· 2026-07-16</span></h3>
      <ul>
        <li>同步更新 S3 精灵与技能数据。</li>
        <li>常见精灵新增「离心舞者」「飞飞钥」。</li>
      </ul>
      <hr>
      <h3>信息弹窗 <span class="modal-date">· 2026-07-13</span></h3>
      <ul>
        <li>新增「使用说明」与「更新公告」信息弹窗（就是你现在看到的这个）。</li>
      </ul>
      <hr>
      <h3>「应对状态」与部分特性适配 <span class="modal-date">· 2026-07-08 ~ 07-10</span></h3>
      <ul>
        <li><strong>「应对状态」机制上线</strong>（本轮最大改动）：防御方新增「聚能」选项；激活后，<strong>所有应对状态技能</strong>会按各自规则改变威力或连击数，覆盖铁蒺藜、龙卷风、追打、炙热波动、虫击、突袭、暗突袭、爆冲、技巧打击、无影脚、偷袭、散手、连续爪击、滚雪球、吹炎、地陷、闪燃、灾厄。</li>
        <li>适配 18 系「愿力冲击」：伤害类型自适应（自动取精灵物攻/魔攻较高者），应对状态时威力 +150%。</li>
        <li>「威力」调节器改为常驻显示：之前只有部分精灵会显示，现在所有精灵都能直接调节。</li>
        <li>新增「连击」调节器，可实时调整连击数；伤害明细中同步新增独立的连击计算行。</li>
        <li>新增「速度」调节器，可实时调整速度，用于影响「顺风 / 破空」「展翅」「扇风」「疾风刺」「闪击」的计算。</li>
        <li>适配「扇风」技能：先手时威力 +50%。</li>
        <li>适配「闪击」「鸣沙陷阱」技能，分别按速度差、物防差加成威力。</li>
        <li>适配「疾风刺」技能：先手时变为 3 连击。</li>
        <li>适配「岚鸟」家族特性：先手时威力 +50%；以及「霜翼领主」特性：先手时威力 +75%。</li>
        <li>适配「凡鹰」家族特性：携带的普通系技能变为翼系；后手时自身受到的伤害 +25%。</li>
        <li>适配「画间沉铁兽」特性：敌方每 1 层增益使本次技能威力 +10%。</li>
        <li>适配「机幕方舟」家族特性：被克制时自身受到的伤害 +25%。</li>
        <li>忽略搜索框中的空格，避免误打空格导致搜索不到精灵。</li>
        <li>鼠标悬停攻击/防御技能图标，可直接看到该技能的详细描述。</li>
        <li>修复了若干伤害计算 Bug。</li>
      </ul>
      <hr>
      <h3>站点发布 <span class="modal-date">· 2026-07-08</span></h3>
      <ul>
        <li>首发版本。</li>
        <li>完整伤害计算、18 系属性相克、连击数 / 减伤等功能。</li>
        <li>星陨层数 0~99，可视化脉动动画与滑块拖拽。</li>
      </ul>
      <p style="color:var(--text-secondary);margin-top:14px">完整历史与源码请见 <a href="https://github.com/Bartzh/roco-star-dmg" target="_blank" rel="noopener noreferrer">GitHub 仓库</a>。</p>
    `
  },
  guide: {
    title: '使用说明',
    html: `
      <h3>大致介绍</h3>
      <ul>
        <li>这是一个专为<strong>星陨</strong>设计的《洛克王国：世界》PVP 伤害计算器工具，有基本的伤害计算功能，便捷的星陨层数调整，以及一些精灵和技能的特别适配，此外还有挑战模式，可以测试自己对星陨斩杀线熟悉程度。</li>
        <li>该工具的首要设计目标是尽可能简洁好看，保持克制避免过于复杂，所以不会考虑支持所有游戏特性（我也懒得搞哈哈）。</li>
      </ul>

      <h3>基本流程</h3>
      <ol>
        <li>选择<strong>攻击方</strong>与<strong>防御方</strong>精灵（可搜索 / 筛选系别）。</li>
        <li>调整种族值、性格、努力值（IV）、双攻 / 双防 buff。</li>
        <li>选择攻击技能（必选）与防御技能（可选）。</li>
        <li>拖动中央<strong>星陨层数</strong>滑块（0~99），实时查看伤害与剩余血量。</li>
        <li>点击「伤害计算明细」可展开完整公式逐项乘数。</li>
      </ol>

      <h3>特别适配</h3>
      <ul>
        <li>精灵特性，包括：仪式巨像家族，岚鸟家族，凡鹰家族，机幕方舟家族，画间沉铁兽。</li>
        <li>与星陨层数联动的技能，包括：多维击打、天体吸积。</li>
        <li>可以通过防御方的「聚能」来触发特殊的「应对状态」效果的攻击技能，包括：铁蒺藜、龙卷风、追打、炙热波动、虫击、突袭、暗突袭、爆冲、技巧打击、无影脚、偷袭、散手、连续爪击、滚雪球、吹炎、地陷、闪燃、灾厄，以及十八系愿力冲击。</li>
        <li>此外还有扇风、疾风刺、闪击、鸣沙陷阱、星痕、急中生智。</li>
      </ul>

      <h3>挑战模式</h3>
      <p>这是一个考验你对星陨斩杀线的把握，辅助记忆斩杀线的小游戏。</p>
      <ol>
        <li>点击顶部的「挑战模式」按钮，会进入挑战模式设置阶段，你可以设置挑战模式的参数，包括精灵池，属性配置，技能选择以及题数。</li>
        <li>设置好后，点击「开始挑战」按钮进入答题阶段，系统会根据你的设置随机出题，此时两侧精灵面板的交互会被全部锁定，伤害结果停止计算，只剩下星陨层数可以调整，这就是你的「作答区」。</li>
        <li>根据系统给出的双方精灵状态，判断此时攻击方需要多少层星陨印记可刚好将防御方斩杀（伤害占比超过100%），调整星陨层数至你认为的答案后点击「提交答案」按钮。</li>
        <li>此时伤害结果开始计算，系统会根据正确答案与你给出的答案之间的差来为你打分。</li>
        <li>点击「下一道题」，将从第二步开始重复步骤，直到所有题目都作答完毕。</li>
        <li>在任何阶段下，你都可以点击「退出挑战」按钮来将页面退回至计算器状态。</li>
      </ol>

      <h3>数据来源</h3>
      <ul>
        <li>精灵与技能数据来自 <a href="https://wiki.biligame.com/rocom" target="_blank" rel="noopener noreferrer">BWIKI</a>。</li>
        <li>数据更新于 2026-07-16。</li>
      </ul>

      <h3>关于</h3>
      <ul>
        <li>国内主站：<a href="https://stardmg.top/" target="_blank" rel="noopener noreferrer">stardmg.top</a></li>
        <li>备用镜像：<a href="https://bartzh.github.io/roco-star-dmg/" target="_blank" rel="noopener noreferrer">GitHub Pages</a></li>
        <li>开源仓库：<a href="https://github.com/Bartzh/roco-star-dmg" target="_blank" rel="noopener noreferrer">Bartzh/roco-star-dmg</a></li>
        <li>作者B站主页：<a href="https://space.bilibili.com/235905700" target="_blank" rel="noopener noreferrer">Bilibili Space</a></li>
        <li>所有代码以WTFPL协议（你他妈爱干嘛干嘛许可证）开源，欢迎贡献与反馈。</li>
      </ul>
    `
  }
};

// 初始化弹窗：触发按钮、ESC、点击遮罩、底部确认按钮均可关闭。
// 打开时锁定 body 滚动，关闭后恢复焦点到触发按钮。
function initInfoModal() {
  const overlay = document.getElementById('info-modal');
  if (!overlay) return;
  const titleEl    = document.getElementById('modal-title');
  const bodyEl     = document.getElementById('modal-body');
  const closeBtn   = overlay.querySelector('.modal-close');
  const confirmBtn = overlay.querySelector('.modal-confirm');
  const triggers   = document.querySelectorAll('.nav-link[data-modal]');
  if (!titleEl || !bodyEl || !closeBtn || !confirmBtn || triggers.length === 0) return;

  let lastFocus = null;

  const open = (type) => {
    const data = MODAL_CONTENT[type];
    if (!data) return;
    titleEl.textContent = data.title;
    bodyEl.innerHTML    = data.html;
    lastFocus = document.activeElement;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    // 锁定背景滚动，避免长公告内容滚动时背景跟着动
    document.body.style.overflow = 'hidden';
    // 焦点移入弹窗，方便键盘 / 屏幕阅读器用户操作
    setTimeout(() => closeBtn.focus(), 0);
  };
  const close = () => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus();
    }
  };

  triggers.forEach(btn => {
    btn.addEventListener('click', () => open(btn.dataset.modal));
  });
  closeBtn.addEventListener('click', close);
  confirmBtn.addEventListener('click', close);
  // 点击遮罩（卡片外）关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  // ESC 关闭
  document.addEventListener('keydown', (e) => {
    if (overlay.classList.contains('is-open') && e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
}

// ============================================================
// CHALLENGE MODE (UI 控件层)
// ------------------------------------------------------------
// 本文件此次只承载"控件 + 过渡"：进入/退出挑战模式、预设/题数 chip、
// 侧栏 label ↔ chip 切换动画。业务逻辑（出题、提交、评分）后续 PR。
//
// 关键不变量：
//   1. 精灵池（攻击方/防御方）是**单选** chip 组：3 个 chip（全部/常见/自选）
//      同时只有一个 .active，**不能空选**。点击当前选中项保持选中不变。
//   2. 「随机」chip 是**开关**：在 .active 和无 .active 之间切换。
//   3. 所有 chip 都复用 .buff-chip 的视觉（.label-chip），并带按压特效
//      （pointerdown 期间加 .pressing 类）。
//   4. 进入挑战模式：body 加 .challenge-mode；隐藏星陨/伤害结果，
//      显示 .challenge-setup；侧栏 label-text 淡出，label-chip-group 淡入。
//   5. 退出：反向。display 切换串在 Web Animations API 动画的 onfinish 时机。
//   6. seal-container 宽度固定 280px，避免进入/退出时 .battle-area 横向抖动。
// ============================================================

const CHALLENGE_LABEL_TRANSITION_MS = 220;   // label ↔ chip 淡入淡出时长

// 缓动曲线（Material Design 命名）
// EASING_STANDARD：cubic-bezier(0.4, 0, 0.2, 1) — Material "standard" 缓动
//   加速进入、减速退出，曲线对称、视觉中性。
//   用于：
//     - 所有动画
//
// EASING_DECELERATE：cubic-bezier(0.16, 1, 0.3, 1) — Material "deceleration" 缓动
//   极速进入（前 25% 进度就跑完 ~70%），最后慢慢"落定"，模拟物理减速到位。
//   让"新内容进场"有一种"轻盈落定"的感觉。
//   用于：
//     - 暂时不使用
const EASING_STANDARD = 'cubic-bezier(0.4, 0, 0.2, 1)';
const EASING_DECELERATE = 'cubic-bezier(0.16, 1, 0.3, 1)';

// 工具：用 Web Animations API 播放「淡出 → 隐藏 → 淡出对方/淡入自己」序列。
//   fadeOut: true 时把元素淡出后 display:none；fadeIn: true 时把元素从 display:none
//   切到 inline-flex 后淡入。两个参数可同时为 false（仅同步样式）。
function _swapLabelVisibility(textEl, chipEl, opts) {
  const { showChip } = opts;

  // 进入或退出前，**先取消**这两个元素上残留的 Web Animations（避免旧的
  // fill:'forwards' 在新动画结束后"复活"，把元素重新拉到 opacity:0）。
  // 这是双向切换必须的清理，否则第二次进入/退出后 chip 或文本会"卡死"。
  _cancelAnimations(textEl);
  _cancelAnimations(chipEl);

  if (showChip) {
    // 文本淡出 → 隐藏 → chip 取消 hidden 并淡入
    if (textEl && textEl.style.display !== 'none') {
      const a = textEl.animate(
        [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(-4px)' },
        ],
        { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
      );
      a.onfinish = () => {
        textEl.style.display = 'none';
        if (chipEl) {
          chipEl.hidden = false;
          chipEl.animate(
            [
              { opacity: 0, transform: 'translateY(4px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
          );
        }
      };
    } else if (chipEl) {
      // 文本已经隐藏（再次进入时），直接让 chip 淡入
      chipEl.hidden = false;
      chipEl.animate(
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
      );
    }
  } else {
    // chip 淡出 → 隐藏 → 文本取消 hidden 并淡入
    if (chipEl && !chipEl.hidden) {
      const a = chipEl.animate(
        [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(-4px)' },
        ],
        { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
      );
      a.onfinish = () => {
        chipEl.hidden = true;
        if (textEl) {
          textEl.style.display = '';
          textEl.animate(
            [
              { opacity: 0, transform: 'translateY(4px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
          );
        }
      };
    } else if (textEl) {
      // chip 已经隐藏，文本直接淡入
      textEl.style.display = '';
      textEl.animate(
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
      );
    }
  }
}

// 取消元素上所有 Web Animations（包括 fill:'forwards' 残留的"最终态"）。
// 双向切换前调用，避免旧动画在"后"相位把元素拉回 opacity:0 的"卡死"态。
function _cancelAnimations(el) {
  if (!el || typeof el.getAnimations !== 'function') return;
  for (const a of el.getAnimations()) {
    try { a.cancel(); } catch (_) {}
  }
}

// 统一取消挑战模式相关元素的所有 Web Animations。
// 在 enter / exit / show / hide 启动新动画前调用，避免新旧 .animate() 互相
// 反向覆盖同一元素（Element.animate() 不会自动取消旧 animation，必须显式 cancel）。
//   - 中心区域：.seal-top / .seal-middle / .result-bottom / #challenge-setup /
//     #challenge-answer-result
//   - 侧栏：所有 .label-text ↔ .label-chip-group 对
function _cancelChallengeAnimations() {
  document.querySelectorAll(
    '.seal-top, .seal-middle, .result-bottom, ' +
    '#challenge-setup, #challenge-answer-result'
  ).forEach(el => _cancelAnimations(el));
  for (const pair of _collectLabelSwapPairs()) {
    _cancelAnimations(pair.textEl);
    _cancelAnimations(pair.chipEl);
  }
}

// 收集挑战模式下需要切换的 (text, chip) 对：
//   - 攻击方 / 防御方 的 panel-label
//   - 属性配置 / 攻击技能 / 防御技能 的 section-title
function _collectLabelSwapPairs() {
  const groups = document.querySelectorAll('.label-chip-group');
  return Array.from(groups).map(g => ({
    textEl: g.parentElement.querySelector('.label-text'),
    chipEl: g,
  })).filter(p => p.textEl && p.chipEl);
}

// 进入挑战模式：把 chip 组淡入到 label 位置；显示 .challenge-setup；
// 隐藏星陨/伤害结果。按钮文案切换为"退出挑战"。
//
// 关键时序（必须与侧栏 label 切换 440ms 对齐）：
//   t=0    开始：星陨/伤害结果淡出 (220ms) + 侧栏 label-text 淡出 (220ms) [并行]
//   t=220  完成：星陨/伤害结果 → body.challenge-mode (display:none) + 挑战设置淡入 (220ms) + 侧栏 chip 淡入 (220ms) [并行]
//   t=440  全部完成
//   旧实现：body.challenge-mode 立即加上 → 星陨/伤害结果瞬间消失 → 挑战设置 220ms 淡入。
//   这导致中心比两侧 chip 早 220ms 完成（侧栏是 text 淡出 220 + chip 淡入 220 = 440ms）。
//
// 快速连点防御（2026-07-18）：
//   1) 进入前先 _cancelChallengeAnimations() 取消所有 sections / setup / label
//      pairs 上正在跑的 animation——避免与"上次 exit 留下的 fade"反向覆盖。
//   2) 启动时 transitionGen++ 并快照 myGen；Promise.all 回调里检查
//      transitionGen === myGen，不等则 no-op（已被新的 enter/exit 接管）。
//      这覆盖了"用户在 220ms 内点退出"导致的旧回调反扑。
function enterChallengeMode() {
  if (state.challenge.active) return;
  // 进入前先清理所有相关元素上正在跑的 animation（修复连点 toggle 时
  // 上一次 enter 留下的 .animate() 反向动画的 bug）。
  _cancelChallengeAnimations();
  const myGen = ++state.challenge.transitionGen;
  state.challenge.active = true;
  // 锁住 toggle click handler（2026-07-18）：440ms 完整动画期间忽略点击，
  // 防止"enter + exit 各 440ms、视觉上闪两次"。末尾 setup 淡入 onfinish
  // 释放（带 gen 守卫，cancel 时不释放，被新动画接管时由新动画释放）。
  state.challenge.toggleAnimating = true;

  // 切换按钮文案 + 视觉
  const btn = document.getElementById('challenge-toggle-btn');
  const text = btn && btn.querySelector('.challenge-toggle-text');
  const icon = btn && btn.querySelector('.challenge-toggle-icon');
  if (btn) {
    btn.classList.add('is-active');
    btn.setAttribute('aria-pressed', 'true');
  }
  if (text) text.textContent = '退出挑战';
  // 现在没有icon了
  if (icon) icon.textContent = '✕';

  // 1) 星陨/伤害结果淡出 → 2) body.challenge-mode + challenge-setup 淡入
  // 与退出对称：先让旧内容淡出，再让新内容淡入，使总时长对齐 chip 的 440ms。
  const sections = document.querySelectorAll('.seal-top, .seal-middle, .result-bottom');
  const sectionAnims = Array.from(sections).map(s =>
    s.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-4px)' },
      ],
      { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
    )
  );
  Promise.all(sectionAnims.map(a => a.finished)).then(() => {
    // gen 守卫：回调触发时若 transitionGen 已变化（用户在淡出期间点了退出），
    // 说明已被 exit 接管，本次回调 no-op，避免 body 状态被反向写入。
    if (state.challenge.transitionGen !== myGen) return;
    sections.forEach(s => {
      s.style.opacity = '';
      s.style.transform = '';
    });
    // 此时才让 body.challenge-mode 生效（星陨/伤害结果回归 display:none）。
    document.body.classList.add('challenge-mode');

    // 显示挑战设置区。**必须先取消 setup 上残留的 Web Animations**——上次 exit
    // 的 Animation 留在 getAnimations() 里、其 fill:'forwards' 会把 setup 钉在
    // opacity:0；不取消的话，setup.hidden = false 后会被 fill 拉回 0（出现一下就消失）。
    const setup = document.getElementById('challenge-setup');
    if (setup) {
      _cancelAnimations(setup);
      setup.style.opacity = '';
      setup.style.transform = '';
      setup.hidden = false;
      const setupAnim = setup.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
      );
      // 完整 440ms 动画结束（sections 淡出 220 + setup 淡入 220）后释放
      // toggle 锁；gen 守卫确保只在"本次 enter 没被抢断"时释放——
      // 若已被 exit 接管（transitionGen 变了），由 exit 自己的 onfinish 释放。
      setupAnim.onfinish = () => {
        if (state.challenge.transitionGen !== myGen) { setupAnim.cancel(); return; }
        setupAnim.cancel();
        state.challenge.toggleAnimating = false;
      };
    }
  });

  // 逐对 label 做淡出 → 淡入 chip 组的过渡（与星陨/伤害结果淡出并行开始；总 440ms）
  for (const pair of _collectLabelSwapPairs()) {
    _swapLabelVisibility(pair.textEl, pair.chipEl, { showChip: true });
  }
}

// 退出挑战模式：反向过渡；隐藏 .challenge-setup；按钮恢复"挑战模式"。
// 关键顺序：1) setup 淡出 → 2) hidden → 3) body.challenge-mode 移除（星陨/伤害结果
// 重新出现）→ 4) 星陨/伤害结果淡入。**不能**先移除 body.challenge-mode 再淡出 setup，
// 否则两者会同时存在导致布局挤兑（星陨/伤害结果被 setup 顶到下面挤在一起）。
//
// 快速连点防御（2026-07-18）：
//   1) 进入前 _cancelChallengeAnimations() 取消 sections / setup / label pairs 上
//      正在跑的 animation——避免与"上次 enter 留下的 fade"反向覆盖。
//   2) transitionGen++ 并快照 myGen；setup.animate 与 sections.animate 的 onfinish
//      内检查 transitionGen === myGen，不等则 no-op。
function exitChallengeMode() {
  if (!state.challenge.active) return;
  // 进入前先清理所有相关元素上正在跑的 animation（修复连点 toggle 时
  // 上一次 enter 留下的 .animate() 反向动画的 bug）。
  _cancelChallengeAnimations();
  const myGen = ++state.challenge.transitionGen;
  state.challenge.active = false;
  // 锁住 toggle click handler（2026-07-18）：440ms 完整动画期间忽略点击，
  // 防止"enter + exit 各 440ms、视觉上闪两次"。末尾 sections 淡入 onfinish
  // 释放（带 gen 守卫，被新动画接管时由新动画释放）。
  state.challenge.toggleAnimating = true;

  const btn = document.getElementById('challenge-toggle-btn');
  const text = btn && btn.querySelector('.challenge-toggle-text');
  const icon = btn && btn.querySelector('.challenge-toggle-icon');
  if (btn) {
    btn.classList.remove('is-active');
    btn.setAttribute('aria-pressed', 'false');
  }
  if (text) text.textContent = '挑战模式';
  if (icon) icon.textContent = '⚔';

  // 逐对 label 做反向过渡（与 setup 淡出并行）
  for (const pair of _collectLabelSwapPairs()) {
    _swapLabelVisibility(pair.textEl, pair.chipEl, { showChip: false });
  }

  // 挑战设置淡出 → 隐藏 → 移除 body.challenge-mode → 星陨/伤害结果淡入
  const setup = document.getElementById('challenge-setup');
  if (setup) {
    _cancelAnimations(setup);
    const a = setup.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-6px)' },
      ],
      { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
    );
    a.onfinish = () => {
      // gen 守卫：若已被新的 enter 接管（用户在淡出期间点了"挑战模式"），
      // 不再继续改 body class 与启动 sections 淡入——避免两者打架。
      if (state.challenge.transitionGen !== myGen) { a.cancel(); return; }
      setup.hidden = true;
      setup.style.opacity = '';
      setup.style.transform = '';
      a.cancel();  // 主动取消，避免 fill 残留到下次 enter
      // 此时才让 body.challenge-mode 移除（星陨/伤害结果回归），并用淡入过渡消解"突然出现"。
      document.body.classList.remove('challenge-mode');
      const sections = document.querySelectorAll('.seal-top, .seal-middle, .result-bottom');
      sections.forEach(s => {
        const anim = s.animate(
          [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
        );
        anim.onfinish = () => {
          // 同样的 gen 守卫
          if (state.challenge.transitionGen !== myGen) { anim.cancel(); return; }
          s.style.opacity = '';
          s.style.transform = '';
          anim.cancel();
          // 完整 440ms 动画结束（setup 淡出 220 + sections 淡入 220）后释放
          // toggle 锁；只在"本次 exit 没被抢断"时释放。
          state.challenge.toggleAnimating = false;
        };
      });
    };
  }
}

// ============================================================
// CHALLENGE MODE (业务逻辑层：题目池 / 答题流程 / 评分)
// ------------------------------------------------------------
// 题目池生成（解耦的 3 个工厂 + 1 个 orchestrator）。每个工厂返回一个
// 生成器 () => 本题具体值，便于后续调整每个维度的"随机策略"而不动其他维度。
// 业务逻辑（startChallenge / applyQuestion / submitAnswer / nextQuestion /
// exitChallenge / findMinKillLayer）也放在本段。
// ============================================================

// 工具：从数组里等概率随机一个元素。防御技能"无"权重更大的随机：把
// __none__ 在候选数组里重复多份实现加权采样。
function _pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// 取本道题新精灵的挑战模式随机池（可能为 null）。
//   side    : 'attacker' | 'defender'
//   spriteId: 精灵 id
// 池数据来自 OTHERS.attacker_random_pools / OTHERS.defender_random_pools，
// 由 make_final_jsons.py 产出。每个池含 default_weight 与 combos：
//   - 总权重 = sum(combos.weight) + default_weight
//   - 抽到 default_weight 区间 → 走"普通随机"（未命中预设组合）
//   - 抽到 combo → 返回 combo.combo
function _getRandomPool(side, spriteId) {
  if (!spriteId) return null;
  const pools = (side === 'attacker')
    ? OTHERS.attacker_random_pools
    : OTHERS.defender_random_pools;
  return pools?.[spriteId] || null;
}

// 按权重从池里抽一个 combo；落在 default_weight 区间或池为空时返回 null。
// 返回 null 表示"未命中预设组合"，由调用方走普通随机兜底。
function _pickFromPool(pool) {
  if (!pool) return null;
  const combos = pool.combos || [];
  const defaultW = pool.default_weight || 0;
  const totalW = combos.reduce((s, c) => s + c.weight, 0) + defaultW;
  if (totalW <= 0) return null;
  let r = Math.random() * totalW;
  for (const c of combos) {
    r -= c.weight;
    if (r < 0) return c.combo;
  }
  return null;
}

// 挑战模式技能随机兜底的权重表（具体数值可调）。
//  - 攻击方：愿力冲击（id 以 __yuanli_ 开头，共 18 个变体）权重低；
//    精灵自身攻击技能权重高。
//  - 防御方：__none__（无）> __state__（聚能）> 精灵自身防御技能。
// 概率 = weight / sum(weights)，精灵自身技能数量越多，其总占比越高。
const CHALLENGE_SKILL_WEIGHTS = {
  attacker: { yuanli: 4, other: 5 },
  defender: { none:   5, state: 4, other: 2 },
};

// 按 CHALLENGE_SKILL_WEIGHTS 从 opts 抽一个技能对象（调用方取 .id）。
//   side = 'attacker' | 'defender'
//   全部权重 ≤ 0 时返回 null（调用方需有兜底）
function _pickWeightedSkill(opts, side) {
  if (!opts || opts.length === 0) return null;
  const W = CHALLENGE_SKILL_WEIGHTS[side];
  const weighted = opts.map(s => {
    let w;
    if (side === 'attacker') {
      w = s.id.startsWith('__yuanli_') ? W.yuanli : W.other;
    } else {
      if (s.id === '__none__')       w = W.none;
      else if (s.id === '__state__') w = W.state;
      else                           w = W.other;
    }
    return { s, w };
  });
  const totalW = weighted.reduce((sum, x) => sum + x.w, 0);
  if (totalW <= 0) return null;
  let r = Math.random() * totalW;
  for (const x of weighted) {
    r -= x.w;
    if (r < 0) return x.s;
  }
  return weighted[weighted.length - 1].s; // 浮点累加误差兜底
}

// ------------------------------------------------------------
// 题目池生成：3 个独立工厂 + 1 个 orchestrator
// ------------------------------------------------------------

// 精灵池工厂：返回 () => 精灵 id
//   pool[side] = 'all'    : 从所有 SPRITES 中等概率采样
//   pool[side] = 'common' : 从 OTHERS.common_attackers/defenders 中等概率采样
//   pool[side] = 'custom' : 固定返回 state[side].id（自选必须已选好精灵）
function buildSpiritRng(side) {
  const mode = state.challenge.pool[side];
  if (mode === 'all') {
    const allIds = Object.keys(SPRITES);
    return () => _pickRandom(allIds);
  }
  if (mode === 'common') {
    const list = (side === 'attacker') ? (OTHERS.common_attackers || [])
                                       : (OTHERS.common_defenders || []);
    const ids = list.slice();
    return () => _pickRandom(ids);
  }
  // 'custom' — 固定当前用户选的精灵
  const fixedId = (side === 'attacker') ? state.attacker?.id : state.defender?.id;
  if (!fixedId) {
    // 自选池但精灵未选：兜底用常见池（避免抛错）
    const list = (side === 'attacker') ? (OTHERS.common_attackers || [])
                                       : (OTHERS.common_defenders || []);
    return () => _pickRandom(list);
  }
  return () => fixedId;
}

// 属性配置工厂：返回 (spirit) => { nature, ivs, buff, speed, power, combo }
//   randomStats[side] = false: 深拷贝当前 state（不污染用户原值，spirit 参数忽略）
//   randomStats[side] = true : 先按 spirit 的随机池抽 nature+ivs / buff-spd /
//                              power / combo（落入 default_weight 区间则走普通随机）；
//                              威力/连击仅攻击方，防御方恒为 0
//   关键：必须传入"本道题新生成的精灵"——与 buildSkillRng 一致，避免误用
//   state.[side]（上一个题目 / 用户在普通计算器里选的精灵）的旧 pool。
function buildStatsRng(side) {
  if (!state.challenge.randomStats[side]) {
    // 固定：从当前 state 深拷贝
    return (_spirit) => ({
      nature: side === 'attacker'
        ? { ...state.attackerNature }
        : { ...state.defenderNature },
      ivs: side === 'attacker'
        ? state.attackerIVs.slice()
        : state.defenderIVs.slice(),
      buff: side === 'attacker'
        ? { ...state.attackerBuff }
        : { ...state.defenderBuff },
      speed: side === 'attacker' ? state.attackerSpeed : state.defenderSpeed,
      // 威力 / 连击：仅攻击方有意义；防御方恒 0（其状态字段也不存在）
      power: side === 'attacker' ? state.attackerPowerBoost : 0,
      combo: side === 'attacker' ? state.attackerCombo : 0,
    });
  }
  // 随机：先看 spirit 的随机池，再走普通兜底
  return (spirit) => {
    const pool = _getRandomPool(side, spirit?.id);
    // 1. nature + ivs（来自 pool.stats；未命中走普通随机）
    const statsPicked = _pickFromPool(pool?.stats);
    let nature, ivs;
    if (statsPicked) {
      nature = { up: statsPicked.nature.up, down: statsPicked.nature.down };
      ivs = statsPicked.ivs.slice();
    } else {
      // 兜底：性格从 6 个 statKey 里抽 2 个不同（up != down）
      const keys = STAT_KEYS.slice();
      const upIdx = Math.floor(Math.random() * keys.length);
      let downIdx = Math.floor(Math.random() * (keys.length - 1));
      if (downIdx >= upIdx) downIdx += 1;
      nature = { up: keys[upIdx], down: keys[downIdx] };
      // 兜底：IVs 从 6 个 statKey 里抽 3 个不同
      const ivKeys = keys.slice();
      ivs = [];
      for (let i = 0; i < MAX_IV; i++) {
        const idx = Math.floor(Math.random() * ivKeys.length);
        ivs.push(ivKeys.splice(idx, 1)[0]);
      }
    }
    // 2. buff / spd / power / combo（来自 pool.buffs；未命中则全 0）
    //    pool.buffs.combo 是 list[dict]，每个 dict 的 key 分流：
    //      - atk / matk / def / mdef → 写入"常量 buff"对象（由 side 决定哪些 key 有效）
    //      - spd / power / combo      → 独立字段；威力/连击仅攻击方
    const buffPicked = _pickFromPool(pool?.buffs);
    const buff = side === 'attacker'
      ? { atk: 0, matk: 0 }
      : { def: 0, mdef: 0 };
    let spd = 0, power = 0, combo = 0;
    if (buffPicked) {
      for (const b of buffPicked) {
        // 独立字段
        if (b.spd   != null) spd = b.spd;
        if (side === 'attacker') {
          if (b.power != null) power = b.power;
          if (b.combo != null) combo = b.combo;
        }
        // 常量 buff：从 b 复制一份去掉 spd/power/combo 的版本写入
        const { spd: _s, power: _p, combo: _c, ...rest } = b;
        Object.assign(buff, rest);
      }
    }
    return { nature, ivs, buff, speed: spd, power, combo };
  };
}

// 技能选择工厂：返回 (spirit) => 技能 id
//   关键：必须传入"本道题新生成的精灵"作为参数（而不是闭包 state.[side]），
//   因为题目池模式下（新精灵 != state.[side]）如果用 state，pool/opts
//   兜底会从旧精灵的数据里挑，导致选出来的 id 在新精灵里查不到，
//   applyQuestion 触发 opts[0] 兜底——看起来"必然选第一个技能"。
// 兜底路径（"固定"分支用户技能找不到时 / "随机"分支）共享：
//   spirit 池 → 加权随机（CHALLENGE_SKILL_WEIGHTS）
// 攻击方：
//   randomSkill=false (固定)：优先 state.attackSkill.id；该 id 不在新精灵可用列表
//                            中时走兜底
//   randomSkill=true  (随机)：直接走兜底
// 防御方：
//   randomSkill=false (固定)：优先 state.defenseSkill.id；找不到时按 reduction
//                            四舍五入容差匹配；都失败走兜底
//   randomSkill=true  (随机)：直接走兜底
function buildSkillRng(side) {
  const isRandom = state.challenge.randomSkill[side];
  // 4 个分支共享的兜底：先看 spirit 池；未命中/不合法走加权随机
  const fallback = (spirit, opts, noneId) => {
    const pool = _getRandomPool(side, spirit?.id);
    const picked = _pickFromPool(pool?.skills);
    if (picked && opts.some(s => s.id === picked)) return picked;
    const weighted = _pickWeightedSkill(opts, side);
    return weighted ? weighted.id : noneId;
  };

  if (side === 'attacker') {
    if (!isRandom) {
      // 固定：先尝试用户的技能；不匹配走兜底
      const userId = state.attackSkill?.id;
      return (attacker) => {
        const opts = getAttackSkillOptions(attacker);
        if (userId && opts.some(s => s.id === userId)) return userId;
        return fallback(attacker, opts, YUANLI_SKILLS[0].id);
      };
    }
    // 随机：直接走兜底
    return (attacker) => {
      const opts = getAttackSkillOptions(attacker);
      return fallback(attacker, opts, YUANLI_SKILLS[0].id);
    };
  }
  // 防御方
  if (!isRandom) {
    const userId = state.defenseSkill?.id;
    const userReduction = state.defenseSkill?.reduction;
    return (defender) => {
      const opts = getDefenseSkillOptions(defender);
      // 1. 优先：完全相同 id
      if (userId) {
        const hit = opts.find(s => s.id === userId);
        if (hit) return hit.id;
      }
      // 2. reduction 四舍五入容差匹配（容差=整数百分比相等）
      if (userReduction != null) {
        const userPct = Math.round(userReduction * 100);
        const hit = opts.find(s => s.reduction != null
          && Math.round(s.reduction * 100) === userPct);
        if (hit) return hit.id;
      }
      // 3. 兜底：与"随机"分支共享
      return fallback(defender, opts, '__none__');
    };
  }
  // 随机：直接走兜底
  return (defender) => {
    const opts = getDefenseSkillOptions(defender);
    return fallback(defender, opts, '__none__');
  };
}

// Orchestrator：取 6 个工厂各调用一次，组装成一道题快照。
// 快照中防御方最终 HP 也存起来，避免后续评分时再算一次。
function buildQuestionSnapshot(_index) {
  const atkId    = buildSpiritRng('attacker')();
  const defId    = buildSpiritRng('defender')();
  // 关键：先构造本题新精灵对象，再让属性/技能工厂用新精灵的 pool 与技能表
  // 去选/兜底，避免 buildStatsRng / buildSkillRng 误用 state.[side]（上一个题目
  // / 用户在普通计算器里选的精灵）的旧 pool 或技能表——那会导致选出来的 id
  // 在新精灵里查不到，触发 applyQuestion 的 opts[0] 兜底，看起来像"必然选
  // 第一个技能"。
  const attacker = { id: atkId, ...(SPRITES[atkId] || {}) };
  const defender = { id: defId, ...(SPRITES[defId] || {}) };
  const atkStats = buildStatsRng('attacker')(attacker);
  const defStats = buildStatsRng('defender')(defender);
  const atkSkId  = buildSkillRng('attacker')(attacker);
  const defSkId  = buildSkillRng('defender')(defender);
  const defHP = getFinalStat(defender, 'hp', defStats.nature, defStats.ivs);
  return {
    attacker,
    defender,
    attackerNature: atkStats.nature,
    defenderNature: defStats.nature,
    attackerIVs: atkStats.ivs,
    defenderIVs: defStats.ivs,
    attackerBuff: atkStats.buff,
    defenderBuff: defStats.buff,
    attackerSpeed: atkStats.speed,
    defenderSpeed: defStats.speed,
    // 威力 / 连击作为题目配置的一部分（仅攻击方；防御方无对应 state 字段）
    attackerPowerBoost: atkStats.power,
    attackerCombo: atkStats.combo,
    attackSkillId: atkSkId,
    defenseSkillId: defSkId,
    defHP,
  };
}

// 二分查找：在 [0, 99] 范围内找能击杀的最少星陨层数。
// 单调性：finalDamage 关于 starLayer 单调非递减（已确认）。
// 99 层仍不能击杀 → 返回 99 作为"不可击杀"哨兵值。
// 哨兵选 99（不是 100）的原因：配合绝对值公式 |s - 99|，
//   submit 99 → |99-99|*10 = 0 → 100 分（用户的"不可击杀时提交99得100"语义）。
//   submit 0 → |0-99|*10 = 990 → 0 分（梯度）。
// 若用 100 作哨兵，s=99 时 |99-100|*10 = 10 → 90 分，与用户预期不符。
function findMinKillLayer(snap, q) {
  // 99 层也不能击杀
  const dmg99 = computeFinalDamage({ ...snap, starLayer: 99 }).finalDamage;
  if (dmg99 < q.defHP) return 99;
  // 0 层即可击杀
  const dmg0 = computeFinalDamage({ ...snap, starLayer: 0 }).finalDamage;
  if (dmg0 >= q.defHP) return 0;
  // 二分 [1, 99]
  let lo = 1, hi = 99;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const dmg = computeFinalDamage({ ...snap, starLayer: mid }).finalDamage;
    if (dmg >= q.defHP) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// ------------------------------------------------------------
// 答题流程辅助函数
// ------------------------------------------------------------

// 锁定 / 解锁精灵面板：仅影响 .spirit-panel 及其后代；星陨层数控件不受影响。
function lockSpiritPanels() {
  for (const id of ['attacker-panel', 'defender-panel']) {
    const el = document.getElementById(id);
    if (el) el.classList.add('challenge-locked');
  }
}
function unlockSpiritPanels() {
  for (const id of ['attacker-panel', 'defender-panel']) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('challenge-locked');
  }
}

// 锁定 / 解锁星陨层数控件（#seal-wrapper 拖拽 + #seal-slider 滑块）。
// 锁定后：拖拽失效、滚轮失效、滑块 disabled。
function lockStarControls() {
  const wrapper = document.getElementById('seal-wrapper');
  const slider = document.getElementById('seal-slider');
  if (wrapper) wrapper.classList.add('challenge-locked');
  if (slider) slider.disabled = true;
}
function unlockStarControls() {
  const wrapper = document.getElementById('seal-wrapper');
  const slider = document.getElementById('seal-slider');
  if (wrapper) wrapper.classList.remove('challenge-locked');
  if (slider) slider.disabled = false;
}

// ------------------------------------------------------------
// 答题结果切换：把 .seal-middle（滑条）替换为 .challenge-answer-result。
// 与 enterChallengeMode / exitChallengeMode 共用同一套 Web Animations API
// 风格（220ms opacity + translateY 4-6px）。
//   - _showAnswerResult(opts): 答完一题后调用，淡出滑条 → 显示结果
//   - _hideAnswerResult(opts): 切到下一题 / 退出挑战时调用，淡出结果 → 淡入滑条
// 两个函数都接受 { animated } 选项；exitChallenge 会传 animated:false 走
// 原地退出（不播动画），与 toggle 按钮的"原地退出"语义一致。
// ------------------------------------------------------------
function _showAnswerResult({ score, optimal }) {
  const middle = document.getElementById('seal-middle');
  const result = document.getElementById('challenge-answer-result');
  const scoreEl = document.getElementById('challenge-answer-score');
  const optimalEl = document.getElementById('challenge-answer-optimal');
  if (!middle || !result || !scoreEl || !optimalEl) return;

  // 快速连点防御（2026-07-18）：
  //   - 进入前先取消 answerAnimating 期间可能存在的 _hideAnswerResult fade
  //   - 启动 transitionGen++ 并快照 myGen；fadeOut.onfinish 内检查 token，
  //     不等则 no-op——防止 _hideAnswerResult 抢在 fadeOut 完成前退出后，
  //     本回调反向把 body 重新加上 challenge-answered。
  //   - answerShown/answerAnimating 立即置 true，让 race 窗口内的
  //     _hideAnswerResult 能正确识别"结果已显示"（不再误判"还没加 body class"
  //     而早返回）。
  _cancelAnimations(middle);
  _cancelAnimations(result);
  const myGen = ++state.challenge.transitionGen;
  state.challenge.answerShown = true;
  state.challenge.answerAnimating = true;

  // 1. 填充内容 + 分数等级（高分绿/中分黄/低分红）
  scoreEl.textContent = score;
  optimalEl.textContent = optimal;
  let grade = 'low';
  if (score >= 80) grade = 'high';
  else if (score >= 50) grade = 'mid';
  scoreEl.dataset.grade = grade;

  // 2. 淡出滑条 → body.challenge-answered 触发 CSS 隐藏 + 显示结果 → 淡入
  // 关键：先做完淡出再加 body class，否则 body class 的 display:none 会让
  // 淡出动画"瞬间消失"，看起来像没动画。
  const fadeOut = middle.animate(
    [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-4px)' },
    ],
    { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
  );
  fadeOut.onfinish = () => {
    // gen 守卫：若 _hideAnswerResult / _showAnswerResult 已被新调用接管
    // （transitionGen 已变），不再继续——避免 body 状态被反向写入导致
    // 答案信息残留与滑条共存。
    if (state.challenge.transitionGen !== myGen) return;
    // 淡出完成才切 display：CSS 让 .seal-middle 隐藏、.challenge-answer-result 显示
    document.body.classList.add('challenge-answered');
    result.hidden = false;
    _cancelAnimations(result);
    result.animate(
      [
        { opacity: 0, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
    );
    // 整个 show 流程（淡出滑条 + 切 display + 淡入结果）完成；
    // 答题结果区稳定显示，answerAnimating 复位。
    state.challenge.answerAnimating = false;
  };
}

// 答题结果 → 滑条 切换。
// 快速连点防御（2026-07-18）：
//   - 早返回判断改用 state.challenge.answerShown（与 c.phase 同步设置），
//     替代 "body.classList.contains('challenge-answered')"——后者在
//     _showAnswerResult 的 fadeOut 还没结束时为 false，会让 race 窗口内的
//     _hideAnswerResult 误判"已隐藏"而早返回，导致 body class 被提前移除。
//   - transitionGen++ 快照 myGen；fadeOut/fadeIn 的 onfinish 内 gen 守卫，
//     防止 _showAnswerResult 抢在 fadeOut 完成后反向写入 body 状态。
//   - answerShown/answerAnimating 立即维护为 hide 流程的最新状态。
function _hideAnswerResult({ animated = true } = {}) {
  const middle = document.getElementById('seal-middle');
  const result = document.getElementById('challenge-answer-result');
  if (!middle || !result) return Promise.resolve();
  // 已经在"滑条态"就直接返回（防重复调用）。**用 answerShown 而非 body class**：
  // _showAnswerResult 的 fadeOut 未结束时 body 还没有 challenge-answered，
  // 但 answerShown 已在调用入口置 true（与 c.phase 同步），能正确识别
  // "结果区在显示中"这一语义。
  if (!state.challenge.answerShown) return Promise.resolve();

  // 原地退出：不播动画，立即换回滑条（用于 exitChallenge 等"立即收尾"场景）
  if (!animated) {
    const myGen = ++state.challenge.transitionGen;
    state.challenge.answerShown = false;
    state.challenge.answerAnimating = false;
    document.body.classList.remove('challenge-answered');
    result.hidden = true;
    return Promise.resolve();
  }

  // 淡出答题结果 → 切回滑条 → 淡入滑条
  // 进入前先清理 answerAnimating 期间可能存在的 _showAnswerResult fadeOut
  // （虽然 _showAnswerResult 自己有 gen 守卫不再反扑，但保险起见清掉）
  _cancelAnimations(result);
  _cancelAnimations(middle);
  const myGen = ++state.challenge.transitionGen;
  state.challenge.answerAnimating = true;
  // 立即清 answerShown——这样若 race 窗口内 _showAnswerResult 被再次调用
  // （理论上不会，但防御），它会自己重新置 true + 启动新动画。
  state.challenge.answerShown = false;

  return new Promise(resolve => {
    const fadeOut = result.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-4px)' },
      ],
      { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
    );
    fadeOut.onfinish = () => {
      // gen 守卫：若 _showAnswerResult / _hideAnswerResult 已被新调用接管
      // （用户在淡出期间又点了 submit），不再继续——避免 body 状态被
      // 错误地覆盖为 hide 终态（导致 result 残留或被强行隐藏）。
      if (state.challenge.transitionGen !== myGen) { fadeOut.cancel(); return; }
      // 切回滑条：移除 body class + 隐藏结果节点
      document.body.classList.remove('challenge-answered');
      result.hidden = true;
      // 淡入滑条
      const fadeIn = middle.animate(
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
      );
      // 等淡入完成再 resolve：调用方此时移除 body.challenge-running / .challenge-mode 才安全
      fadeIn.onfinish = () => {
        // gen 守卫：同样防止后续新动画接管后这个 callback 反向 reset state
        if (state.challenge.transitionGen !== myGen) { fadeIn.cancel(); return; }
        state.challenge.answerAnimating = false;
        resolve();
      };
    };
  });
}

// 渲染进度信息（"第 N / M 题 · 累计 X 分"）
function renderChallengeProgress() {
  const el = document.getElementById('challenge-progress-info');
  if (!el) return;
  const c = state.challenge;
  el.textContent = `第 ${c.current + 1} / ${c.total} 题 · 累计 ${c.totalScore} 分`;
}

// 渲染提交/下一道题/查看结果按钮文案 + 启用状态。
function renderSubmitButton() {
  const btn = document.getElementById('challenge-submit-btn');
  if (!btn) return;
  const c = state.challenge;
  const isLast = c.current >= c.total - 1;
  btn.classList.remove('is-next');
  if (c.phase === 'picking') {
    btn.textContent = '提交答案';
    btn.disabled = false;
  } else if (c.phase === 'answered') {
    btn.textContent = isLast ? '查看结果' : '下一道题';
    btn.disabled = false;
    btn.classList.add('is-next');
  } else {
    // 'idle' / 'done'
    btn.textContent = '提交答案';
    btn.disabled = true;
  }
}

// 全部完成后的结算视图：进度条显示总分；提交按钮消失；星陨控件保持锁定。
// 原本会在 result-info 区域写每题明细，但发现那个区域在伤害圆环正下方，
// 文字过长会顶歪伤害明细的"伤害计算明细"按钮，且视觉上很拥挤，故暂时移除。
// 之后再考虑用更合适的方案展示每题得分（例如弹窗 / 折叠面板 / 单独页面）。
function renderChallengeResult() {
  const c = state.challenge;
  const info = document.getElementById('challenge-progress-info');
  if (info) info.textContent = `挑战完成 · 总分 ${c.totalScore} / ${c.total * 100}`;
  // 提交按钮淡出（220ms），不直接 display:none 避免突兀。
  const btn = document.getElementById('challenge-submit-btn');
  if (btn) {
    btn.classList.remove('is-shown');
    btn.setAttribute('aria-hidden', 'true');
  }
  lockStarControls();
  c.phase = 'done';
}

// ------------------------------------------------------------
// 核心流程
// ------------------------------------------------------------

// 答题阶段：自动把技能列表滚动到当前选中的技能（.skill-btn.active）。
// 精灵面板已锁定交互（pointer-events: none），用户无法自己滚列表，
// 必须由 JS 在 renderSkills 后代为滚到中心位置，避免选中技能被遮挡。
// 注意：2026-07-21 把 .skill-list 拆成外层 + .skill-list-inner 后，
// overflow-y: auto 移到 inner 上，所以滚动的容器也是 inner。
function _scrollSkillListToSelected(side) {
  const list = document.getElementById(side + '-skill-list');
  if (!list) return;
  const scrollEl = list.querySelector('.skill-list-inner') || list;
  const selected = scrollEl.querySelector('.skill-btn.active');
  if (!selected) return;
  // 直接滚 list 自身的滚动条，不动整页。
  // 原实现用 selected.scrollIntoView() 会把所有祖先滚动容器（包括 <html>
  // 页面）都滚到元素可见；移动端竖向布局（attacker → seal → defender）下，
  // defender 那次调用会把整页跳到防御方位置，体验割裂。
  const listRect = scrollEl.getBoundingClientRect();
  const selectedRect = selected.getBoundingClientRect();
  // 选中技能顶部到列表可见区域顶部的偏移；scrollTo 把元素对齐到列表顶部，
  // 行为与 scrollIntoView({ block: 'start' }) 等价。
  const offsetInList = selectedRect.top - listRect.top;
  if (offsetInList === 0) return;
  scrollEl.scrollTo({ top: scrollEl.scrollTop + offsetInList, behavior: 'smooth' });
}

// 应用一道题：替换 state 全字段并重渲染。
// 关键：绕过 selectSpirit / selectAttackSkill / selectDefenseSkill（它们会
// 清空 nature/IVs/buff/speed/power/combo，并触发 calculateDamage 副作用）。
function applyQuestion(index) {
  const q = state.challenge.questions[index];
  if (!q) return;
  // 1. 替换 state 全部相关字段（深拷贝避免污染快照）
  state.attacker = { ...q.attacker };
  state.defender = { ...q.defender };
  state.attackerNature = { ...q.attackerNature };
  state.defenderNature = { ...q.defenderNature };
  state.attackerIVs = q.attackerIVs.slice();
  state.defenderIVs = q.defenderIVs.slice();
  state.attackerBuff = { ...q.attackerBuff };
  state.defenderBuff = { ...q.defenderBuff };
  state.attackerSpeed = q.attackerSpeed;
  state.defenderSpeed = q.defenderSpeed;
  // 威力 / 连击：题目配置的一部分（与双攻/双防/速度同级），不再每题重置
  state.attackerPowerBoost = q.attackerPowerBoost;
  state.attackerCombo = q.attackerCombo;
  state.spiritPicking.attacker = false;
  state.spiritPicking.defender = false;
  // 2. 攻击技能：在新精灵的可用列表中找对应 id
  const atkOpts = getAttackSkillOptions(state.attacker);
  const atkIdx = atkOpts.findIndex(s => s.id === q.attackSkillId);
  if (atkIdx >= 0) {
    state.attackSkillIdx = atkIdx;
    state.attackSkill = atkOpts[atkIdx];
  } else {
    // 题目的 id 在新精灵里不可用 → 用 opts[0] 兜底
    state.attackSkillIdx = 0;
    state.attackSkill = atkOpts[0] || null;
  }
  // 3. 防御技能
  const defOpts = getDefenseSkillOptions(state.defender);
  const defIdx = defOpts.findIndex(s => s.id === q.defenseSkillId);
  if (defIdx >= 0) {
    state.defenseSkillIdx = defIdx;
    state.defenseSkill = defOpts[defIdx];
  } else {
    state.defenseSkillIdx = 0;
    state.defenseSkill = defOpts[0] || { id: '__none__', name: '无', reduction: 1, _pseudo: true };
  }
  // 4. 重置星陨层数 + 题目元数据
  state.starLayer = 0;
  state.challenge.current = index;
  state.challenge.phase = 'picking';
  // 5. 同步 UI
  renderSpiritArea('attacker');
  renderSpiritArea('defender');
  renderSkills('attacker');
  renderSkills('defender');
  // 5b. 滚动技能列表到选中的技能（面板已锁定交互，必须 JS 代滚）
  _scrollSkillListToSelected('attacker');
  _scrollSkillListToSelected('defender');
  renderStatsConfig('attacker');
  renderStatsConfig('defender');
  renderBuffChips('attacker');
  renderBuffChips('defender');
  renderPowerBoostChip();
  setStarLayer(0);
  // 6. 答题阶段不计算伤害：保持空圆环 + 等待提交
  renderWaiting();
  // 7. 进度条 + 提交按钮
  renderChallengeProgress();
  renderSubmitButton();
  // 8. 解锁星陨层数（每题开始都让用户能拖）
  unlockStarControls();
  // 9. 切到答题态：先移除 challenge-mode 让 seal/结果回归显示（避免其 CSS
  //    display:none 把星陨/伤害结果钉死），再加 challenge-running。
  //    设置阶段（enterChallengeMode）时 body 有 challenge-mode，applyQuestion
  //    需要同时清理掉，否则星陨盘 + 伤害圆环不会显示。
  //
  //    **第一题**（setup → running 首次切换）：seal 区域需要走"setup 淡出 →
  //    swap body class → seal 淡入"的 440ms 过渡，与 exitChallengeMode 对称。
  //    之前是同步切换：.seal-* 元素从 display:none 直接变 display:flex，
  //    看起来"突然出现"。其他 UI（spirit 卡 spiritAreaIn、label-chip→label）
  //    已经在并行播，seal 区域补上同样的 Web Animations 即可。
  //    **后续题**：body 类与 setup.hidden 都在第一题设置过，这里就是 no-op，
  //    不用再走动画。
  //
  // 快速连点防御（2026-07-18）：
  //   - 第一题启动前 _cancelChallengeAnimations() + transitionGen++；setup
  //     淡出与 sections 淡入的 onfinish 内 gen 守卫——防止用户在 220ms 内点
  //     退出（exitChallenge 会 cancel 这些 animation + bump gen），即便
  //     onfinish 仍然 fire，gen 失配也会 no-op。
  //
  //   **不在这里清 answerShown/answerAnimating**：nextQuestion 路径下
  //     _hideAnswerResult 入口立即把 answerAnimating 设为 true（防 submit
  //     click 在 440ms 内重入），紧接着 applyQuestion(next) 同步执行——
  //     如果这里再设 false，next 之后那 440ms 的锁立即被吃掉，user 可以
  //     连点 submit/退出挑战再次触发链式动画。改为：_hideAnswerResult
  //     自己的 fadeIn.onfinish 负责设 false。
  if (index === 0) {
    const setup = document.getElementById('challenge-setup');
    if (setup) {
      _cancelAnimations(setup);
      const myGen = ++state.challenge.transitionGen;
      const fadeOut = setup.animate(
        [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(-6px)' },
        ],
        { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
      );
      fadeOut.onfinish = () => {
        // gen 守卫：若已被新的 enter/exit 接管（用户在 220ms 内点退出），
        // 不再继续——避免 body 状态被反向写入。
        if (state.challenge.transitionGen !== myGen) { fadeOut.cancel(); return; }
        // 此时才让 body 切到 running 态：先隐藏 setup + swap class，
        // 再淡入 seal-*，避免两者在 .seal-container（flex column）里同时存在造成挤兑。
        setup.hidden = true;
        setup.style.opacity = '';
        setup.style.transform = '';
        fadeOut.cancel();  // 主动取消，避免 fill 残留到下次 enter
        document.body.classList.remove('challenge-mode');
        document.body.classList.add('challenge-running');
        const sections = document.querySelectorAll('.seal-top, .seal-middle, .result-bottom');
        sections.forEach(s => {
          const anim = s.animate(
            [
              { opacity: 0, transform: 'translateY(4px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: CHALLENGE_LABEL_TRANSITION_MS, easing: EASING_STANDARD }
          );
          anim.onfinish = () => {
            // 同样的 gen 守卫
            if (state.challenge.transitionGen !== myGen) { anim.cancel(); return; }
            s.style.opacity = '';
            s.style.transform = '';
          };
        });
      };
    } else {
      // 兜底：找不到 setup 时直接切（不应该发生）
      document.body.classList.remove('challenge-mode');
      document.body.classList.add('challenge-running');
    }
  } else {
    // 后续题：body 类已经在第一次 applyQuestion 设置好（remove/add 都是 no-op），
    // setup 也已经 hidden，不再动它。
    document.body.classList.remove('challenge-mode');
    document.body.classList.add('challenge-running');
    const setup = document.getElementById('challenge-setup');
    if (setup) setup.hidden = true;
  }
  // 进度信息 + 提交按钮：CSS 控透明度（220ms 淡入），aria-hidden 与可见性同步
  // — 之前用 `hidden = true/false` 是二值切换，没有过渡，体验突兀。
  const info = document.getElementById('challenge-progress-info');
  if (info) {
    info.classList.add('is-shown');
    info.setAttribute('aria-hidden', 'false');
  }
  const submitBtn = document.getElementById('challenge-submit-btn');
  if (submitBtn) {
    submitBtn.classList.add('is-shown');
    submitBtn.setAttribute('aria-hidden', 'false');
  }
  // 10. 答题阶段：把侧栏 label-chip（精灵池单选/随机 chip）淡出，让 label-text
  //     淡入回归——与「从挑战设置退出挑战」时的视觉一致（见 exitChallengeMode）。
  //     不然进入答题态后还会看到「全部/常见/自选」「随机」等 chip，干扰注意力。
  //     **只在第一题播**：后续题目（nextQuestion）的 label 已经在第一题被换回 text，
  //     再播一次 _swapLabelVisibility 就是无意义的"文字淡入"——文字其实一直在那，
  //     看起来很奇怪。
  if (index === 0) {
    for (const pair of _collectLabelSwapPairs()) {
      _swapLabelVisibility(pair.textEl, pair.chipEl, { showChip: false });
    }
  }
}

// 提交答案：二分查找最优层数 → 评分 → 锁定星陨控件（保持用户提交的层数）。
function submitAnswer() {
  const c = state.challenge;
  if (c.phase !== 'picking') return;  // 防双击
  // 快速连点防御（2026-07-18）：如果 _showAnswerResult / _hideAnswerResult 还在
  // 播 220ms 过渡动画，忽略本次点击。否则会与上一次提交未完成的"结果区切换"
  // 动画叠加，触发 answer 信息残留 + body class 反向写入。
  if (c.answerAnimating) return;
  const q = c.questions[c.current];
  if (!q) return;
  const submitted = state.starLayer;
  // 临时 ctx 用于二分查找最优层数（不污染 state）
  const baseSnap = {
    attacker: q.attacker,
    defender: q.defender,
    attackSkill: state.attackSkill,   // 此时 state 已被 applyQuestion 同步
    defenseSkill: state.defenseSkill,
    attackerNature: q.attackerNature,
    defenderNature: q.defenderNature,
    attackerIVs: q.attackerIVs,
    defenderIVs: q.defenderIVs,
    attackerBuff: q.attackerBuff,
    defenderBuff: q.defenderBuff,
    attackerSpeed: q.attackerSpeed,
    defenderSpeed: q.defenderSpeed,
    attackerPowerBoost: state.attackerPowerBoost,
    attackerCombo: state.attackerCombo,
    starLayer: 0,
  };
  const optimal = findMinKillLayer(baseSnap, q);
  // 评分：score = 100 - |s - o| × 10，截断到 [0, 100]
  //   用 |s - o|（绝对差）而不是 (s - o)，让公式在击杀/未击杀两种情况下
  //   都给出合理梯度，与用户的"0层就死 submit 0 得 100、99层都不死
  //   submit 99 得 100、未击杀按偏离程度扣分"语义一致。
  //   - 击杀场景（o ∈ [0, 99]）：submit 偏离 o 越远，扣分越多（双向）
  //   - 不可击杀（哨兵 99）：submit 99 → 100；submit 0 → 0
  // 计算 userDamage 仅用于 isKill 字段（信息性展示），不影响分数。
  const userDamage = computeFinalDamage({ ...baseSnap, starLayer: submitted }).finalDamage;
  const userKills = userDamage >= q.defHP;
  const diff = Math.abs(submitted - optimal);
  const score = Math.max(0, Math.min(100, 100 - diff * 10));
  c.scores.push({
    layer: submitted,
    optimal,
    isKill: userKills,        // 信息性字段：用户提交层数是否实际击杀（不影响分数）
    score,
  });
  c.totalScore += score;
  c.phase = 'answered';
  // 锁定星陨层数（提交后不允许再调）；滑块保持用户提交的层数（不动），
  // 下方 calculateDamage 会用此层数算出真实伤害并显示。
  lockStarControls();
  // 把 .seal-middle（滑条）替换为 .challenge-answer-result，显示"得分"与"最优层数"。
  // 内部用 Web Animations API 淡出滑条 + 淡入结果（220ms + translateY），
  // 不直接 display:none 切换以避免突兀。
  _showAnswerResult({ score, optimal });
  // 刷新按钮 + 进度
  renderChallengeProgress();
  renderSubmitButton();
  // 提交后才计算伤害（让圆环显示最终结果）。
  // 此时 phase === 'answered'，setStarLayer 的 phase guard 不会阻止 calculateDamage。
  calculateDamage();
}

// 进入下一道题 / 最后一题显示结算
function nextQuestion() {
  const c = state.challenge;
  // 快速连点防御（2026-07-18）：如果 _showAnswerResult / _hideAnswerResult 还在
  // 播 220ms 过渡动画，忽略本次点击。否则会与未完成的"结果区切换"动画叠加，
  // 导致 applyQuestion 与 hide 的 body class 状态互相覆盖。
  if (c.answerAnimating) return;
  const next = c.current + 1;
  if (next >= c.total) {
    renderChallengeResult();
    return;
  }
  // 把答题结果切回滑条（在切题之前完成淡出 → 淡入，避免"切题后滑条突然出现"）。
  // 内部走 Web Animations API：淡出结果 → 切 display → 淡入滑条（220ms + translateY）。
  _hideAnswerResult();
  // 重置滑块控件
  unlockStarControls();
  setStarLayer(0);
  applyQuestion(next);
}

// 退出挑战：解除所有锁定、回到正常计算器状态。
// 不备份 state —— applyQuestion 期间会改写 state 字段，退出后 state 残留
// 的是最后提交的题目快照；用户重新调整即可，不专门设计"恢复原状态"。
//
// 快速连点防御（2026-07-18）：
//   1) 入口处 running 守卫：第二次点击的 exitChallenge 调用直接 no-op，
//      避免第一次未跑完就第二次进。
//   2) 先 transitionGen++ + _cancelChallengeAnimations()，确保 _showAnswerResult
//      / applyQuestion(0) 留下的 220ms onfinish 回调的 gen 失配、no-op，
//      不会再反向加回 body class。
//   3) 显式重置 answerAnimating。
//
//   **不要**在这里把 c.answerShown = false：_hideAnswerResult 入口用
//   `if (!answerShown) return Promise.resolve();` 早返回；这里清掉后
//   _hideAnswerResult 不会走完整流程，.challenge-answer-result 不会被
//   hidden=true、body 也不会 remove('challenge-answered')——最终 result
//   与 .seal-middle 同时显示（"答案信息留在这里 + 滑条瞬间出现"）。
//   answerShown 由 _showAnswerResult 入口设为 true，让 _hideAnswerResult
//   检测到它存在、走完整淡出 → 切 display → 淡入流程。
function exitChallenge() {
  const c = state.challenge;
  if (!c.running) return;  // 快速连点防御：第二次点击 no-op
  // 取消所有挑战相关元素上正在跑的 animation（含 _showAnswerResult 的
  // fadeOut.onfinish / applyQuestion(0) 的 setup 淡出 onfinish 等），
  // 并 bump transitionGen 让残留的 onfinish 回调 gen 失配、no-op。
  c.transitionGen++;
  _cancelChallengeAnimations();
  // 不清 c.answerShown：让 _hideAnswerResult 检测到"结果区在显示中"、
  // 走完整淡出 → 切 display → 淡入滑条流程（修复 2026-07-18 答案残留 bug）。
  c.answerAnimating = false;

  // 1. 解锁所有面板
  unlockSpiritPanels();
  unlockStarControls();
  // 1b. 如果当前在"已提交"态，答题结果区域正显示得分/最优层数；
  //     退出挑战时把它换回星陨滑条。走与 nextQuestion 同样的 220ms 淡出 →
  //     淡入过渡（与每道题之间的切换保持一致）。其余退出逻辑（重置状态、
  //     重渲染精灵面板等）与动画并行执行，中心区域的 swap 是用户视线焦点，
  //     周围 UI 的瞬时变化不会干扰体验。
  //
  //     **关键**：必须等 swap 全部完成（淡出 220 + 淡入 220 ≈ 440ms）后再
  //     移除 body.challenge-running / body.challenge-mode。否则 CSS 规则
  //       body.challenge-running.challenge-answered .seal-middle { display:none }
  //     在淡出过程中就失效——.seal-middle 立即显形（opacity:1、translateY:0），
  //     与正在淡出的 .challenge-answer-result 同时出现在 .seal-container
  //     （flex column）里上下排，呈现"上下挤在一起"的瞬态。
  //     _hideAnswerResult 现在返回 Promise：非 answered 态早返回时立即 resolve，
  //     下面 .then() 相当于同步执行（行为不变）。
  _hideAnswerResult().then(() => {
    // 4. body 退出 running（同时清理可能残留的 challenge-mode）
    //    放在 .then 末尾：等淡入滑条也播完再移除，让 CSS 规则覆盖期
    //    与 .seal-middle 的 220ms 淡入动画完整对齐。
    document.body.classList.remove('challenge-running');
    document.body.classList.remove('challenge-mode');
  });
  // 2. 进度信息 + 提交按钮淡出（220ms），aria-hidden 同步更新
  const info = document.getElementById('challenge-progress-info');
  if (info) {
    info.classList.remove('is-shown');
    info.setAttribute('aria-hidden', 'true');
  }
  const btn = document.getElementById('challenge-submit-btn');
  if (btn) {
    btn.classList.remove('is-shown');
    btn.setAttribute('aria-hidden', 'true');
    // 延迟移除 is-next / 设置 disabled = true：
    //   exitChallenge 在同一帧内如果同步把这两个也改了，浏览器会把这
    //   三次状态变更合批为一次过渡（.is-shown → 默认），于是：
    //     1) color 从 yellow (.is-next) → cyan 走 0.22s 过渡，和
    //        opacity 渐出同步发生 → 看起来像"淡出最后变蓝";
    //     2) :disabled 的 opacity: 0.45 覆盖掉默认 0，opacity 实际
    //        终点是 0.45（不是 0），到 0.22s visibility:hidden 突然
    //        生效 → 看起来像"卡了一下"。
    //   解决办法：淡出过程中保持按钮原状态（.is-shown.is-next / enabled），
    //   等 220ms 过渡结束 + 40ms buffer 再清理。这时按钮已经 visibility:hidden，
    //   color 变蓝与 disabled 置位都不可见。
    setTimeout(() => {
      if (!btn.isConnected) return;   // 防御：节点被移除就不动它
      btn.classList.remove('is-next');
      btn.disabled = true;
    }, 260);
  }
  // 3. 还原切换按钮的"挑战模式"状态（不要重新跑 exitChallengeMode 那一套
  //    440ms 过渡动画 — 用户原话"原地退出"）
  const toggleBtn = document.getElementById('challenge-toggle-btn');
  if (toggleBtn) {
    toggleBtn.classList.remove('is-active');
    toggleBtn.setAttribute('aria-pressed', 'false');
    const text = toggleBtn.querySelector('.challenge-toggle-text');
    const icon = toggleBtn.querySelector('.challenge-toggle-icon');
    if (text) text.textContent = '挑战模式';
    if (icon) icon.textContent = '⚔';
  }
  // 4. body 退出 running（同时清理可能残留的 challenge-mode）—— 已移至
  //    上面 _hideAnswerResult().then() 里延后到 swap 动画完成后再移除。
  // 5. 重置 running 状态字段
  c.running = false;
  c.active = false;   // 同步把 setup 状态也清掉，让 toggle 按钮 3 路分支落到 "enter"
  c.phase = 'idle';
  c.current = 0;
  c.total = 0;
  c.questions = [];
  c.scores = [];
  c.totalScore = 0;
  // 6. 重渲染（state 已被 applyQuestion 改写——重新渲染以反映当前 state）
  // 退出时给 spirit 卡片走 skipAnimation：原地退出不应该播一个 250ms 的 spiritAreaIn。
  // 走 inline style（见 renderSpiritCard/renderSpiritPicker），element 创建时即抑制动画。
  renderSpiritArea('attacker', { skipAnimation: true });
  renderSpiritArea('defender', { skipAnimation: true });
  renderSkills('attacker');
  renderSkills('defender');
  renderStatsConfig('attacker');
  renderStatsConfig('defender');
  renderBuffChips('attacker');
  renderBuffChips('defender');
  renderPowerBoostChip();
  setStarLayer(state.starLayer);
  // 7. 重新计算伤害（恢复实时显示）
  calculateDamage();
  const breakdownSection = document.getElementById('breakdown-section');
  if (breakdownSection) breakdownSection.style.display = 'none';
}

// 开始挑战：生成题目池 + 启动第一题
function startChallenge() {
  const c = state.challenge;
  // 1. 校验自选池精灵已选
  for (const side of ['attacker', 'defender']) {
    if (c.pool[side] === 'custom') {
      const has = side === 'attacker' ? !!state.attacker : !!state.defender;
      if (!has) {
        // 简单提示：复用现有信息弹窗
        const modal = document.getElementById('info-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        if (modal && title && body) {
          title.textContent = '无法开始挑战';
          const whichSide = side === 'attacker' ? '攻击方' : '防御方';
          body.innerHTML = `<div style="line-height:1.7">「自选」池需要${whichSide}已选中精灵。请先在精灵面板中选择，或切换为「全部 / 常见」池。</div>`;
          modal.classList.add('is-open');
          modal.setAttribute('aria-hidden', 'false');
        }
        return;
      }
    }
  }
  // 2. 生成题目
  c.questions = [];
  for (let i = 0; i < c.count; i++) {
    c.questions.push(buildQuestionSnapshot(i));
  }
  c.total = c.count;
  c.current = 0;
  c.scores = [];
  c.totalScore = 0;
  c.running = true;
  c.phase = 'idle';
  // 3. 锁定精灵面板
  lockSpiritPanels();
  // 4. 应用第一题（applyQuestion 内部会切到 challenge-running / 显示 progress）
  applyQuestion(0);
}

// 给 .label-chip 挂按压特效（pointerdown/pointerup/cancel）。
// 用 capturing=false 即可，chip 内部不再消费 pointerdown。
function _attachLabelChipPressEffect(chip) {
  if (chip.__pressBound) return;
  chip.__pressBound = true;
  const onDown = () => chip.classList.add('pressing');
  const release = () => chip.classList.remove('pressing');
  chip.addEventListener('pointerdown', onDown);
  chip.addEventListener('pointerup', release);
  chip.addEventListener('pointercancel', release);
  chip.addEventListener('pointerleave', release);
  // 键盘 Enter/Space 也复用该特效（按下时短暂加类）
  chip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') onDown();
  });
  chip.addEventListener('keyup', release);
  chip.addEventListener('blur', release);
}

// 单选 chip 组：点击触发时把同组内 .active 切到目标 chip；点击当前 active
// 不做任何事（不能空选）。返回值表示是否真的切换了。
function _setSingleChoice(group, value) {
  const chips = group.querySelectorAll('.label-chip');
  let changed = false;
  chips.forEach(c => {
    const isTarget = c.dataset.value === value || c.dataset.pool === value;
    if (isTarget && !c.classList.contains('active')) {
      c.classList.add('active');
      c.setAttribute('aria-pressed', 'true');
      changed = true;
    } else if (isTarget) {
      // 已经是 active，也保持并同步 aria
      c.setAttribute('aria-pressed', 'true');
    } else if (c.classList.contains('active')) {
      c.classList.remove('active');
      c.setAttribute('aria-pressed', 'false');
      changed = true;
    }
  });
  return changed;
}

// 开关 chip：toggle .active。返回新状态（true=激活）。
function _toggleChip(chip) {
  const newActive = !chip.classList.contains('active');
  chip.classList.toggle('active', newActive);
  chip.setAttribute('aria-pressed', newActive ? 'true' : 'false');
  return newActive;
}

// 挑战模式预设配置表。
//   easy    : 双方精灵常见 / 双方属性、技能均非随机 / 5 题
//   standard: 双方精灵常见 / 防御方属性与技能随机 / 10 题
//   hard    : 攻击方精灵常见 + 防御方精灵全部 / 防御方属性与技能随机 / 20 题
const CHALLENGE_PRESETS = {
  easy: {
    pool:        { attacker: 'common', defender: 'common' },
    randomStats: { attacker: true,     defender: true     },
    randomSkill: { attacker: true,     defender: true     },
    count: 5,
  },
  standard: {
    pool:        { attacker: 'common', defender: 'all'    },
    randomStats: { attacker: true,     defender: true     },
    randomSkill: { attacker: true,     defender: true     },
    count: 10,
  },
  hard: {
    pool:        { attacker: 'all',    defender: 'all'    },
    randomStats: { attacker: true,     defender: true     },
    randomSkill: { attacker: true,     defender: true     },
    count: 20,
  },
};

// 取消预设 chip 选中（视觉 + state.challenge.preset = null）。
// 用户不能通过点击预设 chip 自身来触发；仅由非预设 chip 的点击回调调用，
// 表示「用户已偏离当前预设，按自定义处理」。
function _clearPresetSelection() {
  const group = document.querySelector('.challenge-setup-chips[data-group="preset"]');
  if (group) {
    group.querySelectorAll('.label-chip').forEach(c => {
      c.classList.remove('active');
      c.setAttribute('aria-pressed', 'false');
    });
  }
  state.challenge.preset = null;
}

// 同步单侧精灵池 chip 视觉 + state
function _syncPoolChip(side, value) {
  const group = document.querySelector(`.label-chip-group[data-kind="pool"][data-side="${side}"]`);
  if (group) _setSingleChoice(group, value);
  state.challenge.pool[side] = value;
}

// 同步单侧 random chip 视觉 + state
function _syncRandomChip(kind, side, value) {
  const chip = document.querySelector(`.label-chip-group[data-kind="${kind}"][data-side="${side}"] .label-chip`);
  if (chip) {
    chip.classList.toggle('active', !!value);
    chip.setAttribute('aria-pressed', value ? 'true' : 'false');
  }
  const key = kind === 'random-stats' ? 'randomStats' : 'randomSkill';
  state.challenge[key][side] = !!value;
}

// 同步题数 chip 视觉 + state
function _syncCountChip(value) {
  const group = document.querySelector('.challenge-setup-chips[data-group="count"]');
  if (group) _setSingleChoice(group, String(value));
  state.challenge.count = value;
}

// 应用预设：写入 state.challenge 并同步所有相关 chip 视觉。
// 注意：state.challenge.preset 由调用方负责更新；本函数不触碰它。
function _applyChallengePreset(presetName) {
  const cfg = CHALLENGE_PRESETS[presetName];
  if (!cfg) return;
  for (const side of ['attacker', 'defender']) {
    _syncPoolChip(side, cfg.pool[side]);
    _syncRandomChip('random-stats', side, cfg.randomStats[side]);
    _syncRandomChip('random-skill', side, cfg.randomSkill[side]);
  }
  _syncCountChip(cfg.count);
}

// 初始化挑战模式：挂事件 + 让初始 chip 状态与 state.challenge 同步。
function initChallengeMode() {
  // —— 切换按钮：3 路分支（running / active / enter）——
  const btn = document.getElementById('challenge-toggle-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      // 快速连点防御（2026-07-18）：
      //   - answerAnimating 守卫：答题结果区还在播 220ms 切换动画时，
      //     忽略 toggle 点击，避免动画进行中切模式状态导致 body class
      //     被反向写入。
      //   - **toggleAnimating 守卫（新增）**：enter/exit 正在播 440ms
      //     过渡动画时忽略 click——避免"enter 220ms sections 淡出 + exit
      //     220ms sections 淡入"在 880ms 内连续播放、视觉上闪两次。
      //     由 enter/exit 末尾 onfinish 释放。
      const c = state.challenge;
      if (c.answerAnimating) return;
      if (c.toggleAnimating) return;
      if (c.running) {
        // 答题阶段：原地退出（不弹 setup 过渡动画）
        exitChallenge();
      } else if (c.active) {
        // 设置阶段：退出设置
        exitChallengeMode();
      } else {
        // 首次进入挑战模式
        enterChallengeMode();
      }
    });
  }

  // 侧栏 pool chip（精灵池单选）
  document.querySelectorAll('.label-chip-group[data-kind="pool"]').forEach(group => {
    const side = group.dataset.side;        // 'attacker' | 'defender'
    const chips = group.querySelectorAll('.label-chip');
    chips.forEach(chip => _attachLabelChipPressEffect(chip));

    // 初始同步：state.challenge.pool[side] 与 chip.active 对齐
    const current = state.challenge.pool[side];
    _setSingleChoice(group, current);

    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.label-chip');
      if (!chip || !group.contains(chip)) return;
      const val = chip.dataset.pool;
      if (!val) return;
      // 单选：点已选中的保持选中；不能空选
      const changed = _setSingleChoice(group, val);
      if (changed) {
        state.challenge.pool[side] = val;
        // 偏离当前预设 → 取消预设选中
        _clearPresetSelection();
      }
    });
  });

  // 侧栏 random-stats / random-skill chip（开关）
  document.querySelectorAll('.label-chip-group[data-kind="random-stats"], .label-chip-group[data-kind="random-skill"]').forEach(group => {
    const side = group.dataset.side;        // 'attacker' | 'defender'
    const kind = group.dataset.kind;        // 'random-stats' | 'random-skill'
    const chip = group.querySelector('.label-chip');
    if (!chip) return;
    _attachLabelChipPressEffect(chip);

    // 初始同步
    const key = kind === 'random-stats' ? 'randomStats' : 'randomSkill';
    chip.classList.toggle('active', state.challenge[key][side]);
    chip.setAttribute('aria-pressed', state.challenge[key][side] ? 'true' : 'false');

    chip.addEventListener('click', () => {
      const newActive = _toggleChip(chip);
      state.challenge[key][side] = newActive;
      // 偏离当前预设 → 取消预设选中
      _clearPresetSelection();
    });
  });

  // 挑战设置区 chip（预设 / 题数，都是单选）
  document.querySelectorAll('.challenge-setup-chips').forEach(group => {
    const groupName = group.dataset.group;  // 'preset' | 'count'
    const chips = group.querySelectorAll('.label-chip');
    chips.forEach(c => _attachLabelChipPressEffect(c));

    // 初始同步
    const initial = groupName === 'preset' ? state.challenge.preset : String(state.challenge.count);
    _setSingleChoice(group, initial);

    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.label-chip');
      if (!chip || !group.contains(chip)) return;
      const val = chip.dataset.value;
      if (val == null) return;
      const changed = _setSingleChoice(group, val);
      if (!changed) return;
      if (groupName === 'preset') {
        state.challenge.preset = val;
        // 应用预设：覆盖其他相关 chip 与 state（用户主动选预设，不取消选中）
        _applyChallengePreset(val);
      } else if (groupName === 'count') {
        const n = parseInt(val, 10);
        if (Number.isFinite(n) && n > 0) {
          state.challenge.count = n;
          // 偏离当前预设 → 取消预设选中
          _clearPresetSelection();
        }
      }
    });
  });

  // —— 「开始挑战」按钮 ——
  const startBtn = document.getElementById('challenge-start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (state.challenge.running) return;   // 已在答题：忽略（防御性）
      startChallenge();
    });
  }

  // —— 「提交答案 / 下一道题 / 查看结果」按钮（按 phase 路由）——
  const submitBtn = document.getElementById('challenge-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const c = state.challenge;
      if (!c.running) return;                // 非答题阶段：忽略
      // 快速连点防御（2026-07-18）：submitAnswer / nextQuestion 自身已经有
      // answerAnimating 守卫，这里再叠一层：动画进行中按钮直接 no-op，
      // 防止 click 事件多次入队导致 setTimeout 链错乱。
      if (c.answerAnimating) return;
      if (c.phase === 'picking') submitAnswer();
      else if (c.phase === 'answered') nextQuestion();
      // 'done' 阶段按钮已 hidden，不触发
    });
  }
}

function init() {
  initStarCanvas();
  generateSealSVG();
  initParticles();
  initSealInteraction();
  updateSealGlow();
  // 信息弹窗：公告 / 使用说明
  initInfoModal();
  // 初始即渲染两侧的内嵌选择器（未选精灵时直接显示）
  renderSpiritArea('attacker');
  renderSpiritArea('defender');
  // 威力 chip 占位（未选攻击方时也常驻显示）
  renderPowerBoostChip();
  renderWaiting();
  // 挑战模式：仅挂事件、初始化 chip 状态，不主动进入
  initChallengeMode();
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadData();
  } catch (e) {
    const info = document.getElementById('result-info');
    if (info) info.innerHTML = '<div class="result-waiting-mini" style="color:#ff3b3b;max-width:260px;line-height:1.5">数据加载失败: ' + (e.message || e) + '<br><br>若用 file:// 打开，请先执行 <code>python build.py</code> 生成 calculator.built.html。</div>';
    return;
  }
  buildSkillIndices();
  init();
});
