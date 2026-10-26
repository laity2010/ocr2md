# OCR2MD V6 · Main 持续开发与 Grok/Muse 并行审计（2026-10-27）

## 本轮流程（用户批准）

1. **Lab 冻结**：`experiment/virtual-chapters-wp0-2` 保持 `043cbf5783c03e9a49ee11c5c018930e284d9f4e`；Git 冻结标签 `lab/frozen-20261026-043cbf5`。Lab 源码、实验发布、原始与未追踪截图、母文档均保留，不再在 Lab 分支继续施工。
2. **开发 Main 合并**：当前 OCR2MD V6 的真正集成主线是 `build/2026-10-20`（仓库没有 `refs/heads/main`），由该实际分支执行正常 `--no-ff` 合并集成候选 `0d981ae`，完整保留两父历史；后续所有开发及修复在此工作区继续，不另建影子 Main。
3. **开发 Main ≠ 正式发布**：现有正式公共网站 `/` 仍指向已发布稳定构建。`dist/` 的本地测试构建与源分支合并均不是生产上线；没有修改正式服务配置、Lab/正式用户数据或正式 GitHub 分支引用。
4. **锁定审计快照**：选取下方所有本地预检之后的 Main SHA，建立独立不可变 `audit/main-20261027-<shortsha>` Git ref；Grok 和 Muse 必须审同一完整 SHA，提交报告时各自记录 SHA/OS/浏览器实物/命令/证据。Main 随后可以增加提交，但不得把旧 SHA 签字沿用到未审的差异上。

## 本地 Main 预检（作为独立审计的起点，不等于审计签字）

- `python3 -m unittest discover -s tests/am -p 'test_*.py'`：25 项中 24 PASS、1 条平台限定 SKIP。
- `python3 tests/am/audit_boundaries.py`：PASS；提示的跨模块调用静态审阅项需由审计者逐项确认（静态工具不会证明实际运行时路由）。
- `python3 tests/am/am.py build` + `check`：PASS；契约统计为 8 模块、110 API、9 消息、14 发布者、19 订阅者、155 测试登记。
- `npm run build`：默认正式模式成功，本地 `dist/` 未部署；构建输出中存在大 bundle 警告，作为性能建议记录。
- `node tests/compact-shell-browser.test.mjs`：Chrome 路径 PASS，旧模拟保存未带 ETag 的测试现已按严格 If-Match/ETag 契约修复；WebKit 浏览器回归必须在独立审计继续。
- `node tests/outline-title-scale-browser.test.mjs`：Chrome、WebKit 两端 PASS，2×→0.2×→1.7×（持久化与 reload）可操作。脚本已去除个人 Mac Chrome/WebKit 绝对启动路径，改用 Playwright-managed browser。

## 已知风险与外部全量审计任务

审计的详细独立职责参阅 `audit-reports/INTEGRATION_INDEPENDENT_AM_GIT_AUDIT_20261026.md`。注意其最初写于尚未合并主线的候选时期；以本报告的真实 Main 冻结 SHA 为唯一准绳，**不要**继续审旧 `integration/*` 候选。

- **P1 待检验**：生产构建虽然成功，但 Lab 的部分虚拟章节 UI/模块依赖 `V6_LAB_ID=cm-html` 特定的源码替换，默认正式构建是否真正启用了预期功能，仍需从真实入口检查；不得把代码进 Main 等同为可上线。
- **P1 待审**：`scripts/v6_lab_profile.mjs` 的 `replaceOnce/code.replace` 构建期注入，需通过 WCP/AM 接口治理核查后制定有界改造，不在这次合并中一口气重构。
- **跨平台证据**：Grok Linux 本机 Node/SQLite/AM、Chromium；Muse macOS Chrome/WebKit；对无法实际运行的项目标为 `BLOCKED`，不可自行创造 PASS。
- **安全和数据**：Lab 快速刷新丢弃未保存内容的豁免严格保留在 Lab profile；正式版的未保存警告、GET ETag/PUT If-Match、旧版本 412、鉴权、唯一母 Markdown/CMD、用户工作数据不得放宽。浏览器自动化一律使用隔离 fixtures，不能操作用户母数据。
- **审计交付**：Grok `audit-reports/GROK_MAIN_AM_GIT_20261027.md`，Muse `audit-reports/MUSE_MAIN_AM_GIT_20261027.md`，独立报告落各自审计分支。报告末尾分开判定 SOURCE_MERGE / PRODUCTION_CUTOVER 与 P0/P1/P2，不替别人签字；后续修复在开发 Main，并依据影响范围增量复审。

## 远端仓库可见性与受控共享

2026-10-27 实际 `gh repo view laity2010/ocr2md --json isPrivate` 返回 `false`：现有 origin GitHub 是**公开仓库**，不是早期工程日志误记的「私有仓库」。因此不能未经保护直接把未验收审计快照推送到公开 origin。若创建专用**私有**审计镜像，只允许单独 `audit/*` 引用的普通 push；不要更改 origin 默认分支、公开发布入口或私有镜像以外的其他项目仓库。共享/授予外部审计机器人权限后才能称为已分发，推送到私有镜像不代表机器人已执行审计。
