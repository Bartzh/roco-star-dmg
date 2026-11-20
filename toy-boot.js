/* ============================================================
 * toy-boot.js — Toy 构建专用启动脚本（网页版 dist/ 不加载）
 *
 * 只在 B站 Toy 容器内生效（window.toy 存在）；普通浏览器打开时
 * 完全退化为网页版行为，不产生任何副作用。
 *
 * 职责：
 *   1. 开启沉浸模式、手机端锁定竖屏，并把容器 safeArea 同步为 CSS 变量；
 *   2. 隐藏「导出数据」——App WebView 不支持 <a download> 下载。
 * ============================================================ */
(function () {
  'use strict';

  // 沉浸模式开关：临时对比关闭效果时，在 URL 后加 ?immersive=0 即可，
  // 无需重新构建。
  const ENABLE_IMMERSIVE = new URLSearchParams(window.location.search).get('immersive') !== '0';

  // 手机端锁定竖屏：横屏时三栏布局在手机上过于拥挤。
  // 平板 / 桌面保持 auto，交给 CSS 宽度断点处理。
  const LOCK_PHONE_PORTRAIT = true;

  function applySafeArea(state) {
    const area = state && state.safeArea;
    if (!area) return;
    const root = document.documentElement;
    ['top', 'right', 'bottom', 'left'].forEach(function (key) {
      if (typeof area[key] === 'number') {
        root.style.setProperty('--toy-safe-' + key, area[key] + 'px');
      }
    });
  }

  function initContainer() {
    // 容器能力仅 B站 App 内支持，Web 端 / 预览态直接跳过。
    Promise.all([
      toy.isSupport('getContainerState'),
      toy.isSupport('setContainerMode'),
      toy.isSupport('onContainerChange')
    ]).then(function (supported) {
      const canGetState = supported[0];
      const canSetMode = supported[1];
      const canWatch = supported[2];

      if (canWatch) {
        // 官方建议：先监听状态变化，再设置模式，以便确认是否生效。
        try { toy.onContainerChange(applySafeArea); } catch (_) { /* 忽略 */ }
      }

      const statePromise = canGetState
        ? toy.getContainerState().catch(function () { return null; })
        : Promise.resolve(null);

      return statePromise.then(function (state) {
        applySafeArea(state);
        if (!canSetMode) return;

        const mode = { immersive: ENABLE_IMMERSIVE };
        // 只有明确识别为手机时才锁竖屏；tablet / desktop / unknown 保持 auto。
        if (LOCK_PHONE_PORTRAIT && state && state.deviceType === 'phone') {
          mode.orientation = 'portrait';
        }
        // 方向与沉浸状态一次传齐，避免出现可观测的中间状态。
        return toy.setContainerMode(mode).catch(function () { /* 忽略 */ });
      });
    }).catch(function () { /* 不支持或调用失败时保持默认容器状态 */ });
  }

  // 导出依赖 <a download>，在 App WebView 中无效；整行移除，保留导入。
  function hideExportRow() {
    const btn = document.getElementById('export-btn');
    const row = btn && btn.closest ? btn.closest('.data-mgr-row') : null;
    if (!row) return;
    const prev = row.previousElementSibling;
    if (prev && prev.tagName === 'HR') prev.remove();
    row.remove();
  }

  function boot() {
    if (!window.toy) return;
    document.documentElement.classList.add('toy-env');
    hideExportRow();
    initContainer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
