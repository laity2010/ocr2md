# OCR2MD v4.4.1 · 工作目录常驻与模块切换不重新加载（2026-10-13）

## 问题与职责

用户报告从设置切换回工作目录有明显的刷新感。根因是 WCP 标准 Runtime 每次切换会对 active module 调用 `unmount`，之前工作目录在 unmount 中 `tri.dispose()` 与 `grid.destroy()`，重进入时 `mount` 从 `HOME='/ocr2md'` 新建 AG / Source / 目录请求。这是模块重复挂载，不是浏览器导航刷新。

修复仅在 OCR2MD v4 的业务工作目录适配器：其 AG、只读 CodeMirror、当前路径、选中项与 TriPane 一起保持在始终连接 document 的 resident host；WCP 仍正常进行插件激活/停用，但模块自己的 `unmount` 只将工作目录转为 inert 离屏待命，再次 `mount` 只显示**原实例**。相同的稳定连接策略此前已用于设置模块，符合 WCP 业务模块自主保持状态、不改 WCP 内核的边界。

## UIC

| 初始 | 动作 | 预期 | 数据副作用 | 不变量 | 自动化 |
|---|---|---|---|---|---|
| 首页工作目录已授权，进入 Book A 并选中章节 | 点「设置」 | 工作目录暂停展示，不销毁 AG、Source 或布局；设置仍正常 | 无 | 不能重新授权或重建对象 | Playwright Chromium/WebKit |
| 设置显示 | 点击「工作目录」 | 原目录位置、选中源码、DOM 对象、AG 实例和 TriPane 直接恢复 | 无 | 目录 LIST 请求数、Vault STATUS 数均不增加 | Playwright Chromium/WebKit |
| 恢复工作目录 | 手动点「刷新目录」 | 当前 `Book A` 再读取一次 | `workspace.list` **恰好一次**，只读 | 不回退到根目录，不写入 Vault | Playwright Chromium/WebKit |
| 后台目录不可见 | 设置 AG 修改→Undo/Redo/Save，拖 TriPane 分隔条 | 设置仍有正确行为，Workdir 不盖住它 | UI 设置局部存储，Vault 文件 0 写入 | WCP 核心与共享设置模块不用修改 | 设置 M3 回归 |
| 内网真实 iPad | 切换「设置↔工作目录」 | 视觉上无需重建与等待、保留所选目录和源码 | 无 | 实体 Safari 手势未单独验收 | manual-external |

## 自动验收记录

- 缺陷复现（修复前）：`node tests/workspaceKeepAlive.mjs` 在 Chromium 报错 `return must preserve live workspace DOM, not remount`，确认根因。
- 修复后 Chromium / WebKit：工作目录同一 DOM 和同一 Source，子目录路径和文本保留，切回前后无新增状态查询或目录读取；手动刷新才读取当前目录恰好一次；0 Vault 文件写入，无页面脚本错误。
- 设置 TriPane 专项与 M2 首页预热回归：Chromium/WebKit 均通过。
- 仅内网 v4.4.1 候选更新；不修改 V3、WCP Runtime、公网 stable。
