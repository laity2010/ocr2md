# OCR2MD WCP26 · cc84b6d 全部 351 契约的同 SHA 审计证据（2026-11-02）

## 审计身份

- 冻结源码 SHA：`cc84b6d4d5f1a8265638293406bbabb3ac512b65`，Mac 上的独立 worktree `../ocr2md-am-cc84b6d4-isolated`，HEAD 未改变、所有 tracked 文件干净。源 MD、PDF 使用冻结预检和真实 Playwright 两浏览器。
- 原始标准执行日志：整合 worktree `.v6/audit-reports/wp2-standard-cc84b6d/console.log`；原始每套日志：隔离 worktree `.v6/tests/am-full-20261102T010009Z-cc84b6d4-<number>-*.log`。
- **必须明确：本轮原始完整命令没有到达 AM_FULL_RESULT。** 上层工具调用设置了 1 小时外层执行时限，在第 83 套过程中到期并被终止。前 82 套已完成真实结果（79 PASS、3 FAIL），不能称其为完整一遍的 91/91 或 AM_FULL_TABLE_PASS。

## 同 SHA 缺失套件恢复（并非更改历史）

在**同一个 frozen worktree、同一个 HEAD、同一个已验证浏览器/数据预加载环境**里调用 `tests/am/am.py` 原始 `run_test_script()`，保持它的 240 秒单套超时、进程清理、返回码和原始测试脚本，仅独立执行原来没完成的 **83–91 套**。每套对应的输出按原始 case_id 写进隔离树现有 `.v6/tests/am.sqlite`，记录身份仍是冻结 SHA；脚本、组件、注册表没有更改。单独的恢复日志为隔离树 `.v6/audit-reports/wp2-resume-cc84b6d/console.log`，逐套审计输出为 `.v6/tests/am-recovered-cc84b6d4-<number>-*.log`。

恢复 **9/9 套 PASS**，涵盖文本块覆盖层、文本块双框审阅、WCP 直接 API 契约、运行时契约、虚拟事件契约、移植性与工作区根目录；但**不能将这种恢复执行冒充原始 `run-all` 连续完成。**

| 冻结 SHA 审计范围 | PASS | FAIL | 共计 |
| --- | ---: | ---: | ---: |
| 91 套的执行证据（82 原始 + 9 恢复） | 88 | 3 | 91 |
| AM SQL 关联测试契约（相同 SHA、原期望值未变） | 344 | 7 | 351 |

原始三套 FAIL 均未修改结果：

1. `tests/illegal-break-rescan-real.browser.test.mjs`，**1 契约 FAIL**。Chrome 55 秒超时，页面模块恢复为 `chapter-boundary`，Worker 扫描次数 0、原 CMD 标记 1。怀疑页面被重载，但无原始导航证据确认触发源。整合分支 `49d3080` 增加跨重载计数、导航和 HMR WebSocket 被动追踪；局部开发服务三轮双引擎 PASS、正式服务一轮双引擎 PASS；另一次 WebKit `/healthz` 访问控制错误被原断言正确记为 FAIL。**尚未根治。**
2. `tests/pdf-block-reorder.browser.test.mjs`，**2 契约 FAIL**。Chrome 真实三击未改变接续状态，复验 WebKit 也重现；压力诊断证明真实连续三击同一标签之间间隔 1294 ms / 743 ms，旧 1200 ms 每次门禁会清空计数。整合分支 `02090f3` 修复为相邻最多 1850 ms、整轮最多 3000 ms；原有拖动/接续/Undo 套件 + 新增快慢手势反例在 Chrome / WebKit 均 PASS；`pdf-block-join-toggle.browser.test.mjs` 两浏览器也 PASS。**已具备定点修复证据，等待新 SHA 全量重审。**
3. `tests/pdf-coverage-zoom-browser.test.mjs`，**4 契约 FAIL**。原跑批缩放后 `.ocr-pdf-block-cover` 为 0，预期 224。现有原始日志未表明是否暂时的 PDF.js 层重绘/页面刷新；整合分支 `ca73f39` 新增仅在 FAIL 时触发的 overlay/page 状态及 900 ms 后恢复观测，保留原数值断言。定点三轮完整 Chrome + WebKit 双引擎缩放/拆分回归 **6 次 PASS**；**尚未证明根因或有产品修复，不得关闭此 FAIL。**

较早的 WebKit 章节导航测试在冻结审计中 PASS；PDF 三击接续测试第 53/91 套 PASS；第 85/91 套文本块双框概览在恢复执行中 PASS。因此历史四个 FAIL 里并非所有都在本轮重现。

## 后续门禁与 Main

- 源码静态边界 82 个 UI JS、48 个跨模块引用，无静态越界；AM 12 模块 / 244 API / 14 消息 / 20 发布 / 36 订阅 / 351 关联契约。动态 62 处调用点已有静态归类，但**未取得完整的运行时合同证明**；还需外部 Linux 验收，不得声明全认证。
- 新整合 HEAD 已不等于冻结审计 SHA（因测试诊断和上述真实 PDF 修复）；**344/351 是历史 cc84b6d 的结果，不能转移到当前最新源码。**
- Main 仍为 `75e0559`，无合并、无内外网发布；不进入 WP3。
- 下一个合法完整门禁必须冻结最终修复后的**一个干净新 SHA**，用足够长的外层执行期限跑真正的 91 套并生成同 SHA 标准报告。若非法断行或覆盖层失效复现，继续保留原 FAIL 和真实证据；只有完整 PASS 才能推动晋升。
