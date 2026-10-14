# V4.5.0 · 模块自动注册、驻留统一、通信边界（2026-10-13）

## 功能规范

操作：在 `plugins/<new>/` 新建带独立 `plugin.json`/`index.js` 的插件；运行常规构建。需要：WCP 0.1.7 + CQE v1、TriPane 0.2.1、ResidentHost 1.0.0。效果：不修改应用入口、其他插件或 WCP 内核，新插件自动加入注册表；UI 标签、首页、后台预热、可见操作组由插件声明驱动。未准备好真实业务的模块使用 `enabled:false`，不提前出现在用户工作台。

跨插件数据仅通过带版本、schema、许可收发方的 WCP CQE Command/Query/Event。`filesystem` 是唯一读 Vault 的业务服务，工作目录 UI 不自行 fetch。设置/工作目录由 WCP 共享 ResidentHost 做长期 DOM 驻留，切换前后同一 AG/CodeMirror，目录不再加载。

## UIC 验收表

| 初始 | 操作 | 预期 UI / 行为 | 数据副作用 | 不变量 | 自动化 |
|---|---|---|---|---|---|
| 插件只有 workspace/settings/filesystem 启用 | 打开 V4.5.0 | 动态标签「工作目录」「设置」；首页工作目录，设置预热前禁用 | 无 | app.js 没有具体业务模块 import/ID | Chromium/WebKit |
| 当前目录已进入子目录且选中文件 | 切换设置再回来 | AG、源码、子目录与选中项保持，LIST/STATUS 请求不增加 | 无 | 同一 DOM、同一 AG | keepalive 两引擎 |
| 设置已预热 | 操作 AG、拖 WCP 2 条 sash、撤销/重做/保存 | 三窗一致，状态不重建 | 浏览器 UI 设置值 | Vault 写入 0 | settings migration 两引擎 |
| 在测试副本启用 `media`，不编辑其他文件 | 重新生成 registry，打开测试界面 | 自动出现「媒体」标签；输入 Markdown 返回图片、HTML 表格、块级公式 3 种项 | 仅扫描用户输入，无 Vault | 原 app.js 与其他插件字节哈希不变 | media autodiscovery 两引擎 |
| 媒体源码试图直接导入 workspace/filesystem 业务 | 运行边界检查 | 构建前失败，阻断跨插件直接依赖 | 无 | 不放宽合同 | test runner 反例 |
| 媒体继续 disabled | 打开实际内网版 | 没有尚未验收的「媒体」标签 | 无 | 不虚报图片下载模块已迁入 | Browser |
| 实体 iPad Safari | 使用内网 v4.5.0 | 基础交互可用 | 无 | 自动 WebKit 不替代真实设备验收 | manual-external 待反馈 |

## 版本 / 安全 / 发布

仅内网候选 `192.168.1.10:4292/v4-directory/`，公网正式和 v3 不变。WCP 内核业务数据零知识；媒体模块仍只读隔离验证，不触及实际图片下载或文件写入。
