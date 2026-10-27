# OCR2MD 独立审计报告 — 源 06bf498（冻结版）

- 审计/修复/签署：Grok（Grok Bot, OCR2MD Auditor）；主线 AI 决定是否合并
- 审计包 HEAD：75567488c52dcd92afa9ff8baf179c0b379f26c3（= ls-remote），父提交 = 源 06bf498daab22ad175f5ae4727a2c1e66b38402c；工作树干净
- 环境：Debian 13 x86_64，Node v22.23.4（/workspace/tools），Python 3.13.5，Playwright 1.64.1，Chromium 156.0.8078.4，WebKit 27.2，SQLite 3.46.1
- 时间：2026-10-27 约 14:45 起（Asia/Shanghai，run id 20261027T064508Z）
- 证据目录：/workspace/grok-evidence-06bf498/（约 0.3 MB，无 PDF、无凭据）

## 1. 正式门禁（bash audit.sh，仅运行 1 次）
| 项 | 结果 | 证据 |
|---|---|---|
| audit.sh 退出码 | PASS (0) | audit.sh.log |
| AM_BUILD：8 模块 / 110 API / 9 消息 / 14 发布者 / 19 订阅 / 155 用例 | PASS | audit.sh.log |
| unittest 25 | PASS | audit.sh.log |
| AM_UI_BOUNDARY files=32 shared=5 cross_imports=18 | PASS | audit.sh.log |
| AM_CHECK | PASS | audit.sh.log |
| 端口/浏览器(Chromium+WebKit)/sips 预检 | PASS | browser-preflight.log |
| AM_FULL_RESULT 155/155，30/30 套件 | PASS | suite-logs/ |
| AM_FULL_TABLE_CERTIFIED / AM_AUDIT_CERTIFIED runtime=Linux | PASS | audit.sh.log |
| 独立 `git fsck --full`（审计包 clone 与隔离 worktree） | PASS (rc=0) | git-integrity.txt |
| 测试后工作树干净、HEAD=06bf498、fixture sha256 | PASS | git-integrity.txt |

注意：Linux 上通过依赖审计包注入的 shim（audit-browser-preload、fixture-preload、sips-compat、linux-diagnostics、loopback-cookie）。macOS 原生门禁未由我运行 → BLOCKED（无 Mac 机器）。

## 2. 独立检查
| 领域 | 结果 | 证据 |
|---|---|---|
| WCP/AM 边界：自建 import/call 图 vs registry | FAIL（见 P1-3、P2-2） | static/graph.py, graph.json |
| 构建期字符串注入 | FAIL（P1-2） | scripts/v6_lab_profile.mjs |
| 保存安全（ETag=sha256、无 cookie/跨源/无 Origin 403、428、412、拒绝后磁盘不变、20 并发恰 1×200、无 tmp 残留、错误解锁码 403、设置未授权 403） | PASS 13/13 | save_safety_results.json |
| 412 后草稿保留（浏览器实测，生产构建，/tmp 副本） | PASS Chromium + WebKit | draft412_probe.mjs, draft412_results.json, draft412-*.png |
| 章节/导航、多面板同步、编辑/预览稳定 | PASS（由 30 套件双浏览器真实运行覆盖） | suite-logs/ |
| 生产构建 | PASS | lab-build-wcp-lab.log |
| Lab 构建 V6_LAB_ID=wcp-lab | FAIL（P1-1） | lab-build-wcp-lab.log |
| 跨平台 | FAIL（P2-1，依赖 shim） | — |

## 3. 问题清单（P0=0，P1=3，P2=5）
### P1-1 Lab 不可复现构建
- 文件：scripts/v6_lab_profile.mjs:97, 112-113；labs/wcp-lab/modules/ 缺 preview-dom-patch.js、document-sessions.js
- 违反：Lab 必须可从仓库复现构建/可审计
- 影响：Lab 产物无法由源码重建，生产 vs Lab 差异不可验证
- 复现：`V6_LAB_ID=wcp-lab npx vite build` → "Missing lab file-session adapter"，rc=1
### P1-2 构建期字符串注入共享 UI 内部，与声明矛盾
- 文件：scripts/v6_lab_profile.mjs:59, 95, 104, 121 改写 main.js/workspace.js/media-module.js；ui/wcp-runtime.js:5 声称 "No shared UI internals are patched by text replacement"
- 违反：WCP 模块边界（仅经注册扩展点）
- 影响：Lab 移除脏草稿更新守卫与 beforeunload 提示（commit 40fa4fc），与 Daisor 10/26 产品规则冲突；替换锚点失配静默失效风险
- 复现：阅读上述行 + Lab 构建（当前直接失败）
### P1-3 WCP 钩子不在 AM registry
- 文件：ui/main.js:27,336,390-391；ui/workspace.js:54,74,199,255,329（editorExtensions、wrapCMD、onCMReady、onAGReady、onPreviewInit、renderPreview）
- 违反：所有跨模块 API 必须登记 apis/access_edges
- 影响：扩展面绕过 AM 证明，certify 不覆盖
- 复现：static/graph.py 对比 tests/am/registry.sql
### P2-1 Mac 硬编码路径/工具
- vite.config.mjs:28-29（homedir iCloud PDF 默认路径）；tests/media-adoption-syntax.test.mjs:29（/Users/daisor/...webkit-2359）；39 个测试钉 /Applications Chrome；7 个测试用 sips
- 影响：非 Mac 需 shim 才能通过
### P2-2 未登记组合边与直接写 store
- main.js→workspace.js createWorkspace、main.js→cm-document.js CMDocument、workspace.js→pdf-preview.js 构造函数无 access_edges；outline-grid.js:138、workspace.js:397 直接 viewStore.setState（ownership.json 已记录为 observed）
### P2-3 412 草稿保留无回归测试
- main.js:179-183 行为正确（本次浏览器实测 PASS），但仓库无测试覆盖
### P2-4 会话 cookie 值为原始 KEY，解锁码为 KEY[:12]；Lab cookie 仅 https 下 Secure
- scripts/v6_serve.py；本地回环可接受，暴露到网络则弱
### P2-5 历史中提交了大体积截图（audit-reports/screenshots），仓库膨胀

## 4. 结论（冻结前）
- SOURCE_MERGE：CONDITIONAL — 生产路径全门禁 155/155、保存安全与双浏览器草稿保留实测通过；条件：Lab 问题（P1-1/P1-2）不进入生产，P1-3 有登记方案。
- PRODUCTION_CUTOVER：CONDITIONAL — 条件：macOS 原生门禁由 Daisor 在 Mac 上复跑通过（本次 BLOCKED）；生产不启用 Lab profile；保持 cookie 仅回环。
