/** WP04 · V3 单源 CM6 会话、增量脏追踪与 850ms 空闲摘要式 md-commit。
 *
 * 严格遵循 CM.md 第 1、4 节与 SQL.md 第 4 节：
 * 1. Zero Shadow Cache：所有正文与结构均直接从唯一 EditorState 读取，绝不维护外部可变副本；
 * 2. 增量脏追踪：仅追踪受变更影响的 logicalId 集合及各块已保存 SHA-256 基线；
 * 3. 850ms 空闲增量保存：对接 /labs/lab-ocr-v3/api/mineru-base/md-commit，
 *    发送 structureSha256 + {logicalId, beforeSha256, after}，409 冲突保留内存不丢失。
 */
import {defaultKeymap, history, historyKeymap, redo, redoDepth, undo, undoDepth} from '@codemirror/commands';
import {markdown} from '@codemirror/lang-markdown';
import {EditorState, Transaction} from '@codemirror/state';
import {EditorView, keymap, lineNumbers} from '@codemirror/view';

import {
  buildInitialStructureState,
  createV3OwnedTransactionFilter,
  v3ApplyOwnedEditEffect,
  v3LoadStructureEffect,
  v3StructureField,
} from './cm-structure.js';
import {createV3MdLineIndex} from './md-line-index.js';
import {
  createBoundaryFlashController,
  v3BoundaryFlashField,
  v3BoundaryFlashTheme,
} from './boundary-feedback.js';

const IDLE_SAVE_MS = 850;
const API_BASE = '/labs/lab-ocr-v3/api/mineru-base/';

async function sha256HexUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 挂载 V3 单源 CM6 源码会话至 Frame 提供的 #editor 宿主节点。 */
export function mountV3Source(host, {fetcher = fetch, idleMs = IDLE_SAVE_MS, onStatus} = {}) {
  let workspacePath = '';
  let idleTimer = null;
  let savingPromise = null;
  let cachedLineIndex = null;
  const dirtyIds = new Set();
  const savedHashes = new Map();
  const listeners = new Set();
  const flashCtrl = createBoundaryFlashController();

  const publishStatus = (msg, kind = 'info') => {
    if (typeof onStatus === 'function') {
      onStatus(msg, kind);
    } else {
      document.dispatchEvent(new CustomEvent('v3-source-status', {detail: {message: msg, kind}}));
    }
  };

  const notifyListeners = (detail) => {
    for (const fn of listeners) {
      try {
        fn(detail);
      } catch {
        // 隔离下游监听异常，不破坏编辑器状态流
      }
    }
    document.dispatchEvent(new CustomEvent('v3-source-updated', {detail}));
  };

  function getLineIndex() {
    const struct = view.state.field(v3StructureField);
    if (!cachedLineIndex || cachedLineIndex._stateRev !== struct.revision) {
      const idx = createV3MdLineIndex(view.state.doc, struct);
      cachedLineIndex = Object.assign(idx, {_stateRev: struct.revision});
    }
    return cachedLineIndex;
  }

  function scheduleIdleSave() {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (!workspacePath || dirtyIds.size === 0) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      void saveNow({reason: 'idle'});
    }, idleMs);
  }

  function updateUndoRedoButtons() {
    const pane = host.closest('.ocr-source-pane') || document;
    const undoBtn = pane.querySelector('#undo');
    const redoBtn = pane.querySelector('#redo');
    const hasDoc = view.state.field(v3StructureField).blocks.length > 0;
    if (undoBtn) {
      undoBtn.disabled = !hasDoc || undoDepth(view.state) === 0;
      undoBtn.title = undoBtn.disabled ? '无可撤销操作' : '撤销 (Undo)';
    }
    if (redoBtn) {
      redoBtn.disabled = !hasDoc || redoDepth(view.state) === 0;
      redoBtn.title = redoBtn.disabled ? '无可重做操作' : '重做 (Redo)';
    }
  }

  const ownedFilter = createV3OwnedTransactionFilter({
    onBoundaryBlocked: ({pos, reason}) => {
      flashCtrl.flash(view, pos);
      publishStatus(reason, 'warning');
      document.dispatchEvent(
        new CustomEvent('v3-boundary-blocked', {detail: {pos, reason}}),
      );
    },
  });

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      cachedLineIndex = null;
      let loaded = false;
      for (const tr of update.transactions) {
        for (const eff of tr.effects) {
          if (eff.is(v3LoadStructureEffect)) {
            loaded = true;
            dirtyIds.clear();
          }
        }
      }
      const curStruct = view.state.field(v3StructureField);
      if (!loaded) {
        const changed = curStruct.lastChangedLogicalIds || [];
        for (const lid of changed) {
          dirtyIds.add(lid);
        }
      }
      scheduleIdleSave();
      updateUndoRedoButtons();
      notifyListeners({
        type: 'docChanged',
        dirty: dirtyIds.size > 0,
        revision: curStruct.revision,
      });
    }
  });

  const view = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        v3StructureField,
        v3BoundaryFlashField,
        v3BoundaryFlashTheme,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        lineNumbers(),
        EditorView.lineWrapping,
        ownedFilter,
        updateListener,
      ],
    }),
    parent: host,
  });

  // 绑定 Frame 原生工具栏中的 #undo / #redo 按钮
  const sourcePane = host.closest('.ocr-source-pane');
  const undoBtn = sourcePane?.querySelector('#undo');
  const redoBtn = sourcePane?.querySelector('#redo');
  const onUndoClick = () => {
    undo(view);
    view.focus();
  };
  const onRedoClick = () => {
    redo(view);
    view.focus();
  };
  undoBtn?.addEventListener('click', onUndoClick);
  redoBtn?.addEventListener('click', onRedoClick);

  async function loadSnapshot(snapshot, {workspace = ''} = {}) {
    workspacePath = workspace;
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    const nextStruct = buildInitialStructureState(
      snapshot,
      view.state.field(v3StructureField).revision + 1,
    );
    savedHashes.clear();
    for (const seg of snapshot.segments) {
      savedHashes.set(seg.logicalId, seg.fragmentSha256);
    }
    dirtyIds.clear();
    cachedLineIndex = null;

    view.dispatch({
      changes: {from: 0, to: view.state.doc.length, insert: snapshot.markdown},
      effects: v3LoadStructureEffect.of(nextStruct),
      annotations: Transaction.addToHistory.of(false),
    });
    updateUndoRedoButtons();
    notifyListeners({type: 'loaded', dirty: false, revision: nextStruct.revision});
    return nextStruct;
  }

  async function saveNow({reason = 'manual'} = {}) {
    if (savingPromise) return savingPromise;
    if (!workspacePath) {
      return {saved: false, skipped: 'no-workspace'};
    }
    if (dirtyIds.size === 0) {
      return {saved: true, changedRows: 0, skipped: 'clean'};
    }

    const run = async () => {
      const stateSnapshot = view.state;
      const struct = stateSnapshot.field(v3StructureField);
      const doc = stateSnapshot.doc;
      const byId = new Map();
      for (const b of struct.blocks) {
        byId.set(b.logicalId, b);
      }

      const targetIds = Array.from(dirtyIds);
      const changes = [];
      const submittedContent = new Map();

      for (const lid of targetIds) {
        const b = byId.get(lid);
        if (!b) continue;
        const afterText = doc.sliceString(b.from, b.to);
        const beforeSha = savedHashes.get(lid);
        if (!beforeSha) continue;
        const afterSha = await sha256HexUtf8(afterText);
        if (afterSha === beforeSha) {
          dirtyIds.delete(lid);
          continue;
        }
        changes.push({
          logicalId: lid,
          beforeSha256: beforeSha,
          after: afterText,
        });
        submittedContent.set(lid, {afterText, afterSha});
      }

      if (changes.length === 0) {
        notifyListeners({type: 'saved', dirty: dirtyIds.size > 0, revision: struct.revision});
        return {saved: true, changedRows: 0, skipped: 'unchanged'};
      }

      publishStatus(reason === 'idle' ? '正在增量保存 V3 正文…' : '正在保存 V3 正文…');
      const res = await fetcher(`${API_BASE}md-commit`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          workspace: workspacePath,
          confirm: 'commit-v3-md',
          structureSha256: struct.structureSha256,
          changes,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const errMsg = data?.error || `HTTP ${res.status}`;
        // 冲突或失败时保留 CM6 内存与 dirtyIds，绝不静默丢弃用户编辑
        publishStatus(`保存冲突，已保留当前编辑：${errMsg}`, 'error');
        return {saved: false, status: res.status, error: errMsg};
      }

      // 仅当当前 CM6 中该块仍等于本次提交正文时才清除该块脏标记，防止保存期间二次按键丢失
      const latestState = view.state;
      const latestById = new Map(
        latestState.field(v3StructureField).blocks.map((b) => [b.logicalId, b]),
      );
      for (const [lid, info] of submittedContent.entries()) {
        savedHashes.set(lid, data?.updatedHashes?.[String(lid)] || info.afterSha);
        const curBlock = latestById.get(lid);
        if (curBlock && latestState.doc.sliceString(curBlock.from, curBlock.to) === info.afterText) {
          dirtyIds.delete(lid);
        }
      }

      if (dirtyIds.size > 0) {
        scheduleIdleSave();
      }
      publishStatus(`✓ 已增量保存 ${changes.length} 个逻辑块`, 'ok');
      notifyListeners({
        type: 'saved',
        dirty: dirtyIds.size > 0,
        revision: latestState.field(v3StructureField).revision,
      });
      return data;
    };

    savingPromise = run().finally(() => {
      savingPromise = null;
    });
    return savingPromise;
  }

  const port = Object.freeze({
    getView: () => view,
    getDoc: () => view.state.doc,
    getStructure: () => view.state.field(v3StructureField),
    getLineIndex,
    getState: () => ({
      workspace: workspacePath,
      dirty: dirtyIds.size > 0,
      dirtyLogicalIds: Array.from(dirtyIds),
      revision: view.state.field(v3StructureField).revision,
      structureSha256: view.state.field(v3StructureField).structureSha256,
    }),
    loadSnapshot,
    saveNow,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  });

  host.v3SourcePort = port;
  document.dispatchEvent(new CustomEvent('v3-source-ready', {detail: {host, port}}));

  return {
    dispose() {
      if (idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      flashCtrl.dispose();
      undoBtn?.removeEventListener('click', onUndoClick);
      redoBtn?.removeEventListener('click', onRedoClick);
      delete host.v3SourcePort;
      view.destroy();
    },
    layout: () => view.requestMeasure(),
  };
}
