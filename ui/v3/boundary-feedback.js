/** WP04 · 跨块受保护事务拦截时的轻量非阻塞视觉反馈。
 *
 * 遵循 CM.md 第 5 节：在拦截跨块编辑或尾换行保护线时，为目标物理行添加
 * 短暂淡色高亮闪烁 Decoration（不抢占焦点、不弹窗阻塞、不修改文档正文），
 * 避免 iPad Safari 触控端误判为输入无响应。
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

/** 触发一次轻量非阻塞行闪烁提示，420ms 后自动清除。 */
export function createBoundaryFlashController() {
  let timerId = null;
  return {
    flash(view, pos) {
      if (!view) return;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      view.dispatch({
        effects: v3BoundaryFlashEffect.of(pos),
      });
      timerId = setTimeout(() => {
        timerId = null;
        try {
          view.dispatch({
            effects: v3BoundaryFlashEffect.of(null),
          });
        } catch {
          // 视图已销毁时忽略
        }
      }, 420);
    },
    dispose() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
  };
}
