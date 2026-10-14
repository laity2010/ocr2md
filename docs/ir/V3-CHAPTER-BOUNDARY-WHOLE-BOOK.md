# V3 · 章节定界先于分章 · DIRjson 全书连续源码

2026-10-09。决策：OCR 标题仅是待审核候选；**禁止在人工定界完成前将 OCR 推断的边界作为实际生成章节的前置条件**。本功能仅影响 V3 的「章节定界」工作模块、DIRjson 保存投影与相应回归；不动原 PDF/OCR JSON/既有 V2 正式 MD。

## 业务规范（Feature Contract）

**FC-WHOLE-01 · 进入工作台 → 章节定界**：无 DIRjson 时从只读 MinerU OCR 初始化，OCR 提议的 root/section/uncertain 只作候选和颜色标记；有正式 DIRjson 时优先从已验证的 CAS 版本恢复，PDF 按需独立加载。源码窗**只显示一份全书连续 MD**，严格按 DIR block `readingOrder` 覆盖每个元素，包括自动推断的不同章节以及前置内容；选择 AG 标题或 PDF 位置不能跳到临时章节文件。每个 OCR 块的来源 marker 与 PDF bbox 始终保留。

**FC-WHOLE-02 · 人工核对**：AG 列出所有 OCR title 候选，并标注待审核/已标定/非章节。源码窗编辑已有来源锚点对应文字，在 OCR 正文块前补充 `#`、`##` 可将漏识别章节提升为标题，取消错误的标题 `#` 可降为普通文字；AG 立即更新。**不允许**没有 PDF/OCR 来源锚点的凭空创建、新增、替换或重排块。取消错误标题不删除原 OCR 内容。遗失的真正无 OCR 来源标题需要将来独立开发人工补录和锚定操作。

**FC-WHOLE-03 · V2 文件分配**：AG 仍保留单独成章 checkbox、内联文件名、批量顺序编号；它们记录在 DIRjson 内，而不分割当前全书源码。即使改变章节标题和文件名，MD 源码选择器在「章节定界」只存在唯一的“全书连续 MD · OCR 章界待审核”选项。其他历史模块可保留既有章节视图，明确仅是临时推断。

**FC-WHOLE-04 · 保存**：DIRjson 可在未全部审核时明确保存 CAS 快照；此时快照只有一个 `whole-book-draft.md`，manifest 的 `projectionState="whole-book-unreviewed"`，**没有**按 OCR 猜测章界发布的若干章节文件；README 标明只是待审核草稿。用户对所有 OCR 标题候选逐项确认/否定且明确分配所有主章节安全文件名后，方可使用 `projectionState="confirmed-chapters"` 发布各章节 MD；未审正文仍不被标为校对通过。保存不更改原 PDF、OCR JSON、旧 V2 MD 或人工已批准的历史版本。

**FC-WHOLE-05 · 服务端审核门槛**：WP7 继续不可变 ZIP、版本 SHA 和 pointer CAS，后端若接到 `whole-book-unreviewed`，验证文件严格为 `whole-book-draft.md` 且 ranges 完整按阅读顺序覆盖所有块；若接到 `confirmed-chapters`，复验候选都 `confirmed` 且 root 有文件名。不把 `needs-review` 当 `confirmed`。无 `projectionState` 的旧快照仅为向后兼容，仍可读回。

## UI Interaction Contract（UIC）

**UIC-WHOLE-01 · browser-auto** 初始 OCR fixture 5 块，有 root 与 section 猜测。动作：进入章节定界→查看源码选择器→选 AG H1→在 AG 内联修改章节文件名→选 H2→PDF 点击。预期：源码只一份 `whole-book-draft.md`，能看到根章节与第二标题及其前后正文，AG/PDF 点击只移动 CodeMirror 选择，不切换 MD 文件；内存 DIR 章节文件名能变但当前源码仍连续。副作用：零 Vault 写入。

**UIC-WHOLE-02 · unit** 初始不同 root 下的完整 9 块 OCR。动作：重组全书源码、将临时 H2 变为 H1。预期：每个 `blockId` 出现一次，顺序与 DIR `readingOrder` 一致，精确 source-range UTF-16 和 bbox 索引完整，改章界后源码仍完整，原始 OCR 语义完全可重建。副作用：没有来源更改。

**UIC-WHOLE-03 · unit + browser-auto** 初始所有标题 `needs-review`。动作：点击保存。预期：CAS ZIP 恰 3 个成员（DIRjson、manifest、一个 whole-book-draft.md），无自动分章文件；后端拒绝多文件或乱序的 `whole-book-unreviewed` 伪包。下次进入无需重新读取 OCR JSON。

**UIC-WHOLE-04 · unit + server** 初始全部标题已经人工确认，所有 root 设置唯一安全 `.md` 名称。动作：构建并保存。预期：chapter 文件个数等于人工确认 root 个数，服务端复验同意，不改变仍未审核的普通正文状态。

**UIC-WHOLE-05 · real-read-only + iPad** 对 `Bufett’s Alpha` 做只读初始化，确认 224 逻辑块全部纳入同一源码，21 个 OCR 标题候选都不自动成为人工确认。PDF 定位、浏览器滚动和 iPad 布局均正常；绝对不写真实 PDF/OCR/历史 sidecar，也不代用户执行人工章节判定。

## 自动测试

`npm --prefix ui-spikes/v3-directory run test:ir:markdown`、`test:ir:ui`、`test:ir:ui:real`、`test:ir:persistence`、`test:ir:persistence:backend`、`test:dir:edit`、`test:review`、`test:bidirectional`、`test:ui`。

人工目视审核仍待用户：V3 工作台的章界正确性、漏识别标题、实际 V2 文件分配及 iPad Safari 长书滚动手感。

## 完成记录与安全边界

- `test:ir:markdown`: `IR_WP6_MARKDOWN_UNIT_PASS`。确认自动根章节临时产生的多份生成文件可被重新连接为原阅读顺序的唯一全书源码；来源 Range、UTF-16 索引、全量 OCR 块 ID 无重无漏。标题升级 H2→H1 后完整来源仍可恢复；若候选未全部人工确认，快照仅包含 `whole-book-draft.md`。全部逐项确认 + 所有 root 文件名已分配后才允许分章。
- `test:ir:ui`: `IR_WP5_BROWSER_FIXTURE_PASS`。默认章节定界只有一个 full-book 选项；AG 改章节文件名、人工确认标题后仍留在统一源码；PDF/AG 点击仅定位对应源块；源码编辑和 H2 取消/撤销，旧模块切换、iPad 布局通过；无 Vault 自动写入。
- `test:ir:persistence`: `IR_WP7_BROWSER_PERSISTENCE_PASS`。测试 ZIP 已保存且确认只有一个 `whole-book-draft.md`，打开恢复时不重读原始 OCR JSON，过期 CAS 拒绝并保留草稿。
- `test:ir:persistence:backend`: `IR_WP7_ISOLATED_BACKEND_PASS`。后台保留旧归档兼容并严格核查新状态：未确认的草稿不能伪装成分章文件，章界确认状态需在服务端复核。原真实书籍未写入。
- 真实书籍的本地中间数据只读校验：`REAL_DIR_FULL_SOURCE_PASS`，224 个 block、21 个 `needs-review` 标题候选，原有 6 个 OCR 推断的临时 MD 不会成为章界前的输出，完整全书 MD 约 99,475 个 UTF-16 字符。
- `test:ir:ui:real`: `IR_WP5_REAL_BROWSER_PASS`。线上新版目录 224 块 / 19 暂定章节点按需定位，可在 iPad 视口使用，原始来源未变。
- `test:ui`: `V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS`，旧目录导航/文件读写与设置保留；`test:review`: `WP7_REVIEW_CAS_UNIT_OK`；`test:bidirectional`: `WP6_BIDIRECTIONAL_INDEX_UNIT_OK`。
- 线上 Service Worker 发布版本 `ocr2md-v3-whole-book-chapter-review-20261009a`。公网与本机 `/v3-directory/` HTTP 200，服务端只重启了 ocr2md 本身以加载保存校验，未改 Agent Link / DNS / 其他项目。**真实书籍仍无 DIRjson current pointer**，尚无替用户执行的人工校对和保存。
- 本轮不做 Git reset/clean/rebase/force push，也未执行 Git commit；保留全部历史 WIP。
