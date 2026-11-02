# OCR2MD WCP26 · WP2/4 全量门禁和 WebKit 复核（2026-11-02）

## 冻结审计的事实（禁止被后续复跑覆盖）

- 固定源 SHA：`60d47b8ac3f1e1b544810553babce523edd173f0`，隔离 worktree `ocr2md-am-60d47b8a-isolated`，源 PDF/MD 原始哈希预检通过。
- 91 套 AM 行为测试：**87 PASS，4 FAIL**；345 条契约：**331 PASS / 14 未获 PASS**。正式 runner exit=1。
- 失败套件：
  1. `chapter-live-navigation.browser.test.mjs`：Chrome PASS，WebKit 在章节选项恢复后 `:visible` 观测偶然为 0，内部选项和真实打开弹层均正常。
  2. `illegal-break-rescan-real.browser.test.mjs`：Chrome 原始跑批时模块退回 `chapter-boundary`，无 Worker 消息，重扫超时。
  3. `pdf-block-join-toggle.browser.test.mjs`：WebKit 真实空白块第二次三击恢复，等待 224 块状态超时。
  4. `text-block-review.browser.test.mjs`：同页 PDF 双框概览未在 17 秒内同时进入 viewport。
- 原始全量日志：`.v6/audit-reports/wp2-standard-60d47b8/console.log`；每套真实证据位于冻结工作树的 `.v6/tests/am-full-20261101T144101Z-60d47b8a-<number>-*.log`。
- **标准报告必须来自审计冻结 SHA。** 使用冻结树 `standard_audit.py` 重生成 `frozen-source-report/report.json`，结果 `FAIL`，原因仅为 `AUDIT_RUNNER_NONZERO`、`AM_RESULTS_INCOMPLETE`；不存在源 SHA 不匹配和源树脏状态。原始标准报告曾错误读取持续开发分支 HEAD，`f9c0fc7` 修复其入口，未来以同 SHA 且干净的隔离树生成审计报告。
- 静态 AM/UI 引用和归属 PASS（82 个 UI 文件、48 跨模块 import），但 62 处动态调用点仍需人工契约追踪，74/244 API 具有直接 PASS 证据。**不能声明 AM_FULL_TABLE_CERTIFIED。**

## 同环境串行复核

采用与冻结 runner 相同的 Playwright WebKit/Chrome 预加载器和原样断言，在同一个冻结 SHA 中逐个执行四项失败测试：

| 测试 | 冻结全量 | 同 SHA 串行复核 | 裁决 |
| --- | --- | --- | --- |
| 章节导航 WebKit | FAIL | FAIL（确认复现） | WebKit 弹层观察时序问题 |
| 非法断行重扫 Chrome + WebKit | FAIL | PASS | 有环境/顺序敏感性；原失败未关闭 |
| PDF 三击接续 Chrome + WebKit | FAIL | PASS | 有环境/手势时序敏感性；原失败未关闭 |
| 文本块双框概览 Chrome + WebKit | FAIL | PASS | 有布局/顺序敏感性；原失败未关闭 |

日志：冻结树 `.v6/audit-reports/wp2-four-failed-recheck/`。严格保留 original FAIL，不将局部 PASS 写回旧审计表。

## 唯一确定修复：章节导航测试的可见性观察竞态

`7508c23` 给三项故障增加可执行诊断，断言和超时不放宽。冻结树复制的独立诊断试验证实，原生章节选项 21、TomSelect proxy 21、内部 option 21、弹层 `isOpen=true`、`display=block`、`visibility=visible`、矩形约 540×412、真实 DOM 行 21；只有 Playwright 在布局刚打开时执行的 `body>.ocr-navigation-popup-files:visible` 偶然计为 0。

`90ef4ac` **仅修改测试**：在点击弹层前对原生 select 和 Tom Select `options` 做**精确、同步**数量断言（21/20/21/Undo/Redo），等待首个选项真正可见（最多 2.4 秒，仅为浏览器布局可见性门禁），之后对可见菜单的选项数继续做精确断言，任何真实缺项仍会失败。没有调整产品源码、菜单选项、不删除检查，也未扩大菜单更新的业务容忍窗口。

同一个修复提交在标准浏览器预加载环境下连续 **5 轮 Chrome + iPad-WebKit** 全部通过，每轮 21→20→21 及 Undo/Redo 均为 PASS；日志 `.v6/audit-reports/wp2-current-diagnostic/chapter-fixed-1.log` 至 `chapter-fixed-5.log`。

## 其它门禁和剩余限制

- AM build：12 模块、244 API、14 消息、20 发布、30 订阅、345 契约行；源文件与测试文件引用核对通过。
- 修复影响范围只涉及 `tests/chapter-live-navigation.browser.test.mjs` 和此前标准审计报告器入口。业务产品代码未变。
- 其它 3 个全量失败只是局部复跑通过，仍须新完整 SHA 全量运行并跟踪是否重现。当前提交 **不具备最终 AM/Git、独立 Linux 及真实 iPad Safari 全部验收结论**。
- Main 保留 `75e0559`；不得在本 WP 将分支冒充合格 Main，不得发布内外网。

## 后续验收门禁

修复后的整合 HEAD 冻结后重新运行完整 91 套行为测试、345 契约、标准 Git/AM 审计和动态契约检查，保证源码与报告同 SHA；对偶现的非法断行、PDF 三击和双框概览查明是否有再现。**只有对应最终 SHA 的完整真实 PASS、必要跨平台/独立审计完成，才能进入 WP3 主线晋升。**
