/* ============================================================
 * toy-sync.js — 云存档同步（Toy 构建专用，网页版不加载）
 *
 * 设计：
 *   - localStorage 仍是本地真相源；云端只保存一份分块快照。
 *   - 键：bkm = 分块数量，bkh = 内容哈希，bk0..bk{n-1} = 快照分片。
 *     单块 ≤900 字节（平台上限 1024），最多 120 块（平台上限 128 key）。
 *   - 读：启动时一次 getCloudStorage()，不轮询。
 *   - 写：本地变更后 10s debounce；页面隐藏 / 关闭时 flush；
 *     一次 setCloudStorage 批量写全部分块。
 *   - 新旧判断：不依赖设备本地时间，改用「内容哈希 + 上次同步基线」：
 *       base = 上次同步时的内容哈希
 *       本地变了 = localHash !== base
 *       云端变了 = remoteHash !== base
 *     仅一方变化 → 自动同步；双方都变化 → 弹窗让用户选择。
 *     这样手机/电脑时钟不一致也不会把新数据误判成旧数据。
 *   - 上传前用 bkh 做一次小读取，若云端已被其它设备更新则转为冲突，
 *     避免「早已打开的页面」静默覆盖别人的改动。
 *
 * 调试：URL 带 ?clouddebug（或 #clouddebug）时，左下角显示同步日志面板。
 * ============================================================ */
(function () {
  'use strict';

  const SPIRIT_PREFIX = 'roco-star-dmg:spirit-config:v1:';
  const FAV_PREFIX = 'roco-star-dmg:favorites:v1:';
  const SETTINGS_KEY = 'roco-star-dmg:settings:v1';
  const SYNC_META_KEY = 'roco-star-dmg:sync:v1';
  const ADOPTED_KEY = 'roco-star-dmg:cloud-adopted:v1';

  const CHUNK_PREFIX = 'bk';
  const CHUNK_META_KEY = 'bkm';
  const HASH_KEY = 'bkh';
  const CHUNK_BYTES = 900;
  const MAX_CHUNKS = 120;
  const DEBOUNCE_MS = 10000;
  const RETRY_DELAYS = [2000, 8000, 30000];

  const t = function (key, params) {
    if (window.I18N && typeof window.I18N.t === 'function') return window.I18N.t(key, params);
    return key;
  };

  let enabled = false;
  let dirty = false;
  let pushing = false;
  let pushAgain = false;
  let forceNextPush = false;   // 用户选择「保留本地」后，跳过上传前检查
  let rev = 0;
  let timer = null;
  let cloudChunkCount = 0;
  let localMeta = { h: null, dirty: false, t: 0 };

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // ------------------------------------------------------------
  // 调试模式：?clouddebug 或 #clouddebug
  // ------------------------------------------------------------
  const DEBUG = (function () {
    try {
      return new URLSearchParams(window.location.search).has('clouddebug') ||
        String(window.location.hash || '').indexOf('clouddebug') >= 0;
    } catch (_) {
      return false;
    }
  })();

  const DEBUG_STORE_KEY = 'roco-star-dmg:clouddebug:v1';
  const DEBUG_MAX_LINES = 200;

  let debugBox = null;
  let debugRestored = false;
  let debugLines = [];

  function debugClock() {
    const d = new Date();
    const pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function ensureDebugPanel() {
    if (debugBox || !document.body) return;
    debugBox = document.createElement('div');
    debugBox.className = 'cloud-debug';
    const title = document.createElement('div');
    title.className = 'cloud-debug-title';
    title.textContent = '云存档调试';
    debugBox.appendChild(title);
    document.body.appendChild(debugBox);
  }

  function appendDebugLine(text, kind) {
    ensureDebugPanel();
    if (!debugBox) return;
    const line = document.createElement('div');
    line.className = 'cloud-debug-line' + (kind ? ' is-' + kind : '');
    line.textContent = text;
    debugBox.appendChild(line);
    // 标题 + 最多 200 行，超出后丢弃最早的一行
    while (debugBox.childNodes.length > DEBUG_MAX_LINES + 1) {
      debugBox.removeChild(debugBox.childNodes[1]);
    }
    debugBox.scrollTop = debugBox.scrollHeight;
  }

  function saveDebugLines() {
    try {
      sessionStorage.setItem(DEBUG_STORE_KEY, JSON.stringify(debugLines));
    } catch (_) { /* sessionStorage 不可用时忽略 */ }
  }

  // 采用云端存档会触发整页刷新；把刷新前的日志从 sessionStorage 回放到面板，
  // 否则新页面只剩「内容一致」，看起来像没有同步过。
  function restoreDebugLines() {
    if (debugRestored) return;
    debugRestored = true;
    try {
      const raw = sessionStorage.getItem(DEBUG_STORE_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      if (!Array.isArray(arr) || !arr.length) return;
      debugLines = arr.slice(-DEBUG_MAX_LINES);
      ensureDebugPanel();
      if (!debugBox) return;
      const sep = document.createElement('div');
      sep.className = 'cloud-debug-line is-warn';
      sep.textContent = '—— 页面刷新，以上为上次启动日志 ——';
      debugBox.appendChild(sep);
      debugLines.forEach(function (item) {
        const line = document.createElement('div');
        line.className = 'cloud-debug-line' + (item && item.k ? ' is-' + item.k : '');
        line.textContent = (item && item.s) ? item.s : '';
        debugBox.appendChild(line);
      });
      debugBox.scrollTop = debugBox.scrollHeight;
    } catch (_) { /* 忽略 */ }
  }

  function debug(message, kind) {
    if (!DEBUG) return;
    try { console.log('[cloud-sync]', message); } catch (_) { /* 忽略 */ }
    if (!document.body) return;
    try {
      restoreDebugLines();
      const text = debugClock() + '  ' + message;
      appendDebugLine(text, kind);
      debugLines.push({ s: text, k: kind || '' });
      if (debugLines.length > DEBUG_MAX_LINES) {
        debugLines = debugLines.slice(-DEBUG_MAX_LINES);
      }
      saveDebugLines();
    } catch (_) { /* 面板渲染失败不影响同步 */ }
  }

  function describeError(err) {
    if (!err) return '未知错误';
    const parts = [];
    if (err.type) parts.push('type=' + err.type);
    if (err.code) parts.push('code=' + err.code);
    if (err.message) parts.push(String(err.message));
    return parts.join(' ') || String(err);
  }

  // ------------------------------------------------------------
  // 内容哈希：只对「存档内容」计算，与时间、设备、键顺序无关。
  // stableStringify 递归排序对象键，保证两台设备生成同一份字符串。
  // ------------------------------------------------------------
  function stableStringify(value) {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(stableStringify).join(',') + ']';
    }
    const keys = Object.keys(value).sort();
    return '{' + keys.map(function (key) {
      return JSON.stringify(key) + ':' + stableStringify(value[key]);
    }).join(',') + '}';
  }

  // 两个 32 位 FNV 变体拼成 16 位十六进制，冲突概率可忽略。
  function hashString(str) {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    }
    return ('0000000' + h1.toString(16)).slice(-8) +
      ('0000000' + h2.toString(16)).slice(-8);
  }

  function hashPayload(snap) {
    return hashString(stableStringify({
      favorites: (snap && snap.favorites) || {},
      spiritConfigs: (snap && snap.spiritConfigs) || {},
      settings: (snap && snap.settings) || null
    }));
  }

  // ------------------------------------------------------------
  // 本地元数据：h = 上次同步的内容哈希，dirty = 是否有未上云修改
  // t 仅用于调试展示，不参与任何新旧判断。
  // ------------------------------------------------------------
  function hasLocalData() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.indexOf(SPIRIT_PREFIX) === 0 || key.indexOf(FAV_PREFIX) === 0) return true;
      }
    } catch (_) { /* 存储不可用 */ }
    return false;
  }

  function readLocalMeta() {
    try {
      const raw = localStorage.getItem(SYNC_META_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          return {
            h: typeof obj.h === 'string' && obj.h ? obj.h : null,
            dirty: obj.dirty === true,
            t: Number.isFinite(obj.t) ? obj.t : 0
          };
        }
      }
    } catch (_) { /* 损坏 → 走默认 */ }
    // 没有同步元数据：有本地数据就视为「未同步」，首次上云时作为基线
    return { h: null, dirty: hasLocalData(), t: 0 };
  }

  function writeLocalMeta() {
    try {
      localStorage.setItem(SYNC_META_KEY, JSON.stringify(localMeta));
    } catch (_) { /* 静默 */ }
  }

  // ------------------------------------------------------------
  // 快照构建
  // ------------------------------------------------------------
  function buildSnapshot() {
    const snap = { v: 1, t: localMeta.t, favorites: {}, spiritConfigs: {}, settings: null };

    ['attacker', 'defender'].forEach(function (side) {
      try {
        const raw = localStorage.getItem(FAV_PREFIX + side);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) snap.favorites[side] = arr;
      } catch (_) { /* 跳过损坏数据 */ }
    });

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key.indexOf(SPIRIT_PREFIX) !== 0) continue;
        try {
          snap.spiritConfigs[key.slice(SPIRIT_PREFIX.length)] =
            JSON.parse(localStorage.getItem(key));
        } catch (_) { /* 跳过损坏数据 */ }
      }
    } catch (_) { /* 存储不可用 */ }

    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') snap.settings = obj;
      }
    } catch (_) { /* 跳过损坏数据 */ }

    return snap;
  }

  function localContentHash() {
    return hashPayload(buildSnapshot());
  }

  function utf8Length(str) {
    let bytes = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 0x80) bytes += 1;
      else if (c < 0x800) bytes += 2;
      else if (c >= 0xD800 && c <= 0xDBFF) { bytes += 4; i++; }
      else bytes += 3;
    }
    return bytes;
  }

  // 按 UTF-8 字节数切分，且不切断代理对（emoji 等）
  function chunkText(text, maxBytes) {
    const chunks = [];
    let cur = '';
    let curBytes = 0;
    for (const ch of text) {
      const b = utf8Length(ch);
      if (cur && curBytes + b > maxBytes) {
        chunks.push(cur);
        cur = '';
        curBytes = 0;
      }
      cur += ch;
      curBytes += b;
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  // 返回 { chunks, hash }。hash 始终对应实际要写入的 chunks 内容。
  function buildPayload() {
    const snap = buildSnapshot();
    let candidate = snap;
    let chunks = chunkText(JSON.stringify(candidate), CHUNK_BYTES);

    if (chunks.length > MAX_CHUNKS) {
      // 极端情况：配置条目过多，超出单 Toy 128 key 上限。
      // 收藏与设置永久保留，配置按存储顺序裁剪到能放下为止。
      const ids = Object.keys(snap.spiritConfigs);
      for (let keep = ids.length - 25; keep >= 0; keep -= 25) {
        const trimmed = Object.assign({}, snap, { spiritConfigs: {} });
        for (let i = 0; i < keep; i++) {
          trimmed.spiritConfigs[ids[i]] = snap.spiritConfigs[ids[i]];
        }
        candidate = trimmed;
        chunks = chunkText(JSON.stringify(candidate), CHUNK_BYTES);
        if (chunks.length <= MAX_CHUNKS) break;
      }
    }

    return { chunks: chunks, hash: hashPayload(candidate) };
  }

  // ------------------------------------------------------------
  // 云端读写
  // ------------------------------------------------------------
  function isRateLimited(err) {
    return !!err && err.type === 'http_error' && err.code === 307044;
  }

  function isAuthError(err) {
    return !!err && (err.type === 'not_logged_in' || err.type === 'unauthorized');
  }

  async function readCloud() {
    debug('读取云端存档…');
    const data = await toy.getCloudStorage();
    if (!data || typeof data !== 'object') {
      debug('云端返回空数据');
      return null;
    }
    debug('云端返回 ' + Object.keys(data).length + ' 个 key');

    const indexes = [];
    Object.keys(data).forEach(function (key) {
      const m = /^bk(\d+)$/.exec(key);
      if (m) indexes.push(Number(m[1]));
    });
    if (!indexes.length) {
      debug('云端没有 bk* 分块，视为无存档');
      return null;
    }

    const maxIndex = Math.max.apply(null, indexes);
    const metaCount = parseInt(data[CHUNK_META_KEY], 10);
    const count = Number.isFinite(metaCount) && metaCount > 0 ? metaCount : maxIndex + 1;
    cloudChunkCount = Math.max(count, maxIndex + 1);
    debug('云端分块数 ' + count + '（bkm=' + (data[CHUNK_META_KEY] || '缺失') +
      '，最大索引 ' + maxIndex + '）');

    let json = '';
    for (let i = 0; i < count; i++) {
      const part = data[CHUNK_PREFIX + i];
      if (typeof part !== 'string') {
        debug('分块 bk' + i + ' 缺失，云端存档不完整', 'err');
        return null;   // 缺块视为损坏，不采用
      }
      json += part;
    }
    try {
      const snap = JSON.parse(json);
      if (!snap || snap.v !== 1) {
        debug('云端快照版本非法，忽略', 'warn');
        return null;
      }
      debug('云端快照解析成功：配置 ' +
        Object.keys(snap.spiritConfigs || {}).length + ' 条', 'ok');
      return snap;
    } catch (_) {
      debug('云端快照 JSON 解析失败，忽略', 'err');
      return null;
    }
  }

  async function pushOnce() {
    const myRev = rev;
    const payload = buildPayload();
    if (!payload.chunks.length) {
      debug('快照为空，跳过上传', 'warn');
      return;
    }

    // 上传前用 bkh 做一次很小的读取：若云端自上次同步后已被别的设备改过，
    // 不直接覆盖，交给冲突弹窗处理。
    if (!forceNextPush && localMeta.h) {
      let remoteHash = null;
      try {
        const kv = await toy.getCloudStorage([HASH_KEY]);
        remoteHash = kv && typeof kv[HASH_KEY] === 'string' ? kv[HASH_KEY] : null;
      } catch (err) {
        debug('上传前检查失败：' + describeError(err), 'warn');
        if (isRateLimited(err) || isAuthError(err)) throw err;
      }

      if (remoteHash) {
        if (remoteHash === payload.hash) {
          debug('云端内容与本次快照一致，无需上传', 'ok');
          localMeta.h = payload.hash;
          localMeta.dirty = false;
          dirty = false;
          writeLocalMeta();
          return;
        }
        if (remoteHash !== localMeta.h) {
          debug('上传前发现云端已被其它设备更新（' + remoteHash + '）', 'warn');
          if (document.visibilityState === 'hidden') {
            debug('页面不可见，冲突留到下次进入处理', 'warn');
            return;   // 保持 dirty
          }
          showConflictDialog(readCloud);
          return;     // 保持 dirty
        }
      } else {
        debug('云端缺少 bkh，跳过上传前检查');
      }
    }

    const chunks = payload.chunks;
    let totalBytes = 0;
    let maxBytes = 0;
    chunks.forEach(function (text) {
      const bytes = utf8Length(text);
      totalBytes += bytes;
      if (bytes > maxBytes) maxBytes = bytes;
    });
    debug('上传 ' + chunks.length + ' 块，共 ' + (totalBytes / 1024).toFixed(1) +
      ' KB，最大块 ' + maxBytes + 'B，hash=' + payload.hash);

    const items = {};
    chunks.forEach(function (text, i) { items[CHUNK_PREFIX + i] = text; });
    items[CHUNK_META_KEY] = String(chunks.length);
    items[HASH_KEY] = payload.hash;
    await toy.setCloudStorage(items);
    debug('上传成功', 'ok');
    forceNextPush = false;

    // 清理上一次写下的多余分块（快照变短时），一次批量删除
    const stale = Array.from(
      { length: Math.max(0, cloudChunkCount - chunks.length) },
      function (_, i) { return CHUNK_PREFIX + (chunks.length + i); }
    );
    if (stale.length) {
      debug('清理旧分块 ' + stale.length + ' 个');
      try { await toy.removeCloudStorage(stale); } catch (_) { /* 下次覆盖即可 */ }
    }
    cloudChunkCount = chunks.length;

    // 上传的是「推送那一刻」的快照：基线更新为该快照的哈希；
    // 若推送期间又有新变更，则保持 dirty，稍后补传。
    localMeta.h = payload.hash;
    if (myRev === rev) {
      dirty = false;
      localMeta.dirty = false;
    } else {
      debug('上传期间又有新变更，稍后补传', 'warn');
      localMeta.dirty = true;
    }
    writeLocalMeta();
  }

  async function pushLoop() {
    for (let attempt = 0; ; attempt++) {
      try {
        await pushOnce();
        return;
      } catch (err) {
        debug('上传失败：' + describeError(err), 'err');
        if (isRateLimited(err) && attempt < RETRY_DELAYS.length) {
          debug('触发限流，' + RETRY_DELAYS[attempt] + 'ms 后重试（' +
            (attempt + 1) + '/' + RETRY_DELAYS.length + '）', 'warn');
          await sleep(RETRY_DELAYS[attempt]);
          continue;
        }
        if (isAuthError(err)) {
          enabled = false;
          debug('登录态无效，本次会话停用云同步', 'warn');
        }
        return;
      }
    }
  }

  function flush(reason) {
    const why = typeof reason === 'string' ? reason : 'manual';
    if (!enabled || !dirty) {
      debug('flush(' + why + ') 跳过：' + (!enabled ? '未启用' : '无待同步变更'));
      return;
    }
    if (pushing) {
      debug('flush(' + why + ') 合并到进行中的上传');
      pushAgain = true;
      return;
    }
    debug('flush(' + why + ') 开始上传');
    pushing = true;
    pushAgain = false;
    pushLoop().finally(function () {
      pushing = false;
      if (pushAgain) { pushAgain = false; flush('pending'); }
    });
  }

  function schedulePush() {
    clearTimeout(timer);
    timer = setTimeout(function () { timer = null; flush('debounce'); }, DEBOUNCE_MS);
  }

  // ------------------------------------------------------------
  // 本地 → 云端
  // ------------------------------------------------------------
  function onLocalChanged() {
    if (!enabled) return;
    rev++;
    dirty = true;
    localMeta.t = Date.now();     // 仅调试展示
    localMeta.dirty = true;
    writeLocalMeta();
    debug('本地变更 rev=' + rev + '，' + (DEBOUNCE_MS / 1000) + 's 后同步');
    schedulePush();
  }
  window.__rocoLocalChanged = onLocalChanged;

  // ------------------------------------------------------------
  // 云端 → 本地
  // ------------------------------------------------------------
  function clearByPrefix(prefix) {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.indexOf(prefix) === 0) keys.push(key);
      }
    } catch (_) { return; }
    keys.forEach(function (key) {
      try { localStorage.removeItem(key); } catch (_) { /* 忽略 */ }
    });
  }

  function adoptCloud(snap) {
    const hash = hashPayload(snap);
    debug('采用云端存档：配置 ' + Object.keys(snap.spiritConfigs || {}).length +
      ' 条，hash=' + hash);
    try {
      clearByPrefix(SPIRIT_PREFIX);
      clearByPrefix(FAV_PREFIX);

      if (snap.favorites && typeof snap.favorites === 'object') {
        ['attacker', 'defender'].forEach(function (side) {
          const arr = snap.favorites[side];
          if (Array.isArray(arr)) {
            localStorage.setItem(FAV_PREFIX + side, JSON.stringify(arr));
          }
        });
      }

      if (snap.spiritConfigs && typeof snap.spiritConfigs === 'object') {
        Object.keys(snap.spiritConfigs).forEach(function (suffix) {
          if (!suffix) return;
          try {
            localStorage.setItem(
              SPIRIT_PREFIX + suffix,
              JSON.stringify(snap.spiritConfigs[suffix])
            );
          } catch (_) { /* 单条失败不阻塞其它条目 */ }
        });
      }

      if (snap.settings && typeof snap.settings === 'object') {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(snap.settings));
      }

      localMeta = { h: hash, dirty: false, t: Number.isFinite(snap.t) ? snap.t : 0 };
      dirty = false;
      forceNextPush = false;
      writeLocalMeta();
    } catch (err) {
      debug('写入云端存档失败：' + describeError(err), 'err');
      return;   // 写入失败：保持现状，不刷新
    }
    // 标记本次刷新是因为采用了云端存档，供刷新后的调试日志区分
    try { sessionStorage.setItem(ADOPTED_KEY, hash); } catch (_) { /* 忽略 */ }
    debug('已写入本地，刷新页面', 'ok');
    location.reload();
  }

  // ------------------------------------------------------------
  // 冲突弹窗（复用 #confirm-modal 结构）
  //   getCloudSnapshot: 返回 Promise<snap|null>，用户选「使用云端」时才读取
  //   确认 = 使用云端；取消 = 保留本地；关闭 / ESC = 暂不处理
  // ------------------------------------------------------------
  function chooseLocal() {
    debug('冲突处理：保留本地，覆盖云端');
    rev++;
    dirty = true;
    localMeta.t = Date.now();
    localMeta.dirty = true;
    forceNextPush = true;   // 用户已明确选择本地，上传时不再二次拦截
    writeLocalMeta();
    flush('conflict-local');
  }

  function showConflictDialog(getCloudSnapshot) {
    debug('检测到冲突：本地与云端都有修改', 'warn');

    const overlay = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const bodyEl = document.getElementById('confirm-modal-body');
    if (!overlay || !titleEl || !bodyEl) {
      debug('冲突弹窗结构缺失，暂不处理', 'err');
      return;
    }

    const closeBtn = overlay.querySelector('.modal-close');
    const cancelBtn = overlay.querySelector('.modal-cancel');
    const confirmBtn = overlay.querySelector('.modal-danger');
    if (!closeBtn || !cancelBtn || !confirmBtn) {
      debug('冲突弹窗按钮缺失，暂不处理', 'err');
      return;
    }

    titleEl.textContent = t('cloud.conflict.title');
    bodyEl.textContent = t('cloud.conflict.body');
    cancelBtn.textContent = t('cloud.conflict.local');
    confirmBtn.textContent = t('cloud.conflict.cloud');

    const lastFocus = document.activeElement;

    const close = function () {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      closeBtn.removeEventListener('click', onClose);
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
      // 还原共享弹窗的按钮文案，避免影响后续确认框
      confirmBtn.textContent = t('confirm.ok');
      cancelBtn.textContent = t('confirm.cancel');
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    };

    const onClose = function () {             // 暂不处理，保持 dirty
      debug('冲突窗关闭：暂不处理', 'warn');
      close();
    };
    const onCancel = function () { close(); chooseLocal(); };
    const onConfirm = function () {
      debug('冲突处理：使用云端');
      close();
      Promise.resolve()
        .then(getCloudSnapshot)
        .then(function (snap) {
          if (!snap) {
            debug('读取云端存档失败，保持现状', 'err');
            return;
          }
          adoptCloud(snap);
        })
        .catch(function (err) {
          debug('读取云端存档失败：' + describeError(err), 'err');
        });
    };
    const onOverlayClick = function (e) { if (e.target === overlay) close(); };
    const onKeydown = function (e) {
      if (overlay.classList.contains('is-open') && e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };

    closeBtn.addEventListener('click', onClose);
    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { confirmBtn.focus(); }, 0);
  }

  // ------------------------------------------------------------
  // 启动
  // ------------------------------------------------------------
  async function init() {
    if (!window.toy) {
      debug('未检测到 Toy SDK，云存档不可用', 'warn');
      return;
    }
    debug('检测云存储能力…');
    let supported = false;
    try {
      supported = await toy.isSupport('getCloudStorage');
    } catch (err) {
      debug('isSupport 调用失败：' + describeError(err), 'err');
    }
    if (!supported) {
      debug('当前环境不支持云存储，跳过同步', 'warn');
      return;
    }
    debug('云存储可用', 'ok');

    let adoptedLastTime = false;
    try {
      if (sessionStorage.getItem(ADOPTED_KEY)) {
        adoptedLastTime = true;
        sessionStorage.removeItem(ADOPTED_KEY);
      }
    } catch (_) { /* 忽略 */ }
    if (adoptedLastTime) debug('上次启动已采用云端存档并刷新', 'ok');

    enabled = true;
    localMeta = readLocalMeta();
    dirty = localMeta.dirty;
    const localHash = localContentHash();
    debug('本地 t=' + (localMeta.t ? formatTime(localMeta.t) : '无') +
      '，dirty=' + dirty + '，hash=' + localHash);
    debug('同步基线 base=' + (localMeta.h || '无'));

    // 页面隐藏 / 关闭时尽力落盘。onPageClose 不保证送达，仅作兜底。
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush('visibilitychange');
    });
    window.addEventListener('pagehide', function () { flush('pagehide'); });
    try {
      toy.isSupport('onPageClose').then(function (ok) {
        if (ok) toy.onPageClose(function () { flush('pageclose'); });
      }).catch(function () { /* 忽略 */ });
    } catch (_) { /* 忽略 */ }

    let cloud = null;
    try {
      cloud = await readCloud();
    } catch (err) {
      debug('读取云端失败：' + describeError(err), 'err');
      if (isAuthError(err)) {
        enabled = false;
        debug('登录态无效，本次会话停用云同步', 'warn');
      }
      return;
    }

    if (!cloud) {
      // 云端没有存档：把现有本地存档作为基线推上去
      if (hasLocalData()) {
        debug('云端无存档，用本地数据建立基线', 'ok');
        dirty = true;
        localMeta.t = Date.now();
        localMeta.dirty = true;
        writeLocalMeta();
        flush('init-baseline');
      } else {
        debug('云端与本地都没有存档，等待首次修改');
      }
      return;
    }

    const remoteHash = hashPayload(cloud);
    debug('云端 hash=' + remoteHash);

    // 内容完全一致：直接对齐基线，不产生任何写入
    if (remoteHash === localHash) {
      debug(adoptedLastTime
        ? '云端与本地内容一致（上次启动的云端同步已完成）'
        : '云端与本地内容一致，本次启动无需同步', 'ok');
      localMeta.h = localHash;
      localMeta.dirty = false;
      dirty = false;
      writeLocalMeta();
      return;
    }

    // 三方比较：base = 上次同步时的内容哈希
    const base = localMeta.h;
    const localChanged = base ? localHash !== base : (localMeta.dirty || hasLocalData());
    const remoteChanged = base ? remoteHash !== base : true;

    debug('比较：base=' + (base || '无') +
      '，localChanged=' + localChanged +
      '，remoteChanged=' + remoteChanged);

    if (!localChanged) {
      debug('仅云端有变化 → 采用云端');
      adoptCloud(cloud);
      return;
    }

    if (!remoteChanged) {
      debug('仅本地有变化 → 上传本地');
      dirty = true;
      localMeta.dirty = true;
      writeLocalMeta();
      flush('init-local-changed');
      return;
    }

    // 两边都变了：交给用户选择
    showConflictDialog(function () { return cloud; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }
})();
