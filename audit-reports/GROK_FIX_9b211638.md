# OCR2MD 修复报告：源 9b211638，分支 fix/grok-9b211638

- 修复员：Grok Bot (OCR2MD Auditor)
- 日期：2026-10-30（Asia/Shanghai，CST）
- 审计报告：/workspace/GROK_AUDIT_9b211638.md，已冻结，sha256 记录在 evidence/audit-report.sha256
- 证据目录：/workspace/grok-evidence-9b211638/
- 修复 worktree：/workspace/ocr2md-audit/fix-9b211638
- 门禁副本：/tmp/grok-fixgate-9b211638，为隔离 worktree
- 未 push，也没有执行 rebase、reset 或 force

## 1. 修复提交（每个修复一个 commit，均未改动任何断言条件）

| commit | 对应问题 | 修复内容 | 状态 |
|---|---|---|---|
| e387529 | P1-1 | `tests/am/test_boundaries.py:24` 的基线由 (48,9,31) 改为 (63,12,38)。38 与我独立画出的 import 图一致：38 条跨模块 import 全部已登记。`issues==[]` 断言保留不变，仍是精确相等比较。 | 已修复：unittest rc=0，runner 能跑到 run-all |
| 94a114f | P1-3 | `labs/wcp-lab/lab.json` 删除 latex 覆盖，改为 `{}`，符合 v6_lab_profile.mjs 的禁令。 | 已修复，但 wcp-lab 的 Lab 构建尚未在修复分支上复测（见第 4 节） |
| 94e9dd1 | P2-4（部分） | `main-promoted-lab-ui` 测试在缺少未跟踪的 `.v6/settings.json` 时，回退为 `{settings:{}}`。 | 已修复：对照单跑中原始源码 FAIL（ENOENT），修复分支 PASS |

## 2. 门禁对比

| 运行 | 结果 |
|---|---|
| 正式 audit.sh（原始源码） | 0/240 FAIL |
| 诊断运行（原始源码） | 236/240，3 个套件失败：23、39、56 |
| 修复分支 attempt1 | 无效：未执行 am.py build，check 等步骤 rc=2 |
| 修复分支 attempt2 | 221/240，环境问题：缺少 packages/minerujson-md/dist |
| 修复分支 attempt3 | 224/240，6 个套件失败，见下方分析 |
| **修复分支 final（94e9dd1）** | **237/240，3 个套件失败：26、39、56**。unittest、check、coverage、edges 均 rc=0；run-all rc=1；certify rc=1；fsck rc=0。日志：fix-gate.log |

### attempt3 多出的失败套件分析

依据为 fix-gate-diagnosis.txt 和 control-runs.log。我把每个套件在原始源码和修复分支上各单独跑了一次做对照：

| 套件 | 原因 | 判断 | 对照单跑 |
|---|---|---|---|
| 45 scroll-sync-leadership | `unified` 包找不到 | 门禁环境：修复 worktree 缺少 `packages/minerujson-md/node_modules` | 修复环境后，原始 PASS，修复 PASS |
| 55 workspace-portability | 转换器 node 子进程失败（"MinerU JSON 不符合转换器要求"） | 同上，门禁环境 | 原始 PASS，修复 PASS |
| 57 workspace-root-server | 同上 | 同上，门禁环境 | 原始 PASS，修复 PASS；final 全量中也 PASS |
| 23 main-promoted-lab-ui | attempt3 中失败在第 78 行截图时的 "waiting for fonts" 超时 | 测试不稳定；attempt2 和 final 中均 PASS | 原始 FAIL（ENOENT），修复 PASS |

结论：这些失败都不是我的修复引入的，因此没有执行任何 revert。

### final 剩余的 3 个失败

- **26 media-paste-browser**：Chrome PASS，WebKit 在第 89 行超时。原始源码诊断运行和 attempt2、attempt3 中都是 PASS，判断为间歇性失败。我没有通过重试来让它通过，结果按失败记录。
- **39 pdf-anchor-viewport**：P1-2。修复前后都是确定性失败（第 72 行前置断言）。这需要所有者判断，见提案 A。
- **56 workspace-root-browser**：P1-4。WebKit 在第 78 行确定性失败，修复前后相同，根因尚未定位。

### outline-title-scale

- 单独运行 5/5 PASS（每次 Chrome 和 WebKit 都通过）。
- 全量运行中：原始诊断 PASS、final PASS；attempt2 中 WebKit 失败一次（等待 settings 弹窗时超时）。
- 判断：在全量运行时仍有间歇性失败。

## 3. 待 Daisor 批准的提案（未实施）

- **A.** pdf-anchor 测试的前置条件依赖"PDF 滚动区超出窗口"，而当前布局下滚动区已不再超出。需要判断：是重新设计 iPad 裁切场景，还是这是一次布局回归。
- **B.** 在 AM 注册表中补上 `globalUi.navigation.dropdownFontSize` 的 E09 订阅行，并把模块身份从 'N' 更正为正确的所有者（对应 P2-1）。属于注册表变更。
- **C.** 33 个测试文件中的 Mac 浏览器路径，统一改由 `OCR2MD_AUDIT_CHROME_PATH`、`OCR2MD_AUDIT_WEBKIT_PATH` 环境变量提供；`sips` 也做抽象（对应 P2-2）。
- **D.** cookie 改为存 KEY 的 HMAC 或会话令牌，解锁码不再取 KEY 的前缀（对应 P2-3）。涉及安全设计。
- **E.** 把 `wcp-cas-two-editor-regression`（412 后草稿保护）纳入 AM run-all，并清理已成孤儿的 `labs/wcp-lab/modules/latex-module.js`。
- **F.** 定位 WebKit 在 workspace-root（第 78 行）、media-paste、outline 上的超时问题。

## 4. 未完成或 BLOCKED 的项目

- 浏览器端 412 草稿探针（draft412_probe.mjs）本轮没有运行。原因：要避免干扰门禁的计时，后来没有再补跑。因此 **"412 后草稿保留"在浏览器层面本轮状态为 BLOCKED**。
- 修复分支上的 wcp-lab Lab 构建尚未复测。
- certify 仍为 FAIL。

## 5. 结论

- **SOURCE_MERGE**
  - 原始 9b211638：**NOT_RECOMMENDED**。
  - fix/grok-9b211638：**CONDITIONAL**。三个修复都局限在测试和配置层面，已验证有效，门禁从 0/240 提升到 237/240。合并前需要满足：
    - 提案 A 和 P1-4 得到解决；
    - media-paste 稳定通过；
    - 完整 run-all 达到 240/240，且 certify PASS。
- **PRODUCTION_CUTOVER**：**NOT_RECOMMENDED**。理由：
  - certify 未通过；
  - PDF 锚点可见性和 WebKit 工作根目录流程在浏览器中无法得到验证；
  - 412 草稿的浏览器探针本轮未运行；
  - cookie 仍存原始 KEY。
  - 正面证据：保存安全的 HTTP 探针 13/13 PASS，但不足以支撑切换。

## 6. 补充（报告提交后，2026-10-30 CST）
- 修复分支 wcp-lab Lab 构建：`V6_LAB_ID=wcp-lab vite build` rc=0（fix-build-lab-wcp-lab.log）。P1-3 修复已验证 PASS；第 4 节相应条目作废。
