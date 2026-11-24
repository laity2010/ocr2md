# OCR2MD · 公共组件与 UI 契约（COMM.md）

> **宪法第二层 · 公共组件 / UI 契约。** 本文件与 `AGENTS.md` 同级，依据第 10 条成为宪法组成部分；由 Main Git 维护，对 Main、Frame、所有现有 Lab 和未来 V3/V4 统一有效，不能凌驾最高宪法或规定 V2 专有 SQL / PBS Schema。读前须先读 `AGENTS.md`、`BUILD.md`，随后读本文件和**当前 Lab 自身 README**。仅用户明确授权可修改强制组件要求，技术核对与门禁变化保留 Git 证据。历史 `CROSS_VERSION_COMPONENTS.md` 仅为指向本文件的兼容别名，不是另一份契约。

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

## 4. 自动执行的跨版本验收门禁（程序证据，而非仅文字要求）

- **工程布局与规范继承**：执行 `python3 .ops/verify-unified-layout.py`。本入口委托 Main Git 中 `main/scripts/verify_unified_layout.py`，不再硬编码当前六／七个 Lab 名称或硬链接数；自动检查所有活动 Lab 的共用 `AGENTS.md`、本版本 `README.md`、根目录的跨版本规范和动态发布清单。新建 V3 时自动纳入，未发布的 V3 不会因不在 release manifest 误报。专用夹具测试：`python3 main/tests/test_verify_unified_layout.py`，含 V3 添加／宪法硬链接断开／缺 README／清单篡改。
- **V1 表头过滤原组件的直接行为**：执行 `node main/tests/cross_version_enum_filter.browser.test.mjs`，在 Chromium 与 iPad-WebKit 用 V1 真实 `EnumCheckboxFilter` 执行 all、勾选／取消、多值组合、模型恢复、临时空表后保留选择；再执行 V1 原 `labs/lab-ocr/tests/enum-checkbox-filter-transient-empty.test.mjs` 等已有回归。
- **针对每个使用 AG Type 列的 Lab 的自动放行**：执行 `python3 main/scripts/verify_cross_version_components.py --target <lab-id> --browser`。程序先检查 V1 源码及接线证据、目标 UI 是否用 `filter: EnumCheckboxFilter` 与 AG 原生过滤图标、是否仍存在自制 Type 单选；然后运行 V1 浏览器行为测试及目标 Lab 的 `tests/cross-version-ag-filter.browser.test.mjs`（该测试必须在目标 AG 真实界面上点击原生过滤图标、验证 all/多值复选）。若尚未实现 AG Type，则报告 `NOT_IMPLEMENTED`，不把空白框架伪称为通过 Type 过滤验收；若已实现但缺目标浏览器测试或采用自制过滤器，**非零退出并阻止发布**。检查器自己的误判测试：`python3 main/tests/test_verify_cross_version_components.py`。
- **V2 当前状态（WP22）**：WP11 已用 V1 `EnumCheckboxFilter` 替换违规的自制 `TypeHeader` 单选；此后 V2 正式发布器持续通过真实 Chromium/iPad-WebKit 组件门禁，并在 WP22（`6275730`）发布核对。历史 WP10 的单选问题只保留在 Git 历史和对应 WP 说明中，不得冒称现状仍应失败。以后创建 V3 必须在其发布器加入相同强制入口，无 Type 的空白框架只能报告 `NOT_IMPLEMENTED`。

> 这些检查是第一阶段的 AG 过滤器门禁；导航、设置、PDF、CM6 的更细交互尚未全部自动化，**不能宣称“所有跨版本组件测试已完成”**。静态源码检查不是唯一证据，所以还必须运行真实的浏览器过滤交互。
