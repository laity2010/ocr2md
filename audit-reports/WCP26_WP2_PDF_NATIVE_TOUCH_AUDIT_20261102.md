# WCP26 · 隔离复审发现 WebKit 三击测试驱动的动作等待（2026-11-02）

## 固定复审证据

独立 detached worktree `/Users/daisor/AgentDock/ocr2md-pdf-independent-58df7e1` 检出源码 `58df7e1bce2abdbf91d3ba8efb876deb14bc2b1b`，通过单独安装依赖、构建 minerujson-md 子包、校验同 SHA256 PDF 夹具，实际运行静态 AM/Python 43 测试与 Chrome/WebKit PDF 回归。缩放/224 覆盖框恢复双浏览器 PASS。原 `tests/pdf-block-join-toggle.browser.test.mjs` 的 iPad-WebKit 路径在 `p2b8` 的接续恢复步骤失败，记录到 3 个 click 真实时间戳 32137/34436/35073 ms；相邻间隔 **2299 ms、637 ms**，总跨度 2936 ms，确实未触发产品既定的 1850 ms 每次触摸门限。CMD 与 224 原始块仍完整，仍有 1 处接续而非数据丢失。所有原始 FAIL 证据均保留于该独立 worktree 的 ignored 审计日志。

## 原因和最小修正

旧测试 `tapThree()` 在触摸模式下对同一个标签连续 **await 3 次 `locator.tap()`**；Playwright 每次做 PDF.js 页面稳定性/actionability 等待，造成 2299 ms 不属于测试原本要表达的快速三击。产品本身没有自动把 3 个慢速单击合并为三击，符合防误操作门禁。

在 `tests/pdf-block-join-toggle.browser.test.mjs` 的 WebKit 测试分支：首次 `locator.tap()` 用于确认真实可点击目标、随后对当前真实标签中心点连续调用 `page.touchscreen.tap()`，仍发送**真实、受信任触摸事件**，不采用 `force:true`、DOM `el.click()`、放宽产品阈值或缩短原有功能断言。增加新的严格测试契约：`p2b8` 恢复必须实际产生恰好 3 次 click，且相邻真实浏览器事件间隔分别为 (0,1850] ms，避免把 Playwright 等待导致的迟到事件误认成三击产品故障。

## 修正后实证

- iPad-WebKit `PDF_NATIVE_TOUCH_TRIPLE_CADENCE_PASS`：真实 click 间隔 **43 ms / 65 ms**，完整接续/恢复/跨页/Undo `PDF_BLOCK_JOIN_TOGGLE_PASS`。
- Chrome 未改触摸机制，原三击/clickCount 及所有跨页等断言 `PDF_BLOCK_JOIN_TOGGLE_PASS`。
- 测试仅改 `tests/pdf-block-join-toggle.browser.test.mjs`，**业务代码 `ui/pdf-preview.js` 与 `ui/pdf-preview.css` 均未改**。

这证明此前新增 FAIL 是测试事件注入的时序失真，不表示允许产品对相隔 2.3 秒的单击当作一次三击。真实 iPad Safari 设备桥本轮无最近在线设备，仍为 `BLOCKED: REAL_IPAD_DEVICE_UNAVAILABLE`，不得以 Playwright 移动 WebKit 作为实机签字。Grok/Muse 外部独立代码审计尚无 ACK，不得称其外审完成。
