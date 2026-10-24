# OCR2MD V6 · 第三方独立 AM/Git 审计入口

**此分支是公开的审计交付包，不是 V6 正式开发分支。**

| 对象 | 固定值 |
| --- | --- |
| GitHub | `https://github.com/laity2010/ocr2md.git` |
| 审计包分支 | `audit-fixture-5c7497c` |
| **待审计源码提交** | `5c7497cdf94ea35217e83effd9496a045625fef0` |
| PDF SHA-256 | `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab` |

审计包后续可能修订入口和夹具说明，**不允许把审计包 HEAD 当成被审计的业务源码 HEAD**。脚本在兄弟目录建立固定提交的 detached worktree，并从审计包提取原始 PDF 到 Git 忽略的 `.v6/workspace/`。不会修改 GPT 主线。

## 从零开始

在 **macOS（标准基准环境）** 或已安装 Playwright Chromium/WebKit 系统依赖的 Linux 上，准备 Git、**Node.js ≥22.13**/npm、Python 3。Node 20 虽能尝试安装依赖，但不满足本审计包 PDF.js 等依赖的引擎要求，因此入口会直接返回 `AUDIT_NODE_UNSUPPORTED`。然后：

```bash
git clone --single-branch --branch audit-fixture-5c7497c \
  https://github.com/laity2010/ocr2md.git ocr2md-audit-bundle
cd ocr2md-audit-bundle
bash audit.sh
```

Linux 首次准备系统库时执行一次 `npx playwright install-deps chromium webkit`（按系统权限可能需要 sudo），或者在拥有 root 权限的隔离容器中用 `OCR2MD_AUDIT_INSTALL_SYSTEM_DEPS=1 bash audit.sh` 自动安装。默认不擅自更改第三方机器的系统库；若缺失，脚本给出明确 `AUDIT_BLOCKED`。

不需要 GitHub 写权限、Grok 凭据、AgentDock、用户 Mac 原始工作目录或其他私有文件。审计包的 PDF 在 `.v6/workspace/buffetts-alpha.original.pdf`，哈希参见 `.v6/grok-handoff/fixtures.SHA256SUMS`。**当前 GitHub 仓库和 PDF 均为 Public；不可视作私有数据通道。**

脚本执行：

1. 检查 Git 当前是审计包分支、工作区干净、冻结业务源码确实是该分支的祖先；启动前检查全部已登记测试的固定端口未被旧服务占用（忙则 `AUDIT_TEST_PORT_BUSY`，不自动杀进程）；
2. 创建/复用兄弟目录 `../ocr2md-v6-audit-target`，checkout 到上表**固定的源码 SHA**；
3. 校验 JSON/Markdown、PDF 哈希，拒绝改写 PDF，并统一设置 `V6_PDF_PATH` 为隔离夹具的绝对路径，避免冻结的 Vite 默认为开发者的 iCloud 路径而在 Linux 返回 `/api/pdf` 404；
4. 对 Web 工作台和独立 `packages/minerujson-md` 转换器分别执行锁文件安装与构建，并安装匹配 lockfile 的 Playwright Chromium/WebKit，在 Mac/Linux 使用真实可执行文件（不依赖用户机器的绝对浏览器路径）；
5. 对历史 start-only UI 测试单独使用 Git 跟踪的压缩审阅夹具（14 条章节标定），结束立即恢复原始零标定样本；对历史章节发布测试单独在忽略目录放置由本次 dist 构建生成的完整 release 快照；冻结测试断言和受审源码均不改变，两项前置夹具在 JSON 证据中显式登记；
6. 在冻结源码执行 `tests/am/run-grok-audit.sh`：AM build/check/coverage/edges、全部已登记测试、certify 和 Git fsck；
7. Linux 环境为仍使用 macOS `sips` 的两项冻结媒体测试提供基于 Chromium 的真实 PNG→JPEG 转换，按 `AUDIT_LINUX_SIPS_SHIM` 日志登记；不修改原测试或跳过断言；遇到 Linux 80s 等页面等待失败时，自动将页面状态/脚本名/JS 错误写入 `AUDIT_LINUX_WAIT_DIAG`，不改变超时阈值；
8. 仅 Linux WebKit 的本地 `http://127.0.0.1` 测试解锁响应，保留服务端验证码和权限校验，在验证解锁成功后让 WebKit 的本地 Cookie Jar 接收非 Secure 的同一有效 Cookie；对两项 Python 服务测试等待真实的初始化/授权探测结束；此适配**不能替代 HTTPS 生产授权的验收**，日志标记 `AUDIT_LINUX_WEBKIT_LOOPBACK_COOKIE_ADAPTER`；
9. 生成 `.v6/audit-reports/RUN_EVIDENCE.json` 和 `run.log`，失败也保留证据。

仅 `AM_FULL_TABLE_PASS` 加 `AM_FULL_TABLE_CERTIFIED` 才能称已登记契约全表通过。139 是**契约关联数**，不是 139 个互不相关的黄金单测；脚本通过也**不等于**模块边界已独立审完。

如需复跑，在原目录再次执行 `bash audit.sh`；仅在目标 SHA 与工作区状态仍安全时复用 worktree，不删除既有内容或强行清理。

Linux 推荐在具有匹配 Playwright 浏览器及系统库的容器中运行（版本来自 package-lock）；Linux 的渲染结果必须标注为**异平台**，不得假称经过 Mac/iPad 实机视觉验收。缺少系统库/网络/浏览器时保留日志并报告 BLOCKED，不能跳过某些脚本后宣称 PASS。

## 给第三方 AI 的审计任务

你是独立审计员。**先读本文件、`AGENTS.md`、`README.md`、`tests/am/README.md`。**

运行上述冷启动命令；核对 `RUN_EVIDENCE.json`、每一份 `.v6/tests/am-full-*.log`、`am.py certify`、`git fsck`。然后**独立检查源码**：查找实际跨模块导入、直接读写、非登记 API、模块职责越界与 Git 历史风险。AM `edges debt` 仅返回**已登记**债务，不是全仓无越界证明。

把你**自己**的报告写入冻结源码工作树 `.v6/audit-reports/INDEPENDENT_AM_GIT_REPORT.md`。至少包括：

- 固定被审计 SHA、审计包 SHA，操作系统/架构、Node/Python/Playwright/浏览器版本、PDF/JSON/Markdown 校验；
- 每个运行脚本的实际结果，139 条登记契约的 PASS/FAIL/BLOCKED/SKIP/NOT VERIFIED，日志的相对路径；`certify` 和 `git fsck` 的结论；
- 对 AM/API/跨模块调用的**独立源码检查**，发现的问题附文件行号、可复现步骤和建议；未发现也说明检查范围；
- 结论明确区分测试通过与架构审计完成，保留环境差异和未检查范围。

严禁写回或推送 GPT 主线、审计包、原始 PDF，也不得读取/上传别人的凭据。审计结果通过聊天附件或用户另行授权的报告渠道提交；只读 Git 凭据不授予 GitHub Issue 写权限。

审计分支内部分历史说明（包括 `tests/am/GROK_AUDIT.md`）曾要求额外传递 PDF、SSH 访问；对**本审计分支**以当前 `AUDIT.md` 为唯一交接入口，对**业务源码**以固定 SHA 对应内容为准。历史文本不应覆盖更新后的事实。
