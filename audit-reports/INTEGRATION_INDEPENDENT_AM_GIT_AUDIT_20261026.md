# OCR2MD V6 · Lab 集成候选独立 AM/Git 全量审计任务书（2026-10-26）

## 审计目标与数据隔离

固定目标：`integration/lab-20261026-am-audit` 分支**最终提交 SHA**（审计开始时各自记录完整 SHA，并始终校验）；母线 `build/2026-10-20` 基线为 `2c21c5418ec36e77239f31d0958e2afca3bdd508`，Lab 经验分支为 `043cbf5783c03e9a49ee11c5c018930e284d9f4e`。分支已普通 `git merge --no-ff` 形成集成候选；**没有合到正式分支，没有部署正式公网，不允许改写生产数据，也不在审计前强推/推送**。

独立审计必须各自以只读、隔离 worktree 进行。审计前：`git rev-parse HEAD`、`git status --porcelain`、`git diff --check`，检查主线 SHA 与 Lab 数据 SHA；审计后再核对。测试需要原始 PDF / MD 只能读取冻结 fixture 的 SHA256，本地无法取得则标为 `BLOCKED`。任何测试写入只能使用独立的 tmpfs / 临时文件夹。不得修改源测试断言来强行过关，不得 rebase/reset-hard/force-push。

## Grok · Linux 独立审计职责

1. 克隆/检出固定候选 SHA 的独立 worktree（如果新候选还没在私有 GitHub 提供，经用户批准的安全传输通道尚未建立，则如实 `BLOCKED: CANDIDATE_NOT_AVAILABLE`，不能以旧版 Grok 报告代替）。
2. 验证 Git 双父合并的三个输入，审查 `tests/am/schema.sql`, `registry.sql`, `ownership.json`, `audit_boundaries.py`, `ui/wcp-runtime.js`, `labs/cm-html/modules/wcp-virtual-chapters.js` 的模块所有权、公开 API 与 WCP 跨模块事件；尤其 `scripts/v6_lab_profile.mjs` 剩余构建期替换（已知技术债），标示破坏契约的 P0/P1。
3. 在隔离环境尝试 Linux-native Node/Vite 构建；运行独立 AM Python/SQLite tests，Mac-only 硬编码路径审计及可移植性检查；Linux Chromium 真机浏览器样板；若不能安装 WebKit 则标 `BLOCKED`，不冒称 PASS。
4. 审核保存 CAS：GET ETag、PUT 428/412、写锁内验证、两个独立编辑器竞争、设置/章节 alternate route、认证一致性；所有操作使用独立虚拟文件，不触碰正式/实验文档。
5. 审核 Git：异常变更、部署目录、版权/依赖更改、可回退性、无不当实验旁路，记录逐项复现命令和最终提交 SHA；独立报告 `audit-reports/GROK_INTEGRATION_AM_GIT_20261026.md`。

## Muse · macOS Chromium / WebKit 独立审计职责

1. **独立** checkout 相同候选 SHA，运行所有适用 AM/Git 检查和 WebKit/Chromium 真实浏览器回归。两人证据不能互相复制或充当另一人的 PASS。
2. 重点检查 WCP/CMD/AG/CM6/MD/PDF 的单源架构和五模块边界、虚拟章节 000–005、AG 「全部」和元素下拉、媒体四窗联动、LaTeX 审阅状态→预览滚动稳定、导航菜单及全局设置多设备尺寸。
3. 强测生产与 Lab 配置区别：默认生产构建是否真的具备拟上线功能？是否仍只在 `V6_LAB_ID=cm-html` 时注入？实验 `beforeunload` 放宽只可影响 Lab，不得溢出主线；原源码字符串注入作为潜在集成阻断。
4. 强测数据授权和 CAS 两端竞争、单文件 Save/Undo/Redo/设置重载；对 `ui/workspace.js`,`ui/main.js`,`ui/scroll-sync.js`,`ui/settings-module.js` 的跨模块访问形成 AM 图。
5. 记录 Mac Chrome 和 **真实 WebKit 引擎**截图/DOM/耗时；Linux 不可执行项原样 `BLOCKED`。独立报告 `audit-reports/MUSE_INTEGRATION_AM_GIT_20261026.md`。

## 双方报告统一结构

- Reviewed Git SHA、OS/架构/Node、浏览器实际 binary/version、测试脚本的输入 fixture SHA、每项 PASS/FAIL/BLOCKED。
- **AM 数据：模块→公开 API→publisher/subscriber→receiver→调用链**。对构建时修改原源码、不经公开接口、额外写入口必须标具体路径/行号和重现测试。
- Git：变更清单、是否覆盖正式数据、是否含删除/绕过测试/隐含绝对路径。与之前 Grok/Muse 旧审计报告区分新旧 SHA。
- 强制单独判断：`READY_FOR_MAINLINE_SOURCE_MERGE`、`READY_FOR_PRODUCTION_CUTOVER`、`BLOCKERS`。可发现 P0/P1/P2；标明责任模块及建议最小修复。
- 提交到各自独立审计分支，通过普通 push 或用户共享路径交付，**不要修改候选分支或正式主线**。两份报告均有签字结果后，由集成主管综合证据决定下一步。**审计启动不等于审计通过。**

## 当前集成主管预检结果

- 普通合并无 Git 冲突。首次 AM 静态审计发现 3 项登记缺失，在候选分支补充真实所有权与消费者，不改业务源码。随后修复 X13 陈旧 Media-CMD 调用锚点、SUB-G01 标题缩放订阅的测试登记、AM 测试文件数基线。AM Python unit 24 PASS / 1 Linux-only skipped，SQLite `AM_BUILD_PASS`, `AM_CHECK_PASS`，源码所有权 `AM_WP2_PASS`。
- Mac 默认 Vite 生产配置已生成可构建产物（在候选专属 dist，未部署根网站）；这一事实**不能证明虚拟章节已默认启用**。需要上述两份独立审计确认正式功能接线和安全切换。
- Linux 平台独立审计、两位审计者签字，以及最终完整 browser test suite **仍未完成**；不能据此把正式根目录指向候选。
