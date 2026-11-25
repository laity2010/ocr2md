/** WP06 / WP07B · V3 工作区 SQL 导入与安全加载控制器。
 *
 * 严格遵循 SQL.md 第 1–2 节：
 * 1. 仅操作当前 F02 授权目录下的 ocr2md.v3.sqlite，绝不触碰 ocr2md.v2.sqlite；
 * 2. 已有数据库直接加载逻辑表快照；缺失时在用户明确点击「生成 V3 SQL」后调用
 *    POST /labs/lab-ocr-v3/api/mineru-base/import（confirm: 'import-v3-mineru-base'），
 *    依次完成 MinerUJSON -> 基础表 -> 逻辑表 编译并自动加载进 CM6。
 */
const API_BASE = '/labs/lab-ocr-v3/api/mineru-base/';

export function mountV3SqlActions({toolbarHost, fetcher = fetch, onLoaded, onStatus}) {
  if (!toolbarHost) return null;

  let currentWorkspace = '';
  let dbExists = false;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ocr-v3-import-btn';
  btn.textContent = '生成 V3 SQL';
  btn.title = '将工作区目录下 MinerUJSON 无损导入 SQL 基础表并编译生成逻辑表';
  btn.dataset.v3SqlState = 'unbound';
  btn.style.cssText = 'margin-left:8px;padding:2px 8px;font-size:12px;cursor:pointer;';

  const undoGroup = toolbarHost.querySelector('.ocr-source-undo-redo');
  if (undoGroup) {
    toolbarHost.insertBefore(btn, undoGroup);
  } else {
    toolbarHost.append(btn);
  }

  function syncButtonState() {
    if (!currentWorkspace) {
      btn.textContent = '生成 V3 SQL';
      btn.disabled = false;
      btn.dataset.v3SqlState = 'unbound';
      return;
    }
    if (dbExists) {
      btn.textContent = '已连 V3 SQL';
      btn.disabled = true;
      btn.dataset.v3SqlState = 'ready';
      return;
    }
    btn.textContent = '生成 V3 SQL';
    btn.disabled = false;
    btn.dataset.v3SqlState = 'missing';
  }

  async function inspectAndLoad(workspace) {
    if (!workspace) {
      currentWorkspace = '';
      dbExists = false;
      syncButtonState();
      return {exists: false};
    }
    currentWorkspace = workspace;
    const q = new URLSearchParams({workspace}).toString();
    const stateRes = await fetcher(`${API_BASE}state?${q}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!stateRes.ok) {
      dbExists = false;
      syncButtonState();
      onStatus?.(`V3 数据库状态检查失败（HTTP ${stateRes.status}）`, 'warning');
      return {exists: false};
    }
    const stateData = await stateRes.json();
    dbExists = Boolean(stateData?.exists);
    syncButtonState();
    if (!dbExists) {
      onStatus?.('当前目录尚未生成 ocr2md.v3.sqlite，请点击「生成 V3 SQL」', 'warning');
      return {exists: false};
    }
    const mdRes = await fetcher(`${API_BASE}markdown?${q}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!mdRes.ok) {
      onStatus?.(`V3 逻辑表读取失败（HTTP ${mdRes.status}）`, 'error');
      return {exists: true, loaded: false};
    }
    const snapshot = await mdRes.json();
    if (currentWorkspace === workspace) {
      await onLoaded?.(snapshot, workspace);
      onStatus?.(`✓ 已加载 V3 书籍（${snapshot.rowCount} 个逻辑块）`, 'ok');
    }
    return {exists: true, loaded: true, rowCount: snapshot.rowCount};
  }

  async function importFreshBook() {
    if (!currentWorkspace) {
      onStatus?.('请先在 settings.json 选定并验证工作区目录，再点击「生成 V3 SQL」', 'warning');
      return null;
    }
    if (dbExists) return null;
    btn.disabled = true;
    btn.textContent = '正在生成 V3 SQL…';
    onStatus?.('正在导入 MinerUJSON 到基础表并生成逻辑表（ocr2md.v3.sqlite）…');
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
        onStatus?.('生成 V3 SQL 失败：' + (data?.error || `HTTP ${res.status}`), 'error');
        syncButtonState();
        return null;
      }
      await inspectAndLoad(currentWorkspace);
      return data;
    } finally {
      syncButtonState();
    }
  }

  btn.addEventListener('click', () => {
    void importFreshBook();
  });

  syncButtonState();

  return Object.freeze({
    getState: () => ({workspace: currentWorkspace, dbExists}),
    inspectAndLoad,
    importFreshBook,
    dispose() {
      btn.remove();
    },
  });
}
