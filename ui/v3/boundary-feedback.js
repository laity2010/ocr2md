/** WP04B · 跨块受保护事务拦截时的轻量非阻塞视觉反馈。
 *
 * 遵循 CM.md 第 5 节：使用 queueMicrotask 异步派发边界行闪烁 Decoration，
 * 绝不在 CM6 transactionFilter 同步执行栈中嵌套 view.dispatch()。
 */
import {StateEffect, StateField} from '@codemirror/state';
import {Decoration, EditorView} from '@codemirror/view';

export const v3BoundaryFlashEffect = StateEffect.define();

const boundaryFlashMark = Decoration.line({
  attributes: {class: 'cm-v3-boundary-blocked-line'},
});

export const v3BoundaryFlashField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    let next = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(v3BoundaryFlashEffect)) {
        if (effect.value == null) {
          next = Decoration.none;
        } else {
          const pos = Math.max(0, Math.min(effect.value, tr.newDoc.length));
          const line = tr.newDoc.lineAt(pos);
          next = Decoration.set([boundaryFlashMark.range(line.from)]);
        }
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const v3BoundaryFlashTheme = EditorView.baseTheme({
  '.cm-v3-boundary-blocked-line': {
    backgroundColor: 'rgba(230, 126, 128, 0.18)',
    transition: 'background-color 360ms ease-out',
  },
});

/** 触发一次异步微任务派发的轻量非阻塞行闪烁提示，420ms 后自动清除。 */
export function createBoundaryFlashController() {
  let timerId = null;
  let disposed = false;
  return {
    flash(view, pos) {
      if (!view || disposed) return;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      queueMicrotask(() => {
        if (disposed) return;
        try {
          view.dispatch({
            effects: v3BoundaryFlashEffect.of(pos),
          });
        } catch {
          return;
        }
        timerId = setTimeout(() => {
          timerId = null;
          if (disposed) return;
          try {
            view.dispatch({
              effects: v3BoundaryFlashEffect.of(null),
            });
          } catch {
            // 视图已销毁时忽略
          }
        }, 420);
      });
    },
    dispose() {
      disposed = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
  };
}
