# 38ea47d Linux 审计 FAIL 修复报告（pdf-click-only 挂起 + 4710 孤儿端口）

## 根因（置信度：机制已证实；触发源为推断）
1. **触发**：box 虚拟机暂停/冻结（推断）。原失败中 suite 20 结束于 19:27:20，suite 21 日志时间 19:37:15，约 595s 墙钟时间对应 240s 单调超时，dmesg 约 19:32 有 "virtual machine fork" 记录。
2. **静默挂起**（已证实）：`tests/pdf-click-only-browser.test.mjs` 中 `page.evaluate` / `browser.close` 没有超时上限。SIGSTOP Chrome 渲染进程后可复现：测试在第 115 行无输出地挂起，直到被杀。
3. **孤儿端口**（已证实）：am.py 的 `subprocess.run(timeout=)` 只杀直接子进程，孙进程 `v6_serve.py` 存活并占住 4710（已用 demo 复现）。
- 负载不是原因：原测试在 8 核满载下 15/15 通过。

## 变更（未改业务代码，未改 AM registry）
- `978fa80` am.py:92 `run_test_script()`：新进程组；超时后 SIGTERM→SIGKILL 整棵进程树；记录 `AM_TIMEOUT_PROCESS_TREE` 和 `AM_TIMEOUT_CLEANUP`（含残留进程与端口）。run_case:307、run_all:345 都改用它。新增 `tests/am/test_timeout_cleanup.py`。超时仍为 240s。
- `6255a3a` tests/pdf-click-only-browser.test.mjs：`bounded()`:26 给 evaluate 加 20s 上限；healthz 请求 2s 超时:48；每引擎 watchdog 150s:29；失败时输出 `PDF_CLICK_ONLY_FAIL` 和步骤名:227；browser.close 限 20s:231；退出或收到信号时杀掉 server:23。断言未改。另外 `tests/am/portability/audit-linux-diagnostics.mjs` 加入 `boundedEval`，上限 5s（:9/:79/:91）。
- `f919378` audit_boundaries.py：新增 ABSOLUTE_OR_URL_IMPORT(:69)、UNTRACKED_FUNCTIONAL_STORE_WRITE(:127) 检查，加 4 个负向测试。基线不变：27 文件 / 7 模块 / 14 条边。

## 验证
- 冻结模拟：原版静默挂起 200s；修复版 53s 内报出可读失败（step="pdf-reading-scroll"）。
- 修复版在负载下 25/25 通过。
- 完整运行 1：138/139。suite 20（pdf-anchor-viewport）ERROR，墙钟约 577s，同样疑似 box 冻结。新清理逻辑生效：survivors=[]，ports_still_listening=[]。
- 完整运行 2：**139/139，failed_suites=0，AM_AUDIT_CERTIFIED sha=f919378c，EXIT=0**。之后检查无孤儿进程。

## 遗留
- pdf-anchor-viewport 等其它浏览器测试建议同样加上超时上限。
- 建议在 registry 登记 3 条缺失的边（需用户批准）；建议清理 Mac 路径。
- VM 冻结本身无法在测试侧修复，只能让它快速、可读地失败，并清理干净。
