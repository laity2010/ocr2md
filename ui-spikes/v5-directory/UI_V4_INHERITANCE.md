# OCR2MD V5 界面继承 V4（2026-10-17）

原则：**V5 只换可插拔业务模块，不换用户熟悉的工作台布局/样式。**

V5 host 直接继承 V4 正式源的 `ui-spikes/v4-directory/assets/v4.css`（原字节复制后仅将 host ID 从 v4 映射至 v5），V4 页面本身的三层头部结构和通用配色/高度规则明确放在 `assets/v5-host.css`。Shell 只负责组织组件，不重新实现 AG Grid、CodeMirror、Dockview、TriPane 或 ResidentHost。

界面层次：

1. 顶部首行：OCR2MD 版本按钮（弹窗内列组件版本）和 **WCP 统一状态栏**。独立模块状态条不得重复。
2. 第二行：`设置`（已迁入 UI 模块）等真实已迁入模块 tab；最右撤销、重做、保存标定三个**全局**按钮，实际按钮使用模块 manifest 的原 ID 和状态，不建立镜像操作。
3. 第三行：当前模块专有按钮区。目前 Settings 仅剩「恢复默认」及禁用的「发布」，不伪造未迁入的工作目录导航与章节功能。
4. 下方完整页面高度：WCP 挂载区。Settings 本体使用 V4 原版通用设置组件，V4 的 AG 表、CodeMirror 源码、预览、TriPane/Dockview 与暗色主题一并继承。

WP2 Filesystem 仍是 `kind=service` 后台模块，不占顶栏 tab；目录界面将在 WP3 Workspace 按同一布局复刻，不得复刻一个空壳冒充迁移成功。

自动化验收：`tests/wp2-browser.mjs` 同时运行 Chromium/WebKit，检查三个顶栏层次顺序、背景色 token、三窗、全局操作组、正常占满页高、无 JS 错误；`npm run test:lan` 默认从内网 HTTPS 验身份、状态与设置保存，`npm run test:remote` 仅远程复验；后续 WP3 继续沿用相同测试矩阵及实体 iPad Safari 截图。
