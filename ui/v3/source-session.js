/** WP04B · V3 单源 CM6 会话、增量脏追踪与 850ms 空闲摘要式 md-commit。
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
import {EditorView, keymap} from '@codemirror/view';

import {
  buildInitialStructureState,
  createV3OwnedTransactionFilter,
  v3ApplyStructureMoveEffect,
  v3LoadStructureEffect,
  v3StructureCommitAnnotation,
  v3StructureField,
  v3StructureHistoryExtension,
} from './cm-structure.js';
import {createV3MdLineIndex} from './md-line-index.js';
import {
  createBoundaryFlashController,
  v3BoundaryFlashField,
  v3BoundaryFlashTheme,
} from './boundary-feedback.js';
import {createV3LineGutter} from './line-gutter.js';
import {focusV3LogicalBlock} from './pane-focus.js';
import {planLocalStructureMove} from './structure-move.js';

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
  let cachedLineIndexRev = -1;
  let savedStructureSha256 = '';
  const savedStructureSnap = new Map();
  const dirtyIds = new Set();
  const savedHashes = new Map();
  const listeners = new Set();
  const flashCtrl = createBoundaryFlashController();

  function captureStructureSnap(blocks) {
    savedStructureSnap.clear();
    for (const b of blocks) {
      savedStructureSnap.set(b.logicalId, {
        parentId: b.parentId ?? null,
        logicalOrder: b.logicalOrder,
        p: b.p,
        b: b.b,
        s: b.s,
      });
    }
  }

  function hasStructureChanges(blocks) {
    for (const b of blocks) {
      const prev = savedStructureSnap.get(b.logicalId);
      if (
        !prev ||
        prev.parentId !== (b.parentId ?? null) ||
        prev.logicalOrder !== b.logicalOrder ||
        prev.p !== b.p ||
        prev.b !== b.b ||
        prev.s !== b.s
      ) {
        return true;
      }
    }
    return false;
  }

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

  function getLineIndex(stateArg) {
    const targetState = stateArg || view.state;
    const struct = targetState.field(v3StructureField);
    if (!cachedLineIndex || cachedLineIndexRev !== struct.revision) {
      cachedLineIndex = createV3MdLineIndex(targetState.doc, struct);
      cachedLineIndexRev = struct.revision;
    }
    return cachedLineIndex;
  }

  function scheduleIdleSave() {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    const blocks = view.state.field(v3StructureField).blocks;
    if (!workspacePath || (dirtyIds.size === 0 && !hasStructureChanges(blocks))) return;
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
      queueMicrotask(() => {
        document.dispatchEvent(
          new CustomEvent('v3-boundary-blocked', {detail: {pos, reason}}),
        );
      });
    },
  });

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      cachedLineIndex = null;
      let loaded = false;
      let structureMoved = false;
      for (const tr of update.transactions) {
        for (const eff of tr.effects) {
          if (eff.is(v3LoadStructureEffect)) {
            loaded = true;
            dirtyIds.clear();
          } else if (eff.is(v3ApplyStructureMoveEffect)) {
            structureMoved = true;
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
        type: structureMoved ? 'structureMoved' : loaded ? 'loaded' : 'docChanged',
        dirty: dirtyIds.size > 0 || hasStructureChanges(curStruct.blocks),
        revision: curStruct.revision,
      });
    } else if (update.selectionSet) {
      const head = update.state.selection.main.head;
      const idx = getLineIndex();
      const row = idx.atOffset(Math.min(head, Math.max(0, update.state.doc.length - 1)));
      if (row) {
        focusV3LogicalBlock(row.logicalId, {source: 'cm6', sourceLine: row.sourceLine, reveal: false});
      }
    }
  });

  const lineGutter = createV3LineGutter({
    getLineIndex,
    onQuoteAdjust(row, delta) {
      const nextLine = delta > 0 ? '>' + row.mdLine : row.mdLine.replace(/^>/, '');
      if (nextLine === row.mdLine) return;
      view.dispatch({
        changes: {from: row.from, to: row.textTo, insert: nextLine},
        scrollIntoView: false,
      });
    },
    onExtractText(row, mode, text) {
      if (!text) return;
      if (mode === 'replace') {
        view.dispatch({
          changes: {from: row.from, to: row.textTo, insert: text},
          effects: view.scrollSnapshot(),
        });
      } else {
        const head = view.state.selection.main.head;
        const pos = head >= row.from && head <= row.textTo ? head : row.textTo;
        view.dispatch({
          changes: {from: pos, to: pos, insert: text},
          effects: view.scrollSnapshot(),
        });
      }
    },
  });

  const view = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        v3StructureField,
        v3StructureHistoryExtension,
        v3BoundaryFlashField,
        v3BoundaryFlashTheme,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        lineGutter,
        EditorView.lineWrapping,
        ownedFilter,
        updateListener,
      ],
    }),
    parent: host,
  });

  const onFocusChanged = (event) => {
    const detail = event.detail;
    if (!detail || detail.source === 'cm6') return;
    const block = view.state.field(v3StructureField).blocks.find((b) => b.logicalId === detail.logicalId);
    if (!block) return;
    const anchor = detail.sourceLine
      ? getLineIndex().atSourceLine(detail.sourceLine)?.from ?? block.from
      : block.from;
    view.dispatch({
      selection: {anchor},
      scrollIntoView: detail.reveal !== false,
    });
  };
  document.addEventListener('v3-focus-changed', onFocusChanged);

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
    savedStructureSha256 = nextStruct.structureSha256;
    captureStructureSnap(nextStruct.blocks);
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

  function applyStructureMove(intent) {
    const prevStruct = view.state.field(v3StructureField);
    const plan = planLocalStructureMove(view.state.doc, prevStruct, intent);
    if (plan.unchanged) {
      return {unchanged: true};
    }
    view.dispatch({
      changes: plan.changes,
      annotations: v3StructureCommitAnnotation.of(true),
      effects: [
        v3ApplyStructureMoveEffect.of({prevStruct, nextStruct: plan.nextStruct}),
        view.scrollSnapshot(),
      ],
    });
    return {unchanged: false, revision: plan.nextStruct.revision};
  }

  async function saveNow({reason = 'manual'} = {}) {
    if (savingPromise) return savingPromise;
    if (!workspacePath) {
      return {saved: false, skipped: 'no-workspace'};
    }
    const curBlocksSnapshot = view.state.field(v3StructureField).blocks;
    if (dirtyIds.size === 0 && !hasStructureChanges(curBlocksSnapshot)) {
      return {saved: true, changedRows: 0, skipped: 'clean'};
    }

    const run = async () => {
      const stateSnapshot = view.state;
      const struct = stateSnapshot.field(v3StructureField);
      const doc = stateSnapshot.doc;

      if (hasStructureChanges(struct.blocks)) {
        const structChanges = [];
        for (const b of struct.blocks) {
          const prev = savedStructureSnap.get(b.logicalId);
          const cur = {
            parentId: b.parentId ?? null,
            logicalOrder: b.logicalOrder,
            p: b.p,
            b: b.b,
            s: b.s,
          };
          if (
            !prev ||
            prev.parentId !== cur.parentId ||
            prev.logicalOrder !== cur.logicalOrder ||
            prev.p !== cur.p ||
            prev.b !== cur.b ||
            prev.s !== cur.s
          ) {
            structChanges.push({logicalId: b.logicalId, before: prev, after: cur});
          }
        }

        const prevOrdered = Array.from(savedStructureSnap.entries())
          .map(([logicalId, s]) => ({logicalId, ...s}))
          .sort((a, b) => a.logicalOrder - b.logicalOrder);
        const oldSucc = new Map();
        for (let i = 0; i < prevOrdered.length; i += 1) {
          const nxt = i + 1 < prevOrdered.length ? prevOrdered[i + 1] : null;
          oldSucc.set(
            prevOrdered[i].logicalId,
            nxt && nxt.p === prevOrdered[i].p && nxt.b === prevOrdered[i].b ? nxt.logicalId : null,
          );
        }
        const newSucc = new Map();
        for (let i = 0; i < struct.blocks.length; i += 1) {
          const nxt = i + 1 < struct.blocks.length ? struct.blocks[i + 1] : null;
          newSucc.set(
            struct.blocks[i].logicalId,
            nxt && nxt.p === struct.blocks[i].p && nxt.b === struct.blocks[i].b ? nxt.logicalId : null,
          );
        }

        const boundaryChecks = [];
        for (const [lid, succ] of oldSucc.entries()) {
          if (succ !== newSucc.get(lid)) {
            const bSha = savedHashes.get(lid);
            if (bSha) boundaryChecks.push({logicalId: lid, beforeSha256: bSha});
          }
        }

        const textChanges = [];
        const submittedText = new Map();
        for (const b of struct.blocks) {
          const afterText = doc.sliceString(b.from, b.to);
          const beforeSha = savedHashes.get(b.logicalId);
          if (!beforeSha) continue;
          const afterSha = await sha256HexUtf8(afterText);
          if (afterSha !== beforeSha) {
            textChanges.push({logicalId: b.logicalId, beforeSha256: beforeSha, after: afterText});
            submittedText.set(b.logicalId, {afterText, afterSha});
          }
        }

        publishStatus(reason === 'idle' ? '正在增量保存 V3 结构…' : '正在保存 V3 结构…');
        const res = await fetcher(`${API_BASE}structure-commit`, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            workspace: workspacePath,
            confirm: 'commit-v3-structure',
            structureSha256: savedStructureSha256,
            changes: structChanges,
            textChanges,
            boundaryChecks,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const errMsg = data?.error || `HTTP ${res.status}`;
          publishStatus(`结构保存冲突，已保留当前编辑：${errMsg}`, 'error');
          return {saved: false, status: res.status, error: errMsg};
        }

        savedStructureSha256 = data.structureSha256 || savedStructureSha256;
        captureStructureSnap(struct.blocks);
        for (const [lid, info] of submittedText.entries()) {
          savedHashes.set(lid, data?.updatedHashes?.[String(lid)] || info.afterSha);
          dirtyIds.delete(lid);
        }
        publishStatus(`✓ 已增量保存结构（${structChanges.length} 块）`, 'ok');
        notifyListeners({type: 'saved', dirty: false, revision: view.state.field(v3StructureField).revision});
        return data;
      }

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
        publishStatus(`保存冲突，已保留当前编辑：${errMsg}`, 'error');
        return {saved: false, status: res.status, error: errMsg};
      }

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
      dirty: dirtyIds.size > 0 || hasStructureChanges(view.state.field(v3StructureField).blocks),
      structureDirty: hasStructureChanges(view.state.field(v3StructureField).blocks),
      dirtyLogicalIds: Array.from(dirtyIds),
      revision: view.state.field(v3StructureField).revision,
      structureSha256: savedStructureSha256 || view.state.field(v3StructureField).structureSha256,
    }),
    loadSnapshot,
    applyStructureMove,
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
      document.removeEventListener('v3-focus-changed', onFocusChanged);
      undoBtn?.removeEventListener('click', onUndoClick);
      redoBtn?.removeEventListener('click', onRedoClick);
      delete host.v3SourcePort;
      view.destroy();
    },
    layout: () => view.requestMeasure(),
  };
}
