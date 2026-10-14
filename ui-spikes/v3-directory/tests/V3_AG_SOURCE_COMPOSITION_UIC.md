# FC-V3-AG-SOURCE-001 / UIC-V3-AG-SOURCE-001

**共同组件**：`AgSourcePair` + `agSourcePair.css`，复用 V2 的 AG Grid、WorkingEditor / JsonSettingsEditor，不为每个场景重复渲染一套源码和表格控件。

**使用场景**：`directory`（工作目录，AG 目录导航＋只读源码，无预览）、`boundary`（章节定界、AG 标题审阅和可编辑 DIRjson 源码）、`cleaning`（章节清洗、只读 AG 和可编辑 MD 源码）、`settings`（AG 配置索引＋可编辑 JSON 源码，无预览）。同一 `workbench-layout` 在 boundary ↔ cleaning 切换场景，不销毁当前 CodeMirror 节点或光标。

**功能共性**：统一 CSS 主题、复用 V2 WorkspaceSplitter 的可拖动分窗（工作目录、章节工作台、设置分别保存比例）、iOS 原生光标、AG→源码与源码→AG 的双向选择、滚动定位和高亮协议，换行标记与颜色配置。`AgSourcePair.bindSelection` 与 `selectFromGrid` 提供统一可选绑定（`setLinkEnabled` 可禁用单场景联动，但能力必须存在）；禁止每个模块重新实现一套选择事件。`AgSourcePair.activateGridRow` 明确区分 `inspect`（不抢源码焦点）与 `source`（设置行点击后进入 JSON 编辑器），由业务模块决定具体行锚点；源码只读/可编辑、写盘 CAS、Undo/Redo、PDF 定位权限仍由业务模块负责，绝不作为外观参数暴露。

**外观差异**：设置中的 `agSourceScenes` 按四个 scene 暴露 `gridFontSize / sourceFontSize / sourceLineHeight / hardReturns / hardReturnColor`，使用 `null` 继承全局 V3 同类属性，既保持统一默认又允许个别场景独立。先存草稿，保存配置才应用。无效覆写阻止保存；旧设置自动继承且不会丢失既有值。

**UIC**：工作目录选中文件仅更新只读源码；章节定界点击 AG 标题定位但不抢 iOS 光标，源码仍可增删改；章节清洗点击 AG 标题仅定位，用户必须在源码里动手编辑；设置 AG 行点击高亮 AG 行并定位高亮 JSON 键；源码点击/移动光标到任意顶层配置键或其跨行嵌套值时，AG 自动滚动至并高亮该行；布尔 checkbox 不抢 iOS 焦点，仍能在两侧维持高亮。切换场景不让未保存变动自行丢失、不修改原 PDF 和 OCR JSON；高亮/光标可视样式一致。

**自动化**：`tests/settingsSmoke.cjs` 对场景配置做迁移、校验和覆写安全测试；`tests/chapterPublishBrowser.cjs` 验证三个真实组合 DOM、四场景样式继承与独立覆写、目录只读、章节源码可编辑、↵ 标记和切换；`tests/irWorkbenchBrowser.cjs`、`tests/chapterHierarchyBrowser.cjs` 回归 IR/标题；Chromium + WebKit。iPad Safari 原生触控光标仍待用户审核。


**2026-10-11 所有权更新：** `settings` 场景不再在 OCR2MD 实例化本地 `TableConfigurationGrid` / `JsonSettingsEditor` / `AgSourcePair`。其功能转由 Agent Link Shared Settings v0.1.10 与 Shared Source v0.2.3 提供（同一共享 AG↔源码契约）。本地 `AgSourcePair` 保留给工作目录和章节工作台，不再复制设置模块。具体验收见 `V3_CENTRAL_SHARED_SETTINGS_UIC.md`。
