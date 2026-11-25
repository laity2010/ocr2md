/** WP06 · V3 工作区 SQL 导入与安全加载控制器。
 *
 * 严格遵循 SQL.md 第 1–2 节：
 * 1. 仅操作当前 F02 授权目录下的 ocr2md.v3.sqlite，绝不触碰 ocr2md.v2.sqlite；
 * 2. 已有数据库直接打开，缺失时仅在用户明确点击「初始化 V3 数据库」后调用
 *    POST /labs/lab-ocr-v3/api/mineru-base/import（confirm: 'import-v3-mineru-base'）。
 */
const API_BASE = '/labs/lab-ocr-v3/api/mineru-base/';

export function mountV3SqlActions({toolbarHost, fetcher = fetch, onLoaded, onStatus}) {
  if (!toolbarHost) return null;

  let currentWorkspace = '';
  let dbExists = false;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ocr-v3-import-btn';
  btn.textContent = '初始化 V3 库';
  btn.hidden = true;
  btn.style.cssText = 'margin-left:8px;padding:2px 8px;font-size:12px;';

  const undoGroup = toolbarHost.querySelector('.ocr-source-undo-redo');
  if (undoGroup) {
    toolbarHost.insertBefore(btn, undoGroup);
  } else {
    toolbarHost.append(btn);
  }

  async function inspectAndLoad(workspace) {
    if (!workspace) return {exists: false};
    currentWorkspace = workspace;
    const q = new URLSearchParams({workspace}).toString();
    const stateRes = await fetcher(`${API_BASE}state?${q}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!stateRes.ok) return {exists: false};
    const stateData = await stateRes.json();
    dbExists = Boolean(stateData?.exists);
    btn.hidden = dbExists;
    if (!dbExists) {
      onStatus?.('当前目录尚未建立 ocr2md.v3.sqlite，可点击「初始化 V3 库」导入', 'warning');
      return {exists: false};
    }
    const mdRes = await fetcher(`${API_BASE}markdown?${q}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!mdRes.ok) return {exists: true, loaded: false};
    const snapshot = await mdRes.json();
    if (currentWorkspace === workspace) {
      await onLoaded?.(snapshot, workspace);
      onStatus?.(`✓ 已加载 V3 书籍（${snapshot.rowCount} 个逻辑块）`, 'ok');
    }
    return {exists: true, loaded: true, rowCount: snapshot.rowCount};
  }

  async function importFreshBook() {
    if (!currentWorkspace || dbExists) return null;
    btn.disabled = true;
    onStatus?.('正在安全导入 MinerUJSON 建立 ocr2md.v3.sqlite…');
    try {
      const res = await fetcher(`${API_BASE}import`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          workspace: currentWorkspace,
          confirm: 'import-v3-mineru-base',
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        onStatus?.('V3 导入失败：' + (data?.error || `HTTP ${res.status}`), 'error');
        return null;
      }
      await inspectAndLoad(currentWorkspace);
      return data;
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', () => {
    void importFreshBook();
  });

  return Object.freeze({
    inspectAndLoad,
    importFreshBook,
    dispose() {
      btn.remove();
    },
  });
}
