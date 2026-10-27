# OCR2MD V6 · 独立 AM/Git 全量审计与自主修复报告（Meta Muse）

- **审计员**：Meta Muse（独立审计，与 Grok、主线 AI 互不代跑、互不代签）
- **审计日期**：2026-10-27（Asia/Shanghai）
- **被审冻结源码 SHA**：`06bf498daab22ad175f5ae4727a2c1e66b38402c`
- **审计包**：公开仓库 `laity2010/ocr2md`，分支 `audit-public-06bf498`，包 HEAD `75567488c52dcd92afa9ff8baf179c0b379f26c3`（父提交恰为冻结 SHA；包与源码 diff 仅 4 个交付文件：PDF 夹具、AUDIT.md、audit.sh、.gitattributes）
- **取材方式**：匿名 HTTPS 克隆（无登录、无人工补传），`bash audit.sh` 标准入口
- **环境**：Ubuntu 24.04.5 LTS x86_64（2 vCPU），git 2.43.0，Node v24.22.1，npm 10.9.4，Python 3.12.3，Playwright 1.64.1（Chromium / WebKit 托管构建）
- **夹具校验**：PDF SHA-256 `be12aa25…e41ab`、MD SHA-256 `d86508f6…e3b764`，与 AUDIT.md 固定值一致（audit.sh 内置校验通过）

## 结论（绑定冻结 SHA 06bf498）

| 项目 | 结论 |
| --- | --- |
| AM_GIT_AUDIT_RESULT | **FAIL** |
| 全量结果 | **28/30 套件、149/155 契约 PASS**，未取得 AM_FULL_TABLE_CERTIFIED（run-all 失败后脚本按设计在 certify 前退出） |
| MAINLINE_ARCHITECTURE_COMPLIANT | **PASS（架构面）**：AM 登记/引用/外键检查全过，WCP/UI 边界检查 PASS，edges debt = 0 |
| READY_FOR_PRODUCTION_CUTOVER | **NO**（见文末建议） |

## 运行记录（全部如实保留）

| 运行 | 隔离目录 | 结果 |
| --- | --- | --- |
| Run 1 | `ocr2md-am-06bf498d-isolated` | 跑到 24/30 时被审计环境自身的运行时重启杀停（环境事件）。已完成部分：22 套件 PASS、**20 号 FAIL**（见 F1）。无 verdict |
| Run 2 | `ocr2md-am-06bf498d-run2` | **AUDIT_BLOCKED（环境）**：VM 更换后 WebKit 依赖 `libgstreamer-1.0.so.0` 缺失，浏览器预检拦截，零套件执行 |
| Run 3 | `ocr2md-am-06bf498d-run3` | 环境失败：`playwright install-deps` 与平台重启后的系统包恢复进程争抢 apt 锁（exit 1），零套件执行 |
| Run 4 | `ocr2md-am-06bf498d-run4` | **完整运行**：环境恢复后实跑，28/30 套件、149/155 契约，AUDIT_SH_EXIT=1（run-all 两套件 FAIL） |

## 登记与完整性（Run 4 实测）

- AM_BUILD_PASS：modules/apis/messages/publishers/subscriptions/tests = **[8, 110, 9, 14, 19, 155]**
- AM_CHECK_PASS：apis=110、FK=OK、源码与测试路径 OK、ui-ownership OK；引用覆盖 APIs 110/110、core 82/82、publishers 14/14、subscriptions 19/19（覆盖为引用统计而非通过率，依 AM 既定口径）；9 类消息中 1 类无登记订阅者（覆盖注记，非失败）
- `am.py edges debt` 输出 `(no results)`：**debt = 0**
- AM_UI_BOUNDARY_PASS：**files=32、shared=5、cross_imports=18**
- Python 单测（unittest discover，含边界负向测试）：**25 项全过**
- Git：克隆 fsck rc=0、双 worktree 受检树干净；Run 4 因 run-all 失败未执行到脚本尾部的 fsck/洁净复检（已由审计员在克隆侧独立补验，见上）

## 发现

### F1（P1 · 产品缺陷，确定性）大纲标题字号保存后重开不恢复

- 套件 `tests/outline-title-scale-browser.test.mjs`（3 契约）在 Run 1、Run 4 两次全量及一次单独复跑中 **3/3 同一点失败**：滑杆设 2 与 0.2 的即时生效断言均通过，保存 1.7 成功（PUT /api/settings 200 且落盘值正确），`page.reload` 后等待大纲 H1 字号恢复为 57.8px（34×1.7）在 test.mjs:53 超时。超时诊断态：文档完整加载（3,112 行 / 306,869 字）、大纲 21 行在位、零页面错误，字号停留在 1 倍。
- 根因（源码定证）：设置值经 `main.js:322` 注册订阅 → `workspace.setOutlineTitleFontScale`（`ui/workspace.js:411`）以 `currentOutline?.grid?.setTitleFontScale(value)` 可选链转发。若设置模块在页面加载后发布已存值时大纲网格尚未创建（或正处销毁重建间隙），该值被静默丢弃；`createOutlineGrid` 恒以倍率 1 初始化且无补发路径。属启动时序竞态，在较慢环境（如本机 2 vCPU）稳定复现，快速机器上可能长期潜伏。
- 与 2026-10-25 主线审计的 LaTeX 审阅计数重开失败（已由 ea5b0ca 以「启动收尾补发」修复）属同一失效类别：**异步启动后已存状态的恢复发布不可靠**。

### F2（P2 · 测试可移植性）media-adoption-syntax 仍钉死个人机器浏览器路径

- `tests/media-adoption-syntax.test.mjs:27-28` 硬编码 `/Applications/Google Chrome.app/...` 与 `/Users/daisor/Library/Caches/ms-playwright/webkit-2359/pw_run.sh`。主线 cc14a72 已把同类钉死路径的两个套件转为 Playwright 托管启动，唯独漏了本套件。该路径违反 AGENTS.md 第 7 条（个人绝对路径不得写入通用测试）；在作者机器之外的 macOS 上本套件无法启动浏览器。Linux 审计中经 `audit-browser-preload.mjs` 覆盖 executablePath 而 PASS（含 Run 4 的 14 号套件），故不影响本次 Linux 结果，但属真实存量缺陷。

### F3（P2 · 偶发观察，未定性为缺陷）cm6 保存后滚动位置单次跳变

- Run 4 中 `tests/cm6-browser.test.mjs` 在 test.mjs:76 断言失败一次：保存后 `scrollTop` 由 121903 变为 38（SAVE_POSITION 日志在案）。Run 1 该套件 PASS；失败后单独复跑两次均 PASS（SAVE_POSITION 前后均为 121903）。合计 4 个样本 1 次失败，定性为**时序敏感偶发**，不排除保存完成与滚动测量之间的竞态；样本不足以定性为产品缺陷，本轮未对其做推测性修改，建议主线在高负载环境下留意复现。

### 观察（不计失败）

- `vite.config.mjs:28-29` 的 dev-server PDF 路径默认值仍回退到作者 iCloud 路径（`V6_PDF_PATH` 未设时）。仅影响在他人机器上以默认配置启动 Vite dev 的场景（PDF 端点 404 并有 existsSync 保护）；审计入口恒设 `V6_PDF_PATH`，生产构建不经此路径。属第一轮审计 F1 的存量尾巴，建议主线顺手改为显式无默认（缺失即报错）以彻底关闭。

## 未验证 / BLOCKED 项

- **macOS 原生运行**：本审计员仅在 Linux 执行；macOS 结果未验证（依 AGENTS.md 第 7 条记为未验证，不以 Linux 结果冒充）。
- **生产 HTTPS 授权行为**：本地 HTTP 回环 Cookie 适配为审计层公开适配（不进入生产），生产 HTTPS 下的授权/Cookie 行为未在本轮验证。
- **冻结 tag**：本轮未复核 `v6-feature-freeze-20261022` 的远端状态（与本快照无关的历史注记）。

## 自主修复（分支 fix/muse-06bf498，自冻结 SHA 起）

冻结树哈希 `97c7cbaef453a4767e3b26a29349d94c8cb02bce` → 修复树哈希 `9154c22dd7b9d6bd989b7fe35fce5d8d0075c7e4`。共两个独立提交，完整补丁见随报告交付的 `audit-reports/fix-muse-06bf498.patch`（`git format-patch` 序列，可在冻结 SHA 上 `git am` 重放）；修复后的两个文件亦按原路径一并交付（`ui/workspace.js`、`tests/media-adoption-syntax.test.mjs`）。

1. **`287441921b7548532dbf0bd59d3cea9392eded9e` fix(ui): retain outline title font scale across outline panel lifecycle**（对应 F1）
   `ui/workspace.js` +7/−1：workspace 层记住最近一次经校验的字号倍率（校验规则与网格 setter 一致：有限数、0.2–2、同款错误信息），实时转发逻辑不变；`OutlinePanel.init()` 在每次创建网格后补发记住的值。产品侧修复，未动任何测试断言、期望值或超时。
2. **`76b8f829b36363b0275b0e8f496f587bf21d5e73` test(media): use portable Playwright-managed launchers in media-adoption-syntax**（对应 F2）
   `tests/media-adoption-syntax.test.mjs` +2/−2：照主线 cc14a72 的既定做法，将两个钉死路径换为 Playwright 托管 Chromium/WebKit（空 options）。断言、夹具、行为要求零改动。

**回归证据（修复树 76b8f82）**：先以标准入口 `bash tests/am/run-grok-audit.sh 76b8f82…` 跑全量，前 19 个套件 **19/19 PASS**（含 4 号 cm6、14 号 media-adoption），运行至 20 号开头时被审计环境自身的沙箱写故障（EPERM）复发杀停——环境事件，证据为 exec 写错误记录，与修复无关。写通道恢复后，在同一隔离目标内以与运行器完全相同的环境变量单独补跑 20–30 号：**20 号连续两次 PASS**（Chrome 与 WebKit 均输出 `OUTLINE_TITLE_SCALE_PASS … persisted:1.7`，日志随报告交付），21–30 号全部 PASS。修复树合计（分两段执行）**30/30 套件 PASS**；但未完成一次不间断的 run-all、未对修复树执行 certify，故**不声称修复树已获认证**——全量认证须由主线在合并后的新冻结快照上复验。

**交付通道说明（如实记录）**：本审计员的已授权 GitHub 写入通道（连接器 push-files）只能在默认分支基础上新建分支，工具集中无「在指定 SHA 建分支」的 create-ref 能力；若用它强行建 `fix/muse-06bf498`，分支基底将不是冻结树，会误导合并方。故修复以补丁序列 + 修复后文件 + 树哈希的形式随本报告分支交付，本地修复分支（提交如上）完整保留；主管 AI 可在冻结 SHA 上 `git am` 重放得到相同修复树（树哈希 `9154c22d…` 可核）。报告分支 `audit/muse-06bf498-report` 本身亦由该通道在默认基底上创建，仅承载报告与证据文件，此点与前几轮交付惯例一致。

**独立性声明**：以上修复由本审计员完成，按约定**不由本审计员为其签字背书**；冻结 SHA 的原始结论（FAIL，149/155）不因修复而改变、不被覆盖。是否采纳由主管 AI 独立复核全部 Git 差异与回归证据后决定。

## 建议

### SOURCE_MERGE（可否进入开发 Main）：**建议合并 fix/muse-06bf498**

- F1 修复针对确定性契约失败，改动面极小（单文件 +7/−1），机理与 ea5b0ca 的既定修复范式同类（恢复发布补发），且补发值来自设置模块的既有校验通道，未新增状态源。
- F2 修复与主线自身 cc14a72 的先例逐字同构，零断言变更。
- 合并前请主管 AI 独立复跑 20 号套件（原失败点）与 14、19、28 号相邻套件，并核对补丁重放后的树哈希。

### PRODUCTION_CUTOVER（可否正式发布）：**不建议（NO）**

- 本冻结快照全量未获认证（149/155，F1 为确定性失败）；修复尚未经一次不间断全量认证，且 macOS 与生产 HTTPS 两项未验证。
- 建议路径：合并修复 → 从合并后的 Main 重新冻结快照 → 在新快照上取得至少一次 Linux 全量 CERTIFIED 与 macOS 侧独立证据 → 再议切换。

## 证据索引（随本报告分支交付）

- `audit-reports/evidence/audit-06bf498-run4.log`：Run 4 完整主日志（28/30、149/155）
- `audit-reports/evidence/frozen-suite20-failure.log`：冻结树 20 号套件失败原始日志
- `audit-reports/evidence/fixed-suite20-pass.log`：修复树 20 号套件 PASS 日志（Chrome/WebKit）
- `audit-reports/fix-muse-06bf498.patch`：修复补丁序列（2 个提交）
- Run 1/2/3 的日志与全部单独复跑日志保存在审计员本地工作区 `~/workspace/audit-06bf498-evidence/`，可按需补交。
