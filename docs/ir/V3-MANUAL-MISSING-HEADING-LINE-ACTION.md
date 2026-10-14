# V3 章节定界 · V2 源码行号菜单 → 补录标题（2026-10-09）

## Feature Contract

**FC-MANUAL-01 · 调用入口：** 在「章节定界」的全书连续 MD 源码中直接单击 V2 CodeMirror 左侧任意行号，弹出行操作浮层，暂时仅暴露「补录标题」。浮层明确提示「在本块之后插入标题」，不再另建固定工具栏。点击外部或取消应关闭且无数据变更。V2 原有字体、语法高亮、行号和编辑功能沿用。旧 IR/其他模块不暴露此能力。

**FC-MANUAL-02 · 人工补录：** 输入单行标题、H1/H2 层级、原 PDF 的真实页码，勾选「已对照 PDF 核实」，点击插入。必须在已存在的 DIR 源块之后定位；页码限制在原 PDF 的实际页数，不自动推断或伪造 OCR 元素、bbox 和文字。生成稳定 `blk_*`、一个 `manualHeadings` 元信息、章/节候选与对应章节树锚点。新标题的 `sources=[]` 是**唯一允许的显式例外**：仅 `type=title` 且 `manualHeadings` 中有页码证据；原 OCR 的每个来源元素仍需恰好覆盖，物理原文文件保持不可变。

**FC-MANUAL-03 · 立即同步：** 新标题按 `readingOrder` 插入原光标所在块之后，全书 Markdown 中出现 `#`/`##`，AG 增加「人工补录 · PDF页码」行；点击此行的 PDF 定位只能跳**页**，不显示伪造 OCR 框。源码改字、撤销/重做、分配章节文件都走原 DIRjson 内存通道。

**FC-MANUAL-04 · 保存：** 修改只在内存草稿；用户点击「保存章节定界」才通过 WP7 不可变 ZIP + CAS 持久化。未全部确认章界时，继续只物化一个 `whole-book-draft.md`。服务端必须独立检查无来源的手工块确实存在于 `manualHeadings`，PDF 页码合法、位置有前置来源锚点、range 的 `manualPdfPage` 完全一致；不能因为来源证据数组为空就拒绝**合法**补录，也不得给**普通 OCR**块放宽来源要求。已保存快照下次直接恢复人工补录，无需重新 OCR。

**FC-MANUAL-05 · 限制：** 该操作不是在 PDF 自动创建几何精确坐标，也不是任意分割/重建段落。原始 OCR 漏字但已落在某正文块中的标题，仍可直接加 `#`/`##` 升级；完全遗漏的标题按菜单人工补录。行号操作的插入位置是**该行所属块之后**，不是逻辑行中间。若需要在一个段落中间插入，先使用结构清洗分段。严格禁止未确认的标题冒称 OCR 来源。

## UI Interaction Contract

**UIC-MANUAL-01 · browser-auto**：加载 5 块的 OCR fixture，进入 V3 章节定界并点击 CodeMirror gutter 行号 `2`。预期「第 2 行 · 在本块之后插入标题」浮层与唯一动作「补录标题」可见；取消/外部点击不写 DIR；仅勾选确认并填写文字、页码、层级后才能提交。

**UIC-MANUAL-02 · browser-auto**：输入 `Missing Heading Restored From PDF`、H1、PDF 1 页并勾选确认。预期浮层关闭，AG 新增人工补录行，连续源码出现 `# Missing Heading Restored From PDF`，原 5 个块仍保留，草稿为 6 个块，`sourceElements` 总数不增加，`manualHeadings` 含真实页码和 `afterBlockId`。无 Vault 自动写入。

**UIC-MANUAL-03 · unit**：模拟 3 页原书、向已有来源块后插入遗漏标题，断言 `readingOrder` 唯一顺序、人工块 `sources=[]`、PDF 页码唯一且无 bbox、OCR JSON 重建与原始输入一致、Markdown source-range 可查、章结构合法。使用非法页码、多行标题或不存在的前置 blockId 时事务失败，不改变原 IR。

**UIC-MANUAL-04 · browser-auto + server**：两个浏览器并发，A 人工补录且保存、B 旧编辑草稿尝试 CAS 写入；B 被拒绝。新页面恢复 A 的 `manualHeadings`、全书 MD 和 AG 行，仍然不重新读取原 OCR JSON；服务器只允许严格配对的人工来源 range，不能产生未审核按章节发布。

**UIC-MANUAL-05 · real-read-only**：在 `Bufett’s Alpha` 的真实 PDF/OCR 加载新版 UI，只读打开并检查旧 AG、源码、PDF 性能与菜单入口，无需用户授权不得执行人工补录或保存。iPad Safari 软键盘和精确点击位置需用户实际触控验收。

## 自动验收命令

```bash
npm --prefix ui-spikes/v3-directory run test:ir:chapters
npm --prefix ui-spikes/v3-directory run test:ir:markdown
npm --prefix ui-spikes/v3-directory run test:dir:edit
npm --prefix ui-spikes/v3-directory run test:ir:ui
npm --prefix ui-spikes/v3-directory run test:ir:persistence
npm --prefix ui-spikes/v3-directory run test:ir:ui:real
npm --prefix ui-spikes/v3-directory run test:ir:persistence:backend
npm --prefix ui-spikes/v3-directory run test:review
npm --prefix ui-spikes/v3-directory run test:bidirectional
npm --prefix ui-spikes/v3-directory run test:ui
```

## 实施完成与验收

- `test:ir:chapters` → `IR_WP4_CHAPTER_UNIT_PASS`：人工新增块来源稀缺严格可校验、原 OCR JSON 重建不变、标题重命名仍持有 PDF 页码、非法页码/锚点/多行标题拒绝。
- `test:ir:markdown` → `IR_WP6_MARKDOWN_UNIT_PASS`；`test:dir:edit` → `DIR_SOURCE_EDIT_UNIT_PASS`；`test:ir:persistence:backend` → `IR_WP7_ISOLATED_BACKEND_PASS`。
- `test:ir:ui` → `IR_WP5_BROWSER_FIXTURE_PASS`，Playwright 真实点击 CodeMirror 行号，输入补录标题、核实 PDF 页码、AG 增行、DIRjson 草稿可下载、无自动 Vault 写入。
- `test:ir:persistence` → `IR_WP7_BROWSER_PERSISTENCE_PASS`，带人工补录标题的快照 CAS 保存、SHA 读回、冲突拒绝、第三浏览器恢复、无需重新读 OCR 全部通过。
- `test:ir:ui:real` → `IR_WP5_REAL_BROWSER_PASS`（224 块，只读 Vault，无人工校对或保存）；`test:review` → `WP7_REVIEW_CAS_UNIT_OK`；`test:bidirectional` → `WP6_BIDIRECTIONAL_INDEX_UNIT_OK`；`test:ui` → `V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS`。
- `npm run publish:preview` 已发布公网 V3，Mac 上 ocr2md 服务按需重启一次以启用后端来源审核规则；URL `/v3-directory/` 本机和公网返回 HTTP 200，缓存 `ocr2md-v3-manual-title-gutter-20261009a`，所有新增行菜单控件 ID 均在发布的 HTML 中。
- `Bufett’s Alpha` 的冻结 PDF/OCR JSON/旧 sidecar 文件 SHA-256 均与基准完全一致，真实 DIR current pointer 不存在；未代替用户执行任何人工标题补录。
- 本轮保留大量现存 Git WIP；不执行 reset/clean/rebase/force push，也不提交 GitHub。iPad Safari 实际点击软键盘行为待用户审核。
