# OCR2MD V4 M1 · WCP 通用三窗接入功能规范 / UIC (2026-10-13)

## 范围与目标

M0 真机已验收的工作目录保持已有导航/授权/只读预览行为；M1 使用 **WCP TriPane v0.1.0**，将当前 `AG Grid + CodeMirror + 只读预览` 装进三个通用 DOM slots。TriPane 只管布局，不知道 Vault / CQE / 文件内容。完整版 `full` 为 Dockview 可停靠视图，精简版 `compact` 为 Gridview；工作目录默认精简版，未来章节工作台可选择完整版。**M1 预览为已选文件元数据/文本，并不是 PDF.js 页渲染。**

## 行为契约

| 初态 | 操作 | 需要 | 效果 | 数据副作用 | 不变量 | 自动化 |
|---|---|---|---|---|---|---|
| 未授权内网候选 | 打开工作目录 | 先验证 Mac Vault token | 显示授权框与三个窗格 | 无 | 不能将代理来源当本机免密 | Chromium/WebKit + 真实 Safari 待验收 |
| 已授权且目录已载入 | 单击 AG 文件 | 按 CQE 只读查询预览 | CodeMirror 和预览同步所选项 | 无文件写入 | 不向 WCP 内核发送凭据或文件数据 | Chromium/WebKit |
| 三窗 Compact | 点击 `Full 模式` | 同一批业务 HTMLElement | Dockview Full，按钮变 `Compact 模式` | 只改会话布局信息 | AG、CodeMirror 不重建 | Chromium/WebKit |
| 三窗 Full | 点击 `Compact 模式` | 保留内容、业务选中项 | Gridview Compact，按钮变 `Full 模式` | 只改会话布局信息 | 组件 slot ID 为 `ag/source/preview` | Chromium/WebKit |
| 已调整分隔条 | 离开工作目录后再进入 | 独立 sessionStorage 布局键 | 布局恢复，页面其余组件不串值 | 仅布局持久化 | 工作目录 API 和其它组件配置不变 | Chromium/WebKit |
| 目录选中 PDF 书籍 | 点击设为工作目录 | 必须直接存在 PDF | 仅公布 `workspace.selected` 和 PDF 数量 | 会话选择，无文件写入 | 章节模块未接入时不创建假工作台 | Chromium/WebKit + 真机待验收 |

## 组件版本与构建边界

- WCP 唯一源码：`web-component-platform/src/component/tripane/index.ts`，MIT Dockview/Gridview 8.5.1；无新的第三方依赖。
- WCP 独立发布包：`published/components/tripane/v1/releases/0.1.0/`，`manifest.json` 提供逐文件 SHA-256；OCR2MD `scripts/build-modules.mjs` 仅复制受校验发布产物到 `components/`，绝不重新编译 Dockview。业务 `workspace.js` 直接 `import ../components/tripane.js`，不依赖 stage 字符串打补丁。
- 共享 WCP core、V3 源码、Mac Vault、章节文件均不修改。V4 只读权限与 M0 完全相同。

## 自动化、人工验收

- `node tests/tripaneWorkspaceBrowser.mjs`（WCP 项目）验证真实 V4 工作目录代码加仿真 Vault，无写入；`node tests/tripaneBrowser.mjs` 验证两业务 fixture 组件隔离与 resize；`node ui-spikes/v4-directory/tests/workspaceBrowser.mjs` 检查 M0 回归。
- iPad Safari 需逐项确认 Full／Compact 布局拖动和复位、预览联动、键盘/触控。**M0 已验收不能自动作为 M1 真机验收证据**。
- 真实 PDF.js 预览及章节清洗工作台不在此里程碑；必须单独定义 FS Range／文档页面对齐契约再接入。

### M1 三窗专项回归补充（2026-10-13）

WCP `tests/tripaneM1Acceptance.mjs` 在 LAN v4.2.0 页面上针对 Chromium/WebKit × 横/竖屏共四组，分别验证模式切换、分隔条真实几何尺寸变化（65px）、文件选中后 CodeMirror／预览联动及切换状态保持；全部自动通过，Vault 写入 0 次。使用只读仿真文件数据，非真实用户 Vault，不应称为物理 iPad 手指实测。
