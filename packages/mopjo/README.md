# MOPJO · MinerU OCR PDF JSON Operator

独立 TypeScript 文档数据内核验证包。第一条原则见 [ARCHITECTURE.md](./ARCHITECTURE.md)：**原始 DIRjson 和 PDF 不可变、人工操作增量化、Markdown 只作为投影**。

## 固定真实数据：Buffett’s Alpha（与 OCR2MD V4 一致）

默认从 Mac Obsidian 的 `Bufett’s Alpha` 书籍目录读取当前保存的 `.ocr2md/ir-current.v1.json` 所指向的原始 DIRjson 快照，绑定该快照记录 SHA 的原始 PDF。测试会复制快照到系统临时目录，仅在那里生成增量 JSON 和 Markdown；绝不发布/覆盖 V4 章节或修改原始 PDF/OCR。

在仓库根目录运行：

```bash
npm --prefix packages/mopjo test
```

`npm test` 顺序执行严格 TS 类型检查、WP1 极小隔离边界回归（37 项断言）、以及 Buffett 实书 WP2 端到端回归（55 项检查）。若书籍不在默认路径，可指定 `MOPJO_BUFFETT_BOOK=/path/to/Bufett’s\ Alpha`。

单独运行：

```bash
npm --prefix packages/mopjo run test:unit
npm --prefix packages/mopjo run test:buffett
npm --prefix packages/mopjo run typecheck
```

## 核心输入、输出与 CLI

输入：`original.dir.json`（不可变 DIRjson）、`source.pdf`（只读原始 PDF）、`changes.json`（初始空增量）。输出：按序重放操作得到的有效文档、元素索引、MD 投影及 PDF 位置；不会直接产生第二份可编辑正文权威。

可对已经存在的有效 IR 使用 `init-ir`，也可对 MinerU 原始页 JSON 使用 `init`：

```bash
npm --prefix packages/mopjo run build
node packages/mopjo/dist/cli.mjs init-ir /tmp/original.dir.json /path/to/source.pdf /tmp/book-test
node packages/mopjo/dist/cli.mjs render /tmp/book-test /path/to/source.pdf /tmp/book.md
node packages/mopjo/dist/cli.mjs elements /tmp/book-test /path/to/source.pdf table
node packages/mopjo/dist/cli.mjs locate /tmp/book-test /path/to/source.pdf blk_0123456789abcdef01234567
node packages/mopjo/dist/cli.mjs operate /tmp/book-test /path/to/source.pdf /tmp/operation.json
node packages/mopjo/dist/cli.mjs edit /tmp/book-test /path/to/source.pdf /tmp/book.md
```

`operate` 接收由 JSON 写成的单个结构化操作，例如：`{"kind":"suppress-block","blockId":"blk_..."}`。每次保存仅更新包内的 `changes.json`；查询和重新生成 MD 不更改增量；过期版本、结构歧义及错误来源校验一律拒绝。

**当前边界：** WP2 实现了正文、标题的安全 Markdown 修改，人工页级文本补录，元素逻辑删除/恢复，以及经验证的正文块拆分/合并。图片、表格、公式和图表已具备提取与定位接口，尚不支持其富媒体内容编辑、完整注释对和智能断行清洗。这属于 WP2 时的历史阶段边界；WP06 已把当时复用的纯 IR 算法及其传递依赖迁入 `src/ir/`。目前的独立构建与源码边界请以 [WP06_ARCHITECTURE.md](./WP06_ARCHITECTURE.md) 为准；**仍未接入 V4 页面**。

## WP3 · 章节独立发布与重新打开

使用与 V4 同源的 `ir-current.v1.json`、`chapters-map.v1.json` 和 PDF，按用户确认的 **6 个章节文件** 输出，各章具有完整原始来源元素和独立增量日志；在包内编辑某章无需加载整书 DIRjson。6 章总计 224 块，保留 19 个内部章节节点。输出放全新的测试目录，不覆盖原章节。

```bash
# 从同一份 Buffett’s Alpha 原始数据自动读取、分章、校验和清理临时测试目录
npm --prefix packages/mopjo run test:wp3

# CLI 自行指定隔离位置；baseGeneration 是 V4 的 ir-current.v1.json.archiveSha256
node packages/mopjo/dist/cli.mjs chapter-publish /tmp/book.dir.json \
  /tmp/chapters-map.json '/path/to/original.pdf' '<baseGeneration>' /tmp/new-mopjo-chapters
node packages/mopjo/dist/cli.mjs chapter-elements /tmp/new-mopjo-chapters '01 Buffett’s Alpha.md' '/path/to/original.pdf'
node packages/mopjo/dist/cli.mjs chapter-edit /tmp/new-mopjo-chapters '01 Buffett’s Alpha.md' '/path/to/original.pdf' /tmp/edited.md
node packages/mopjo/dist/cli.mjs chapter-render /tmp/new-mopjo-chapters '01 Buffett’s Alpha.md' '/path/to/original.pdf'
```

`chapter-render` 由两份 JSON 重新生成 MD，即使磁盘上以前缓存的 MD 被改坏也不影响真值。`test:wp3` 确认分章完整覆盖、原始 SHA、独立逐章加载编辑、人工文本页级定位、增量重放及错误拒绝。仍需注意：独立章节的复杂块拆分/合并、注释对维护、富媒体写入和生产级并发事务尚未完成。

## WP4 · 完整来源、章节元素与双向定位

WP4 的实施入口仍只有一个，不要求操作 V4 页面：

```bash
npm --prefix packages/mopjo test
# 只运行 WP4 的 Buffett 实书操作 + CLI 保存重开验收
npm --prefix packages/mopjo run test:wp4
```

固定样本：Buffett’s Alpha 的 **22 页、224 个逻辑块、315 个原始 OCR 元素、6 个章节包、19 个原始章节节点**。遗漏的 91 个 discarded 证据现在以“未验证的页面邻近归属”额外保留。每章仍可不加载整书 DIRjson 而独立打开、操作、重放和再生 MD。

新增安全操作包含正文拆分、合并、相邻重排、软断行修正；受约束的标题层级与人工标题；真实 OCR segment 锚定的表格/公式/图片 URL 片段修改、正文内行内公式局部修正；人工新增的页级媒体/公式/表格，以及注释审核记录。自动注释配对或任意富媒体结构修改未宣称完成。

只读查询 CLI 命令：`chapter-elements`、`chapter-evidence`、`chapter-segments`、`chapter-notes`、`chapter-tree`、`chapter-point`（全书 PDF 页码+归一化坐标）及 `chapter-offset`（MD UTF-16 偏移）。修改仍经 `chapter-operate` 的 JSON 操作，经增量 SHA 链审计。Markdown 不作为权威文件，失效缓存可用 `chapter-render` 重新生成。

WP4 所有代码仍限定在 `packages/mopjo/`，不更新 V4、不覆盖真实 Obsidian 章节。遗留生产边界包括：Vault 的并发 CAS、复杂表格增删行列、任意媒体插入清洗、完整注释号—正文自动关联、跨章操作，以及复杂页面的亚元素精确 bbox 识别；这些应在 V4 接入前分别验收。

## WP05 · V4 标准数据 Port（已通过独立实书验收；页面未接线）

新增 `src/v4Port.ts`，输出 `MopjoV4ChapterSession` 和 `V4ChapterPort`。用于章节清洗业务组件取得元素、注释、标题、PDF↔MD 双向定位，以及编辑、内存草稿、增量 JSON CAS 保存、重开重放。全部 UI Markdown 偏移统一为含状态头的 UTF-16 坐标。Port 与 WCP 内核、V4 代码完全隔离；需由可信文件服务提供真实原子 CAS。

```bash
npm --prefix packages/mopjo run test:wp5
```

本项测试使用与 V4 相同的 6 章、224 块、315 来源元素，测试操作只发生在临时目录。**它不能证明 V4 的旧 Workbench 已替换、真实 Vault 并发 CAS 已提供或三窗交互已接通。** 完整接口契约及剩余生产接线条件见 [V4_PORT_WP05.md](./V4_PORT_WP05.md)。

## WP06 · 源码完全独立和架构账本

MOPJO `src/ir/` 只保留实际导入闭包内的 9 个私有 IR 模块，原始算法 SHA-256 在迁移时一一相同；不再通过 `../../../src/` 引用 OCR2MD 旧仓库源码。开发工具作为本包的独立 `devDependencies` + `package-lock.json`，支持在主仓库之外用 `npm ci` 安装、构建和回归。**这不等于已切换 V4 业务页面或实现生产多写入者 CAS**。

```bash
cd packages/mopjo
npm run verify:boundary             # TypeScript AST 导入/边界检查
npm test                            # WP1–WP5 原有 369 项检查
npm run test:isolated               # /private/tmp 中复制包、单独 npm ci 与全量回归
python3 scripts/ael.py report      # MOPJO 私有 AEL 账本，不修改 V4 AEL
```

详情、基线 SHA、依赖与 AEL 警告语义见 [WP06_ARCHITECTURE.md](./WP06_ARCHITECTURE.md)。后续其他模块可使用 [AEL_REFERENCE_V1.md](./AEL_REFERENCE_V1.md) 的指标口径和 [AEL_REFERENCE_V1.json](./AEL_REFERENCE_V1.json) 的机器可读样本作为对照基准；该样本是一次性源码迁移，不是所有模块的统一文件数或耗时阈值。
