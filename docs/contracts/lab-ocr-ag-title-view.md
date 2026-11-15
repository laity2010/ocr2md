# Lab OCR · AG 标题过滤视图契约

- **入口**：复用 AG 工具栏现有下拉，Lab OCR 中的选项为 `MD 行`（普通全列表）和 `标题`；空白 Lab Frame 的原模块下拉行为不变，设置仍可从源码导航进入。没有新增独立表或第二套 AG 数据。
- **标题集合**：通过稳定 `block_id` 联接 MD 行和原始 OCR Block 仅取得 PBS/来源信息；**MD 行自身的有效类型和 Level 始终由 CM6 当前 Markdown 源码的 ATX 标题 `#`（1–6 级，后跟空白或行尾）派生**。删除标题标记后，当前 MD 行立即变为普通 `text`、`Level=null`，退出标题视图；添加或更改 `#` 后进入标题视图或实时更新 Level，包含原 OCR 类型为 text 的行。原始 Block `block_type`/`level` 仍在 Block 参考表中保留，绝不反向修改原 OCR 字段。保留全部原始行号、LineID、BlockID、原始文本和空行。
- **列序**：只显示 `text`（MD 行，左固定）、`line_no`（行号）、`pbs`（PBS）、`level`（Level），排序默认原始 `line_no` 升序。AG 单元格显示的是不变的 Markdown **源码**文本，不是 Markdown 渲染结果。
- **外观**：复用源窗口已有 Obsidian Everforest H1-H6 **整行文字与 `#` 标记**颜色规则（`ui/obsidian-everforest.css`），不复用 CM6 的 H1-H6 放大字号；AG 字号保持普通行尺寸。没有合法 ATX 标记的 MinerU 原始标题行按普通 MD 文本处理，不凭 OCR Level 造 `#`。
- **页面／空行过滤**：标题视图默认选中 AG 顶栏的“全部”，即显示全书所有标题；`line_no` 的非空行默认过滤保留，可在现有列筛选器中切换显示空行。取消“全部”则只显示当前 PDF 页的标题。切回 MD 行视图恢复完整列定义及其原有默认当前页、非空行过滤。筛选均只影响 AG 派生视图。
- **生命周期和同步**：切换仅复用 `frame.showSqlRows()`，数据从 CM6 读出；修改源码则通过原 `patchMdRows` 增删事务立即更新标题视图，标题不再符合条件就移出、Level 不再保留 OCR 旧值。不发额外 SQLite HTTP 请求、不重建 MD StateField。编辑单行文本仍通过原 CM6 `editMdLine` API。四窗点击定位与 PDF 页面跟随使用已有稳定 LineID/BlockID 接口；隐藏的非标题行不强行清除过滤条件。
- **验收**：`tests/lab-ocr-title-view.test.mjs` 为直接数据投影测试；`tests/lab-ocr-md-full-source.browser.test.mjs` 验证现有顶栏菜单、全页标题、4 列、默认字号、和 CM6 相同的标题标记色、四窗定位及切回普通视图后无保存或重载。原有 AG 页码筛选与 PDF 拖动浏览器回归须继续通过。
