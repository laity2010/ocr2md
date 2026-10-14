# v3 设置接入 v2 通用配置组件（2026-10-08）

## 需求与实现

v3 首页仍仅有 **工作目录 / 设置** 两个主标签；`设置` 标签不再维护自制的多组 HTML 配置表单，而是**直接实例化 v2 现有的 `TableConfigurationGrid`**。

- 共享配置 AG Grid 组件：`ui-spikes/v2/src/tableConfigurationGrid.ts` → `new TableConfigurationGrid(host, onActivate, onBooleanChanged)`。
- 为共享组件增加一个兼容扩展 `setRows(rows)`，接收通用 `TableConfigurationRow[]`，保留原有 v2 `setConfig()`、`rowCount()`、bool callback、5 列（控件/功能组/键名/值/中文描述）不变。改动既有 v2 表格主题代码时，将原主题参数无差异提到 `v2/src/calibrationTheme.ts`，原 `calibrationGrid.ts` 继续 re-export，解除旧业务文件的隐式依赖。
- v3 特有 `v3DirectoryConfigRows(settings)` adapter 只负责将 10 项目录设置转成共享组件的数据行，**不实现另一套网格或筛选器**。
- 右侧 JSON 复用 CodeMirror 技术并通过可共享的 `v2/src/jsonSettingsEditor.ts` 提供通用源码编辑功能。左侧点击行直接定位对应 JSON key，布尔项可在 v2 配置网格内改选并更新 JSON 源码；其它值从 JSON 里修改。
- JSON 是唯一草稿来源：只有 **保存配置** 完成 schema 校验后才写浏览器 localStorage 并让目录视图立即生效；错误 JSON 不写入，不影响已保存设置。**恢复默认** 恢复源码和持久配置。授权密钥不放进 JSON。

## 配置边界

本航点共享的是 **UI/配置编辑组件**，不把 v3 的目录专属配置混入 v2 章节审计配置文件：v2 项目级配置仍由原 `/__workspace/table-presentation` 负责；v3 目录显示/交互配置依旧使用原有 `ocr2md-v3-directory-settings-v1` localStorage 键，两者拥有不同字段和不同持久化范围，故不存在误写/覆盖。Mac Vault Root 真实文件接口 `__v3/fs` 原样保留。

可调项保持：字号、密度、显示列、目录排序、刷新、文件操作区显示与点击读取。服务器安全控制（`.obsidian` 隐藏、禁止覆写/整树删除）仍不可配置。

## 验收

- v2 原有 `TableConfigurationGrid.setConfig` 对外签名保留，v2 TypeScript typecheck 通过，原网格主题参数未改变。
- v3 真实临时磁盘 + 浏览器 E2E：共享 v2 配置 AG Grid 至少 10 行、CodeMirror 编辑器存在、共享 Boolean checkbox 改变 JSON 后保存、JSON 非布尔配置保存、非法 JSON 不覆盖配置、恢复默认；原工作目录 CRUD 与上级导航也通过。
- 公网 iPad / iPhone 浏览器模拟继续核对共享配置表布局、真实 Mac Obsidian Root 和验证笔记读回（不是物理 iPad Safari 验收）。

只部署 `ui-spikes/v2/v3-directory/` 下的静态 HTML/JS/SW，未重启常驻 Mac 文件服务、未修改 Tunnel/DNS/Agent Link、未改已有 Obsidian 文档。
