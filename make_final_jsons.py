import json
import re

from pypinyin import Style, lazy_pinyin

with open('datas/intermediate/core.json', 'r', encoding='utf-8') as f:
    core = json.load(f)
with open('datas/intermediate/learnsets.json', 'r', encoding='utf-8') as f:
    learnsets = json.load(f)
with open('datas/intermediate/learnset_catalog.json', 'r', encoding='utf-8') as f:
    learnset_catalog = json.load(f)
with open('datas/intermediate/skill_catalog.json', 'r', encoding='utf-8') as f:
    skill_catalog = json.load(f)
with open('datas/intermediate/pet_illustration_urls.json', 'r', encoding='utf-8') as f:
    pet_illustration_urls = json.load(f)
with open('datas/intermediate/skill_icon_urls.json', 'r', encoding='utf-8') as f:
    skill_icon_urls = json.load(f)


# ============================================================
# Picker presets — hard-coded lists of "common" sprites shown in
# the spirit picker's quick-filter chip. These are placeholders;
# please edit them to taste.  Both sides may include the same
# sprite; duplicates are harmless (the Set check is per-id).
# ============================================================
COMMON_ATTACKERS: list[str] = [
    'pet_000175', # 龙息帕尔
    'pet_000317', # 暮星辰
    'pet_000629', # 祭礼巨像
    'pet_000338', # 圣羽翼王
    'pet_000413', # 落陨星兔
    'pet_000287', # 粉耳星兔
    'pet_000224', # 怖哭菇
    'pet_000372', # 噼啪鸟
    'pet_000068', # 锤头鹳
    'pet_000203', # 翼龙
    'pet_000070', # 音速犬
]
COMMON_DEFENDERS: list[str] = [
    'pet_000198', # 贝古斯
    'pet_000076', # 尖嘴狐仙
    'pet_000468', # 帕帕斯卡
    'pet_000070', # 音速犬
    'pet_000084', # 火焰猿
    'pet_000520', # 食尘短绒
    'pet_000329', # 利灯鱼
    'pet_000365', # 燃薪虫
    'pet_000190', # 荆棘电环
    'pet_000530', # 窃光蚊
    'pet_000318', # 春花兔
    'pet_000494', # 爆焰喷喷
    'pet_000372', # 噼啪鸟
    'pet_000317', # 暮星辰
    'pet_000419', # 泥吼牙
    'pet_000635', # 女王蜂
    'pet_000314', # 嘟嘟锅
    'pet_000636', # 恶魔狼王
    'pet_000553', # 巨鼓象
]


def _is_cjk(ch: str) -> bool:
    """Return True if `ch` is a CJK ideograph (basic range)."""
    if not ch:
        return False
    code = ord(ch)
    return (
        0x4E00 <= code <= 0x9FFF        # CJK Unified Ideographs
        or 0x3400 <= code <= 0x4DBF    # CJK Ext A
        or 0x20000 <= code <= 0x2A6DF  # CJK Ext B
    )


def make_search_keys(name: str) -> tuple[str, str]:
    """Return (pinyin_full, pinyin_initials) for a sprite name.

    Both strings are lower-cased, non-CJK characters (latin letters,
    digits, punctuation) are passed through as-is so the runtime
    `includes` check works uniformly for any input the user types.

    pypinyin handles multi-character words: e.g. "皮卡丘" → "pikaqiu"
    and "武斗酷猫" → "wudoukumao".
    """
    full = ''.join(lazy_pinyin(name)).lower()
    initials = ''.join(
        lazy_pinyin(name, style=Style.FIRST_LETTER, errors=lambda x: list(x))
    ).lower()
    return full, initials


sprites = {}
no_skills = []
no_stats = []
for pet_id, pet_info in core.items():
    if not pet_info.get('st'):
        no_stats.append(pet_id)
        continue
    skills = []
    learnset = learnset_catalog[learnsets[pet_id]]
    if fs := learnset.get('fs'):
        skills.append(fs)
    if ns := learnset.get('ns'):
        skills.extend(s['sk'] for s in ns)
    if lg := learnset.get('lg'):
        skills.append(lg['sk'])
    if ss := learnset.get('ss'):
        skills.extend(ss)
    if bs := learnset.get('bs'):
        skills.extend(s['sk'] for s in bs)
    if not skills:
        no_skills.append(pet_id)
        continue
    pinyin_full, pinyin_initials = make_search_keys(pet_info['t'])
    sprites[pet_id] = {
        'id': pet_id,
        'name': pet_info['t'], # str: 精灵的名字。
        'types': pet_info['tp'], # list[str]: 精灵所属系别，如“水系”（任何系别都会带一个“系”字），部分精灵有两个系别。
        'hp': pet_info['st']['hp'], # int: 精灵的生命值。
        'atk': pet_info['st']['at'], # int: 精灵的物攻。
        'matk': pet_info['st']['sa'], # int: 精灵的魔攻。
        'def': pet_info['st']['df'], # int: 精灵的物防。
        'mdef': pet_info['st']['sd'], # int: 精灵的魔防。
        'spd': pet_info['st']['se'], # int: 精灵的速度。
        'skills': skills, # list[str]: 精灵的所有技能的id。
        # Pre-computed search keys (used by the spirit-picker search box).
        # Both are lower-cased so the JS side can do a case-insensitive
        # `includes` check directly. Non-CJK characters (e.g. latin
        # letters, digits) are kept verbatim in both fields.
        'pinyin': pinyin_full,
        'pinyin_initials': pinyin_initials,
    }
    if il_url := pet_illustration_urls.get(pet_id):
        sprites[pet_id]['illustration_url'] = il_url # Optional[str]: 精灵的图片url。
print('no_stats:', no_stats)
print('no_skills:', no_skills)

for skill_id, skill_info in skill_catalog.items():
    skill_info.pop('icon_id', None)
    skill_info['id'] = skill_id
    if skill_info['category'] == '防御':
        if skill_info['desc'].startswith('减伤'):
            match = re.search(r'(\d+)%', skill_info['desc'])
            if match:
                skill_info['reduction'] = 1 - int(match.group(1)) / 100
            else:
                skill_info['reduction'] = 0
                print('no reduction:', skill_info['name'])
        else:
            skill_info['reduction'] = 0
            print('no reduction:', skill_info['name'])
    elif skill_info['category'] == '攻击':
        if '连击' in skill_info['desc']:
            match = re.search(r'(\d+)连击', skill_info['desc'])
            if match:
                skill_info['combo'] = int(match.group(1))
            else:
                print('no combo:', skill_info['name'])
    if icon_url := skill_icon_urls.get(skill_id):
        skill_info['icon_url'] = icon_url # Optional[str]: 技能的图标url。


with open('datas/final/sprites.json', 'w', encoding='utf-8') as f:
    json.dump(sprites, f, ensure_ascii=False)
with open('datas/final/skills.json', 'w', encoding='utf-8') as f:
    json.dump(skill_catalog, f, ensure_ascii=False)


# ============================================================
# Others — exported as a small JSON consumed by calculator.html.
# Currently just the two "common" sprite lists;
# future per-side presets (e.g. starter recommendations)
# can be added here without touching the (much larger) sprites.json.
# ============================================================
others = {
    'common_attackers': COMMON_ATTACKERS,
    'common_defenders': COMMON_DEFENDERS,
}
with open('datas/final/others.json', 'w', encoding='utf-8') as f:
    json.dump(others, f, ensure_ascii=False, indent=2)
