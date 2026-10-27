# OCR2MD · 外部 AM/Git 审计工作流

本文件是 OCR2MD 审计的**唯一操作手册**，详细执行 `AGENTS.md` 第 6、7 条；不是独立的工程原则，也不能改变 `AGENTS.md` 的正式授权与发布门禁。Grok、Muse 使用**同一份 Prompt 模板、同一固定 Main SHA**，但在各自环境中独立审计、独立修复。**人工唯一交付动作是转发一份标准审计 Prompt**；主线 AI 必须在此前将源码快照、版本化审计说明、PDF/MD 测试夹具及哈希证据全部放到 GitHub 的实际可下载位置。外部 AI 从 GitHub 自行取得和验证全部资料，绝不要求用户另行传送 bundle、PDF 或其他文件。GitHub 上传成功不等于外部 AI 可取件：经用户授权公开的审计包必须实际通过匿名 HTTPS 冷克隆验证；私有仓库必须确认接收 AI 自身具有可用的连接器或 Git 传输权限，未验证应标为 `BLOCKED: DELIVERY_ACCESS`。不依赖 GitHub Issue 自动派单，也不建设额外审计任务调度系统。

### 经用户授权的公开审计包（已验证案例）

2026-10-27 用户明确授权 OCR2MD 项目公开，已使用原公开仓库 laity2010/ocr2md 的独立 audit-public-06bf498 分支发布本轮审计包：固定受审源码完整 SHA 为 06bf498daab22ad175f5ae4727a2c1e66b38402c；审计包 HEAD 为 75567488c52dcd92afa9ff8baf179c0b379f26c3；完整 PDF 及 MD 夹具已校验哈希。已由无凭据的匿名 HTTPS 单分支冷克隆实际验证，包内根目录 audit.sh 为一键入口。发布仅限审计包分支，没有推送未验收的开发 Main，也没有部署生产。

每次新审计优先复用已成功的模式：检查冻结 SHA、全部可达 Git 历史及测试数据是否存在不应公开内容；若已获得相应公开授权，则从冻结 SHA 创建**独立交付包提交**，内置受许可的 PDF/MD 测试夹具、根目录 AUDIT.md 和 audit.sh；普通 push 到原公开 GitHub 仓库的独立审计分支，再实际使用无凭据的 HTTPS 完整克隆验收。该交付包 HEAD 可以晚于被审源码 SHA，但必须准确披露两者关系，所有运行与结论绑定**被审源码 SHA**。若未获公开许可，不得借审计便利泄露私有内容；私有渠道需真实验证接收 AI 有权读取，未通过则停止交付并报告 BLOCKED。

~~~
git clone --single-branch --branch audit-public-06bf498 https://github.com/laity2010/ocr2md.git ocr2md-audit-06bf498
cd ocr2md-audit-06bf498
bash audit.sh
~~~

## 1. 工作流与责任

| 阶段 | 执行者 | 可验收的交付 |
| --- | --- | --- |
| 1. 整合 | 主线 AI | 用户已批准的 Lab 通过正常 merge 进入**持续开发 Main**；原 Lab 分支、快照及数据冻结。若没有待合并 Lab，直接进行下一阶段 |
| 2. 冻结 | 主线 AI | 核查 Main 状态与本地 AM/Git 基线，冻结完整 40 位 Git SHA，创建只读 `audit/*` 引用；经用户明确授权公开并通过敏感内容预检时，普通 push 到公开仓库的独立审计交付分支；否则须使用已验证接收端权限的私有仓库，不动开发/生产分支 |
| 3. 准备 | 主线 AI | 从下方**单一模板**生成一份审计 Prompt；注明仓库、SHA、GitHub 取件方式及预期报告/修复分支；由用户仅转发这份 Prompt 给 Grok、Muse |
| 4. 接单 | Grok / Muse | 在**自己的**执行环境核实仓库访问、准确 SHA、Git 状态与运行能力；给出 ACK 或真实的 BLOCKED 原因。人工转发不等于接单成功 |
| 5. 审计与修复 | Grok / Muse | 各自独立运行 AM/Git、浏览器及专项检查；保留初始失败证据，**在自己的修复分支**自主修复、复测；不互相等待、不修改冻结快照 |
| 6. 报告 | Grok / Muse | 各自独立审计报告、修复报告、日志与 Git 提交/分支。未修复问题及 BLOCKED 原样记录 |
| 7. 集成 | 主线 AI | 复核真实 Git diff、AM/WCP 边界、原始与修复后证据，必要时交叉复验；决定是否把部分或全部修复正常 merge 到最新开发 Main，并补做受影响测试 |

审计 Main 时，**当前 Main 可继续开发**；冻结 SHA 不随其移动。修复合入开发 Main **不等于正式生产发布**，正式上线仍按 `AGENTS.md` 由用户批准及适用跨平台验收。执行期间禁止 rebase、reset --hard、git clean、force push；不修改生产数据、冻结 Lab、原始 PDF 或他人的实验环境。

## 2. 统一审计 Prompt（人工转发用）

主线 AI 每次只生成**一份** Prompt（以下模板），把占位符填成真实值，原文分别转发给 Grok 与 Muse；两边可依据自身平台特点选择额外的测试，但不能删减共用验收范围。优先采用已获得授权且通过安全检查的公开审计包，实测匿名 HTTPS clone；私有交付必须额外验证接收 AI 自身权限，不能把主线的 GitHub 权限当作对方权限。

```text
你是 OCR2MD 独立审计与修复 AI（Grok 或 Muse）。请独立执行以下任务，不引用另一位 AI 的审计结论作为自己的 PASS。

审计仓库：<GITHUB_REPOSITORY_URL>
冻结源码分支：<AUDIT_SOURCE_BRANCH>
审计交付包分支（公开方式）：<PUBLIC_AUDIT_PACKAGE_BRANCH>
待审 Main 完整 SHA：<40_CHAR_SHA>
GitHub 审计材料入口：<PUBLIC_AUDIT_PACKAGE_BRANCH_OR_PRIVATE_ARTIFACT_PATH>（含源码、PDF/MD、哈希与审计脚本）
GitHub 审计材料的权限要求与获取说明：<ACCESS_VERIFICATION_INSTRUCTIONS>
原始报告分支：audit/<AI>-<SHORT_SHA>-report
独立修复分支：fix/<AI>-<SHORT_SHA>
唯一工作流入口：该冻结提交根目录 AUDIT.md
统一 AM 执行入口：bash tests/am/run-grok-audit.sh <40_CHAR_SHA>

第一步：如果交付为公开审计包，从 GitHub 匿名 HTTPS clone 指定审计交付包分支，核实该分支包含指定完整源码 SHA 与 PDF/MD 夹具，运行 bash audit.sh（它在隔离 worktree 审计固定源码 SHA，不把交付包 HEAD 误认成被审源码）。私有交付则由本人授权 GitHub/Git 实际验证仓库访问和 SHA，可使用 scripts/audit-ack.sh。无论哪种交付，都记录真实平台、Git 状态、哈希与运行结果；失败必须报 BLOCKED，不得臆造 PASS。

第二步：在独立 worktree 运行全部适用 AM/Git、Chromium/WebKit 和业务专项检查，人工独立审阅 AM/API/消息订阅、WCP/Lab 边界、跨模块 import/DOM/store 调用、构建期改写、版本/跨平台差异、HTTP 428/412/CAS 与草稿保护、生产与 Lab 功能激活；如有未覆盖范围，如实报告。真实 iPad 与模拟 WebKit 不可混称。

第三步：把原始发现和 FAIL/BLOCKED/日志先固化在审计报告中（不能在修复后抹去）。在自己的 fix/* 分支从指定 SHA 出发逐项自主修复，运行相关回归，不降低断言、不删除失败测试、不放宽授权或数据隔离；遇到无法安全修复的事项，保持未解决而非强行修复。

第四步：提交原始审计报告、逐项修复报告及证据到独立 audit/*-report 分支；修复代码普通 push 到自己的 fix/* 分支。报告列出原始 SHA、两条提交/分支引用、环境、复现命令、初始问题 P0/P1/P2、实际修改文件、修复后 PASS/FAIL/BLOCKED、遗留问题，并分别给出 SOURCE_MERGE 和 PRODUCTION_CUTOVER 的建议（最终裁决不由你作出）。

不得修改源 audit 快照、开发 Main、冻结 Lab、正式用户文档或生产发布目录。禁止 force push/rebase/reset-hard/git clean。检查 Git 凭证与日志是否包含隐私信息，不上传令牌、原始用户数据或未授权 PDF。修复者不能给自己的修复出具独立审计签字。
```

注：模板中的 `<AI>` 填为 `grok` 或 `muse`，但任务主体和验收标准完全相同。主线 AI 应当把填好的**同一 Prompt**交给用户转发，不额外维护两套分叉的 Prompt 文件。GitHub Issue 可作记录，但**不作为任务送达、接单或执行的证据**。

## 3. 冻结快照与接单门禁

- 主线 AI 在 `git status --porcelain` 为空、`git rev-parse HEAD` 与目标完整 SHA 对齐、`git diff --check` 及基线 AM/Git 预检完成后，建立不可随 Main 漂移的 `audit/<名称>` 分支与对应标签。未通过项记录清楚，不得把本地预检叫作外部全量认证。
- 交付使用已核实为私有的仓库，冻结源分支只作**读取**。如 Git clone 在接收端不可用，应把经过独立 clone 验证的 Git bundle 作为 GitHub 托管的审计资产，并先核验接收 AI 能否用其 GitHub 连接器实际下载；绝不改为用户手工传文件，也不得未经授权公开私有代码。跨平台测试所需只读 PDF/MD 必须由审计 AI 自行从 GitHub 下载获授权且可核验 SHA256 的隔离夹具；源码仓库不存在的 `.v6/` 或真实用户文件不能视为自动交付。严禁把原工作目录当测试目标。
- Grok/Muse 收到人工转发后，各自先运行 `bash scripts/audit-ack.sh <SHA> <REMOTE> <refs/heads/audit/...>`（或使用其 GitHub 连接器真实验证同等事实），记录仓库、ref、SHA、OS/架构、环境和错误。脚本/连接器验证不能由主线 AI 代跑后称为外部 AI 的 ACK。
- 若某个接收 AI 未能访问私有仓库或环境缺依赖，记录 `BLOCKED: REPO_ACCESS` / `BLOCKED: ENV`，由其说明原因并解决后重试；另一位的结果与权限不能代替该 AI 的独立验收。
- 对早于 `scripts/audit-ack.sh` 存在的冻结提交，不得为增加脚本而改写快照；可由接收 AI 实际运行 `git ls-remote`、`git rev-parse HEAD`、`git status --porcelain` 获得同等回执。

## 4. 共用 AM/Git 验收与自主修复

**全量 AM 主入口沿用既有脚本名称**，Grok/Muse 使用完全相同的命令：

```sh
bash tests/am/run-grok-audit.sh "<40_CHAR_SHA>"
```

该脚本在隔离 detached worktree 中执行，依赖固定的测试 PDF 哈希、环境与浏览器真实启动。审计 AI 要保存执行命令/退出码、构建和 AM check/coverage/edges/run-all/certify、Git fsck、Chromium/WebKit 的实际结果；运行失败保留原日志，不得改测试掩盖问题。AM 静态覆盖不足以证明所有 Lab/WCP 功能合格，需另列源码和专项业务审阅。

**分支各司其职**：`audit/main-<sha>` 为只读源；`audit/grok-<sha>-report`、`audit/muse-<sha>-report` 留存各自原始发现和后续修复证据；`fix/grok-<sha>`、`fix/muse-<sha>` 只装各自修复代码与必要的新增/纠偏测试，保留完整提交历史。报告必须指出起始 SHA、修复 HEAD 和实际差异；修复后不能覆盖原始 FAIL 事实。修复用例仍失败或不能复现则保持未解决状态。

## 5. 主线 AI 集成验收

主线 AI 只复核候选 `fix/*` 分支，**不得盲合**：核验它从冻结 SHA 出发，检查 Git diff/AM 契约/接口边界/测试证据/安全隔离。Grok 与 Muse 修复同一问题时，比较两种方案并择优，避免机械叠加和冲突；可接受部分修复、拒绝问题修复，或要求交叉审计。合格的代码使用普通 Git merge 吸收到最新开发 Main，再对因 Main 前进产生的差异补审。原始审计报告及修复报告独立保留。

最终必须分别记录两个结论：`SOURCE_MERGE`（是否能并入**开发** Main）与 `PRODUCTION_CUTOVER`（是否具备正式发布资格）。外部 AI 的自测 PASS 不自动成为独立复核 PASS；旧 SHA 的结论不能冒认为新 Main 的全面认证；正式生产发布需另行取得用户批准。

## 6. 记录位置与复用

- **正式原则**：`AGENTS.md`，第 6 条明确本文件为细节入口；新原则必须由用户批准。
- **操作流程与唯一 Prompt**：本文件 `AUDIT.md`，随流程实践维护，避免重复的交接手册。
- **AM 业务契约与脚本**：`tests/am/README.md`、`tests/am/run-grok-audit.sh`、`scripts/audit-ack.sh`；只记录真实执行所支持的事实。
- **每轮证据**：`audit-reports/`、审计分支、修复分支、Git Commit、隔离测试日志；历史报告不可改写以迎合新的结果。

未来只需向主线 AI 下达“发起标准 AM/Git 全量审计”：它就按照本文检查/冻结快照、生成统一 Prompt 交由用户转发，并在 Grok/Muse 提交修复后独立决定是否并入 Main。
