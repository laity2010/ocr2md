# WP19 · 滚动与高亮焦点分离

## 用户要求

滚动时，光标高亮不要自动跟随。这里的滚动包括源码 CM6、Markdown 预览、PDF 页滚动；光标高亮指当前逻辑 `logical_id`、AG/PDF/PBS/Markdown 选中状态、CM6 原生 selection。**滚动不是显式选择**。保留此前 V1 的源码/预览滚动位置同步和主动定位行为。

## 根因与修复位置

- 在 `ui/v2-pane-focus.js`，协调器同时监听 `viewStore.focusTarget`（用户明确点击/选择/定位）与 `viewStore.scrollTarget`（`ui/scroll-sync.js` 由滚轮、触摸、滚动位置同步发布的阅读位置）。旧代码错误地把 `scrollTarget.sourceLine` 映射为 `logicalId`，再发出 `v2-sync-focus`，导致 AG 自动切页、PDF 标签重新高亮、Markdown 高亮跟随滚动。
- WP19 仅删除 V2 专属 `scrollTarget -> v2-sync-focus` 桥接；`viewStore.scrollTarget` 继续让现有 **V1 `scroll-sync.js` 原模块**负责 CM6/Markdown 的滚动位置追随，绝不更改其坐标、滚轮驱动者与防回馈算法。
- 只在 `focusTarget` 发生变化时改变唯一高亮：AG 用户点击行、PDF 用户点击 PBS 标签、Markdown 用户点击渲染元素、CM6 用户移动光标或被明确命令定位。跨窗选中触发的滚动仍然可以将目标块带入视野，但不是“滚动导致改变选中块”。滚动不修改 CM6 selection、SQLite 两表或 PBS 排序。

## 验收

- `node tests/v2-mineru-base.browser.test.mjs`：在真实 V2 的 AG/CM6/Markdown 中，先显式选定逻辑块，再手动滚动 Markdown → CM6 阅读位置仍联动，`v2MarkdownPreviewPort.getFocusedId()`、CM6 selection、AG 高亮 PBS、当前 AG 页码与 `v2-sync-focus` 事件数均不变；随后反向滚动 CM6 → Markdown 滚动位置联动，而焦点仍完全不变；最后点 AG 行、Markdown 标题均能更换并恢复选中块。Chromium 和 iPad-WebKit 必须 PASS。
- `node tests/v2-real-markdown-preview.browser.test.mjs`：真实 22 页、267 逻辑块、V1 PDF.js 多轨 PBS 测试，在点击 PDF 标签选定 p0b0s0 后实际滚动 PDF 页，仍保持 PDF 选中 ID、Markdown 高亮、CM6 原生光标与 AG 选中 PBS 一致；其余 PDF/CM6/标题/公式/表格/拖动行为必须回归 PASS。Chromium/iPad-WebKit 均通过；未经过真实 iPad Safari 手指验收前不可冒充实机通过。
- 该航点**只动 V2 适配层和测试**；禁止复制、修改 V1/Frame 公共 scroll-sync 模块，禁止新增开关或第二份焦点状态，避免“取消滚动追随”误伤既有显式点击定位。
