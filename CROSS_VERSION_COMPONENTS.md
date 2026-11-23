# OCR2MD · 跨版本组件一致性契约

> **适用范围与权威**：本文件是统一工程根目录 `AGENTS.md` **第 10 条登记的委托规范**，由 Main Git 维护。适用于 Main、已登记的 Lab 与以后从空白框架重建的 V3/V4；它不凌驾于 `AGENTS.md`，也不把 V2 数据库、PBS 或 Markdown Schema 当作跨版本规则。切换版本先读 `AGENTS.md` → 本文件 → **该版本自己的 README**。仅用户明确授权可扩大跨版本强制要求；接口、测试和适配信息修改须保留 Git 证据。

## 1. 公共组件登记表与责任边界

| 组件 / 统一要求 | 当前可核对的来源基线 | 跨版本强制要求及状态 |
| --- | --- | --- |
| **AG Grid 表头列值筛选** | V1 `labs/lab-ocr/ui/enum-checkbox-filter.js` (`EnumCheckboxFilter`)；接线 `labs/lab-ocr/ui/outline-grid.js`、`labs/lab-ocr/ui/lab-ocr/workflow.js` | **已核验 V1 源码和测试，强制复用其交互契约**；细则见第 2 节 |
| **导航下拉** | V1 `labs/lab-ocr/ui/wcp-navigation-select.js`；Frame 同名模块 | 应保留既有导航层级、选择/定位及 Undo/Redo 接入习惯；具体 API 和适配差异需在各版本 README 与直接测试核实，**不得在无审计时复制平行下拉组件** |
| **全局设置与目录授权** | V1 `labs/lab-ocr/ui/settings-module.js`、Frame 设置模块 | 沿用经过验收的全局设置入口、字段权限及统一提示方式；存储与授权细节以各版本实际接口测试为准，不能为局部需求重新建立设置状态系统 |
| **PDF 预览与 PBS 标签交互** | V1 `labs/lab-ocr/ui/lab-ocr/pdf-viewer.js`、`pdf-gutter-label-layout.js`、`pdf-bbox-gesture.js` | 重用经验证的 PDF.js 浏览器预览、块标注/避让/定位语义；跨版本接口和具体手势必须逐项验收，**不可把未检验的近似实现冒充 V1** |
| **CM6 源码与跨窗定位** | Frame `ui/cm-document.js`，V1 对应 CM6 接入 | 保持唯一文档源、明确定义的位置映射与 Undo/Redo 行为；数据持久化和是否可编辑属于版本契约，**不要求各版本采用相同 SQLite Schema** |

> **状态说明**：AG 过滤器的 V1 公共接口和对应测试已核对；其余条目只确定**已有复用基线与必须先核验接口**，不是宣称它们全部已抽象成版本无关库或已经通过 V3 验收。要新增具体的强制 UI 行为，先审计基线并经用户明确授权补充。

## 2. AG Grid 表头过滤：不可擅自替换的交互契约

- **直接复用优先**：使用 V1 `EnumCheckboxFilter`，它实现 AG Grid Community `IFilterComp`。新版本从同一组件及标准 AG API 接入；确需隔离适配时，保留 GUI、过滤模型、生命周期和可执行测试，禁止无证据地另造同职能过滤器。
- **显示与交互**：使用 AG Grid **原生列头过滤图标**和 AG 管理的弹层；弹层显示 `all` 复选框及当前列去重值的复选框；支持多值同时勾选、全部/取消、过滤模型恢复与新数据加载后的合理保留。`filterChangedCallback()` 让 AG 负责筛行，不通过独立页面状态和全量数据重构冒充过滤。
- **接线基线**：`filter: EnumCheckboxFilter`、按列需要使用 `filterValueGetter`、`suppressHeaderMenuButton: true`、`suppressHeaderFilterButton: false`。排序、固定列、列宽各自设置：某列 `sortable:false` **不表示不能过滤**。不能用自制 `headerComponent` 里的 `<select>`、自制对话框、Enterprise 专属过滤功能代替。
- **数据边界**：过滤只影响 AG 可见行，不改变 SQLite/MD Block/原始 OCR、PDF 映射或其他窗口的位置关系；多列过滤叠加，不因加载时暂时空表清空用户原有选项。
- **直接测试与验收**：V1 `labs/lab-ocr/tests/enum-checkbox-filter-transient-empty.test.mjs`、`labs/lab-ocr/tests/outline-browser.test.mjs`（以及受影响的 V1 View 浏览器测试）是已存在的行为证据；新版本必须复用这些行为夹具或实现等效直接测试，至少验证点击图标、`all`、多个选项复选、清空、数据刷新、与排序独立、Chromium/iPad-WebKit 的交互。不能只查 DOM 外观或仅凭一个过滤条件成功就宣布复刻。

## 3. 新版及新 View 的执行检查

1. 开始组件实施之前，读取此表和**实际存在的 V1/Frame 源码**，确认版本、公开 API、适配边界和测试；找不到来源时标记 BLOCKED，不猜测。
2. 新版本自己的 `README.md` 只写**组件适配位置、当前通过/未通过状态和明确的例外**，不复制改写这里的通用规则。
3. 如需偏离已登记的强制一致性要求，先提交差异证据和影响测试供用户批准；不得以“V2 崩溃”“V3 从零重做”为由悄悄换组件。
4. 完成组件时核对直接测试、跨版本外观/交互和不同浏览器行为；未验收的功能必须标明 **未完成**，不能因为 README 已引用本规范就当作已修复。
