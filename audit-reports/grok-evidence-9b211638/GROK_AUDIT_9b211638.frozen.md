# OCR2MD 独立审计报告 — 源 SHA 9b211638b1791fc0ac4b084cc565230203507d9d

审计员：Grok Bot (OCR2MD Auditor)｜时间：2026-10-30（Asia/Shanghai, CST）｜审计包：audit-public-9b211638 @ f755ac947904c361d8148d6231b2fa778824a182（= ls-remote，工作树干净）
证据目录：/workspace/grok-evidence-9b211638/（无 PDF、无凭据）

## 1. 正式 audit.sh（仅运行一次）
- 07:10:16–07:10:45 CST，EXIT=1：**FAIL / AUDIT_RUNNER_NONZERO / AM_RESULTS_INCOMPLETE**，AM 用例 0/240 执行。
- 原因：`tests/am/test_boundaries.py:24` 期望 (48,9,31)，实际 (63,12,38)；runner 在 run-all 之前中止。证据：audit-sh.log、report.json、run.log。
- AM_BUILD_PASS：12 模块 / 167 API / 13 消息 / 19 发布者 / 28 订阅 / 240 测试；静态违规 0；运行时待复核调用点 53。

## 2. 诊断性续跑（原始源码、隔离副本，非正式结论）— diag-original-gate.log
| 步骤 | rc |
|---|---|
| unittest tests/am | 1（仅 test_baseline） |
| am.py check / coverage / edges debt | 0 / 0 / 0 |
| am.py run-all | 1：**AM_FULL_RESULT passed_cases=236/240 failed_suites=3** |
| am.py certify | 1（无完整 PASS） |
| git fsck | 0 |

失败 suite（均单独复跑确认为确定性失败，见 solo/）：
- 23 main-promoted-lab-ui.browser：ENOENT `.v6/settings.json`（读取未跟踪的本地运行时文件）1/1 FAIL。
- 39 pdf-anchor-viewport-browser：Chrome 前置断言 "test must exercise the original PDF scrollport cropped by screen"（line 72）3/3 FAIL；WebKit 未执行 → BLOCKED。06bf498 轮同环境 PASS，测试本身仅改 selectPreview 辅助 → 布局变化导致 PDF scrollport 不再超出窗口底。
- 56 workspace-root-browser：Chrome PASS；WebKit line 78 等待 `.ocr-settings-directory-feedback[data-state=warning]` 超时 2/2 FAIL。根因未定位。

## 3. 独立核查
| 项 | 结果 | 证据 |
|---|---|---|
| 跨模块 import 图（独立脚本 graph.py） | PASS：38 条跨模块 import 全部有登记 edge 与批准 bindings；无无主文件 | import-graph.json |
| 上轮 3 条“未登记”(main→workspace, main→cm-document, workspace→pdf-preview) | 误报：被 shell 例外（caller NULL）+ 既有 (caller,target,file) 边 + crossModuleBindings 覆盖 | import-graph.json |
| DOM 事件 E08–E13 字面量 dispatch/listen | PASS（除下列 P2-1） | 代码+registry 对照 |
| 直接 store 写 | PASS：observedDirectStoreWrites 为空；上轮问题已修 | report.json |
| 保存安全（/tmp 隔离副本 HTTP 探针） | PASS 13/13：强 ETag、403×3、428、412、拒绝不落盘、20 并发恰 1 胜、无 tmp 残留 | save_safety.log / save_safety_results.json |
| 412 后草稿保留 | 仓库新增 tests/wcp-cas-two-editor-regression.test.mjs，但**未纳入 AM run-all**；独立浏览器探针见修复报告 | — |
| CM6 保存后滚动不变 | PASS（cm6-browser suite，SAVE_POSITION 断言 <2px） | diag log suite 05 |
| 业务区（虚拟章节/AG/媒体/LaTeX/HTML/note pair/Callout/fenced code/PDF） | 对应 suite 全 PASS（01–38,40–55 除 23），PDF 锚点见 P1-2 | diag log |
| 生产构建 | PASS rc0 ×2；差异仅 index-*.js/index.html（`__V6_BUILD_VERSION__` 嵌时间戳），其余产物逐字节一致 | build-prod-1/2.log |
| Lab 构建 cm-html | PASS（git worktree 内）；/tmp git-archive 中因 `git rev-parse` 失败 | build-lab-cm-html-gitwt.log |
| Lab 构建 wcp-lab | FAIL：LAB_MODULE_OVERRIDE_FORBIDDEN | build-lab-wcp-lab-gitwt.log |

## 4. 上轮问题复核
| 问题 | 结论 |
|---|---|
| outline-title-scale | 单独跑 5/5 PASS（Chrome+WebKit 每次均 PASS）；全量中亦 PASS |
| Lab 缺模块与字符串替换 | 字符串替换已移除（08fb6f4, 242d281），已改为禁止覆盖；但 labs/wcp-lab/lab.json 仍有 latex 覆盖 → 构建失败（P1-3） |
| WCP hooks 入 AM | 已修：W01–W09 + X-W01/X-W02 |
| Mac 硬编码路径 | 部分：无 /Users/；33 个测试文件仍含 /Applications/（如 cm6-browser.test.mjs:27），sips 2 处；靠审计 shim 运行（P2-2） |
| vite 默认路径 | 已修：vite.config 第 30 行 V6_PDF_PATH 或 repo 相对默认 |
| cookie 存原始 KEY | 未修：scripts/v6_serve.py:189,435 cookie=KEY；134 UNLOCK_CODE=KEY[:12]（P2-3） |

## 5. 发现（P0=0, P1=4, P2=4）
- **P1-1** tests/am/test_boundaries.py:24 基线过期 (48,9,31)≠(63,12,38)；违反“门禁须可运行完整 240 用例”；影响：正式 audit 0/240、certify 不可能通过；复现：`python3 -m unittest discover -s tests/am -p test_*.py`。
- **P1-2** tests/pdf-anchor-viewport-browser.test.mjs:72 前置断言在当前布局下恒失败（Chrome 3/3），WebKit 被阻断；违反 PDF 锚点回归契约可验证性；复现：`node tests/pdf-anchor-viewport-browser.test.mjs`（Linux, Playwright 1.64.1）。需所有者判定是布局改动使 iPad 裁切场景消失（测试需重设计）还是布局回归。
- **P1-3** labs/wcp-lab/lab.json 的 latex 模块覆盖与 v6_lab_profile.mjs 禁令冲突；`V6_LAB_ID=wcp-lab vite build` rc=1。
- **P1-4** tests/workspace-root-browser.test.mjs:78 WebKit 确定性超时（2/2），Chrome PASS；工作根目录校验 warning 状态在 WebKit 下不出现；跨浏览器契约 FAIL，根因未定位。
- **P2-1** ui/wcp-navigation-select.js:109-117（owner shared）以模块 'N'（Note Pair）身份注册 `globalUi.navigation.dropdownFontSize` 并订阅 settings.changed(E09)，E09 仅登记 SUB-C01/SUB-G01；未登记订阅+模块身份错误（引入于 adf79f1/4adc7b3）。
- **P2-2** 33 个测试文件硬编码 /Applications/ Chrome 与 ~/Library WebKit 路径，sips 2 处；Linux 依赖审计 shim。
- **P2-3** scripts/v6_serve.py:189,435 cookie 值为原始 KEY，134 解锁码为 KEY 前缀；cookie 泄露即全权限。
- **P2-4** tests/main-promoted-lab-ui.browser.test.mjs:13 依赖未跟踪 `.v6/settings.json`，干净检出必挂；另 wcp-cas-two-editor-regression（412 草稿保护）未纳入 AM run-all。
- 观察（非缺陷）：ui/fontcheck.js:21 查询 .cm-content；scroll-sync.js 读取预览 DOM [data-source-start]；main.js:679 DEV-only `window.__v6cm6` 仍在。

## 6. 结论
- **SOURCE_MERGE：NOT_RECOMMENDED**（原始 9b211638）。理由：正式门禁 0/240；诊断全量 236/240、3 suite 确定性失败；wcp-lab 构建失败。前置条件：P1-1..P1-4 解决后完整 run-all 240/240 且 certify PASS。
- **PRODUCTION_CUTOVER：NOT_RECOMMENDED**。理由同上，且 PDF 锚点可见性回归无法在 Chrome/WebKit 验证。保存安全 13/13 PASS 是正面证据但不足以抵消门禁失败。

（本报告写成后冻结，修复见 /workspace/GROK_FIX_9b211638.md）
