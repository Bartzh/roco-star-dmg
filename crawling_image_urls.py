import requests
import json
import time
import random

# 目标网站的 API 端点
api_url = "https://wiki.biligame.com/rocom/api.php"
headers = {
    "User-Agent": "roco-star-dmg/1.0"
}

def reversed_dict(d: dict) -> dict:
    reversed_d = {}
    for k, v in d.items():
        reversed_d.setdefault(v, []).append(k)
    return reversed_d
def get_image_urls(owners_and_titles: dict[str, str]) -> dict[str, str]:
    reversed_d = reversed_dict(owners_and_titles)
    step = 50
    current = 0
    urls = {}
    duplicates = []
    missing = []
    titles = list(reversed_d.keys())
    while current < len(titles):
        params = {
            "action": "query",
            "titles": '|'.join(titles[current:current+step]),

            "prop": "imageinfo",
            "iiprop": "url",

            "format": "json",
            "formatversion": "2"
        }
        response = requests.get(api_url, params=params, headers=headers)
        data = response.json()
        if 'continue' in data:
            raise Exception("API 返回了继续参数，需要分页处理")
        if 'warnings' in data:
            print(data['warnings'])
        for page in data['query']['pages']:
            title = page['title'].replace(' ', '_')
            if page.get('missing') or not page.get('imageinfo'):
                missing.append(title)
                continue
            owners = reversed_d[title]
            for owner in owners:
                if owner in urls:
                    duplicates.append(owner)
                    continue
                urls[owner] = page['imageinfo'][0]['url']
        current += step
        time.sleep(random.uniform(2, 4))
    print(f"成功获取 {len(urls)} 个图片 URL")
    print(f"重复的图片owner：{duplicates}")
    print(f"缺失的图片title：{missing}")
    return urls



with open('datas/intermediate/core.json', 'r', encoding='utf-8') as f:
    core = json.load(f)
illustration_urls = get_image_urls(
    {p_id: f'文件:{p_info['img']['il']}.png' for p_id, p_info in core.items() if p_id != '_meta' and p_info.get('img')}
)
with open('datas/intermediate/pet_illustration_urls.json', 'w', encoding='utf-8') as f:
    json.dump(illustration_urls, f, indent=4, ensure_ascii=False)


with open('datas/intermediate/skill_catalog.json', 'r', encoding='utf-8') as f:
    skill_catalog = json.load(f)
skill_urls = get_image_urls({s_id: f'文件:Skill_{s_info['icon_id']}.png' for s_id, s_info in skill_catalog.items() if s_id != '_meta'})
with open('datas/intermediate/skill_icon_urls.json', 'w', encoding='utf-8') as f:
    json.dump(skill_urls, f, indent=4, ensure_ascii=False)


with open('datas/final/types.json', 'r', encoding='utf-8') as f:
    types = json.load(f)
element_icon_urls = get_image_urls({e_id: f'文件:图标_宠物_属性_{e_id}.png' for e_id in types.keys()})
for e_id, icon_url in element_icon_urls.items():
    types[e_id]['iconUrl'] = icon_url
with open('datas/final/types.json', 'w', encoding='utf-8') as f:
    json.dump(types, f, indent=4, ensure_ascii=False)
