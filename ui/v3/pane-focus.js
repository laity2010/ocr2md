/** WP05 · 显式多窗聚焦控制器（严格分离阅读滚动与高亮焦点）。
 *
 * 遵循 CM.md 第 5 节 & VIEWS.md 第 2 节：
 * 1. 阅读滚动同步绝不更新 focusTarget、不抢夺光标、不触发写盘；
 * 2. 仅接受显式点击/选区变更（AG/CM6/MD/PDF）派发 v3-focus-changed。
 */

let currentFocus = null;

export function getV3Focus() {
  return currentFocus;
}

export function focusV3LogicalBlock(logicalId, {source = 'unknown', sourceLine = null, reveal = true} = {}) {
  const id = Number(logicalId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  currentFocus = Object.freeze({
    logicalId: id,
    source,
    sourceLine: Number.isInteger(sourceLine) && sourceLine > 0 ? sourceLine : null,
    reveal: Boolean(reveal),
    at: Date.now(),
  });
  document.dispatchEvent(new CustomEvent('v3-focus-changed', {detail: currentFocus}));
  return currentFocus;
}

export function clearV3Focus() {
  currentFocus = null;
  document.dispatchEvent(new CustomEvent('v3-focus-changed', {detail: null}));
}
