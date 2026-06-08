import lupa
import json

file_path = 'datas/skill_catalog'

# 1. 初始化 Lua 运行时
lua = lupa.LuaRuntime(unpack_returned_tuples=True)

with open('datas/helper.lua', 'r', encoding='utf-8') as f:
    helper_code = f.read()
    lua.execute(helper_code)
    is_lua_array = lua.globals().is_lua_array

# 2. 加载 Lua 表数据
with open(file_path+'.lua', 'r', encoding='utf-8') as f:
    lua_code = f.read()

# 3. 执行 Lua 代码，获取 Lua Table 对象
lua_table = lua.eval(lua_code)

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

# 5. 转换并导出为 JSON
py_dict = lua_to_py(lua_table)
with open(file_path+'.json', 'w', encoding='utf-8') as f:
    json.dump(py_dict, f, indent=4, ensure_ascii=False)
