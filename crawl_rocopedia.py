"""爬取 rocopedia.org 的特性（Trait）名称与效果描述。

rocopedia 全站挂着 Cloudflare Turnstile，requests、curl_cffi、playwright
都会被 403，所以这里用 nodriver 驱动本机 Edge（必须有头）在真实浏览器里读 DOM。
技能 / 精灵各自只需打开一个链接即可直接获取，不在本脚本范围内。
精灵：https://www.rocopedia.org/w/index.php?title=Data:DamageCalculator/Jinies&action=raw
技能：https://www.rocopedia.org/w/index.php?title=Data:DamageCalculator/Skills&action=raw

用法：
    uv run --with nodriver -- python crawl_rocopedia.py

输出：
    datas/intermediate/rocopedia/traits_en.json   223 条：特性名 / slug / 效果描述
"""

import json
import os
import pathlib

import nodriver as uc

BASE = "https://www.rocopedia.org"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PROFILE = os.path.join(os.environ.get("TEMP", "."), "rocopedia-edge-profile")
OUT_DIR = pathlib.Path("datas/intermediate/rocopedia")

CHALLENGE_TITLES = ("Just a moment", "稍候", "Checking your connection")

TRAITS_JS = r"""
JSON.stringify([...document.querySelectorAll('.nrc-collection-trait-card')].map(card => {
  const nameEl = card.querySelector('.nrc-collection-name');
  const link = nameEl && nameEl.querySelector('a');
  const desc = card.querySelector('.nrc-collection-description');
  return {
    name: (nameEl ? nameEl.innerText : card.dataset.name || '').trim(),
    slug: link ? link.getAttribute('href').replace(/^\//, '') : null,
    effect: desc ? desc.innerText.trim() : '',
  };
}))
"""


async def load(page, path: str, selector: str, attempts: int = 40) -> None:
    """等 Cloudflare 验证通过且目标元素出现，必要时重新导航。"""
    for attempt in range(attempts):
        await page.get(BASE + path)
        for _ in range(20):
            await page.sleep(1)
            title = await page.evaluate("document.title") or ""
            if any(t in title for t in CHALLENGE_TITLES):
                continue
            if await page.evaluate(f"!!document.querySelector({json.dumps(selector)})"):
                return
        print(f"  {path} 未就绪，重试 ({attempt + 1}/{attempts})", flush=True)
    raise RuntimeError(f"加载失败：{path}")


async def extract(page, js: str, expected: int, attempts: int = 3) -> list:
    """执行提取脚本，行数明显偏少时重新提取。"""
    data = []
    for _ in range(attempts):
        raw = await page.evaluate(js)
        data = json.loads(raw) if raw else []
        if len(data) >= expected * 0.9:
            return data
        await page.sleep(3)
    return data


async def main() -> None:
    browser = await uc.start(
        headless=False,
        user_data_dir=PROFILE,
        browser_executable_path=EDGE,
        browser_args=["--no-first-run", "--disable-features=msEdgeSplashScreen"],
    )
    page = await browser.get(BASE + "/Traits")

    print("爬取 Traits ...", flush=True)
    await load(page, "/Traits", ".nrc-collection-trait-card")
    traits = await extract(page, TRAITS_JS, 223)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / "traits_en.json"
    path.write_text(json.dumps(traits, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  {path}  {len(traits)} 条", flush=True)

    browser.stop()


uc.loop().run_until_complete(main())
