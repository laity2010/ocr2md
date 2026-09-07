# ocr2md UI v2

这是新的 UI 架构壳。它与 `ui-spikes/integration` 并存，当前不替换旧页面，也不迁移旧业务功能。

## 当前阶段目标

先建立可迁移的工作台主干：

> 工作台身份与能力由一个 WorkspaceMachine 统一决定，外部数据通过明确的 Repository / Adapter 边界进入，UI 不直接发明业务状态。

当前状态：

- `idle`
- `opening`
- `loadError`
- `chapter.clean`
- `chapter.dirty`
- `chapter.saving`
- `debug`

第二阶段已增加 `ChapterRepository` 边界和 `FixtureChapterRepository`。当前页面会异步加载旧 integration 中 Buffett 章节的冻结 fixture（source / working / sidecar），成功后才进入 `chapter.clean`；加载失败进入明确的 `loadError`，不会伪装成已打开。

第三阶段已接入 CodeMirror 6：loaded `workingText` 进入真实编辑器；程序化装载不会产生 dirty，只有 CodeMirror 的真实 `docChanged` 才发送 `WORKING_CHANGED(text)` 给 WorkspaceMachine。状态机同时持有新的 workingText，`workingLength` 可用于不泄露正文地验证实际内容变化。远程 debug `edit` 同样必须走 CodeMirror transaction，不能直接伪造 dirty。

## v2-M1：真实章节持久化闭环（2026-09-05 完成）

M1 已从“模拟保存”切换为 repository Promise 驱动的真实保存：`SAVE` 进入 `chapter.saving`，只有 repository 真正写入成功后才回 `chapter.clean`；失败自动回 `chapter.dirty` 并保留 `saveError`。

开发实机当前固定绑定 Mac Google Drive 同步目录里的 `01 Buffett’s Alpha 副本`，不碰正式 `01 Buffett’s Alpha`。服务端只暴露该固定章节，不提供任意路径写入。working 内容以 SHA-256 作为 revision；保存必须携带 expectedRevision，不匹配返回 409 并拒绝覆盖。

M1 自动化验收 6/6 通过，覆盖真实文件写入、页面刷新后重入、远程 edit/save/close/open 持久化、stale revision 冲突拒绝、调试白名单与状态通道。随后在真实 iPad 页面完成实机闭环：63,833 → 63,834 字符，保存 revision 从 `c98d7b5f…` 变为 `40ef918c…`，关闭重开后仍为 63,834；验收调试字符随后通过 revision 保护安全清理，文件恢复 63,833 和原 revision。

## v2-M2：真实项目章节 catalog（2026-09-06 完成）

M2 将单一固定章节升级为固定项目目录下的真实章节 catalog。服务端扫描项目 `chapters/`，为每个章节目录生成稳定 chapterId，并标记是否具备 working + sidecar；UI 只持有 chapterId，不接受任意磁盘路径。catalog、selectedChapterId、打开/保存生命周期全部进入 WorkspaceMachine，避免重新产生 DOM/全局选择状态。

真实 `Bufett’s Alpha` 项目当前识别 7 个章节目录，其中 5 个 ready（01、01 副本、02、03、04），2 个 blocked（00 与 05，均缺 sidecar）。blocked 章节仍显示在 UI 中，但不能选择打开；远程 `open-chapter` 同样要求合法且 ready 的 chapterId，缺 id / 伪造 id / blocked id 分别被 400 / 404 / 409 拒绝。

M2 自动化 6/6 通过：多章节 catalog、跨章节切换、持久化重入、远程指定 chapterId、stale revision、非法 remote open 均覆盖。真实 iPad 实机验收通过：在 `01 Buffett’s Alpha 副本` 上完成 63,833 → 63,834 → 真保存 → 重开保持；随后打开 02（3,254 字符）与 03（3,844 字符）均进入各自 clean session；远程打开 blocked 的 `00 Bufett’s Alpha` 返回 409。验收字符最后通过 expectedRevision 安全清理，副本恢复 63,833 / `c98d7b5f…`。项目级 `npm run test:all` 同时通过，旧 integration UIC 17/17 全绿。

当前明确约束：

- debug 与真实 chapter 互斥。
- debug 可以演示编辑，但不能保存。
- 只有 dirty chapter 可以发起 SAVE。
- saving 期间不可继续编辑或重复保存。
- dirty chapter 不能直接 CLOSE，未来必须走明确的“保存 / 放弃修改 / 取消”流程。
- UI 控件的 enabled / disabled 只从 `deriveWorkspaceView(snapshot)` 推导。
- 所有可参数化的 UI 状态（session、canEdit、canSave、按钮 disabled 等）必须由自动化浏览器测试验证；人工验收只负责主观交互体验。
- v2 开发联调页显示“刷新时间”，调试状态通道同时上报固定的 `pageLoadedAt`；用于确认读取的是用户刚刷新后的真实 iPad 页面实例，而不是旧状态。
- v2 开发联调现已支持双向白名单命令通道：服务器可向指定 clientId 下发 `open-chapter / edit / select-review-module / focus-first-calibration / ignore-first-calibration / undo / redo / save / close / enter-debug / exit-debug`；iPad 通过与真实产品路径相同的事件入口执行，并回报相同 `commandId`。`open-chapter` 必须携带合法且 ready 的 chapterId；任意非白名单动作被拒绝。

## 暂时没有迁移

- 浏览器端直接 Google Drive API adapter（当前实机通过 Mac Google Drive 同步目录的受限项目 adapter）
- 完整 Review modules UI
- Feature Debug Runner
- 完整 AG Grid 行为（筛选、右键、批量操作、预览跳转等）

CodeMirror、最小 AG Grid、真实 working + sidecar 持久化已在 M1–M3 完成；模块化 Review 工作台与源码定位在 M4 完成；统一 Undo / Redo 在 M5 完成。后续仍逐项迁移，并继续用原有 Feature Contract / UIC 对照验收。

## 运行

```bash
cd ui-spikes/v2
npm install
npm test
npm run build
npm run serve
```

然后打开：

`http://localhost:4180/`

## 目录

```text
v2/
├── src/
│   ├── workspaceMachine.ts
│   └── app.ts
├── tests/
│   └── workspaceMachine.test.ts
├── index.html
├── package.json
└── tsconfig.json
```

## v2-M3：真实标定持久化闭环（2026-09-06 完成）

M3 接入 AG Grid 36.1，表格直接投影 WorkspaceMachine 中的真实 sidecar rows；“已忽略/已删除”不显示在表内。当前最小编辑能力只开放“现有行类型 → 已忽略”。Grid 不直接改 rowData，所有修改都发送 `CALIBRATION_LINE_TYPE_CHANGED`，并复用正式 `ChapterReviewApplication.setRowsLineType()` 处理行类型变化、注释配对与嵌入块一致性。

M3 同时把 revision 从“working revision”升级为“章节工作区 revision”：SHA-256 同时覆盖 working + canonical sidecar。repository SAVE 使用 `serializeSidecar()`，同一次保存写入 working + sidecar；任一文件被外部修改都会触发 409，不能静默覆盖标定。

自动化 8/8 通过：AG Grid 标定忽略持久化、remote 标定 + working 同次保存、working 外部冲突、sidecar 外部冲突、M2 跨章节与 debug 回归全部覆盖。稳定检查点随后再次运行根目录 `npm run test:all`，全部核心测试与旧 integration UIC 17/17 均通过。

真实 iPad 实机验收：`01 Buffett’s Alpha 副本` 基线为 working 63,833、标定 212、可见 193、已忽略 15、annotationPairs 10、revision `409011a8…`。remote 通过与 Grid 相同业务路径忽略一条真实标定后，working 保持 63,833，可见 193→192，已忽略 15→16，进入 dirty；真保存后 revision 变为 `bd8efefe…`，关闭重开后 192/16 与新 revision 保持。最后通过组合 expectedRevision 恢复原 sidecar，最终回到 63,833 / 212 / 193 / 15 / 原 revision。

## v2-M4：模块化标定工作台与源码定位（2026-09-06 完成）

M4 将 M3 的标定总表升级为 4 个真实 Review 模块：`章节标题 / 注释 / 嵌入块 / 非法断行`。`activeReviewModule`、当前模块行数和当前源码定位行均进入 WorkspaceMachine；模块按钮不维护独立 UI 状态。

模块行数据直接来自真实 sidecar，并继续隐藏 `已忽略/已删除`。章节标题只显示真实层级标题。Buffett fixture 的自动化基线为：章节标题 10、注释 20、嵌入块 51、非法断行 6。注释表增加注释号列；嵌入块保持旧工作台的视觉列顺序 `组号 → 行号 → 行类型 → 预览`。

sidecar 重入后的旧 `range.line` 不可信，因此 M4 的表格行号和点击定位都统一复用正式 `locateCandidate(workingText, candidate)`，再通过 CodeMirror `revealRange()` 居中并选中真实源码；只有定位成功才把 `focusedReviewRowId / focusedSourceLine` 回写 WorkspaceMachine。

远程调试通道新增白名单 `select-review-module / focus-first-calibration`，与人工模块按钮、表格点击走相同产品路径；非法 reviewModule 在服务端直接 400 拒绝。M4 v2 自动化 10/10 通过，其中专门覆盖四模块真实行数/列顺序和点击表格行真实定位 CodeMirror；M1–M3 的持久化、working/sidecar stale 409、跨章节与 debug 回归同时全绿。



## v2-M5：统一 Undo / Redo（2026-09-06 完成）

M5 将正文编辑与标定修改纳入同一条 WorkspaceMachine 历史。历史快照只包含 `workingText + rows + annotationPairs`，`revision` 始终代表最后一次真实持久化基线。每次正文或标定修改都会把“修改前快照”压入 undoStack，并清空 redoStack；Undo / Redo 恢复完整工作台快照，不允许 CodeMirror 与 AG Grid 各自维护业务历史。

CodeMirror 的私有 history 已移除。按钮、`Cmd/Ctrl-Z`、`Cmd/Ctrl-Shift-Z`、`Ctrl-Y`、以及 remote `undo / redo` 全部进入同一个 XState 产品动作路径。Undo 回到 savedBaseline 时会自动从 `chapter-dirty` 回到 `chapter-clean` 并令 `canSave=false`；Redo 再离开基线时重新 dirty。保存成功后当前快照成为新的 savedBaseline，并清空 Undo / Redo。Undo 后发生新操作时旧 redo 分支会被丢弃。

v2 自动化：WorkspaceMachine 混合历史测试通过；Playwright 12/12 通过，覆盖按钮 Undo/Redo、CodeMirror 快捷键统一历史、remote undo/redo、Redo 分支失效、M1–M4 持久化/冲突/Review 模块/源码定位回归。稳定检查点随后运行根目录 `npm run test:all`，全部核心测试与旧 integration UIC 17/17 均通过。

真实 iPad 实机验收：副本基线 working 63,833 / visible 193 / ignored 15 / revision `409011a8…`。remote 正文 +1 后 undoDepth=1；再忽略一条真实标定后 working 63,834 / visible 192 / ignored 16 / undoDepth=2。第一次 Undo 只恢复标定（63,834 / 193 / 15 / undo=1 / redo=1）；第二次 Undo 恢复已保存基线并自动进入 `chapter-clean`（63,833 / 193 / 15 / canSave=false / undo=0 / redo=2）。两次 Redo 再依次恢复正文与标定；保存后历史清空，关闭重开仍保持 63,834 / 192 / 16。验收结束已通过 expectedRevision 恢复原 working + sidecar，最终回到 63,833 / 193 / 15 / `409011a8…`。


## v2-M6：脏章节离开保护（2026-09-06 完成）

M6 将 dirty 章节的离开行为从“按钮不可用/事件被忽略”升级为 WorkspaceMachine 的正式生命周期状态。关闭 dirty 章节或尝试切换到其他 ready 章节时，会进入 `chapter-leave-confirm`，并记录 PendingLeaveIntent（close 或 open + target chapterId）。UI 显示统一的“取消 / 放弃修改 / 保存并继续”确认面板；remote 调试同样只能通过 `leave-cancel / leave-discard / leave-save` 白名单动作进入产品路径。

取消会保留当前 working + sidecar 草稿并恢复原章节选择；放弃不会写入 repository；保存并继续必须等待真实 repository SAVE 成功后才执行关闭或打开目标章节。若保存失败，状态返回 leave-confirm，并保留 saveError，不会误离开当前章节。

M6 自动化：WorkspaceMachine 覆盖 cancel / discard-close / save-close / dirty switch cancel / discard / save-before-switch；Playwright 14/14 通过，新增真实 UI 离开保护测试并回归 M1–M5 全部持久化、冲突、Review 模块、源码定位与统一 Undo/Redo。稳定检查点随后运行根目录 `npm run test:all`，全部核心测试与旧 integration UIC 17/17 均通过。

真实 iPad 实机：副本基线 working 63,833 / revision `409011a8…`。remote edit 后关闭进入 `chapter-leave-confirm`，三种选择能力均为 true；取消后继续 chapter-dirty / 63,834。再次关闭并放弃后回 idle，repository revision 未变，重开仍 63,833。再次 edit 后尝试打开 02，进入 leave-confirm，目标明确为 `02 Appendix A Data Sources and Methodology`；选择“保存并继续”后先将副本保存为 63,834 / revision `f2001240…`，再打开 02。关闭 02 后重开副本确认 63,834 与新 revision 均存在。验收结束已通过 expectedRevision 恢复原 working + sidecar，最终回到 63,833 / `409011a8…`。


## v2-M7：非法断行完整迁移（2026-09-06 完成）

M7 完整迁移旧工作台“非法断行”模块的正式语义，而不是把“合并”改造成即时编辑正文。进入章节时，`PersistentChapterRepository.loadChapter()` 会基于当前 working 调用正式 `ChapterReviewApplication.refreshIllegalLineBreak()` 重新扫描非法断行，再与 sidecar 中已有人工标定 reconcile；sidecar 仍只持久化标定事实，不冗余保存 previousLineText / nextLineText / breakReason / mergedPreview 等派生字段。

非法断行专用表格列为：`断行处 / 行类型 / 预览（前10 + 后10） / 合并预览 / 判断`。点击行或预览会重新定位当前 working，并由 CodeMirror 选中断点前 10 + 后 10 个字符。行类型保持旧产品语义 `合并 / 已忽略`；标定阶段不改变 working，真正合并仍在导出时发生。

页面导出状态直接复用正式 `buildIllegalMergeSpans()`：显示“多少条合并标定 → 多少组实际导出合并 · 已忽略多少条”，不另造统计规则。fixture 基线为 6 条“合并”标定 → 6 组合并，3 条已忽略；忽略一条后变为 5 / 5 / 4，working 字符数保持不变。Undo/Redo 会同步恢复导出决策；保存、关闭、重入后标定仍保持，测试结束恢复基线。

M7 同时修复实机 telemetry 的旧竞态：同一 `pageLoadedAt` 只接受 sequence 不倒退的状态上报；更旧页面实例不能覆盖更新页面实例。新增浏览器契约验证 stale sequence 被拒绝，新 pageLoadedAt 可以重新从 sequence=1 开始。v2 完整 Playwright 16/16 通过。稳定检查点随后重新运行根目录 `npm run test:all`，完整 monolithic run 成功退出，全部核心测试与旧 integration UIC 17/17 均通过。

真实 iPad 实机：刷新后 pageLoadedAt `2026-09-06T00:56:01.269Z`。副本基线 working 63,833 / 非法断行 merge 6 / ignored 3 / revision `409011a8…`。切到非法断行模块后 activeModuleRows=6；第一条真实断行定位到第 124 行。忽略一条后 working 仍 63,833，mergeDecision 6→5、mergeSpan 6→5、ignored 3→4，进入 dirty；Undo 回 6/6/3 并 clean，Redo 回 5/5/4；真保存 revision 变为 `35d8bf75…`，关闭重开仍为 5/5/4。验收结束已通过 expectedRevision 恢复原 working + sidecar，最终回到 63,833 / 6 / 3 / `409011a8…`。

## v2-M8：章节标题模块完整迁移（2026-09-06 完成）

M8 将章节标题从“读取 sidecar 旧结果”升级为基于当前 working 的正式重扫：加载章节以及普通 working 编辑都会调用 `ChapterReviewApplication.refreshChapterTitle()`，并继续使用正式嵌入块 regex 排除嵌入内容。标题层级 1–6 级跟随当前 Markdown，人工 `已忽略` 会在重扫时保留。

标题专用 AG Grid 使用 `行号 / 行类型 / 标题预览`；标题预览按真实 H1–H6 渲染。改变标题层级会调用正式 `applyHeadingLineTypeToText()` 同时修改 Markdown 与 rows，并只产生一条 WorkspaceMachine 统一 history snapshot；Undo/Redo 一次恢复 working + rows + annotationPairs，CodeMirror 不维护第二套产品历史。

`为标题编号` 是 workspace/export setting，默认开启；不 dirty、不进入 Undo/Redo、不写章节 sidecar。标题编号按 source position 计算，正式导出统计复用 `exportByCalibration(..., { numberHeadings })`。专项 Playwright 2/2、v2 全量 18/18、根 `npm run test:all` 与旧 integration UIC 17/17 全部通过。

真实 iPad 实机使用 `01 Buffett’s Alpha 副本`：63,833 / 10 标题 / 10 导出标题 / 10 已编号 / revision `409011a8…` 起步；第一条 H1→H2 后 working 63,834 / undoDepth 1；Undo 回 clean 63,833，Redo 回 dirty 63,834；编号关闭后已编号 0 且 history 不增加，再开启回 10；保存后 revision `154c000d…`，关闭重开仍保持 H2，并直接读取持久化 working 确认 `# Buffett’s Alpha → ## Buffett’s Alpha`。验收结束恢复原 working + sidecar，最终精确回到原 revision `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`。

## Mac 私有云迁移：5/5 完成（2026-09-06）

v2 已从临时本机运行迁移到标准化 Mac 私有云运行边界，业务真相仍只在 `WorkspaceMachine / ChapterReviewApplication / core`。k3s release 为 `ocr2md-v2`，workspace 使用 PVC `ocr2md-workspace`；当前正式镜像为 `ocr2md/v2:mpc-final-20260906c`，Deployment 1/1 Ready。Helm chart 保持 host-neutral，Mac 专属 launchd / NodePort / loopback 适配只存在于 `deploy/private-cloud/`。

稳定入口为 `127.0.0.1:4176`：preview 负责当前 v2 静态前端，workspace 请求进入 k3s NodePort `30418`，debug 请求进入 launchd 托管的 `4183` control bridge。外网继续复用既有 Cloudflare named tunnel + Access；没有增加第二条长期 tunnel。

真实设备控制协议在迁移验收中补齐可靠性：命令 ACK 前不出队；`commandSequence` 去重保证 ACK 重试不会重复执行产品动作；命令终态 XState 与 ACK 原子上报；打开/保存等异步命令等待业务终态；UI paint 等待有 100ms 上限。普通 state telemetry 改为单一普通 fetch，移除了 `Beacon + keepalive fetch` 双发。此前偶发 Undo/Redo “状态已变但 ACK 丢失”的根因被确认是浏览器连接池被高频 keepalive/Beacon 调试请求挤满，而不是 WorkspaceMachine/history 错误；修复后完整远程链路无临时埋点连续 3/3 PASS。

最终稳定门禁：v2 全量 18/18 PASS；debug state/command 专项 4/4 PASS；根 `npm run test:all` 全部 core tests + 旧 integration UIC 17/17 PASS；Helm lint/template 与 host-neutral token gate PASS；Mac 私有云 health / portability-check 均 PASS。最终通过正式 `4176 → k3s/PVC` 路径核对安全副本：working 63,833，annotations 212，visible 193，ignored 15，deleted 4，非法断行 6 merge + 3 ignored，revision 精确为 `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`。

最终外网真实 iPad smoke 于 2026-09-06 17:04（+08:00）完成：新会话 bridge v2 正常、页面前台可见；Mac control sidecar 自动执行安全副本 `open-chapter`（commandSequence 1）→ `chapter-clean`，再执行 `close`（commandSequence 2）→ `idle`。全程未修改章节，最终仍为 63,833 / annotations 212 / visible 193 / ignored 15 / deleted 4 / illegal 6 merge + 3 ignored / revision `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`，`REAL_IPAD_FINAL_SMOKE_OK`。

## M9 注释模块完整迁移（2026-09-06）

注释模块现已使用当前 working 自动重扫，而不是只显示 sidecar 旧候选；working 普通编辑也会触发注释重扫，并通过稳定 row identity 保留人工审核结果。AG Grid 注释视图新增可编辑“注释号”和“配对状态”两列，能直接显示自动匹配、待补引用、待补正文、待补注释号；页面状态与 debug telemetry 同时显示 calibrated / paired / missingRef / missingBody / missingNumber 汇总。

注释号修改统一走 `WorkspaceMachine → ChapterReviewApplication.setAnnotationNumber`，纳入统一 Undo/Redo，并随 SAVE 写入 sidecar；保存后关闭重开仍可恢复注释号与 annotationPairs。M9 专项自动化 PASS；v2 全量 21/21 PASS；根 `npm run test:all` 全部 core PASS + 旧 integration UIC 17/17 PASS。

真实设备最终验收使用安全副本：20 条注释 / 10 对完整匹配 → 第一条注释号 1→99 后变为 pairs=11、paired=9、missingRef=1、missingBody=1 → Undo 后精确恢复 10 对完整匹配 → close。全程未保存，PVC revision 与 212/193/15/4/非法断行 6+3 基线完全不变，`REAL_DEVICE_M9_ANNOTATION_OK`。

M9 最终部署镜像：`ocr2md/v2:m9-annotation-20260906b`，Helm revision 4，1/1 Ready。封箱时同时补齐 OCI 的 `module-probe.js`，容器内检查通过，NodePort `/module-probe.js` 与 `/dist/app.js` 均返回 200；b 版相对实机验收通过的 a 版仅包含 M9 页面标题/说明与镜像静态资产完整性修复，不改变注释业务逻辑。

## M10 嵌入块模块完整迁移（2026-09-06）

嵌入块现已按当前 working 自动重扫；普通 working 编辑同样触发重扫，人工忽略/删除决定通过稳定 row identity 保留。组号保持派生语义：每个 `>` 开启一组，后续行继承到下一个 `>`；已忽略/已删除不参与可见分组。页面与 debug telemetry 可直接观察总行 / 可见行 / 组数 / 未分组数，安全副本精确基线为 65 / 51 / 11 / 0。

M10 专项 7/7 PASS；v2 全量 23/23 PASS；根 `npm run test:all` 全部 core PASS + 旧 integration UIC 17/17 PASS。最终私有云镜像 `ocr2md/v2:m10-embed-20260906a`，Helm revision 6，1/1 Ready。

真实设备最终闭环：65/51/11/0 → 忽略一条后 65/50/11/0 → working +1 触发重扫后人工忽略仍保留 → Undo working → Undo 忽略 → 精确恢复 65/51/11/0 → close。全程未保存，PVC revision 和 212/193/15/4/非法断行 6+3 基线完全不变，`REAL_DEVICE_M10_EMBED_OK`。

## M11 章节定界完整迁移（2026-09-06）

M11 已把项目根 OCR Markdown 的章节定界链路完整迁到 v2：core 负责 OCR 判断、自然序合并、一级标题扫描、章节文件分配、segments 与 frontmatter；WorkspaceMachine 统一承载 OPEN_BOUNDARY、编辑、Undo/Redo、SAVE、EXPORT；repository/server 只做 storage adapter。hidden boundary 文件为 `.ocr2md-merged.working.md` 与 `.ocr2md/chapter-boundary/{baseline.md,sidecar.json,manifest.json}`，revision 同时覆盖根输入与 hidden 状态，stale revision 返回 409。

专项 Playwright 1/1 PASS；v2 全量 24/24 PASS；根 core/unit 全 PASS；旧 integration 拆成 4 批分别 4/4、4/4、4/4、5/5，合计 17/17 PASS。真实私有云 boundary 基线为 1 个 OCR 输入、working 83,258 字、2 个一级标题、0 分配、revision `9958f7ea5f055965c3ae6a857fd548d053523892a93de8445751050113f3645d`。真实设备 smoke `open-boundary → 91/92 依次编号 → undo → close` 通过；全过程未保存，最终 working/标题/分配/revision 精确不变，`REAL_DEVICE_M11_BOUNDARY_OK`。
