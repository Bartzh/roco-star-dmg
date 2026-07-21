import json
import re

from pypinyin import Style, lazy_pinyin
from dataclasses import dataclass, field, asdict
from typing import Literal, Optional

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
# Build source-id → final-name mapping for skills, handling
# duplicate names by appending a numeric suffix to disambiguate.
# Skills with the same `name` are very rare but do exist; for
# each duplicate group we sort by the source int id and let the
# smallest keep the base name, while the rest get `name2`,
# `name3`, …  The resulting name is what shows up as the key
# in skills.json, as the value of `id` inside each skill, and
# as the entries in sprites.json's `skills` field.
# ============================================================
from collections import defaultdict
_name_to_source_ids: dict[str, list[str]] = defaultdict(list)
for _source_id, _info in skill_catalog.items():
    _name_to_source_ids[_info['name']].append(_source_id)
id_to_final_name: dict[str, str] = {}
for _base_name, _source_ids in _name_to_source_ids.items():
    if len(_source_ids) == 1:
        id_to_final_name[_source_ids[0]] = _base_name
    else:
        # 用技能数据里真正的 int id 排序，catalog 的 key 是 `skill_xxxxxx` 字符串。
        _sorted = sorted(_source_ids, key=lambda x: int(skill_catalog[x]['id']))
        for _i, _sid in enumerate(_sorted):
            id_to_final_name[_sid] = _base_name if _i == 0 else f'{_base_name}{_i + 1}'
        print(
            f'重名技能 "{_base_name}"：共 {len(_sorted)} 个，已加后缀区分：'
            + ', '.join(f'{skill_catalog[_sid]['id']}→{id_to_final_name[_sid]}' for _sid in _sorted)
        )


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
        skills.append(id_to_final_name[fs])
    if ns := learnset.get('ns'):
        skills.extend(id_to_final_name[s['sk']] for s in ns)
    if lg := learnset.get('lg'):
        skills.append(id_to_final_name[lg['sk']])
    if ss := learnset.get('ss'):
        skills.extend(id_to_final_name[s] for s in ss)
    if bs := learnset.get('bs'):
        skills.extend(id_to_final_name[s['sk']] for s in bs)
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

        'id': name,
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
    'skills': ['翼击', '龙卷风', '先发制人', '多维击打', '天体吸积'],
    'pinyin': 'pintu',
    'pinyin_initials': 'pt',
    'hbid': 789987,
}

for skill_id, skill_info in skill_catalog.items():
    skill_info.pop('icon_id', None)
    # 技能的 key 与 id 都用最终名（重名时已加数字后缀），更便于使用。
    skill_info['id'] = id_to_final_name[skill_id]
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
# 以技能最终名作为 key（重名时已加数字后缀以保证唯一）
skill_catalog = {skill_info['id']: skill_info for skill_info in skill_catalog.values()}


with open('datas/final/sprites.json', 'w', encoding='utf-8') as f:
    json.dump(sprites, f, ensure_ascii=False)
with open('datas/final/skills.json', 'w', encoding='utf-8') as f:
    json.dump(skill_catalog, f, ensure_ascii=False)



@dataclass
class Nature:
    up: Literal['hp', 'atk', 'def', 'matk', 'mdef', 'spd']
    down: Literal['hp', 'atk', 'def', 'matk', 'mdef', 'spd']

@dataclass
class StatsCombo:
    nature: Nature
    ivs: list[Literal['hp', 'atk', 'def', 'matk', 'mdef', 'spd']]

@dataclass
class WeightedStatsCombo:
    combo: StatsCombo
    weight: float

@dataclass
class StatsPool:
    default_weight: float
    combos: list[WeightedStatsCombo]

@dataclass
class WeightedBuffCombo:
    combo: list[dict[str, int]]  # 例如 [{'atk': 100}]
    weight: float

@dataclass
class BuffsPool:
    default_weight: float
    combos: list[WeightedBuffCombo]

@dataclass
class WeightedSkillCombo:
    combo: str  # 技能名（重名时带数字后缀），例如 '先发制人' / '腾挪2'
    weight: float

@dataclass
class SkillsPool:
    default_weight: float
    combos: list[WeightedSkillCombo]

@dataclass
class RandomPool:
    stats: Optional[StatsPool] = None
    buffs: Optional[BuffsPool] = None
    skills: Optional[SkillsPool] = None


attacker_random_pools: dict[str, RandomPool] = {
    '龙息帕尔': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['hp', 'atk', 'def']
                    ),
                    weight=10
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'atk', 'def']
                    ),
                    weight=3
                )
            ]
        ),
        buffs=BuffsPool(
            default_weight=70,
            combos=[
                WeightedBuffCombo(
                    combo=[{'atk': 100}],
                    weight=30
                )
            ]
        ),
        skills=SkillsPool(
            default_weight=70,
            combos=[
                WeightedSkillCombo(
                    combo='先发制人',
                    weight=30
                )
            ]
        )
    ),
    '暮星辰': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=9
                )
            ]
        ),
        skills=SkillsPool(
            default_weight=10,
            combos=[
                WeightedSkillCombo(
                    combo='翼击',
                    weight=65
                ),
                WeightedSkillCombo(
                    combo='追打',
                    weight=10
                ),
                WeightedSkillCombo(
                    combo='倾泻',
                    weight=10
                ),
                WeightedSkillCombo(
                    combo='先发制人',
                    weight=5
                )
            ]
        )
    ),
    '落陨星兔': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=9
                )
            ]
        ),
        buffs=BuffsPool(
            default_weight=40,
            combos=[
                WeightedBuffCombo(
                    combo=[{'power': 40}],
                    weight=60
                ),
                WeightedBuffCombo(
                    combo=[{'power': 80}],
                    weight=10
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=1,
            combos=[
                WeightedSkillCombo(
                    combo='多维击打',
                    weight=9
                ),
                WeightedSkillCombo(
                    combo='灵光',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='流火',
                    weight=1
                ),
            ]
        )
    ),
    '粉耳星兔': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=9
                )
            ]
        ),
        buffs=BuffsPool(
            default_weight=1,
            combos=[
                WeightedBuffCombo(
                    combo=[{'power': 20}],
                    weight=7
                ),
                WeightedBuffCombo(
                    combo=[{'power': 40}],
                    weight=3
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=1,
            combos=[
                WeightedSkillCombo(
                    combo='多维击打',
                    weight=8
                ),
                WeightedSkillCombo(
                    combo='流火',
                    weight=1
                ),
            ]
        )
    ),
    '音速犬': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=6
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=4
                ),
            ]
        ),
        buffs=BuffsPool(
            default_weight=3,
            combos=[
                WeightedBuffCombo(
                    combo=[{'atk': 100}],
                    weight=7
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=1,
            combos=[
                WeightedSkillCombo(
                    combo='灼伤',
                    weight=5
                ),
                WeightedSkillCombo(
                    combo='火云车',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='跌落',
                    weight=4
                ),
                WeightedSkillCombo(
                    combo='闪燃',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='__yuanli_冰__',
                    weight=0.75
                ),
            ]
        )
    ),
    '锤头鹳': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=7
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='matk', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=7
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'atk', 'mdef']
                    ),
                    weight=2
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='atk'),
                        ivs=['hp', 'matk', 'mdef']
                    ),
                    weight=2
                )
            ]
        ),
        skills=SkillsPool(
            default_weight=1,
            combos=[
                WeightedSkillCombo(
                    combo='潮涌',
                    weight=6
                ),
                WeightedSkillCombo(
                    combo='水弹枪',
                    weight=6
                ),
                WeightedSkillCombo(
                    combo='风矢',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='撕咬',
                    weight=1
                ),
            ]
        )
    ),
    '祭礼巨像': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=1,
            combos=[
                WeightedSkillCombo(
                    combo='多维击打',
                    weight=5
                ),
                WeightedSkillCombo(
                    combo='四维降解',
                    weight=5
                ),
                WeightedSkillCombo(
                    combo='天体吸积',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='热砂',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='陨石',
                    weight=3
                ),
            ]
        )
    ),
    '怖哭菇': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='atk'),
                        ivs=['hp', 'def', 'mdef']
                    ),
                    weight=7
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='spd'),
                        ivs=['hp', 'atk', 'def']
                    ),
                    weight=3
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='spd'),
                        ivs=['hp', 'matk', 'def']
                    ),
                    weight=1
                ),
            ]
        ),
        buffs=BuffsPool(
            default_weight=20,
            combos=[
                # 防反
                WeightedBuffCombo(
                    combo=[{'atk': 70, 'matk': 70}],
                    weight=1
                ),
                # 翠顶
                WeightedBuffCombo(
                    combo=[{'atk': 100}],
                    weight=3
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=1,
            combos=[
                WeightedSkillCombo(
                    combo='先发制人',
                    weight=10
                ),
                WeightedSkillCombo(
                    combo='多维击打',
                    weight=0.75
                ),
                WeightedSkillCombo(
                    combo='__yuanli_地__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='__yuanli_幽__',
                    weight=3
                ),
            ]
        ),
    ),
    '圣羽翼王': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=9
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=2
                ),
            ]
        ),
        buffs=BuffsPool(
            default_weight=20,
            combos=[
                # 力增
                WeightedBuffCombo(
                    combo=[{'atk': 100}],
                    weight=5
                ),
                # 力增2次
                WeightedBuffCombo(
                    combo=[{'atk': 200}],
                    weight=2
                ),
                # 伺机而动
                WeightedBuffCombo(
                    combo=[{'power': 70}],
                    weight=4
                ),
                WeightedBuffCombo(
                    combo=[{'matk': 70}],
                    weight=1
                ),
                WeightedBuffCombo(
                    combo=[{'power': 70, 'matk': 70}],
                    weight=2
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=1,
            combos=[
                WeightedSkillCombo(
                    combo='水刃',
                    weight=8
                ),
                WeightedSkillCombo(
                    combo='闪击',
                    weight=2
                ),
                WeightedSkillCombo(
                    combo='水花四溅',
                    weight=4
                ),
                WeightedSkillCombo(
                    combo='扇风',
                    weight=2
                ),
                WeightedSkillCombo(
                    combo='离子震荡',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='__yuanli_冰__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='__yuanli_武__',
                    weight=3
                ),
            ]
        ),
    ),
    '翼龙': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=1,
            combos=[
                WeightedSkillCombo(
                    combo='龙爪',
                    weight=8
                ),
            ]
        ),
    ),
    '噼啪鸟': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=8
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=3
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=1,
            combos=[
                WeightedSkillCombo(
                    combo='翼击',
                    weight=9
                ),
                WeightedSkillCombo(
                    combo='龙卷风',
                    weight=2
                ),
            ]
        ),
    ),
    '龙鱼': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=7
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=1,
            combos=[
                WeightedSkillCombo(
                    combo='翼击',
                    weight=6
                ),
            ]
        ),
    ),
    '离心舞者': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=9
                ),
            ]
        ),
        buffs=BuffsPool(
            default_weight=0,
            combos=[
                WeightedBuffCombo(
                    combo=[{'matk': 50, 'power': 20}],
                    weight=10
                ),
                WeightedBuffCombo(
                    combo=[{'matk': 50, 'power': 40}],
                    weight=2
                ),
                WeightedBuffCombo(
                    combo=[{'matk': 100, 'power': 20}],
                    weight=1
                ),
                WeightedBuffCombo(
                    combo=[{'matk': 100, 'power': 40}],
                    weight=0.5
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=1,
            combos=[
                WeightedSkillCombo(
                    combo='多维击打',
                    weight=8
                ),
                WeightedSkillCombo(
                    combo='离子震荡',
                    weight=1
                ),
            ]
        ),
    ),
}
attacker_random_pools = {k: asdict(v) for k, v in attacker_random_pools.items()}


defender_random_pools: dict[str, RandomPool] = {
    '音速犬': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=9
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=4
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='matk'),
                        ivs=['def', 'atk', 'spd']
                    ),
                    weight=2
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['def', 'atk', 'spd']
                    ),
                    weight=1
                )
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=1
                ),
            ]
        )
    ),
    '嘟嘟锅': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='atk'),
                        ivs=['hp', 'def', 'mdef']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=2
                ),
            ]
        )
    ),
    '兽花蕾': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='atk'),
                        ivs=['hp', 'def', 'mdef']
                    ),
                    weight=9
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=1
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=1
                ),
            ]
        )
    ),
    '恶魔狼王': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=1,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=9
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=3
                ),
            ]
        )
    ),
    '尖嘴狐仙': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='atk'),
                        ivs=['hp', 'def', 'mdef']
                    ),
                    weight=11
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=4
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=4
                ),
                WeightedSkillCombo(
                    combo='火焰护盾',
                    weight=3
                ),
            ]
        )
    ),
    '荆棘电环': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=7
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=2
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=1
                ),
            ]
        )
    ),
    '迷迷箱怪': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'atk', 'def']
                    ),
                    weight=8
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['hp', 'atk', 'def']
                    ),
                    weight=4
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=2
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=2
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=4
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=0.5
                ),
                WeightedSkillCombo(
                    combo='风墙',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='能量守恒',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='吓退',
                    weight=2
                ),
            ]
        )
    ),
    '火焰猿': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'atk', 'def']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=1
                ),
            ]
        )
    ),
    '冰钻布鲁斯': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=8
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['hp', 'atk', 'def']
                    ),
                    weight=6
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=5
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='有效预防',
                    weight=3
                ),
            ]
        )
    ),
    '帕帕斯卡': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=6
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=1
                ),
            ]
        )
    ),
    '绒光优优': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=5
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='硬化',
                    weight=3
                ),
            ]
        )
    ),
    '噼啪鸟': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=9
                ),
            ]
        ),
    ),
    '泥吼牙': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'atk', 'def']
                    ),
                    weight=9
                ),
            ]
        ),
        buffs=BuffsPool(
            default_weight=8,
            combos=[
                WeightedBuffCombo(
                    combo=[{'def': 60}],
                    weight=2
                ),
                WeightedBuffCombo(
                    combo=[{'def': 120}],
                    weight=1
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=2
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=1
                ),
            ]
        )
    ),
    '食尘短绒': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'def', 'mdef']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=8
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=2
                ),
                WeightedSkillCombo(
                    combo='风墙',
                    weight=4
                ),
                WeightedSkillCombo(
                    combo='壁垒',
                    weight=1
                ),
            ]
        )
    ),
    '利灯鱼': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=8
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='matk', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=5
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=1
                ),
            ]
        )
    ),
    '窃光蚊': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'atk', 'def']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=1
                ),
            ]
        )
    ),
    '燃薪虫': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'def', 'mdef']
                    ),
                    weight=9
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'atk', 'mdef']
                    ),
                    weight=2
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='火焰护盾',
                    weight=2
                ),
            ]
        )
    ),
    '贝古斯': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=7
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='atk'),
                        ivs=['hp', 'def', 'mdef']
                    ),
                    weight=5
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='能量守恒',
                    weight=2
                ),
            ]
        )
    ),
    '春花兔': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='atk'),
                        ivs=['hp', 'def', 'mdef']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='酶浓度调整',
                    weight=1
                ),
            ]
        ),
    ),
    '暮星辰': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=1
                ),
            ]
        ),
    ),
    '机幕方舟': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'def', 'mdef']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=4
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='能量守恒',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='有效预防',
                    weight=3
                ),
            ]
        ),
    ),
    '爆焰喷喷': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'atk', 'def']
                    ),
                    weight=7
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='atk', down='matk'),
                        ivs=['hp', 'atk', 'def']
                    ),
                    weight=5
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='淬火',
                    weight=1
                ),
            ]
        ),
    ),
    '音碟吼': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='matk', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=8
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='atk'),
                        ivs=['hp', 'matk', 'mdef']
                    ),
                    weight=3
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=15
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=7
                ),
                WeightedSkillCombo(
                    combo='能量守恒',
                    weight=1
                ),
            ]
        ),
    ),
    '女王蜂': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='matk'),
                        ivs=['hp', 'atk', 'spd']
                    ),
                    weight=9
                ),
            ]
        ),
        buffs=BuffsPool(
            default_weight=0,
            combos=[
                WeightedBuffCombo(
                    combo=[{'def': 75, 'mdef': 75, 'spd': 75}],
                    weight=10
                ),
                WeightedBuffCombo(
                    combo=[{'def': 60, 'mdef': 60, 'spd': 60}],
                    weight=1
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=5
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='有效预防',
                    weight=1
                ),
            ]
        ),
    ),
    '巨鼓象': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'def', 'mdef']
                    ),
                    weight=7
                ),
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='matk'),
                        ivs=['hp', 'atk', 'def']
                    ),
                    weight=4
                ),
            ]
        ),
        buffs=BuffsPool(
            default_weight=3,
            combos=[
                WeightedBuffCombo(
                    combo=[{'def': 20}],
                    weight=5
                ),
                WeightedBuffCombo(
                    combo=[{'def': 40}],
                    weight=3
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=2
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=2
                ),
                WeightedSkillCombo(
                    combo='相位移动',
                    weight=1
                ),
                WeightedSkillCombo(
                    combo='能量守恒',
                    weight=1
                ),
            ]
        ),
    ),
    '飞飞钥': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='hp', down='atk'),
                        ivs=['hp', 'def', 'mdef']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=3
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=2
                ),
                WeightedSkillCombo(
                    combo='能量守恒',
                    weight=1
                ),
            ]
        ),
    ),
    '离心舞者': RandomPool(
        stats=StatsPool(
            default_weight=1,
            combos=[
                WeightedStatsCombo(
                    combo=StatsCombo(
                        nature=Nature(up='spd', down='atk'),
                        ivs=['hp', 'matk', 'spd']
                    ),
                    weight=9
                ),
            ]
        ),
        skills=SkillsPool(
            default_weight=0,
            combos=[
                WeightedSkillCombo(
                    combo='__none__',
                    weight=10
                ),
                WeightedSkillCombo(
                    combo='__state__',
                    weight=5
                ),
                WeightedSkillCombo(
                    combo='能量守恒',
                    weight=1
                ),
            ]
        ),
    )
}
defender_random_pools = {k: asdict(v) for k, v in defender_random_pools.items()}



# ============================================================
# Others — exported as a small JSON consumed by calculator.html.
# Currently just the two "common" sprite lists;
# future per-side presets (e.g. starter recommendations)
# can be added here without touching the (much larger) sprites.json.
# ============================================================
others = {
    'common_attackers': COMMON_ATTACKERS,
    'common_defenders': COMMON_DEFENDERS,
    'attacker_random_pools': attacker_random_pools,
    'defender_random_pools': defender_random_pools,
}
with open('datas/final/others.json', 'w', encoding='utf-8') as f:
    json.dump(others, f, ensure_ascii=False)
