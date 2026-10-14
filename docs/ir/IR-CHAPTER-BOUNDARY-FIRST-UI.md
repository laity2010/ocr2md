# V3 · 章节定界优先与 PDF.js 缩放 · Feature/UIC

2026-10-09。当前验收状态：自动测试中的版本；书籍的人工章节判定尚未完成。

## 业务决策

- 工作台的**第一个可见工作模块**为「章节定界」。进入本书工作台，左 AG 只列出原始 OCR `title` 元素（PDF 页码、MinerU level、原文标题、判定、章节文件名、状态）。**不仅过滤 OCR `level=1`**，以免真实文献中附录、参考文献等非 `level=1` 的一级章节被漏掉；人工明确分配主章节与小节。每条记录是原始 OCR 标题，不是合并后的 MD 段落，也不是推断出来的准确章节。
- 右上保持 IR 自动生成的只读 Markdown 源码与当前章节选择器，右下官方 PDF.js 原文。选标题时展示该标题在 PDF 的真实 OCR bbox；没有自动把它标成正确。
- 表格和源码窗清理常驻工具：**章节定界时只显示「保存章节定界」、「标定章节」、按需 OCR 来源选择、状态、MD 章节选择**。正文合并/拆分、ZIP 导出、旧人工映射与旧版文本块均放在折叠的「其他模块」下；原功能不删除。此处的“清理”是业务界面降噪，不是删除 WIP/历史数据或绕过原审核流程。
- 「标定章节」按需展开：选择 OCR 标题，判断主章节/小节/非章节；对主章节填写唯一、无路径穿越的 `.md` 文件名；填写人工依据，点击「暂存章节标定」。每一项人工决定记录 `chapterStructure.candidates.status="confirmed"` 与 `reviewReason`，原始 PDF/OCR、正文块 `audit` 仍为 `unreviewed`。当层级变化，其他受影响的人工确认保守地重置为待复核。
- 「保存章节定界」复用 WP7 Versioned IR Snapshot 的明确确认、版本号 CAS、来源 SHA 与读回校验：不是覆盖官方 MD，也不是覆盖原书。显示在 `ir-generated/versions/<sha>/` 的 MD 文件按人工文件名生成；首次保存后才视为版本持久化。多端 iCloud 同步/人工目视验收仍独立。
- PDF.js 增加直接操作：`−`、缩放百分比（50%、75%、100%、125%、150%、200%、300%）、`适宽`、`整页`、`+`。自适应窗口大小时**不能意外重置用户指定的百分比**；PDF 定位框与 canvas 同尺度变换，页码和懒加载保持原有 PDF.js 实现，不能新建第二 PDF 渲染器。

## Feature contracts

**FC-CHAPTER-01** 操作：打开工作目录 → 工作台。需要：一份原始 PDF 和 MinerU OCR JSON（多份必须明确选择）。效果：默认只显示 OCR 标题候选 AG 表，点击候选可以定位真实 PDF 与生成 MD；不调用官方 Markdown 进行对齐。

**FC-CHAPTER-02** 操作：选择一行 OCR 标题 → 标定章节 → 判定/文件名/依据 → 暂存。需要：真实原 OCR 标题 `blockId`、有效且无重复的顶级 `.md` 文件名、非空审核依据。效果：更新统一 IR 的章节树和来源锚点关系，记录人工标定，保留 PDF/OCR 原始 SHA 和审校状态；不执行自动文件写入。

**FC-CHAPTER-03** 操作：点击保存章节定界。需要：WP7 已授权的真实版本存储、未与其他会话冲突。效果：完整 IR+生成 MD/索引经 CAS 保存并校验，遇冲突保留草稿。主章节文件名由 IR 而不是旧的官方 MD 决定。

**FC-CHAPTER-04** 操作：需要正文清洗或旧功能时打开「其他模块」。效果：保留旧组件和 WIP，但首次进入章节定界界面时不出现无关操作按钮；避免用户误操作跨阶段清洗。

**FC-PDF-ZOOM-01** 操作：进入 PDF 原文 → 适宽/整页/缩放 50%～300%、放大缩小。需要：PDF.js viewer ready。效果：真实 PDF 页面缩放，页码和 OCR bbox 高亮持续一致；未就绪时操作禁用；窗口改变时保留人工百分比而不是重置到适宽。

## UIC

**UIC-CHAPTER-01 (browser-auto)** 初始：未标定书籍 → 章节定界优先。动作：选书、选 OCR、点标题行。预期：左 AG 仅原始标题、源码 MD、PDF bbox；「标定章节」外无拆段/合并/旧审核按钮。副作用：零 Vault 写入。

**UIC-CHAPTER-02 (browser-auto)** 初始：AG OCR 标题选中。动作：展开标定、主章节文件名 `01-Example Chapter.md` 和依据，暂存。预期：行显示已标定、文件名更新，生成 MD path 使用该名称，旧 OCR 源与普通正文审核状态不变。副作用：内存草稿 dirty，需要显式保存。

**UIC-CHAPTER-03 (browser-auto)** 初始：同一浏览器中存在未保存 IR。动作：切换「其他模块」中的逻辑块清洗/旧人工审核/旧文本块。预期：旧功能仍可进入，切回 IR 同一草稿保留；不能因为 UI 清理删除任何既有功能或数据。

**UIC-PDF-ZOOM-01 (browser-auto)** 初始：PDF.js viewer ready 并有 OCR 原文 bbox。动作：选择 125%，调整窗口、缩小、整页、适宽。预期：canvas 尺寸发生真实变化；手动比例在 resize 后不丢，OCR 高亮留在对应 PDF 页、页面和索引仍可导航。副作用：不修改 PDF 原件、Sidecar 或 IR。

**UIC-PDF-ZOOM-02 (browser-auto + iPad viewport)** 初始：834×1194 iPad 布局。动作：缩放/翻页/模块切换。预期：PDF 工具不与右侧源码或左 AG 相互遮挡、不产生全页横向溢出，PDF.js 继续仅按需渲染。

## 可复现测试

```bash
npm --prefix ui-spikes/v3-directory run test:ir:chapters
npm --prefix ui-spikes/v3-directory run test:ir:ui
npm --prefix ui-spikes/v3-directory run test:ir:ui:real
npm --prefix ui-spikes/v3-directory run test:ir:persistence
npm --prefix ui-spikes/v3-directory run test:review
npm --prefix ui-spikes/v3-directory run test:bidirectional
```

人工验收仍待用户检查真实文档章节候选及文件名；自动运行不会把未核准 OCR 正文变成「已校对」。

## 最终验收记录

- `test:ir:ui`：**通过**。默认章节定界、OCR 标题候选、章节名称/文件名与审核依据、PDF.js 125% 缩放及 resize 后比例保持、框选不丢失、MD↔PDF 定位、草稿不自动保存、旧模块切换和 iPad 布局。
- `test:ir:ui:real`：**通过**。`Bufett’s Alpha` 22 PDF 页 / 224 IR 逻辑块 / 19 暂定章节节点；标题候选模式和原有正文模式均正确载入；全部原始来源只读。
- `test:ir:persistence`：**通过**。两会话冲突与第三会话读回、只保存经过用户确认的版本、旧版本保留。
- `test:ir:chapters`、`test:ir:markdown`、`test:review`、`test:bidirectional`：**通过**。主章节文件名验证、非章节标题输出普通文本、所有来源不丢失，旧审核无回退。
- 旧版 `pdfMdReviewFixture.cjs` 和 `workbenchFocusLayoutSmoke.cjs`：**通过**。各旧模块仍可从「其他模块」进入；834px iPad 与桌面无横向溢出。
- `test:ui`：**通过** (`V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS`)。根据“默认章节定界”新业务预期显式切换旧文本块；并等待 AG 行重绘后再执行两次触摸点击；未降低目录浏览安全验收。
- 本次重构已发布至原有 V3 预览 `https://ocr2md.laity.bid/v3-directory/`，服务缓存版本 `ocr2md-v3-chapter-first-zoom-20261009a`，原本 Mac Vault 的持久化及保护规则保留。
- **人工验收仍待用户执行**：真实书籍 21 条标题候选未因自动测试而成为已审；无真实书籍 IR 文件写入。之前所有 Git WIP 保留、未提交。
