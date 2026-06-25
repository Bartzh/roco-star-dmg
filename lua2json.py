import os
import lupa
import json

FILES = [
    'core',
    'learnset_catalog',
    'learnsets',
    'skill_catalog',
]

SRC_DIR = 'datas/src'
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

# 5. 遍历所有文件，转换并导出为 JSON
for name in FILES:
    src_path = f'{SRC_DIR}/{name}.lua'
    out_path = f'{OUT_DIR}/{name}.json'

    # 检查文件是否需要重新转换
    src_mtime = os.path.getmtime(src_path)
    if os.path.exists(out_path) and os.path.getmtime(out_path) >= src_mtime:
        print(f'跳过（修改日期未变化）: {src_path}')
        continue

    # 2. 加载 Lua 表数据
    with open(src_path, 'r', encoding='utf-8') as f:
        lua_code = f.read()

    # 3. 执行 Lua 代码，获取 Lua Table 对象
    lua_table = lua.eval(lua_code)

    py_dict = lua_to_py(lua_table)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(py_dict, f, indent=4, ensure_ascii=False)

    print(f'{src_path} -> {out_path}')
