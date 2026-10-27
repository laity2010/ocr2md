# OCR2MD · 独立审计统一入口

本文件是工程**操作流程**，不是 AGENTS.md 新增的正式原则。Grok/Muse 使用同一 Git SHA、同一 AM 全量测试入口 tests/am/run-grok-audit.sh；审计结论来自独立真实执行，不得互相转抄。旧公开审计包曾用本文件作为单一冷启动入口，本轮恢复此方式。

## 固定的六个状态

1. PREPARED：本地基线预检，固定 40 位完整源 SHA；冻结 audit/* 分支及标签，普通 push 到核实为私有的审计镜像，不改变公开/生产引用，不上传 .v6、PDF、个人工作数据或密钥。
2. DELIVERED：向 Grok/Muse **实际执行会话**发送仓库、固定 ref、完整 SHA、夹具领取方式、任务书与报告路径；创建 GitHub Issue 不等于真正投递。
3. ACKNOWLEDGED：每个 AI 使用**自己的**访问权限实际读取冻结 ref，检出并确认目标 SHA、干净工作树、可用运行环境，交回下面的 AUDIT_ACK 或有证据的 BLOCKED。发起方本机有权限不能替代对方的 ACK。
4. EXECUTED：在独立工作区使用真实夹具运行 AM/Git、专项测试与 Chromium/WebKit，记录每项 PASS/FAIL/BLOCKED、命令、原日志、平台信息。
5. REPORTED：审计者把独立报告及证据提交到自己的 audit/<ai>-<sha>-report 分支，或清楚申明 REPORT_PUSH BLOCKED；原被审 Git SHA 不得改变。
6. REVIEWED：集成 AI 独立审阅和复验修复；修复分支合格后才可正常合并到持续开发 Main，生产发布另行审批。

每个状态都必须有证据；不能因“已建立 Issue”、测试脚本命名或 Git 作者名称就声称某 AI 已经开始/完成。

## 统一交接卡（对 Grok/Muse 各自发送一次）

- 来源仓库（含权限）：git@github.com:laity2010/ocr2md-independent-audit.git
- 冻结引用：refs/heads/audit/<name>；完整 Git SHA：<40 hex>
- 报告分支：refs/heads/audit/<grok|muse>-<shortsha>-report
- 目标环境：实际 OS/CPU、Node/Python、Chromium/WebKit；不能在模拟 iPad 上声称真机 PASS
- PDF/MD：仅走有权限的私有夹具渠道，先验证 SHA；不得把用户母文件用于写入测试
- 交接入口：被审提交中的 AUDIT.md；统一测试命令：bash tests/am/run-grok-audit.sh <40 hex>
- 独立任务：记录 AM API/事件/订阅/跨模块调用、WCP/Lab 覆盖差异、Git、CAS/412 草稿、生产/实验接线，并分别判断 SOURCE_MERGE 与 PRODUCTION_CUTOVER

先在该 AI 自己的会话询问：“请只完成仓库权限、冻结 SHA、环境三项读取验证，返回 ACK 或 BLOCKED；收到 ACK 后再执行全量审计。”**不要一次发送后就认定已经开工。**

## 审计者权限与环境验收

在隔离目录克隆或 checkout 冻结审计分支（不能跟踪浮动 main）。新 SHA 会包含只读验收脚本：

~~~sh
# 三个值必须从本轮交接卡逐字填入。
REVIEWED_SHA='<40位 SHA>'
SOURCE_REMOTE='git@github.com:laity2010/ocr2md-independent-audit.git'
FROZEN_REF='refs/heads/audit/<完整分支名>'

git clone --branch '<完整分支名>' "$SOURCE_REMOTE" ocr2md-audit
cd ocr2md-audit
bash scripts/audit-ack.sh "$REVIEWED_SHA" "$SOURCE_REMOTE" "$FROZEN_REF"
~~~

仅出现 AUDIT_ACK READY 且回执 sha/ref 与任务一致，才可进入 EXECUTED。连接器型 AI 可以采用其真实 GitHub 读取工具检查相同 SHA/文件，但必须附实证；无法运行命令标 BLOCKED: ENV，缺权限标 BLOCKED: REPO_ACCESS。

**旧冻结 SHA 的兼容**：2026-10-27 冻结的 99531372736085eb5a8c89ea6bbf315c4378c504 尚无此脚本。不得改写旧快照。对旧任务，真实执行 git ls-remote --exit-code 检查远端 ref、git rev-parse HEAD 核对完整 SHA、git status --porcelain 核对干净工作区，返回相同字段即可。

## 审计执行、签字与修复

- 验证 Git 树与夹具哈希、OS/CPU、Node/Python/SQLite、Playwright 和**真实启动的** Chromium/WebKit；可运行的项目全部实际执行，不能把 BLOCKED 填 PASS。
- 标准 AM 全量命令：bash tests/am/run-grok-audit.sh "$REVIEWED_SHA"。该命令会在隔离 detached worktree 内执行；报告保留测试计数、失败套件、退出码、AM certify、Git fsck。AM 全表通过不等于 WCP/Lab 源码架构自动合格。
- 源码审阅另核对 WCP 消息和 AM 注册表、跨模块直接 import/DOM/store、构建期替换、生产与实验差异、HTTP 428/412 和双编辑器保留草稿。标明风险 P0/P1/P2 与实际证据路径；区分 SOURCE_MERGE / PRODUCTION_CUTOVER。
- Grok 可在另一个 fix/grok-<sha>-* 分支修复自己的 FAIL，**原报告必须保留**；修复后提交代码/测试 diff 与回归证据，不能自行充当独立复核者。Muse 作交叉审计，集成 AI 决定能否进入持续开发 Main。任何合并采用正常 Git merge，不 rebase、reset-hard、force-push，不擅自生产发布。
- Main 可以同时继续开发。合入修复时以当前 Main 再检查影响差异与补审范围；旧报告只证明旧 SHA，不代表新 Main 已全面认证。

## 2026-10-27 的既有历史状态

冻结 SHA 9953137：Grok 已提交独立 FAIL 报告 c8b9536；Muse Issue #2 仍未收到实际 ACK/审计报告。本文件的新增不构成对 Muse 旧任务的实际派送。当前私有镜像是否能被 Muse 访问，必须由 Muse 在自身会话独立验证。
