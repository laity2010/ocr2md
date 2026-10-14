# OCR2MD V4.4.0 · 设置模块 TriPane 真实迁移（2026-10-13）

## Feature Contract

设置与工作目录必须**共用 WCP TriPane 的分隔条内核**。工作目录为 AG+只读源码 2 窗；设置为 AG、源码、值预览 3 窗，保留原来左 AG／右上源码／右下预览的位置，但移除 Shared Settings 自绘的两条 `las-divider`、`las-preview-divider` 交互。布局与保存由同一 TriPane 0.2.1 管理；设置的 AG Grid、CodeMirror、值预览、撤销/重做/保存、schema 与 draft **仍由 Shared Settings 0.1.17 业务模块持有**。

WCP 0.2.1 给 3 窗 compact 新增可选 `compactLayout:'right-stack'`；旧 compact 默认 `'stack'` 不变。设置业务适配器传入 `slots:{ag,source,preview}`，按 DOM 槽位移动已有内容，不重新生成 AG/CodeMirror，不修改 WCP core、Shared Settings stable、V3，亦不扩充 Vault 文件权限。Shared Settings 的原生布局 CSS 仅在 V4 设置实例 `data-wcp-layout=tripane` 时覆盖，以防影响其他使用者。

**生命周期约束：** Shared Settings 上游 `disconnectedCallback()` 会销毁 AG Grid，因此原设置 Custom Element 必须继续连接到 document；继续使用 v4.3 已测试的离屏预热／前台 overlay，不重复初始化业务实例。`prewarm()` 仅在 AG、共享源码及 TriPane 都成功挂载后才解锁设置 tab。两个模式分别存储 layout key，保留旧用户 WCP 三窗布局，设置用独立 `ocr2md-v4-settings-tri-v2`。

## UI Interaction Contract

| 初始状态 | 用户动作 | 预期 UI | 数据副作用 | 必须保持 | 自动化 |
|---|---|---|---|---|---|
| 首次启动 | 打开 v4 首页 | 工作目录可操作，设置 tag 禁用 | 无 | Mac Vault 无默认放权 | Chromium/WebKit |
| 设置仍在后台 | 等待资源加载 | AG、源码、值预览和布局全部 ready 后，设置 tag 可用 | 内存初始化 | 不阻塞工作目录导航 | 浏览器延迟 shared manifest |
| 设置已就绪 | 点击设置 | 一套 WCP TriPane：AG 左、源码右上、预览右下；原内建分隔条隐藏 | 只改布局 | 原 AG 实例、CodeMirror、预览节点保留 | 双浏览器布局检验 |
| TriPane 可见 | 拖动竖向分隔条 | AG 与源码列实际改变宽度 | session 布局偏好 | 源码内容不变，DOM 不重建 | Chromium/WebKit 横/竖屏；断言几何变化 |
| TriPane 可见 | 拖动横向分隔条 | 源码、预览实际改变高度 | session 布局偏好 | AG/源码/预览不丢内容 | 同上 |
| AG 已载入 | 勾选启用状态 | 共享源码实时更新，撤销／重做可用 | 草稿，仅手动保存后写 UI 配置 localStorage | 文件系统写入始终 0 | 浏览器交互、撤销/重做/保存 |
| 设置有草稿/已保存 | 切换工作目录再回来 | 设置节点、AG API、已保存状态不重建，工作目录仍可用 | 无文件写入 | 对话框/路径/权限无变化 | 双浏览器 fixture Vault |

## 真机与发布门禁

WCP `tests/settingsTriPaneMigration.mjs` 使用真实内网候选网页 `192.168.1.10:4292/v4-directory/` 与只读 fixture Vault 测试（绝不读真实用户凭证和文件）。使用 `SETTINGS_TRIPANE_PORTRAIT=1` 补测 768×1032 竖屏。旧工作目录测试：`tests/workspaceHomePrewarm.mjs`；WCP 架构验收 `npm run verify`。只通过自动化的 WebKit 不等于实体 iPad Safari 触控真机验收；用户使用时发现问题再补具体真实设备证据。

## 2026-10-13 实际执行结果

- LAN 页面：OCR2MD `v4.4.0-settings-tripane-20261013`，独立 `WCP TriPane 0.2.1` 资产 SHA256 校验一致。
- `node tests/settingsTriPaneMigration.mjs`、`SETTINGS_TRIPANE_PORTRAIT=1 node tests/settingsTriPaneMigration.mjs`：Chromium/WebKit × 横屏 1032×720、竖屏 768×1032 共 4/4 **PASS**。AG／源码／预览确实均在 TriPane 下；布局为左 AG／右上源码／右下预览，旧两条分隔条 display:none。竖分隔条尺寸变化至少 55px、横分隔条 45px；AG 修改驱动源码、Undo/Redo/Save 通过；设置预热、在工作目录／设置间来回切换均保持原 AG，错误 0，Vault 写入 0。
- `node tests/workspaceHomePrewarm.mjs`：Chromium/WebKit 2/2 **PASS**，工作目录 M2 双窗、共享只读源码、设置后台解锁不回归。
- WCP `npm run verify`：architecture 4/4、CQE 5/5、TypeScript、Vite **PASS**。
- WCP `node tests/tripaneBrowser.mjs && node tests/tripaneShadowBrowser.mjs`：旧三窗接口、Full/Compact、独立状态、ShadowRoot 的 Chromium/WebKit 横竖屏组合 **PASS**。

最终状态：**内网自动验收通过，物理 iPad Safari 尚未执行手指触控验收**；可在正常使用时发现问题再反馈。所有文件/设置保存测试只在全新隔离 Playwright 浏览器中进行，真实 Vault 文档无写入。
