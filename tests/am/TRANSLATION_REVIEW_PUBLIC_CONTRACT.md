# 校译 Lab · 独立模块最小公开契约

校译模块与分句模块平级：共用 V6 Dockview、CM6、Everforest/Sarasa **显示技术**，不调用分句引擎、不读取 Gold、不修改 CMD 或分句侧车。

1. **TR01** `load_dataset(inputDirectory)`：从 `translation-review/input/` 独立读取 CMD、统一句块表与多 AI 译文；检查原始 SHA、记录 ID、字段和顺序完全一致；仅以只读响应供校译页使用。直接测试：`python3 -m unittest tests/test_v6_translation_review.py`。
2. **TR02** `prepareTranslationReview(dataset)` / `filterTranslationRows(rows,mode)`：基于每条的 `original/corrected/translation` 构成只读比较表与差异筛选。直接测试：`node --test tests/translation-review-core.test.mjs`。
3. **TR03** `createTranslationCompareWorkspace(container,model,{onSelect})`：独立 CM6/Dockview 多窗，左窗显示 WP1 的干净单语 MD、右窗按 AI 数量纵向堆叠；窗口仅通过不可变 `id` 和原文→干净文档的坐标锚点同步。真实浏览器测试：`node tests/translation-review-lab.browser.test.mjs`（Chromium + iPad WebKit）。
4. **TR04 (WP1)** `buildCleanReviewedMD(source,rows)` / `restoreReviewedMD(clean)`：在校译模块内部构建单语只读 Markdown。仅删除工作元数据注释、将同一块连续句子的分隔符变为换行；所有其余源字符、标题、媒体、公式、HTML、注释都保留，并记录可逆补丁和 source→clean 的 ID 位置。逆向结果必须逐字符等于审阅 MD，任何坐标重叠/不可安全分句直接报错，不允许悄悄跳过。直接测试：`node --test tests/translation-review-clean-md.test.mjs`；锁定 402 条的真实数据测试：`node tests/translation-review-clean-real.test.mjs`。两条测试不可互相替代。
5. **TR05 (WP1 阅读版)** `buildTranslationReadingProjection(clean)` / `mainMediaURL(src)`：把 TR04 的干净 MD 投影成给 Main 的 `renderMarkdown()` 读取的临时版面。句间增加阅读段落间隔；仅在临时投影里恢复已审阅行内公式的隐藏审阅标记以调用 Main 的 KaTeX。源文件和干净 MD 不变。主线路由 `/media/<文件名>` 只读提供工作空间的统一媒体，不创建 Lab 媒体文件，也不通过本地路径读取 Main 数据。直接测试：`node --test tests/translation-review-reading.test.mjs`；真实浏览器测试同 TR03。
6. **TR06（预览行号、句 ID 与滚动）**：复用 TR05 的阅读版 `anchor.line` 与 Main Markdown 渲染产生的 `data-source-start`。在阅读文章外生成不参与正文流布局的双栏标记（行号、句 ID），监听图片加载、callout 展开与 Dockview 缩放重新计算绝对 Y；滚动不会触发其他窗的定位或改变主动选中句，只有点击句子或 ID、选择记录时才允许更新焦点。真实 402 句 Chrome/WebKit 回归：`node tests/translation-review-reader-gutter.browser.test.mjs`。
7. **TR07（稳定选择与 Main 注释阅读）**：滚动和图片重排不改变用户主动选择的句 ID（只有明确点选正文、行号 ID 或工具栏记录才可更新选择）。左窗复用 Main 的 `createFootnotePopover({root,onLocate})`，注引点击打开与 Main 相同的正文卡片，不跳转哈希；卡片提供显式定位注文、关闭，预览工具栏提供 `↩ 返回注引` 恢复精确的阅读滚动位置。弹窗组件与原 Main 模块同源，不复制渲染/注释逻辑。真实全篇测试：`node tests/translation-review-reader-gutter.browser.test.mjs`。
8. **TR08（点击不重复跳转）**：点击已选中句子立即幂等，不允许向其他窗再次 `scrollIntoView`；主动选择新句后，只在目标句位于其他窗视口外时定位，已可见时只标记。CM6 右窗需有真实文本区的短按、未发生拖动才允许触发选择，触摸滑动不能被误认为句子点击。Chrome/WebKit 全篇 402 句真数据点击、滚动、注释回归执行 `node tests/translation-review-reader-gutter.browser.test.mjs`。
9. **TR09（iPad Safari 旧焦点滚动锚点防护）**：只读 Dockview 面板拒绝无 `preventScroll` 的自动 `focus()`；右窗点击位置以 CM6 实际命中的 DOM 文本行作为锚点，不再用触摸完成时的 XY 重新推算。左窗轻触句 ID/正文必须保持自身 `scrollTop` 不变，即使浏览器在 pointerup 期间错误跳转回旧标题 `225 | p5b2`。真实测试含此特定旧锚点的注入回归，且不修改 Main 预览器。

**WP1 左窗状态**：现在呈现 Main `renderMarkdown()` 渲染的全篇单语 Markdown 阅读版（标题、图片、LaTeX、HTML 表格、Obsidian 折叠 callout），正文按句划界；右侧 AI 译文比较暂不改变，统一 ID 通过临时阅读投影的锚点联动。下游双语排版和英文纠错高亮不在 WP1 范围。

## 路由

- `/labs/<lab-id>/`：Lab 首页，仅运行环境入口；Main `/` 仍是 V6 工作台。
- `lab-home.html`：独立首页。
- `sentence-benchmark.html`：已有分句 Lab，不改变业务操作。
- `translation-review.html`：校译 Lab，不包含任何分句按钮、分句仲裁或 Gold 业务代码。

## 输入输出

- 独立输入：`labs/sentence-benchmark/.runtime/translation-review/input/`，文件 `document.md`、`translation-units.json`、`translated-<ai>.json`。首次数据通过一次性**复制**移入该独立输入目录；页面不动态读取分句 Lab 的 exports 文件。
- 独立输出：`labs/sentence-benchmark/.runtime/translation-review/output/`。当前只读比较阶段尚无写入 API；后续英文／译文仲裁要增加自己的审阅契约、CAS 保存和直接测试，不能复用句界 sidecar。
- 校译输入由独立 `/api/translation-review-data` GET 返回；不是 Main 的 CMD `/api/document`，也不是分句 `/api/sentence-review`。

## 诚实边界

当前可展示、筛选、联动多 AI 的两层纠错和译文，但**尚未实现人工采用、落盘、校译结果导出或 Obsidian 双语重组**。未被真实测试覆盖的主线发布、外部审计、Linux 兼容不作通过声明。
