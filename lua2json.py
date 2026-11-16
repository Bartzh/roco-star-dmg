import lupa
import json

FILES = [
    'core',
    'learnset_catalog',
    'skill_catalog',
    'rocopedia_links',
]

SRC_DIR = 'datas/src'
S5_DIR = 'datas/src/s5'
OUT_DIR = 'datas/intermediate'

# 1. 初始化 Lua 运行时
lua = lupa.LuaRuntime(unpack_returned_tuples=True)

with open('helper.lua', 'r', encoding='utf-8') as f:
    helper_code = f.read()
    lua.execute(helper_code)
    is_lua_array = lua.globals().is_lua_array

# 4. 递归将 Lua Table 转换为纯 Python 字典/列表
def lua_to_py(obj):
    t = lupa.lua_type(obj)
    if t == 'table':
        if is_lua_array(obj):
            n = len(obj)  # lupa 支持 len() 取数组长度
            return [lua_to_py(obj[i]) for i in range(1, n + 1)]
        else:
            return { (int(k) if isinstance(k, float) and k.is_integer() else k): lua_to_py(v)
                     for k, v in obj.items() }
    # None说明值已是python类型
    elif t is None:
        return obj
    # 以下代码似乎并不需要，因为lupa已经返回python类型了
    elif t in ('number', 'string', 'boolean'):
        return obj
    elif t == 'nil':
        return None
    return str(obj)


def decode_s5(name):
    """解码新版图鉴的 dragon-tuples-1 压缩数据。

    结构：{"dragon-tuples-1", 字符串池, 数据体}
    数据体节点：{1, {{字段索引, 值}, ...}} 表示对象，{2, {值, ...}} 表示数组。
    字符串池里同时存字段名和对象 key（精灵 id、技能 id、图鉴编号等）。
    """
    with open(f'{S5_DIR}/{name}.lua', 'r', encoding='utf-8') as f:
        packed = lua.eval(f.read())

    assert packed[1] == 'dragon-tuples-1', f'{name}: 不支持的编码 {packed[1]}'
    fields = [None] + list(packed[2].values())  # Lua 数组从 1 开始

    def decode(node):
        if lupa.lua_type(node) != 'table':
            return node
        tag = node[1]
        if tag == 1:
            result = {}
            for entry in node[2].values():
                key = fields[entry[1]]
                assert isinstance(key, str), f'{name}: 无效的字段索引 {entry[1]}'
                result[key] = decode(entry[2])
            return result
        if tag == 2:
            return [decode(value) for value in node[2].values()]
        raise ValueError(f'{name}: 未知的节点类型 {tag}')

    return decode(packed[3])


# 遍历所有文件，转换并导出为 JSON
data = {}
for name in FILES:
    src_path = f'{SRC_DIR}/{name}.lua'

    # 加载 Lua 表数据
    with open(src_path, 'r', encoding='utf-8') as f:
        lua_code = f.read()

    # 执行 Lua 代码，获取 Lua Table 对象
    lua_table = lua.eval(lua_code)
    data[name] = lua_to_py(lua_table)

# 将 S5 增量合并进旧表，对应 模块:精灵图鉴/S5 的 extend 逻辑
s5_skills = {}
for name in ['jinies', 'skills', 'traits', 'others']:
    new_data = decode_s5(name)
    if name == 'others':
        data['learnset_catalog'].update(new_data['Learnsets'])
    elif name == 'jinies':
        data['core'].update(new_data)
    else:
        data['skill_catalog'].update(new_data)
    if name not in ['skills', 'traits']:
        with open(f'{OUT_DIR}/s5/{name}.json', 'w', encoding='utf-8') as f:
            json.dump(new_data, f, indent=4, ensure_ascii=False, sort_keys=True)
        print(f'{SRC_DIR}/s5/{name}.lua -> {OUT_DIR}/s5/{name}.json')
    else:
        s5_skills.update(new_data)
with open(f'{OUT_DIR}/s5/skills.json', 'w', encoding='utf-8') as f:
    json.dump(s5_skills, f, indent=4, ensure_ascii=False, sort_keys=True)
print(f'{SRC_DIR}/s5/skills&traits.lua -> {OUT_DIR}/s5/skills.json')

for name in FILES:
    out_path = f'{OUT_DIR}/{name}.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data[name], f, indent=4, ensure_ascii=False, sort_keys=True)
    print(f'{SRC_DIR}/{name}.lua -> {out_path}')
