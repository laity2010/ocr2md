# 工作目录 · 独立化 WP0（候选，未启用）

本目录是从冻结的 OCR2MD V4 `plugins/workspace/` 提取的自包含 WCP 插件。它只负责 **目录导航/选择与只读文本预览**，不持有 DIRjson、Markdown 或章节数据，不提供文件写入能力。借用原 V4 已验收的 AG Grid、CodeMirror 源码查看器和 WCP TriPane，不另外制造一套表格或编辑器。

## 唯一所有权与交互边界

- `workspace.js`：工作目录页面的 DOM、AG、源码窗、工具条、选择及生命周期；DOM 都在 WCP 传入的 `host` 之下。**不能使用 V4 专有 mount/toolbar 锚点。**
- `workspace-grid.js` + `ag-grid-base.min.css`：来自 V4 的 AG Grid 已构建组件和样式，只作为 workspace 自己的内部视图。`vendor/shared-source` 是 WCP 公共只读源码组件；`components/tripane.js` 是公共布局组件。
- `directory-service.js`：内部 `ocr2md:directory` 服务，仅 `GET /__v3/fs` 的状态、目录列表、只读文本预览及瞬时目录选择；不得使用 `/__v3/ir`、章节写入或通用 FS mutation。选择只改变内存状态并发布 `workspace.selected`。
- `directory-contracts.js`：唯一对外 WCP CQE v1 契约。UI 不直接 `fetch`、访问其他插件或改动全局状态。
- `index.js`：统一导出 `modules=[directoryModule,workspaceModule]` 和对应 `contracts`，无业务注册逻辑分散到别处。

本候选 `plugin.json` 的 `enabled=false`；现网 V5 registry 仍只有 Settings。旧 `plugins/filesystem` 混合 DIRjson/章节文件服务继续禁用，不合并进本目录，也不删除历史证据。加入实际 V5 之前必须另开 AEL 任务、明确后端 Vault 实机授权与真实 iPad UX，并让工作目录作为完整 UI 插件参与注册；不得直接改 WCP、Settings、MOPJO 或章节源码。

## WP0 验收（不触及真实 Vault）

```sh
node plugins/workspace/tests/ownership-gate.mjs
node plugins/workspace/tests/independent-lifecycle.mjs
node scripts/check-plugin-boundaries.mjs
node scripts/verify-v4-freeze.mjs
```

生命周期浏览器测试实际加载同一 `vendor/wcp/components/v1/loader.js` 的 WCP 0.1.8、真实 AG Grid 与源码窗，并由局域隔离服务器模拟只读 `/__v3/fs`。依次验收禁用、安装、授权、AG列表、源码预览、PDF目录选择、WCP tab切换、卸载、重装；Chromium 与 WebKit 均须通过。测试从不连接真实 Vault、不写文件或 MOPJO。AEL 的 module owner 是 `workspace`，所有交付代码应位于 `plugins/workspace/`。

**下一轮（不属于 WP0）：** 正式 V5 真实服务接入，需要独立 AEL/浏览器验收；WP0 通过不代表真实 iPad 或 Vault 授权已经完成。
