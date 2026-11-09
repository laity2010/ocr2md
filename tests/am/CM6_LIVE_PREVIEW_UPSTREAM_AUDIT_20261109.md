# OCR2MD · 两个 CM6 Markdown Live Preview 开源组件对照审计

审计日期：2026-11-09。性质：**固定 SHA 的源码核验 + 官方测试执行 + 面向 OCR2MD 的接入审查**，不是直接替换主线/校译左窗的实施许可，也不是独立于本次执行者的第三方外审。

## 0. 受审材料与约束

| 项目 | Atomic Editor | live-markdown |
| --- | --- | --- |
| 上游 | `https://github.com/kenforthewin/atomic-editor` | `https://github.com/getlatentic/live-markdown` |
| 受审固定 Git SHA | `b6ed65f01bde4510031bc7a495520bc1a7688c66` | `97aa7b68cc7f8d0b990cb974c1577325bc3a9547` |
| 提交日期 | 2026-07-11 | 2026-09-21 |
| package name / 版本 | `@atomic-editor/editor` v0.6.2 | `@latentic/live-markdown` v0.4.2 |
| 许可证 | LICENSE 原文 MIT | LICENSE 原文 MIT |
| React 外壳 | React 18/19 peer；**低级 CM6 扩展单独导出** | React 18/19 peer；`mergeExtensions()` 可提供 CM6 规则/扩展，README 仍将“独立于 React 的引擎”列为未完成路线 |
| 源码规模 | 约 21 个 TS/TSX 文件（含测试除外的计数未单独统计） | 约 204 个 TS/TSX 文件（含测试） |

源码克隆于 Mac 临时隔离目录：`/tmp/ocr2md-cm6-editor-audit-20261109/{atomic-editor,live-markdown}`。无修改 OCR2MD Main、Lab 运行代码、CMD/翻译数据或上游远端分支。本报告为 OCR2MD 项目唯一提交成果。

两者都是相对年轻的**小型开源编辑器**，不能以“高赞成熟方案”直接论证整体采用。Atomic Editor 的应用父项目（Atomic）与独立编辑器的 Star **不应混算**。

## 1. 统一标准的源码审计

| 审查维度 | Atomic Editor | live-markdown | OCR2MD 判断 |
| --- | --- | --- | --- |
| `EditorState.doc` 持有 Markdown | **满足**。`AtomicCodeMirrorEditor.tsx:300-304,361-364` 直接以输入 MD 创建 CM6 doc，变化回传 `doc.toString()` | **部分满足**。`CodeMirrorMarkdownEditor.tsx:235-240,557-559` 将 YAML frontmatter 从 CM6 doc 分出，CM6 只承载 body | 校译要求 CMD **全文**在 CM6 中；Atomic 默认更吻合 |
| 编辑器/组件化边界 | `src/index.ts:7-35` 导出 `inlinePreview`, `imageBlocks`, `tables`, `readOnlyExtension` 等，不必接管已有 EditorView | `src/index.ts:40-85` 导出 `NodeRule/mergeExtensions/mathExtension/footnoteExtension` 等，但高层仍由 React 外壳管理文件和持久化 | 两者都可以拆扩展；Atomic 更适合试接现有 WCP CM6 |
| 普通 Markdown Live Preview | `inline-preview.ts:24-39,312-350` 逐行 Decorator 隐藏语法，解决 ViewPlugin 不能替换跨行段的问题 | `core/registry.ts:56+` NodeRule + `core/plugin.ts:112+` 装饰/标记驱动，视口内扫描 | **两者都比先前整段 `Decoration.replace(block:true)` 合理**；但不等于句 ID Gutter 已验证 |
| 只读、阅读模式 | `read-only.ts:24-46` / `AtomicCodeMirrorEditor.tsx:148-155,369-370`，支持 `Compartment` 原地切换 | 高层组件 props 未发现对应 `readOnly`；`mode='source'/'wysiwyg'` 不是只读；可由宿主 CM6 再加 readOnly | 校译左窗必须只读；Atomic 开箱支持 |
| 源码行号和句 ID Gutter | 可由标准 CM6 扩展组合，但未自带 OCR2MD 句 ID；图片/表格 Widget 可能仍影响标记 | 同样不自带句 ID Gutter；表格/HTML block Widget 会替换源码区域 | **两者均未通过 OCR2MD 402 句渲染 Gutter 验收**；不得写成已解决 |
| CM6 原生标题折叠 | 上游未找到自带 `foldService/foldGutter`；可通过宿主 extension 接入 | 同样未找到自带 `foldService/foldGutter` | 折叠仍使用已有 CM6 API，禁止外部 HTML 折叠状态机 |
| 图片 | `image-blocks.ts:51-110` 提供 Widget、缓存尺寸以改善 iOS 滚动 | `image/imageWidget.ts`、`imageSrcResolver.ts` 和 host resolver 支持相对媒体、上传 | 必须直接调用 Main 的 `/media/` 解析与授权，不能新建媒体目录 |
| GFM 表格 | `table-widget.ts:655+,1225+` 使用可编辑 Widget | `table/` 和 `tablev2/` 多套表格编辑状态与 Widget | 可用作 GFM 表格；**OCR2MD 多行 HTML 表格不是 GFM 表格** |
| 复杂多行 HTML 表格 | 未提供等价 Main HTML 阅读渲染 | **不满足**。`html/htmlWidget.ts:82-90` 明确多行 HTMLBlock 保留原样源码（禁止 ViewPlugin 跨行替换） | OCR2MD 表格和块链/注释表有多行 HTML；**直接替换必失真** |
| KaTeX `$...$`/`$$...$$` | 不内置独立数学渲染扩展 | `math/mathPlugin.ts` + `math/mathWidget.ts` 内置 KaTeX | 公式能力 live 优胜，但要验证与 Main 的 inline/fence/Obsidian 约定一致 |
| Obsidian callout、嵌套表格 | 未内置 | 未内置 Obsidian `[!...]` 特殊规则 | 两者都需复用 Main `obsidian-callouts` 逻辑，不能把“普通引用块”当作 callout 验收 |
| 脚注 | 未内置完整脚注 renderer | `footnote/footnotePlugin.ts:13-85` 对 `[^id]` 引用/定义作 ViewPlugin 标记；未提供与 Main 相同的注释引用→注文弹窗/返回契约 | live 更接近，但**Main 注释弹窗、脚注定义来源/多窗定位仍缺** |
| HTML 安全 | 非完整 HTML 阅读器；`window.open(...,'noopener,noreferrer')` 默认链接策略，但相对/远端 image src 仍需要宿主约束 | `html/htmlWidget.ts:6-12,59-63` 使用 DOMPurify 且禁脚本、iframe、form 等；Mermaid `securityLevel:'strict'`（`mermaidRender.ts:28-46`） | 安全防护积极，但有**实际兼容性问题**：HTML widget 的协议白名单会删掉 `/media/xxx` 等相对 URL；宿主必须单独审查安全而不能简单放宽所有 URI |
| iPad / 滚动跳动 | `inline-preview.ts:916-939` 避免仅滚动引起装饰重建；`image-blocks.ts:63-84` 做图片尺寸缓存 | 有独立 WebKit browser suites，但需要匹配的 Playwright WebKit revision | 两者都**未在 OCR2MD 物理 iPad Safari** 验收，不能因 README 宣传判 PASS |
| 框架/工程风险 | React wrapper + 21 个 TS/TSX 源码/测试文件的体量较小，易隔离需要的扩展 | 更宽功能面，约 204 TS/TSX 源码/测试文件；还引入 `mermaid`,`turndown`,`yaml`,`DOMPurify`,`KaTeX` 等依赖，外壳有自动保存等语义 | 应最小复用；不宜整包接管 CMD 保存、翻译映射和 WCP 同步 |

### 关键反例：live-markdown 的“无损”不能直接作为 OCR2MD 保证

源码：`src/frontmatter.ts:71-94,106-123`。解析 YAML 后使用 `yaml.stringify()` 重建，而不是保留原始 YAML 字节。**用编译后的真实代码执行**了独立输入/输出：

```text
输入：---\ntitle: "Buffett"\n# preserve me\n---\n# Analysis\n
输出：---\ntitle: Buffett\n---\n# Analysis\n
严格相等：false；输入长度 50，输出长度 34。
```

另一个行内数组样本同样发生结构性换行变化。没有 YAML frontmatter 的普通 CMD 注释样本能保持一致，但**不能由此推断所有 Markdown 都字节无损**。其高层 React 组件的 CM6 doc 还只装 body 而非原文 frontmatter。即使序列化在默认保存流程才触发，该事实已使其不能无适配地满足 CMD 全文原子化约定。

### 关键反例：live-markdown 的 HTML 清洗策略会删除 Main 的相对媒体 URL

将 `html/htmlWidget.ts:6-12` 的真实 `SANITIZE_CONFIG` 传给仓库安装的 DOMPurify + jsdom，实测：

```text
<img src="/media/p1.jpg" alt="x">  →  <img alt="x">
<img src="https://ocr2md.laity.bid/media/p1.jpg"> → 保留绝对 HTTPS src
<a href="/relative.md">go</a> → <a>go</a>
<a href="javascript:alert(1)">no</a> → <a>no</a>
<script>alert(1)</script><b>safe</b> → <b>safe</b>
```

这不代表安全漏洞；恰恰说明该项目拦截不可信 URL。但 OCR2MD 预览默认的 `Main /media/` 相对链接会被误删。移植必须通过可信媒体解析器以受限路径输出、并保持安全阻断。不能为修一张图片将 URI 白名单全部开放。

## 2. 在 Mac 真机执行的检查（固定上述 SHA，不修改测试断言）

环境：macOS Apple Silicon，Node v23.11.0、npm 10.9.2、pnpm 10.33.0。安装使用锁文件且 `--ignore-scripts`，避免执行依赖安装生命周期脚本；随后显式运行项目自身测试与构建。请注意 Node 23 并非 Atomic 测试工具推荐的 LTS 版本。

| 检查 | Atomic Editor | live-markdown |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` **PASS** | `pnpm typecheck` **PASS** |
| 默认单元测试 | `npm test -- --reporter=dot`: **75/75 PASS，7 文件** | `pnpm test`: **729/732 PASS，74 文件，3 FAIL**；2 个测试文件失败，包含 2 个 5 秒超时和 1 个表格混合数学断言 |
| 失败专项复查 | 不需要 | `vitest run src/codemirror/table/tableInline.scanned.test.ts src/codemirror/core/editorTheme.test.ts --maxWorkers=1 --testTimeout=20000`: **12/12 PASS**。故首轮故障不能直接判定产品代码必然错误，可能与并行/测试资源有关；默认整套**仍未通过** |
| 控制并发的全套复核 | 不需要 | `vitest run --maxWorkers=2 --testTimeout=15000`: **732/732 PASS，74/74 文件**。确认首轮失败可通过降低并行竞争/放宽原 5 秒超时避免，原始默认参数的一次未通过仍如实保留；**未修改任何上游测试断言** |
| 编译和打包 | `npm run build`: **PASS** | `pnpm build`: **PASS**，生成 dist 和 DTS |
| Playwright 官方配置 | 官方 Chromium 配置找不到它期望的 Playwright 浏览器 revision，最初 **BLOCKED（环境）** | 官方 WebKit 配置找不到指定的 WebKit revision，**BLOCKED（环境）** |
| 浏览器替代验证 | 仅替换审计配置的 executablePath 为宿主已安装 Google Chrome，不动官方源码/断言：`@smoke` **3/3 PASS**（非原样浏览器 revision） | 试图配置宿主已有旧版 WebKit，实际运行仍要求指定 revision；**没有完成 WebKit 浏览器层验收**，不得将 jsdom 单测等同 iPad 实机 |

如需重现：克隆上游、checkout 固定 SHA，使用两项目已有 `package-lock.json` / `pnpm-lock.yaml` 安装；在沙盒中依次执行项目的 typecheck、test、build。原始终端日志保存在 Mac 临时目录 `/tmp/ocr2md-audit-{atomic,live}-*.log`；**未将第三方源码或个人 CMD 文档打包进本报告**。

## 3. 针对 OCR2MD 校译 Lab 的结论与路线

**优先候选：Atomic Editor 的低级 CM6 `inlinePreview()`（非整包 React 编辑器）。** 可复用它保持 CM6 行结构、鼠标冻结、布局稳定、只读阅读模式和图片滚动缓存的思路；与 WCP 已有 `EditorView/EditorState` 组合，而不是再做另一层 HTML 阅读视图。

**次级参考：live-markdown 的 math、footnote、HTML 安全和 NodeRule 设计。** 现有完整 React 外壳、YAML 重序列化、多行 HTML 缺失，使其不宜直接承担 OCR2MD CMD 统一编辑和校译的正式左窗。不得把合并两套重型渲染引擎当成“直接复用”。

**两者都不批准直接晋升 Main/校译左窗。** 审计发现来源于上游代码与其官方测试，并非在 OCR2MD 388,265 字符真实 CMD 上完成的两候选端到端运行。不能用“上游 demo 看起来好”替代本项目 402 句、19 标题、18 媒体、41 KaTeX、9 HTML 表和 7 callout 的验收。

### 建议的最小下一航点（独立 Lab，不动 Main）

1. 在 **Lab 隔离页面**复用 `@atomic-editor/editor` 的 `inlinePreview` 与 `readOnlyExtension` **原扩展公开 API**，挂在 WCP 已存在的 CM6 EditorView；句号/源码行号 Gutter 与标题折叠继续使用 CM6 自身插件，禁止叠加自建 HTML 行号栏、折叠坐标状态机。
2. 用校译真数据验证：`view.state.doc.toString()` 与完整 CMD 字节完全一致；402 句原始位置稳定；开启/关闭渲染，Gutter 对所有句块可见；从 GPT/Grok 译文点选不会跳回 `225|p5b2`。
3. 针对没有覆盖的 Markdown 语法，保持现有 Main 渲染器为事实参考，通过**独立的最小适配 API**处理图片、LaTeX、嵌套 HTML 表格、Obsidian callout 和 Main 注释对；不要把整个 Main 预览复制一份，也不要为了隐藏源码让整段 source line 被替换而失去 gutter。
4. Chrome/iPad WebKit/实机 Safari 测试必须覆盖长文虚拟滚动、反复选句/折叠、20 条脚注、隐蔽无效断行、最小字体和远端媒体；用合成恶意 HTML/链接与多种 frontmatter 样本检查安全和字节恒等。
5. **只有全部验收通过才考虑版本晋升**；失败时留在 Lab，不触碰 Main 预览与文档保存。后续候选升级必须核验新上游 SHA/依赖及其回归，不得无条件追随主分支。

此报告不扩张模块对外 API，也不改变 AGENTS.md。本次审核已查明需要复用哪一类组件，以及**尚未被上游解决的明确缺口**。
