# WCP26 · PDF 文本块覆盖框生命周期定点修复（2026-11-02）

## 用户指定范围

用户决定：**非法断行重扫暂停开发**；以后该功能归入 CMD 核心的「文本块」模块，并按 WCP/CMD 统一接口处理分句后的非法断行。本轮不移动该模块、不修它的旧实现、不取消或伪造任何失败测试；主目标改为 PDF 原始文本块覆盖框稳定性。

## 冻结失败与局部机制

`cc84b6d` 冻结审计的 `tests/pdf-coverage-zoom-browser.test.mjs` 在缩放后捕捉到 DOM 覆盖节点数量 `0`，而原始 bbox 对应 `224` 个 Block；旧日志没有页面 DOM 生命周期快照，无法区分 PDF.js 重建页面与应用重载，因此**不能宣称这个旧例已经找到唯一根因**。新版只增设由 PDF 预览器自身掌管的弹性恢复机制，不引入第二套文本块数据。

`ui/pdf-preview.js`：

- 在 PDF.js `setZoom()` 更新/重排页面布局后，**同步核对并挂载**原来由 CMD 提供的文本块 overlay，不等待可能没有触发的 `pagerendered`。
- 页面 DOM 若在重排、分页过程中被移除，`MutationObserver` 仅监视属于 PDF 页面、覆盖节点的 childList 变化；发现节点已不在当前 PDF Viewer 容器里时，同一个 microtask 内按已有 `blockCoverageNodes` 和原 bbox 重挂；不为普通 canvas、text layer、标签属性更改重画。
- 覆盖关闭时 `blockCoverageRows` 为空，Observer 不能悄悄重新打开；`dispose()` 必须断开观察器，避免旧 Viewer 和新 Viewer 争抢覆盖层。
- 非法/已脱离页面不会被当作有效 PDF 页贴标。原始 pNbN ID、子块/父块、勾选状态、虚线标签、全页编号、编辑 Undo 均由原有模块保留；不读写独立的 Markdown/PDF 数据副本。

`tests/pdf-coverage-zoom-browser.test.mjs`：

- 保留四次缩放时的原即时 224 数量、页 17 阅读锚点、位置漂移上限、MD/PDF 独立开关、拆分视图、两窗覆盖、原文件哈希与 runtime-error-empty 断言。
- 新增真实浏览器操作：从 PDF 第 17 页实际卸下该页覆盖框节点，确认确实不再齐全；页面 DOM 观察器必须自动恢复到 224，而且验证原 `p16b0` **节点身份、checkbox 状态、bbox style 完全不变**。该修复不是修补测试数据，也不通过轮询重新执行测试动作。
- Vite 测试服务和异步工具栏会偶发未及时就绪：通过 DOM 对象明确挂载后继续原断言；如果仍未出现，保留 FAIL 和服务启动诊断日志，不能忽略。

## 本轮验收状态

局部 Chrome 和 Playwright WebKit（模拟移动浏览器，不等于 iPad Safari 实机）在新增节点脱离恢复及原完整缩放/拆分路径上分别 PASS；其余旧版 PDF 拖动/三击接续独立回归另行运行、结果必须单独保留。未做 Main 晋升或发布。

`1c0745e` 的跨模块标准全量审计之前已独立启动，但在用户重排优先级之后被明确暂停并保全 `wp2-standard-1c0745e/interrupted-pdf-priority-console.log`；这是**未完成**的冻结审计，期间非法断行及 LaTeX 的 FAIL 不得说成通过。新的 PDF 代码与测试尚未获得新 SHA 全量合格证书；需要单独再审。

## PDF.js 页面加载层遮挡原标签的独立修复

覆盖层回归发现 `pdf-block-join-toggle.browser.test.mjs` 原本可能在跨页到 `p9b0` 时因 PDF.js `.page.loadingIcon.loading` 正在装载而无法完成真实点击：Playwright 明确报告 Page 10 region 抢占了目标控件的 pointer events。这与原始覆盖 DOM 被移除是不同故障；为保持原生手势，不得靠 `force:true` 测试强制点击解决。

`ui/pdf-preview.css` 将仍在加载的 PDF page 设为 `pointer-events:none`，保留其上 CMD 父块/子块标签 `pointer-events:auto`。加载状态结束后正常页面命中不变，亦不影响预览层本身只读几何显示。`tests/pdf-block-join-toggle.browser.test.mjs` 专门合成真实 loading CSS 状态，检查目标 `p9b0` 经 `document.elementFromPoint` 命中真实块标签，恢复原状态后再按原方法完成三次真实点击、跨页接续、Undo，**未减少或替换**旧断言。

## 真实局部回归矩阵（同一当前整合 worktree）

| 真实场景 | Chrome | Playwright iPad-WebKit |
|---|---|---|
| PDF 缩放与手动解除 DOM 覆盖、自动恢复原节点/bbox/checkbox/224 块；原文不改 | PASS | PASS |
| PDF 原始块重排、跨栏移动、编号、真实手势三击、Undo | PASS | PASS |
| PDF 单击、三击 CMD 接续/恢复、跨页与 loading 状态不遮挡 | PASS | PASS |
| AM 模块边界静态检查和 Python 原有 43 测试 | PASS（1 skipped） | 非浏览器测试 |

浏览器运行日志（本机 ignored 审计目录）：

- `.v6/audit-reports/wp2-coverage-lifecycle/zoom-chrome-diagnostic.log`
- `.v6/audit-reports/wp2-coverage-lifecycle/zoom-webkit-retry.log`
- `.v6/audit-reports/wp2-coverage-lifecycle/pdf-block-reorder.browser.test.mjs.log`
- `.v6/audit-reports/wp2-coverage-lifecycle/join-after-loading-css.log`
- `.v6/audit-reports/wp2-coverage-lifecycle/am-check.log` 与 `am-python.log`

在这轮专项验收中 PDF 相关已测问题局部 PASS；用户指定延期的非法断行与全量其他模块旧 FAIL 仍保留为未关闭审计事项。`1c0745e` 原全量门禁因用户调整优先级而**人为暂停**，已记录未完成证据，不得称其 PASS。整合分支的 PDF 修复应当冻结新 SHA 后进行同源 AM/Git 全量审计与后续独立 Linux、iPad Safari 实机验收，才能判断是否达到 Main 晋升/发布标准。
