# V6 Lab · LaTeX 审阅值修改导致 Markdown 预览跳到章节首行（2026-10-26）

## 复现方式与截图
- 在公网/本地 Lab，导航到虚拟章节 `章节chapter/001-Buffett-s-Alpha`，AG 勾选「全部」并选择 LaTeX。手动把 MD 预览滚至 scrollTop=840px，再**真实鼠标/触摸控件点击**第 2 行审阅下拉，选择 `latex`；记录立即/100/350/850/1450/2200ms 的真实 DOM `scrollTop`，并在修改前后截图。
- **原故障真实复现**：Chrome `840 -> 0` (350ms 内)，iPad WebKit `840 -> 0` (100ms 内)。截图显示 MD 由章节中段跳到标题/作者的首屏，然而源文件导航和 AG 项数未变化。
- DOM scrollTop setter 抓到两个独立根因：
  1. 审阅写入使同章 `scope.from/to` 重新计算，延迟 AG 查询发布没有 `reason` 的 `ocr2md:wp4-virtual-scope`，WCP `onPreviewInit` 不区分同章节边界微调和真实章节导航，调用 `previewPort.repaint()`，它有意执行 `mdPane.scrollTop=0`。
  2. 真实 WebKit 测试中，滚动协调器把外部 AG 审阅写入当作 CM6 主导的同步渲染，`beforeRender/afterRender` 反而将 MD 移至源码窗（章节开头）。此行为在滚动事件来自原生 touch/mouse wheel 时有时隐藏，故原先仅看单元格 DOM 的验收未发现。

## 修复
- `c794edb`：Lab WCP `onPreviewInit` 记住章节 ID，同一章节仅更新新 scope 而不触发导航型 `repaint()`；切换到不同章节才执行回到章节顶部。
- `a996a41`：`ui/scroll-sync.js` 在 CM6 未聚焦且 `documentRevision` 已变化时将 Markdown 视为本次被动编辑的滚动位置来源；直接在 CM6 打字继续保持 CM6 主导逻辑。显式导航和共享焦点不变。
- 未更改保存、CMD 唯一写入、正文原始数据、HTTP、正式发布或 AG/WCP 接口。

## 自动化点击 + 截图验收
- 用 `labs/cm-html/wp0-2/latex-review-scroll-screenshot.browser.test.mjs` 在**真实 Chrome 与移动模拟 iPad WebKit**，分别测试本地 Lab 和公网 Cloudflare Lab。
- 两种引擎、两种入口均通过：前 840px → 改审阅为 `latex` → 15/100/350/850/1450/2200ms **全部保持 840px**，AG 仍 42 行，仍在章节 001，没有弹保存及业务 API 写入。
- 实际再次选源导航另外一章：Chrome、iPad WebKit 均 `840 → 0px`，说明显式导航回顶部的既有行为保留。
- 对截图的 MD 视口区域做逐像素对比：Chrome 与 iPad WebKit 两组「改前/改后」图均**像素完全相同**（Pillow ImageChops diff bbox 为 None）。证据：`audit-reports/screenshots/latex-scroll-compare-Chrome.png`、`latex-scroll-compare-iPad-WebKit.png`；四张完整点击前后图保存在同目录。
- 回归：`latex-preview-flicker.browser.test.mjs` 与 `ag-all-cross-chapter-focus.browser.test.mjs` 本地 Chrome / iPad WebKit PASS，KaTeX 预览 DOM 保留、媒体/公式/标题跨虚拟章节定位和预览焦点不退化。
- Lab 版本 `v6-lab-cm-html-20261026-220724`，部署 `https://ocr2md.laity.bid/labs/cm-html/`；功能提交为 `c794edb` 和 `a996a41`。截图和专项测试提交见紧随提交。**正式版**仍 `v6-20261026-102651`，Lab 母 Markdown SHA-256 `33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc` 未变化。

## 边界
- WebKit 是浏览器自动化 iPad 设备模拟，不等于用户真实 Safari 手工验收；本次测试是审阅和滚动的有界回归，不替代 WP8 Grok/Muse 审计。正式主线不合并，遵从实验分支规则。
