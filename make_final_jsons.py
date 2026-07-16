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
    '龙息帕尔',
    '暮星辰',
    '祭礼巨像',
    '离心舞者',
    '圣羽翼王',
    '落陨星兔',
    '粉耳星兔',
    '怖哭菇',
    '噼啪鸟',
    '锤头鹳',
    '翼龙',
    '龙鱼',
    '权杖-V',
    '音速犬',
    '月牙雪熊',
]
COMMON_DEFENDERS: list[str] = [
    '贝古斯',
    '尖嘴狐仙',
    '帕帕斯卡',
    '音速犬',
    '火焰猿',
    '食尘短绒',
    '利灯鱼',
    '燃薪虫',
    '荆棘电环',
    '窃光蚊',
    '春花兔',
    '爆焰喷喷',
    '噼啪鸟',
    '暮星辰',
    '泥吼牙',
    '飞飞钥',
    '女王蜂',
    '机幕方舟',
    '音碟吼',
    '冰钻布鲁斯',
    '嘟嘟锅',
    '恶魔狼王',
    '巨鼓象',
    '迷迷箱怪',
    '绒光优优',
    '兽花蕾',
    '离心舞者',
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
    # 没有图鉴，说明是未上线精灵
    if not pet_info.get('hb'):
        continue
    if not pet_info.get('st'):
        no_stats.append(pet_id)
        continue
    skills = []
    learnset = learnset_catalog[learnsets[pet_id]]
    if fs := learnset.get('fs'):
        skills.append(f'sk_{skill_catalog[fs]['id']}')
    if ns := learnset.get('ns'):
        skills.extend(f'sk_{skill_catalog[s['sk']]['id']}' for s in ns)
    if lg := learnset.get('lg'):
        skills.append(f'sk_{skill_catalog[lg['sk']]['id']}')
    if ss := learnset.get('ss'):
        skills.extend(f'sk_{skill_catalog[s]['id']}' for s in ss)
    if bs := learnset.get('bs'):
        skills.extend(f'sk_{skill_catalog[s['sk']]['id']}' for s in bs)
    if not skills:
        no_skills.append(pet_id)
        continue
    name = pet_info['t']
    if name == '落陨星兔（信使精灵）':
        name = '落陨星兔'
        print(f'出现"落陨星兔（信使精灵）"，重命名为"{name}"')
    elif name == '落陨星兔':
        print(f'出现"落陨星兔"，可能不再需要重命名代码')
    pinyin_full, pinyin_initials = make_search_keys(name)
    sprites[name] = {
        # 用于排序，随后删除
        'hb': pet_info['hb'],

        'id': pet_id,
        'name': name, # str: 精灵的名字。
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
        'hbid': int(pet_info['hb']['i'][9:]),
    }
    if il_url := pet_illustration_urls.get(pet_id):
        sprites[name]['illustration_url'] = il_url # Optional[str]: 精灵的图片url。
print('no_stats:', no_stats)
print('no_skills:', no_skills)
# 排除剩下的一些精灵
del sprites['幽影树（突变的样子）']
# 按图鉴id排序
def hb_id(item: tuple[str, dict]) -> int:
    sprite = item[1]
    result = sprite['hbid']*10
    # 目前用这种方法判断是否为首领是有效的
    if sprite['hb']['hen'] == False and sprite['hb']['stp'] == False:
        result += 1
    return result
sprites = dict(sorted(sprites.items(), key=hb_id))
# 删除hb
for s in sprites:
    del sprites[s]['hb']
sprites['拼图'] = {
    'id': 'pet_789987',
    'name': '拼图',
    'types': ['幻系'],
    'hp': 290,
    'atk': 200,
    'matk': 192,
    'def': 183,
    'mdef': 183,
    'spd': 145,
    'skills': ['sk_7150080', 'sk_7150110', 'sk_7020970', 'sk_7190260', 'sk_7190440', 'sk_7190240'],
    'pinyin': 'pintu',
    'pinyin_initials': 'pt',
    'hbid': 789987,
}

for skill_id, skill_info in skill_catalog.items():
    skill_info.pop('icon_id', None)
    skill_info['id'] = f'sk_{skill_info['id']}'
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
# 技能id作为key
skill_catalog = {skill_info['id']: skill_info for skill_info in skill_catalog.values()}


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
