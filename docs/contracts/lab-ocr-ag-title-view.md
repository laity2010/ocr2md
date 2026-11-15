# Lab OCR · AG 标题过滤视图契约

- **入口**：复用 AG 工具栏现有下拉，Lab OCR 中的选项为 `MD 行`（普通全列表）和 `标题`；空白 Lab Frame 的原模块下拉行为不变，设置仍可从源码导航进入。没有新增独立表或第二套 AG 数据。
- **标题集合**：以当前 CM6 MD 行表通过稳定 `block_id` 联接当前 Block CM6 运行态的 `block_type`，仅投影 `block_type === 'title'` 的 MD 行。`Level` 是只读 MinerU 标题层级，不从 PBS 深度或 Markdown `#` 数量推测。保留全部原始行号、LineID、BlockID、原始文本和空行。
- **列序**：只显示 `text`（MD 行，左固定）、`line_no`（行号）、`pbs`（PBS）、`level`（Level），排序默认原始 `line_no` 升序。AG 单元格显示的是不变的 Markdown **源码**文本，不是 Markdown 渲染结果。
- **外观**：复用源窗口已有 Obsidian Everforest H1-H6 **整行文字与 `#` 标记**颜色规则（`ui/obsidian-everforest.css`），不复用 CM6 的 H1-H6 放大字号；AG 字号保持普通行尺寸。没有合法 ATX 标记的 MinerU 标题行仍显示原文，不凭 Level 造 `#`。
- **页面／空行过滤**：标题视图默认选中 AG 顶栏的“全部”，即显示全书所有标题；`line_no` 的非空行默认过滤保留，可在现有列筛选器中切换显示空行。取消“全部”则只显示当前 PDF 页的标题。切回 MD 行视图恢复完整列定义及其原有默认当前页、非空行过滤。筛选均只影响 AG 派生视图。
- **生命周期和同步**：切换仅复用 `frame.showSqlRows()`，数据从 CM6 读出；不发 SQLite HTTP 请求、不重建 MD StateField。编辑单行文本仍通过原 CM6 `editMdLine` API。四窗点击定位与 PDF 页面跟随使用已有稳定 LineID/BlockID 接口；隐藏的非标题行不强行清除过滤条件。
- **验收**：`tests/lab-ocr-title-view.test.mjs` 为直接数据投影测试；`tests/lab-ocr-md-full-source.browser.test.mjs` 验证现有顶栏菜单、全页标题、4 列、默认字号、和 CM6 相同的标题标记色、四窗定位及切回普通视图后无保存或重载。原有 AG 页码筛选与 PDF 拖动浏览器回归须继续通过。
