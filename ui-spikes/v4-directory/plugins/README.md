# OCR2MD V4 插件契约（2026-10-13）

1. **模块代码在自己的 `plugins/<name>/` 下开发。** 每个目录拥有 `plugin.json`、`index.js`、业务脚本、样式及单独测试；不编辑其他插件、`app.js` 或 WCP 核心来接新功能。
2. 由 `node ui-spikes/v4-directory/scripts/build-modules.mjs` 扫 `plugin.json` 自动生成 `registry.generated.js`，应用入口只读取该注册表。Schema V1：`id`、`entry:index.js`、`kind:ui|service`、`tab`、`order`、`home`、`prewarm`、`actions`、`enabled`（缺省 true）。唯一 `home:true` UI 模块。
3. `index.js` 导出 `modules`（WCP AppModule 对象数组）和 `contracts`（CQE 消息契约数组）。模块的 `mount(host,bus)` 仅管理自己内容。独立服务模块在 `setup(bus)` 注册处理器，客户端按版本化 `command/query/event` 调用，**禁止引入其他插件实现**。
4. 共享窗口由 WCP 版本化组件提供：`TriPane` 布局、`ResidentHost` 常驻与切换；模块只提供自身内容槽及行为。**驻留实例不等于持久后端**，权威数据由服务模块持有。浏览器存储要使用模块专用键。
5. `scripts/check-plugin-boundaries.mjs` 检查所有插件源文件、跨插件导入、Shell 逆向依赖，以及工作目录 UI 越权 `fetch`；`plugins/workspace` 目前显式允许旧 v2 AG 基础工具，`filesystem` 显式允许旧 v3 DirectoryController，待后续迁移再收紧。此检查是源码结构门禁，**不是安全沙箱**。
6. `media` 是真实 CQE 只读扫描小样板（图片、HTML 表格、块级公式），`enabled:false` 不安装到用户正式工作台。测试通过临时启用副本证明新插件只改自己的目录并自动出现。尚未实现图片下载、真实 Vault 写入，不宣称业务迁移完成。
7. 内网开发 `192.168.1.10:4292/v4-directory/` 为默认，iPad 外网才发布公网候选；没有明确要求不能覆盖公网正式版或修改 v3。

核心命令：

```sh
node ui-spikes/v4-directory/scripts/build-modules.mjs
node ui-spikes/v4-directory/scripts/check-plugin-boundaries.mjs
node --test ui-spikes/v4-directory/tests/plugin-boundaries.test.mjs
```

浏览器：WCP 仓库 `node tests/workspaceKeepAlive.mjs`、`node tests/settingsTriPaneMigration.mjs` 和 `node tests/mediaAutodiscoveryBrowser.mjs`（媒体用临时同源目录，自动清理）。

8. `chapter-boundary` 是 V3 章节定界的独立复用适配插件。旧版 `IrWorkbenchPanel`、PDF View 和局部辅助源码已固化在插件目录，`legacy.ts` 仅负责本地重导出；纯 DIRjson 核心和开源 V2/PDF.js 组件通过显式允许名单复用，后续模块不得依赖章节定界内部实现。工作目录通过 `workspace.selected` CQE 传递书籍选择；`plugin.json.activateOn` 驱动通用导航。文件服务目录只读，另对章节定界开放专用 CAS 保存/备份发布命令，不提供通用写入授权。

## 章节定界（V4.6）

`plugins/chapter-boundary/` 是可独立导航的一级业务插件。`activateOn:"workspace.selected"` 通过通用 Shell 导航切换；目录与 DIRjson 只经 WCP CQE 访问授权文件服务。`legacy.ts` 兼容打包 v3 已验证的 `IrWorkbenchPanel`、PDF.js Viewer、v3 MacVaultHttpFS；局部样式限制在 `.v4-chapter-boundary` 范围，绝不向其他 WCP 插件注入 V3 全局 CSS。用户主动点击保存和发布才允许真实 Mac 事务写入。自动验收合同见 `../tests/CHAPTER_BOUNDARY_V46_UIC.md`。
