# MOPJO 第一条架构原则 · WP1 实验契约

> 原始数据永不修改；人工操作全部增量化；Markdown 永远是有效数据状态的投影；PDF 永远是原始证据。

## 数据权威与输入输出

- **输入**：MinerU 页结构 JSON（原始只读）、原始 PDF（只读）及已生成的不可变 `original.dir.json`。
- **唯一可变权威**：`changes.json`，包含基线 SHA、PDF SHA 和有序语义操作。当前文档 = 不可变 DIRjson + 重放增量。
- **输出**：每次由当前文档派生的 Markdown 及元素 ↔ PDF 页/坐标映射。Markdown 文件只是可重建的编辑投影，**不是**第二份权威数据。
- **编辑**：修改 Markdown 后通过稳定块 ID 转换为经过 IR 校验的操作，原始 OCR、PDF 和基线 DIRjson 一律不改。增量记录保存完整旧/新片段以及操作前后状态 SHA，重放时严格核对。
- **新增内容**：没有 OCR 来源时不伪造 PDF bbox；必须保留显式人工来源或标注不可定位。歧义的编辑拒绝，不静默猜测。

## WP1 范围及技术债

这是**独立验证原型**，不是 V4 集成或完整自由编辑器。初版每次只接收一个已锚定标题/正文块的安全修改；删改块标记、跨块粘贴、富媒体源码直改、任意新增段落等拒绝。成熟的底层 OCR2MD IR 算法暂通过 import 复用，**下一阶段才把依赖移进独立包**，当前禁止将其描述为完全脱离源码树可安装。CLI 负责文件 IO，核心 `core.ts` 不读写任何文件、不渲染 UI、不依赖 WCP/PDF.js。

WP1 CLI 接受一个实际 PDF 文件并核对 SHA（大 PDF 的再次验证成本将在正式集成时通过可信文件适配层优化）；不存在原 PDF 内容的人工新增文字不得伪造坐标。CLI 验证是单进程、离线、隔离目录下的功能测试，暂不承诺并发写入、跨文件原子初始化或生产 CAS 接入；后续应接入 Vault 的版本与原子提交。

## 验收判据

1. MinerU JSON + PDF 生成一次性不可变 DIRjson 基线及空增量，原文件的哈希不变。
2. DIRjson + 增量 JSON 生成 MD；明确映射到 PDF 原始页/框坐标。
3. 编辑 MD 某一个已有正文/标题块，**只**持久化增量 JSON，不保存已编辑 MD 为权威数据。
4. 重新打开并按序验证操作 SHA，重建 MD 字节相同，元素及原 PDF 坐标相同。
5. 损坏 SHA、错误 PDF、删除块标记、多块编辑或错误操作均拒绝；失败前后文件字节不变。

编辑投影头携带 `mopjo:state-sha256`，导入被编辑的 MD 时先核对版本，拒绝旧稿覆盖新状态；头部是派生元数据，不是额外权威文件。

## WP2 扩展（2026-10-16）

- 默认验收文档：与 V4 同一份 `Buffett’s Alpha` 已保存 DIRjson 快照及原 PDF；通过 `tests/run-buffett-wp2.sh` 仅读取书籍，将快照与测试输出放在系统临时目录。
- `queryElements()` 返回稳定块 ID、类型、正文、MD 范围、PDF 页码/坐标、OCR 原始 elementId 和媒体/公式/HTML 片段；隐藏块仍可查询，但不再有可见 MD 范围。
- `applyElementOperation()` 接收 `suppress-block`（非破坏性的逻辑删除）、`restore-block`、`insert-manual-text`、`split-text`、`merge-text`。老版已锚定 MD 文本/标题更新仍由 `applyMarkdownEdit` 和 `importEditedMarkdown` 承担。
- 删除并不删除原始 OCR block 或原始 `sourceElements`，只从 MD 投影里隐藏；因此始终可以反查原 PDF 和恢复。
- 人工补录只允许显式输入对应 PDF 页码，必须与插入点的来源页一致，明确无原始 OCR elementId / bbox，绝不虚构 PDF 坐标。此来源只表示用户指定的页级人工标注，不等于 OCR 识别证明。
- 拆分只接受可验证的 OCR 文本来源，合并仅接受相邻同章节正文；任何不符合原始证据覆盖约束的操作必须拒绝。表格、公式、图片可查询和定位，但 **WP2 不修改它们的原始结构**；断行智能判定、注释对修改、任意自由格式新增/删除不在 WP2 通过范围内。
- 所有增量操作携带前后有效状态 SHA；即使删除没有修改 IR 对象本身，状态 SHA 也绑定隐藏块集合。已保存 MD 的版本头绑定工作数据状态，防止陈旧的审阅文本覆盖新的增量。每次重开都严格重新校验原始 JSON/PDF SHA 和每个操作。
- 物理文件提交仍由 CLI 所有，测试验收仅承诺隔离目录、单写入者条件下的原子替换，尚未接入生产多写入者事务/CAS，尚未将根目录 `src/documentIr*.ts` 依赖完全迁走。

## WP3 · 真正的章节独立包（2026-10-16）

固定以 V4 的 Buffett’s Alpha 当前 `ir-current.v1.json` 对应不可变 DIRjson ZIP、`chapters-map.v1.json` 和原 PDF 作为唯一真实综合样本。映射为 **6 个文件边界、224 个块、19 个内部标题层级节点**。分章检验映射为严格连续区间，既不丢失也不重复 OCR 块；每块保留原始全书 blockId、PDF 页码及 OCR JSON 指针。

`chapter-publish` 在全新、隔离的包目录输出 `manifest.json`，以及每章的 `<filename>.dir.json`（独立的不可变 `mopjo/chapter-original`）、`<filename>.changes.json` 和 `<filename>.md`。原书 PDF 只通过 SHA 绑定和路径参数共享，不复制。每章仅携带本章块以及这些块引用的 `sourceElements`（包括 OCR rawBlock 与全部原始 segment）；另外保留章节内部标题树。该章节 IR **不伪装成整书 `DocumentIrV1`**，因为旧 v1 模型要求完整整书元素覆盖。

不可变章节 JSON 包含每个源块在初次导入时的合法原始 MD 投影片段（只读派生缓存），是为了保持原生 HTML 表格和公式逐字投影；更新仍全部写入独立 `changes.json`，**不将已经编辑的 MD 作为权威**。以章节包 `original + delta` 重新打开可生成与提交前字节一致的 MD，完全无需读取整书 DIRjson 或章节映射。每章仍必须绑定原 PDF SHA；不能把新增文字假冒 PDF OCR 坐标。

WP3 独立章节支持安全单块正文/标题编辑、逻辑删除/恢复和页级人工文本补录；可查询全部原标题、正文、图片、公式、表格和图表的来源及 PDF 区域。WP2 的整书级 `split-text/merge-text` **尚未移植进此独立 Chapter IR 操作器**，不能据此宣称章节清洗全功能完成。章节 Markdown 编辑不允许改动其锚点或跨块无歧义之外的结构操作。

独立 CLI 的 `chapter-edit/operate` 先提交增量 JSON 再原子替换派生 MD 缓存。两文件间断电可能留下旧 MD 缓存；读取者永远以 JSON+delta 重新生成数据，`chapter-render` 可恢复 MD。**生产多写入者环境仍需 Vault CAS 与版本化双文件提交机制**，本航点不修改 V4 的真实 `chapters/`。源程序仍复用 `src/documentIrMarkdown.ts` 等共享纯函数作为只读首次投影，尚不是完全无外部依赖的 npm 包。

## WP4 · 元素操作与完整 OCR 证据（2026-10-16）

**数据不变量保持不变**：原始 MinerU JSON、原始 PDF、初次规范化 DIRjson 和每章 `*.dir.json` 不可修改；任何审阅仅添加 `*.changes.json` 操作；`*.md` 是可删除并重新生成的视图。

### 源证据与章节归属

- Buffett’s Alpha 当前 DIRjson 包含 224 个正文逻辑块 + 91 个未纳入正文的 discarded OCR 元素，共 **315 个原始 sourceElement**。WP4 全数序列化到六个章节包，原始 `elementId`、PDF 全书页码、bbox、OCR jsonPointer 和原始 segment 均不变。
- discarded 证据按 PDF 页码和邻近位置临时分配到章节包，显式标为 `page-proximity-unverified`，**并不声称已确认属于该章节**。其实际原始结构仍在不可变 JSON 中，不合并进 MD 正文。
- 第 2 页的 `page_footnote` 可作为独立物理证据查询、在对应页留下 `review-note` 增量审阅结论；注释号与注释正文未确认前不可自动绑定。人工新增始终仅有页级锚点，没有 OCR bbox。

### 单章增量操作

- `split-text`、`merge-text`、`move-text`、`join-soft-break`：只对可安全解析的普通正文执行，原始 OCR 永远不变；拆分/合并仅保留粗粒度原始 bbox，绝不伪造新的分段精确坐标；重排限定同章节相邻正文。
- `heading-level` 与 `insert-manual-heading`：允许受约束的叶级小节变更和新标题补录，`effectiveChapterTree` 为派生结构，不重写不可变章树；不允许跨越章节文件边界。
- `replace-rich`：针对已经绑定原始 `elementId+segmentPointer` 的图片 URL、行间公式、HTML 表格指定片段进行局部更新。HTML 表格要求结构标签不变；图片链接限制 HTTPS 或 `imgs/` 安全本地相对路径；脚本/事件属性等高风险标记拒绝。
- `replace-inline-formula`：从真实 OCR 行内公式 segmentPointer 精确选中唯一原始公式文本，增量更新当前文字/MD，拒绝重复文本歧义或伪造来源。
- `insert-manual-rich`：人工新增图像、公式、表格仅携带明确 PDF 页级来源，不能伪造 OCR segment、PDF bbox 或 OCR 自动识别结果。
- `review-note`：显式记录 OCR 错误、未匹配或经过证据核对的确认结论；不能凭编号猜测 PDF 上存在匹配注释号。

### 元素、位置与歧义

- `chapter-elements`、`chapter-evidence`、`chapter-segments`、`chapter-notes`、`chapter-tree` 为只读查询；`chapter-point` 和 `chapter-offset` 提供 PDF/MD 双向命中。重叠 bbox 明确返回 ambiguous 候选，不强选一个；源 segment 在 MD 中多次出现时不猜测其精确文本范围。
- 暂不承诺任意富媒体结构变化（任意新增/删除表行列、公式语法语义验证、自动下载图片）、跨章节重排、语义断行自动判断、注释全自动配对、多人并发 CAS/事务、浏览器响应时延指标。它们需要独立更强契约与真实对照样例，不能以目前测试通过替代人工 PDF 校对。

### 验收

`npm --prefix packages/mopjo test` 顺序执行 TypeScript 严格检查、WP1、WP2、WP3、WP4 实书功能和隔离 CLI 落盘重开测试。全部只读访问 V4 的 Buffett’s Alpha；生成包和修改仅存在临时目录，结束自动删除。MOPJO 仍引用仓库共享纯 IR 导入/投影实现，尚不属于完全外置的零依赖 npm 包，也未接入 V4 UI。
