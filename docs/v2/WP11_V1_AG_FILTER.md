# WP11 · V1 AG Grid 原生列头过滤复用与发布门禁

## 目标与不变边界

V2 继续保留原 Frame 四窗、V1 PDF/Markdown 预览和 CM6；两张物理 SQLite 表、工作目录 F02 授权、PBS/Type/MD Block 列序及 SQL 组数据操作弹窗全部不变。**仅修复 AG 表头过滤器**：替换 WP10 的自制 Type 单选表头，不新增并行组件，不回滚任何用户 MD Block 或 PBS 编辑。

## V1 原版来源与装配

- V1 源码：`labs/lab-ocr/ui/enum-checkbox-filter.js` 的 `EnumCheckboxFilter`（AG Grid Community `IFilterComp`）；原始 CSS：`labs/lab-ocr/ui/ag-enum-filter-shared.css`。V2 已有同名 `ui/` 文件，两对文件各自 SHA256 一致，直接**引用现成字节一致的原版源码**，不重新制作组件，不修改 V1 工作树。
- V2 仅在 `ui/v2-mineru-entry.js` 导入 `EnumCheckboxFilter` 和 `ag-enum-filter-shared.css`，所有逻辑表及基础表的列定义复用原 AG 接线：`filter:EnumCheckboxFilter`、`filterValueGetter`、`suppressHeaderMenuButton:true`、`suppressHeaderFilterButton:false`；`sortable` 和 `pinned` 独立配置，不因为禁止排序而禁止过滤。
- Type 列不再含 `TypeHeader`、自制 `<select>`、单值 `typeFilter` 状态或重构行数组的过滤行为，**由 AG 官方过滤图标打开其管理的弹出面板**，实现 `all`、复选多值、恢复筛选模型、动态行模型刷新。
- PBS 左固定，内容由 `p/b/s` 动态显示，最适列宽、不可排序；Type 最适列宽、不可排序、可按列值复选；MD Block 第三列，余列保留横向滚动。默认逻辑 `p` 页/全体逻辑块 checkbox 继续是 V2 原有的独立**视图范围**，不能误作新的 AG Type 过滤器。各过滤只能改变 AG 可见行，不写 SQL、CM6 文本或 PDF 原始坐标。
- 在 V2 的隔离 Vite 构建适配器只新增只读的 `getFilterModel/getDisplayedRows` AG 公共测试端口以读取 AG 自身当前行模型；没有修改 `ui/frame/` 源文件或创建第二个 Grid。

## 通过标准

1. 根目录 `main/scripts/verify_cross_version_components.py --target lab-ocr-v2 --browser`：审计实际源码，V1 真组件 + V2 真 AG 表头浏览器测试必须在 Chromium 与 iPad-WebKit 全过；不允许为过关删除测试或仅使用 DOM 伪装。
2. V2 `tests/v2-mineru-base.browser.test.mjs`：原有两表、导航组弹窗、PBS 左固定、Type 不可排序、MD Block、CM6/AG/预览和 SQL 保存原测试继续通过；Type 使用 AG 原生过滤图标和 all/复选多值，等待 AG `getDisplayedRows()` 过滤完成后核对数据，而非误计 AG 退出动画的临时 DOM。
3. V2 `tests/v2-real-markdown-preview.browser.test.mjs`：真实 MinerU 267 行、V1 PDF 标签、HTML/公式与四窗互动保持不变；Frame 独立测试与 Python SQL 数据测试不退化。
4. Git 主分支和 V2 分支的 `AGENTS.md` 仍共用实际 inode，且 V2 构建完成后统一 Lab 发布清单的 SHA 与公网完全一致；本航点不变更 V1 或 Main 源码。
