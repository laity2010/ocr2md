# OCR2MD V4 Workspace M0 · Feature Contract / UIC

## 目标和实际功能

- 独立 WCP 模块 `ocr2md:workspace` 管理 AG Grid + CodeMirror 只读目录页面、手势导航和选中项；`ocr2md:filesystem` 是权威只读 Mac Vault service；它们不 import 彼此实现，仅通过版本化 WCP CQE 协议互通。
- 只读取 `/ocr2md` 及后代；沿用 v3 **无 UI** 的 `V3DirectoryController` 而不载入 v3 app.ts / 原页面状态。
- 未授权时展示本模块的登录表单；只使用 sessionStorage 的 `ocr2md-v4-workspace-access-key`。不读取、不覆盖 v3 旧 key、V3 DIRjson、已发布章节或用户配置。
- 用户选择已有书籍文件夹，点击「设为工作目录」；文件服务需验证该目录直接包含至少一份 PDF。成功后记录当前会话的选择并经 `workspace.selected@1` 发布事件，**尚不自动导航到尚未接入的章节模块**。

## UI Interaction Contract

| 初态 | 用户动作 | 期望效果 | 数据副作用 | 不变量 | 自动化 |
|---|---|---|---|---|---|
| v4 设置标签 | 点击「工作目录」 | 通过 WCP 公开 `selectModule` 进入独立目录 UI | 仅组件切换 | 不穿透 WCP ShadowRoot；不改 v3 | Chromium+WebKit |
| 未授权 | 输入 Vault 访问密钥，点「连接」 | Mac FS 授权后加载 `/ocr2md` AG；失败显示原因 | v4 **session** 令牌 | 不写原文件；令牌不存 localStorage | fixture + 浏览器 |
| 目录已载入 | 单击 AG 行 | CodeMirror 显示只读文件元数据/最多16KiB源码 | 无 | 文件引用必须匹配 `nodeId/revision` | fixture + 浏览器 |
| 目录已载入 | 鼠标双击或触屏快速两次点击目录**名称** | 进入子目录，原目录行失效 | 无 | 导航 epoch 不能被预览回调取消 | mouse/touch 浏览器 |
| 书籍文件夹 | 点击「设为工作目录」 | 校验直接 PDF，再返回选择状态 | 内存中当前书籍路径和事件 | 无 PDF 拒绝；不写 Vault；WCP 不识别业务路径 | fixture + 浏览器 |
| 已进入工作目录 | 点击「设置」 | 返回共用设置组件 | 卸载工作目录 UI | 文件服务状态独立；Vault 不写 | Chromium+WebKit |
| v4 设置 | 查看 AG 启用勾选 | 顺序：组件模块/功能组/启用/参数名 | 仅本实例列布局 | 不调整其他 Shared Settings 用户 | Chromium+WebKit |

## 访问与安全

- Mac Vault 后端使用现有同源 `GET /__v3/fs?op=...`，`workspace-fs.ts` **不实现任何文件提交**。
- 对文件内容限制为16KiB首段，WCP CQE 对整个消息限制128KiB；大目录的当页行数最多160并展示截断告警（完整分页仍待后续增强）。
- 模块的 `setup/mount/unmount` 仅持有自己的数据与实例；WCP Core 只新增无业务含义的 `selectModule(id)` 公共方法，原生 `plugin-menu` 与 app 顶栏共用该能力。
- 自动化：`node ui-spikes/v4-directory/tests/workspaceBrowser.mjs` 使用仿真 Vault GET；Chromium/WebKit 触屏与双击路径，所有 POST 拒绝并计数。`node ui-spikes/v4-directory/tests/settingsBrowser.mjs` 验证原有设置不回归。
- 物理 iPad Safari 与真实授权仍标记 `manual-external` / **待用户审核**，不能由 Mac WebKit 结果代替。

## UIC regression · iPad screen height (v4.1.2)

- Initial: Safari physical iPad in landscape, V4 setting tab open. The screenshots of v4.1.1 showed settings AG/source around 320-440 CSS px high with more than half the page left empty.
- Action: open V4 page, switch settings ↔ workspace; rotate portrait/landscape.
- Expected: `#panel-modules` fills the available viewport from below `h1` / `.v3-top-row` to within 16px of the visual viewport bottom; WCP and child panels inherit 100% height. No large blank lower region. Heading/status only shows one visible activity message. All original buttons/fields remain usable.
- Side effects: CSS and HTML build marker only; no Vault or settings writes.
- Invariants: use V4-scoped selectors, leave V3 layout and shared settings component CSS untouched. Browser automation uses `getBoundingClientRect()` (no screenshot pixel matching), at multiple iPad viewport sizes; actual Safari remains manual-external.

## UIC · 从 V3 显式授权复用（v4.1.3）

- 未授权的 V4 工作目录显示「沿用 v3 授权」按钮；点击才启动读取本浏览器同源存储。
- WCP `workspace.reuse-v3@1` 的 payload **为空**；唯一能读取 `ocr2md-v3-mac-vault-key` 的是 `ocr2md:filesystem`，它先通过 Mac Vault 只读 status 验证凭据，成功才保存在 V4 专用 sessionStorage，不改变 V3 记录。
- V3 勾选「记住设备」时，V4 可从同一 Safari 浏览器的 localStorage 复用；V3 未勾选时，sessionStorage 仅同一标签页可用——须在已经连接 V3 的**同一个标签页**切换到 V4 后再点复用。
- 无旧密钥/密钥失效时不得假装成功，返回提示；不会写真实 Vault 或公开密钥。
- `tests/workspaceBrowser.mjs` 的 Chromium 临时会话、WebKit 永久记录两种 fixture 验收：无凭据拒绝 → 本地种入 v3 测试 token → 点击复用 → V4 session key 写入、V3 key 不变 → 正常目录导航和 PDF 工作目录选择 → 0 Vault 写操作。
- 真实 iPad Safari 的跨标签存储仍需人工验收；本航点不得自作声称已经在用户设备获得授权。
