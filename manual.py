import requests
import json

# 目标网站的 API 端点
api_url = "https://wiki.biligame.com/rocom/api.php"

# 构造 API 请求参数
params = {
    "action": "query",
    "titles": "文件:JL_guiyankungchong.png",

    "prop": "imageinfo",
    "iiprop": "url",
    #"imlimit": "50",
    #"rvprop": "content",
    #"rvslots": "main",

    "format": "json",
    "formatversion": "2"
}

headers = {
    "User-Agent": "roco-star-dmg/1.0"
}

# 发送 API 请求
response = requests.get(api_url, params=params, headers=headers)
data = response.json()

print(data)
print(json.dumps(data, ensure_ascii=False, indent=2))

# parsed = mwparserfromhell.parse(data['query']['pages'][0]['revisions'][0]['slots']['main']['content'])
# print(parsed)
