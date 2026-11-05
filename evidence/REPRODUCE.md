# 可复现命令

## 原始材料（历史保留，不重跑）

原始交付包 `a1c9c57f887523084b8eafe5b2f5568902826bc2` 中执行 `bash audit.sh`，因 AM registry visibility CHECK 在业务测试前失败。输出保存在 `original/`，不得将该结果写成 0 个业务测试通过。

## 早期修复后完整门禁（历史保留）

固定 `2ee865729b716e613a64f104a702c778ca3889b1` 并执行标准入口；报告、完整 run log 与 console 保存在 `post-fix-gate2/`。它不是最终 FIX_SHA 的结果。

## 最终候选（两个相互独立的干净 worktree）

```sh
export PATH=/workspace/tools/node-v22.23.4-linux-x64/bin:$PATH
cd <CLEAN_DETACHED_WORKTREE_AT_a58efa90e2f2ed0a785d6220c1a7d56a8cc7cd8c>
# 固定 PDF 放在本树 .v6/workspace/buffetts-alpha.original.pdf，权限只读。
export OCR2MD_AUDIT_SKIP_BROWSER_INSTALL=1
export OCR2MD_AUDIT_TARGET_DIR=<NEW_ABSOLUTE_DETACHED_WORKTREE_PATH>
export OCR2MD_STANDARD_REPORT_DIR=<NEW_EVIDENCE_DIRECTORY>
bash tests/am/run-standard-audit.sh a58efa90e2f2ed0a785d6220c1a7d56a8cc7cd8c
```

第二次必须使用另一个新的 target 和 report 目录，不能覆盖首轮结果。脚本仍执行浏览器真实启动预检；`SKIP_BROWSER_INSTALL` 仅复用已安装的同版本 Playwright 浏览器。

本环境的 Node 为 v22.23.4，Python 3.13.5，Linux x86_64。浏览器具体版本及 source hashes 以各轮 `report.json` 为准。

## 针对性检查

- `node --test packages/minerujson-md/tests/converter.test.mjs`
- `node tests/cmd-block-chains-wp2.test.mjs`
- `ONE_BROWSER=Chrome node tests/pdf-block-join-toggle.browser.test.mjs`
- `ONE_BROWSER=iPad-WebKit node tests/pdf-block-join-toggle.browser.test.mjs`
- `python3 tests/am/am.py check`

浏览器测试需要门禁同一组 audit preload、固定 PDF 和隔离 document；详细环境可参照 `run-grok-audit.sh`。不得把 Linux iPad-WebKit 仿真称为真实设备。
