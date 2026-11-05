# OCR2MD V6 · PDF 版面元素标定：内外三方统一独立审计与修复任务书

> **唯一任务书，三个独立执行者**：Internal、Grok、Muse。除了交付分支名称中的 `AI_ID`，三者收到**相同**的审计意图、测试入口、证据门槛和报告字段；不再存在「内部审计主管专用 Prompt」与「外部低配 Prompt」。本文件是本轮实际执行指令，受 `AGENTS.md` 和冻结 SHA 的 `AUDIT.md` 约束，不修改工程正式原则或审计基线。

## 0. 固定材料（每一方都必须亲自验证）

| 项目 | 唯一数值 |
| --- | --- |
| GitHub | `https://github.com/laity2010/ocr2md.git` |
| **受审源码 SHA** | **`9c47e44f1fc6b44b4f126030d68008854aced6ca`** |
| 冻结源码引用 | `audit/pdf-layout-elements-20261105` |
| 公开可匿名审计包 | `audit-public-pdf-elements-9c47e44` |
| 审计包提交（**不是**受审源码） | `a1c9c57f887523084b8eafe5b2f5568902826bc2` |
| 原始 PDF 夹具 SHA-256 | `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab` |
| MinerU Markdown 夹具 SHA-256 | `d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764` |
| **共用审计入口** | **在上述审计包的匿名新克隆中 `bash audit.sh`**（它隔离执行 `bash tests/am/run-standard-audit.sh <SHA>`） |

材料检出：

```sh
git clone --single-branch --branch audit-public-pdf-elements-9c47e44 \
  https://github.com/laity2010/ocr2md.git ocr2md-pdf-audit
cd ocr2md-pdf-audit
bash audit.sh
```

每方分别独立记录自身的 clone、SHA、PDF/MD hash、Git 状态、OS/架构、浏览器版本、命令退出码和原始日志。**对方通过或本机已有日志不能代替亲自验证**。若 `bash audit.sh` 因 AM 基线错误停止，先保留 FAIL，再逐阶段隔离执行可运行的直接测试，不跳过失败证据。

## 1. 统一审计意图与不可降低的检查面

**共同目标**：审查里程碑的六类 PDF 版面元素标定，确保功能真实可用且遵循统一 CMD/CM6/AG 接口契约，跨窗交互正确、原始 OCR 证据只读、Git 和跨平台可复现；发现问题后各自独立修复，最终由集成审核采纳修复，不预先接受任何一方的结论。

1. **标题**：层级、章节边界/导航、CMD 标记、AG 投影、源码/PDF/Markdown 定位。
2. **文本块**：原生 MinerU → CMD PBS/BC 初始化；父子标签、归入/拆分/排序、原始 PDF bbox/子框身份和跨窗定位；被归入块与原物理块的映射；图片/跨页 HTML 表格定位。
3. **非法断行**：块内/跨块及 `正文→LaTeX→正文` 两段独立候选；A/B 两端定位和着色；`合并/忽略/待定`；跨块只用后块 `lb=m/i`，块内位置级注释；不立即合并；AG 下拉不重刷，Undo/Redo、保存刷新一致。
4. **LaTeX**：公式识别、源码/预览/AG 联动、渲染、审阅、错误反馈和结构边界。
5. **媒体**：图片/图表位置、来源状态、采用与本地替换、预览/源码/PDF 同步。
6. **注释对**：注引与注文提取/配对、审阅着色、格式转换与多窗定位。

**所有模块共同强制检查**：唯一 CM6 Markdown 源；CMD 独占注释/标签读写；AG 只是投影且操作不重置行/筛选/滚动；静态与运行时跨模块 API/消息边界；历史 Git 引入点及越界 revert 策略；HTTP 412/428 和乐观保存冲突；Mac/Linux 及 Chromium/WebKit 实测与局限；原 PDF、MinerU JSON、iPad 用户数据不可改。功能测试 PASS **不代表** AM/Git 边界 PASS。

## 2. 完全相同的审计步骤（每方执行）

**A · 原始审计**：从固定 `9c47e44` 的只读快照执行统一脚本，保留 `run.log/report.json/report.md`，记录原始 `PASS / FAIL / BLOCKED / REVIEW_REQUIRED`，额外手工核对动态 DOM、跨模块共享状态、未登记调用；没有执行的项目不得报 PASS。完整入口未跑完须说明到哪一步及退出原因。

**B · 独立修复**：从固定源码 SHA 创建自己的 **`fix/<AI_ID>-pdf-elements-9c47e44`** 分支/隔离 worktree，先保存原失败证据，然后针对真实问题自行修复（允许结论不同、方案不同）。不访问其他审计者的 `fix/*` 作为解决方案，不直接改 Main、源快照、原始 PDF/JSON 或生产数据。不可删除测试、放宽断言、改 Schema 洗白或直接为真实越界添加许可登记。若不能安全修复，保持 FAIL 并说明。

**C · 修复后验证**：实际运行受影响专项测试、模块 API/消息/边界检查、Chrome/WebKit、AM `check/coverage/edges/run-all/certify`；在自己的修复提交上运行 `bash tests/am/run-standard-audit.sh <本人的完整 FIX_SHA>`，不把审计包内固定原始 SHA 的 `bash audit.sh` 当作修复后验收。原始 `9c47e44` 的 `bash audit.sh` 必须保留其原始 FAIL 与日志。按最终修复 SHA 重新给出真实退出码，不得将修复后的 PASS 追记到旧 `9c47e44`。跨平台环境不具备则标 BLOCKED，并列明差距。保留原始及修复后两套日志。

**D · 独立交付**：各自在 `audit/<AI_ID>-pdf-elements-9c47e44-report` 报告分支保留原始和修复后结果，`fix/<AI_ID>-pdf-elements-9c47e44` 分支保留实际源码/测试修复。普通 push，禁止 force/rebase/reset-hard/clean。向集成者交付报告 HEAD、修复 HEAD、固定原始 SHA。**修复者不对自己的修复签发独立认证**。

## 3. 统一报告字段和通过门槛

每人必须以**同一结构**报告：

| 字段 | 交付内容 |
| --- | --- |
| `AI_ID`、环境 | internal/grok/muse，OS/架构、Node/Python、浏览器/工具版本 |
| `SOURCE_SHA` / `FIX_SHA` | 冻结 SHA 和自己的修复 SHA，均完整 40 位 |
| 交付来源 | 独立 clone 的 Git ref 与 PDF/MD SHA256 证明 |
| 初始结果 | 原始 PASS/FAIL/BLOCKED/REVIEW_REQUIRED、可复现步骤、源代码位置、日志证据 |
| 问题清单 | ID、模块、P0/P1/P2、发生机制、受影响边界、Git 引入点 |
| 自主修复 | 独立提交、实际 diff、为何修复而不是隐藏问题、保留的原始测试 |
| 修复后结果 | 每项测试命令/真实退出码、浏览器数据、AM 检查、残留未覆盖项 |
| 两个判断 | `SOURCE_MERGE` 与 `PRODUCTION_CUTOVER` 分开，给出 PASS/FAIL/BLOCKED/REVIEW_REQUIRED 和证据 |

**相同标准**：只在测试确实执行且契约与动态边界均有充分证据时判 PASS；确认违规即 FAIL；环境/材料不具备为 BLOCKED；未核实动态调用/边界为 REVIEW_REQUIRED。各自独立确认，不强迫三方意见一致，不用多数票替代证据。

## 4. 已知基线问题（各方都必须自行复现）

`9c47e44` 的 AM `registry.sql` 在原始 `visibility` 数据约束处失败，还存在 API 编号重复；解决第一层后可能出现历史 API/edge 登记失效及 PDF 回调 owner 不匹配。此为**调查线索，不是审计答案**。必须从原始 SHA 再现第一手证据。内部此前的报告：`audit/internal-pdf-layout-9c47e44-report`；该报告不得作为内部自身下一次审计的替代证据，更不得代替 Grok 或 Muse 的独立执行。

## 5. 最终集成：三方各修各的，最后才合并 Main

审计三人完全平行、互不等待各自修复。由**集成负责人**（不是三位审计者的任何一个在自己分支上宣称的 PASS）在三份报告和修复提交到齐后：

1. 在最新开发 `main` 的**隔离**工作树建立 `integrate/pdf-elements-9c47e44`，冻结新的集成起点 SHA，保留现有用户文档及所有审计源 ref。
2. 按缺陷 ID 去重/归并，核对三份原始日志、修复 diff、API/消息边界、跨平台结果。针对同一问题**择优采纳一套修复**，不是三份直接叠加；有冲突则在集成分支处理，必要时请其他审计者交叉复核。
3. 采用普通 Git `merge`（不 rebase/force）引入经过确认的修复，保留提交与来源。拒绝或延期的修复也记录理由，不误称已经采纳。
4. 对集成分支**最终新 SHA**重跑完整 AM/Git 统一审计、六模块业务回归、Chrome/WebKit、适用的 Mac/Linux 验证，并复核 Main 自审计基线以来的新增改动。若存在 FAIL/BLOCKED 或重大 REVIEW_REQUIRED，保持集成分支，不并入 Main。
5. **只有集成验收合格且符合 `AGENTS.md` 授权时**，才普通 merge/fast-forward 到开发 `main`；合并后对 Main 最终 SHA 再核对对应测试与 Git 状态。通过 AM/Git 全量门禁才正常 push 远端正式 Main；开发入口按 Main 发布规则处理；正式生产晋升另需用户批准。

本轮不以旧 `9c47e44` 的任何结果为未来集成 SHA 的认证。三方结论相互独立，最终不是投票，而是集成证据与测试门禁裁决。

## 6. 三方共同使用的唯一 Prompt

> 将**这一整份任务书**原样交给内部 AI、Grok 和 Muse；仅各自设置 `AI_ID=internal`、`AI_ID=grok` 或 `AI_ID=muse`。其余内容、固定 SHA、执行入口、缺陷等级、可交付标准完全一致。内部 AI 应按自己的 fix 分支独立修复，而非只作为外部调度者。收到文件或 GitHub 链接不等于 ACK：需要三人各自核验 GitHub 获取材料并确认接受任务；未确认时只记录 `PENDING`，不能声称已经开始或通过。

## 7. 本轮执行状态（非审计结论）

| 审计者 | 原始材料/ACK | 独立修复 | 报告状态 |
| --- | --- | --- | --- |
| Internal | 已执行先期基线检查；固定 SHA 的 AM 登记表构建 **FAIL** | 本地隔离候选 `fix/internal-am-pdf-elements-9c47e44`，提交 `c618d68`，**仅是未认证的初步修复** | 先期原始证据见 `audit/internal-pdf-layout-9c47e44-report`；仍须按此统一任务书独立复测 |
| Grok | **PENDING ACK**；公开 GitHub 审计包已就绪，不等于接单 | 未确认 | 未收到独立报告 |
| Muse | **PENDING ACK**；公开 GitHub 审计包已就绪，不等于接单 | 未确认 | 未收到独立报告 |

本表只记录已经核实的事实；某个审计者提交新证据后应通过独立审计报告更新状态，不悄悄改变冻结源码或原始 FAIL 记录。
