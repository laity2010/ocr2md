# OCR2MD WCP26 · PDF 三击接续被 WebKit 事件延迟击穿（2026-11-02）

## 冻结审计 FAIL 与真实复现

独立固定源码 `cc84b6d4d5f1a8265638293406bbabb3ac512b65` 的第 54/91 套 `tests/pdf-block-reorder.browser.test.mjs` 在 Chrome 全量运行时 **FAIL**。跨栏拖动和 Undo 路径执行后，三击 `p16b3` 未能使其 checkbox 从勾选变为接续，24 秒后原断言超时，源报告为 `.../.v6/tests/am-full-20261102T010009Z-cc84b6d4-54-pdf-block-reorder.browser.test.log`。

复验 WebKit 也复现 `p16b3` 未改变：模块仍是 `text-block`，原始 224、逻辑 224，已接续数 0；`p16b3`/`p16b5`/`p16b11` 均有独立勾选，PDF 状态显示 `p16b3` 父块正常定位。不是 CMD 原始版面、AG 选项和数据丢失。

**关键指纹：**重排压力测试中，`p6b7` 标签上的 3 个真实浏览器点击连续抵达，`target=SPAN`、`detail=1`，时间戳为 13340、14634、15377 毫秒（间隔 **1294 ms + 743 ms**）。组件旧门禁 `now-lastTap<=1200` 把第 2 次点击清零，第三次只算第 2 次；故没有触发 `onBlockJoin`，且 CMD 未改变。这个结果直接证明它是点击计时分界缺陷，不是复核截图误判；旧 600 ms 拖动防误触保护在另一成功样本中为 `remainingMs=0`，不能把它当作已证实根因。

## 定点业务修复

`ui/pdf-preview.js` 保持原有三击进入 CMD 接续与长按拖动的工作流，但将最多 3 次的同一标签事件序列改为：

- 相邻两次允许最长 1850 ms（WebKit 实测 1294 ms）。
- **整轮**从第一击到第三击必须在 3000 ms 内完成；超限即重开新序列，不累积散落单击。
- 只统计当前原始块自己的事件；单击仍即时定位源码，未引入延迟处理；拖动仍走原 370 ms 长按和 600 ms ghost-click 保护；所有编辑经同一个可 Undo 的 CMD 接口，不直接写原文件。

`tests/pdf-block-reorder.browser.test.mjs` 原先所有移动、checkbox、跨栏、子块携带、Undo、原文不改、报错为空断言保持不变，并新增严格浏览器回归：

- 以 1350 ms 和 700 ms 间隔对同一真实标签触发三击，必须变为接续（源测试继续等待真实 checkbox=false）；Undo 必须恢复独立。
- 单击间隔大于新门禁（1950 ms）时，不得错误接续。
- 失败时记录原标签、逻辑编号、勾选、模块、PDF 状态和 click 事件真实时间；不改已有 24/25 秒断言，不过滤错误。

## 已完成的验证与限制

- 改动后的 `pdf-block-reorder.browser.test.mjs`：Chrome / iPad-WebKit 都通过真实拖动、接续、Undo、额外快慢三击测试，输出 `PDF_BLOCK_TRIPLE_CADENCE_PASS` 和 `PDF_BLOCK_REORDER_PASS`。
- `npm run build` PASS；`python3 -m unittest discover -s tests/am -p 'test_*.py'` 43 tests OK（1 skipped）。
- 该修复尚未完成**更新 SHA 的完整 91 套门禁**，禁止由局部通过推出最终 AM_FULL_TABLE_PASS，也不能晋升 Main。

完整本机浏览器日志（ignored、不可伪造 sandbox 下载）：`.v6/audit-reports/wp2-pdf-reorder-diagnostic/webkit-trace-2.log`、`.v6/audit-reports/wp2-pdf-cadence-fix/pdf-block-reorder.browser.test.mjs.log`。
