import json
import re

with open('datas/core.json', 'r', encoding='utf-8') as f:
    core = json.load(f)
with open('datas/learnsets.json', 'r', encoding='utf-8') as f:
    learnsets = json.load(f)
with open('datas/learnset_catalog.json', 'r', encoding='utf-8') as f:
    learnset_catalog = json.load(f)
with open('datas/skill_catalog.json', 'r', encoding='utf-8') as f:
    skill_catalog = json.load(f)
with open('datas/pet_illustration_urls.json', 'r', encoding='utf-8') as f:
    pet_illustration_urls = json.load(f)
with open('datas/skill_icon_urls.json', 'r', encoding='utf-8') as f:
    skill_icon_urls = json.load(f)


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
    if ss := learnset.get('ss'):
        skills.extend(ss)
    if bs := learnset.get('bs'):
        skills.extend(s['sk'] for s in bs)
    if not skills:
        no_skills.append(pet_id)
        continue
    sprites[pet_id] = {
        'name': pet_info['t'], # str: 精灵的名字。
        'types': pet_info['tp'], # list[str]: 精灵所属系别，如“水系”（任何系别都会带一个“系”字），部分精灵有两个系别。
        'hp': pet_info['st']['hp'], # int: 精灵的生命值。
        'atk': pet_info['st']['at'], # int: 精灵的物攻。
        'matk': pet_info['st']['sa'], # int: 精灵的魔攻。
        'def': pet_info['st']['df'], # int: 精灵的物防。
        'mdef': pet_info['st']['sd'], # int: 精灵的魔防。
        'spd': pet_info['st']['se'], # int: 精灵的速度。
        'skills': skills, # list[str]: 精灵的所有技能的id。
    }
    if il_url := pet_illustration_urls.get(pet_id):
        sprites[pet_id]['illustration_url'] = il_url # Optional[str]: 精灵的图片url。
print('no_stats:', no_stats)
print('no_skills:', no_skills)

for skill_id, skill_info in skill_catalog.items():
    skill_info.pop('icon_id', None)
    skill_info.pop('id', None)
    if skill_info['category'] == '防御':
        if skill_info['desc'].startswith('减伤'):
            skill_info['reduction'] = 1 - int(skill_info['desc'][2:4]) / 100
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


with open('sprites.json', 'w', encoding='utf-8') as f:
    json.dump(sprites, f, ensure_ascii=False)
with open('skills.json', 'w', encoding='utf-8') as f:
    json.dump(skill_catalog, f, ensure_ascii=False)
