# OCR2MD 修复报告 — 源 06bf498 → 分支 fix/grok-06bf498

审计者、修复者、签署者均为 Grok（Grok Bot, OCR2MD Auditor）；是否合并由主线 AI 决定。未 push，未 rebase/reset --hard/force，未修改审计包分支、冻结源、Main、Lab 或生产数据，未执行 git clean。时间均为 Asia/Shanghai，2026-10-27。

- 审计报告（冻结）：/workspace/GROK_AUDIT_06bf498.md，sha256 4782154519309009aa44c15fe5bd510a0497c013b84dcd1b29c602a26c1230e8
- 修复 worktree：/workspace/ocr2md-audit/fix-06bf498，基于 06bf498daab22ad175f5ae4727a2c1e66b38402c
- 提交（作者 "Grok Bot (OCR2MD Auditor)" <laity2010@users.noreply.github.com>）：
  1. 2e2c4cd test(media)：浏览器可执行路径可用环境变量覆盖，否则回退到 Playwright 自带浏览器（P2-1 的部分修复，断言未改）。修复前在 Linux 不带 shim 运行报 Error；修复后 rc=0，两种浏览器都 PASS（fix1-*.log）
  2. 38288bf test(save)：新增 tests/save-conflict-draft-browser.test.mjs，覆盖 412 后草稿保留，在 Chromium 和 WebKit 的生产构建上运行，结果 PASS（fix2-save-conflict.log）。注：该测试未登记进 registry，因为登记需要 Daisor 批准。我没有做变异测试（负对照）。
  3. 本报告副本 audit-reports/GROK_FIX_06bf498.md

## P0/P1 处理情况
- P0：0 个
- P1-1 Lab 缺模块、无法构建：未修。补模块属于 Lab 架构变更，只写了提案 A3
- P1-2 构建期字符串注入：未修。改为扩展点属于架构变更，只写了提案 A2
- P1-3 WCP 钩子未登记：未修。改 AM registry 需批准，只写了提案 A1
- **P1-4（冻结后新发现）门禁不确定**：tests/outline-title-scale-browser.test.mjs:58 断言 0.2 !== 1.7，滑块设值存在竞态。在未改动的 06bf498 上单套件诊断运行 5 次失败 2 次，在修复分支上 5 次失败 4 次（outline-flake-diagnostic.txt）。修复分支的两处改动不涉及该测试或 UI 代码。结论：155/155 的认证结果依赖时序，审计时那次全过不能证明稳定。未修复：不允许靠重试通过，根因还需要排查（可能是测试的 set() 没等 UI 更新提交）

## 修复后门禁（tests/am/run-grok-audit.sh 38288bf，在修复分支 HEAD 上完整运行一次，与 audit.sh 调用的是同一脚本）
| 项 | 修复前 06bf498 | 修复后 38288bf |
|---|---|---|
| AM_BUILD 8/110/9/14/19/155 | PASS | PASS |
| unittest 25 | PASS | PASS |
| AM_UI_BOUNDARY / AM_CHECK | PASS | PASS |
| AM_FULL_RESULT | 155/155，30/30 | **152/155，29/30 FAIL**（outline-title-scale，即 P1-4） |
| certify | CERTIFIED | 未执行（被前一步失败阻断） |
| 新增 412 草稿测试 | 无 | PASS（独立运行，未纳入 AM） |
如实说明：修复分支的门禁**没有通过**。我没有重跑来凑出通过结果。

## 待 Daisor 批准的提案（均未实现）
- A1：在 registry.sql 中登记 WCP 钩子（editorExtensions/wrapCMD/onCMReady/onAGReady/onPreviewInit/renderPreview）、3 条组合 import 边，以及新的 412 测试用例
- A2：用 wcp-runtime 的正式扩展点替代 v6_lab_profile.mjs 的字符串替换，并修正 wcp-runtime.js:5 的注释
- A3：把 labs/wcp-lab/modules/preview-dom-patch.js 和 document-sessions.js 纳入仓库，或删除对它们的依赖；同时决定 Lab 去掉脏草稿守卫和 beforeunload 是否符合 10/26 产品规则
- A4：vite.config.mjs 的默认 PDF 路径改成仅从环境变量读取（会影响 Mac 上的工作流程）
- A5：cookie 不再存原始 KEY，解锁码不再是 KEY 前缀

## 未解决
P1-1、P1-2、P1-3、P1-4；P2-1 的其余部分（39 个测试钉死 Chrome 路径，7 个测试依赖 sips）；P2-2、P2-4、P2-5；macOS 原生门禁 BLOCKED（没有 Mac 机器）。

## 建议
- SOURCE_MERGE（合并修复分支）：CONDITIONAL。两个提交只改测试，风险低。但修复后的门禁没有全过（P1-4 是原本就有的 flake），所以合并前提是 P1-4 修好后整套门禁确定性地达到 155/155（加上新测试为 156）
- PRODUCTION_CUTOVER：NOT_RECOMMENDED（相比审计时下调）。原因：门禁不确定（P1-4），macOS 原生门禁没有跑过。前提：修复 P1-4 后连续多次全量通过；Mac 原生复跑通过；生产不启用 Lab profile
