# WP2/10 · v3 独立目录管理（2026-10-08）

## 更新说明（2026-10-08）

本文前半部分记录 WP2 **最初的 Fixture 内存验收**；用户指出正式目标是 iPad 实际存储，所以这套内存验收已不再构成存储通过条件。现在已将公网演示切换到浏览器 IndexedDB 实际持久化（含离线缓存），见 `WP2-LOCAL-STORAGE-GATE.md`。但真实 Obsidian Vault 的 iCloud 目录挂载仍未实现。以下历史 Fixture 验收日志保留作架构溯源，不可冒充当前生产状态。

## 范围

本航点先实现隔离的目录控制器、Memory Fixture Storage Adapter 和独立 Web UI 验收页；**不切换 v2 正式目录页面，也不改动 Python 服务、Mac/iCloud/GD 文件、PDF、章节存储或既有 WIP**。后续 WP3 才构建真实 Mac Local Storage，WP4 才逐渐对接业务。

新增文件：
- `src/v3FixtureWorkspaceFs.ts`：完全内存的 `WorkspaceFSV3` 适配器 / 多工作区 Registry。
- `src/v3DirectoryController.ts`：只依赖 WP1 的 `WorkspaceMountRegistry` 和 `WorkspaceFSV3`。
- `src/v3DirectoryController.test.ts`：隔离目录服务合同 / 冲突测试。
- `ui-spikes/v3-directory/`：独立 UI，不依赖旧 `app.ts` / `dev_server.py`，可独立编译并静态服务。

## 模块边界

```
v3-directory UI (DOM, no File System access)
       |
V3DirectoryController (dir state, page, changes, selected mount)
       |
WorkspaceMountRegistry -> WorkspaceFSV3 (WP1)
       |
FixtureWorkspaceFS (this WP) / Mac Local (WP3) / iPad (WP6-8)
```

- Controller 不导入 GD、iCloud、Unison、ChapterRepository、PDF、翻译模块。
- 任意页面刷新、目录选择不触发浏览器 `window.location.reload()`。
- 工作区切换必须先通过业务侧 dirty/saving/inFlight 检查，再打开新挂载并加载根目录；失败保留原工作区；新工作区就绪后才释放旧句柄。
- 目录更改以稳定 `nodeId` 识别目标，以 `revision` 为 CAS 前置条件。rename/move 保持 ID，copy 分配新 ID。
- 目录删除默认非递归；强制递归需要显式输入 `DELETE <绝对逻辑目录>`。即使 UI 授权，Adapter 仍强制 `expectedRevision + expectedTreeRevision`。
- `generation` 随修改变化；游标版本过期触发 ESTALE；前端可刷新当前目录。
- Fixture 模拟多工作区、外部并发写入、idempotent requestId、原子批次校验和本地事件推送，但内存数据不是可持久化文件。
- `FixtureWorkspaceFS.getCapabilities()` 明确 `durableLocal:false`、`fileCoordination:false`，防止把内存测试假装成 Mac/iPad 实际存储验收。

## 独立 UI 验收

```sh
npm --prefix ui-spikes/v3-directory run build
cd ui-spikes/v3-directory && python3 -m http.server 4290 --bind 127.0.0.1
# 浏览 http://127.0.0.1:4290/
```

演示页建立两个**模拟 Obsidian Vault Root**（`vault-primary`、`vault-secondary`）。默认打开 `vault-primary:/`，初始根目录包含 `ocr2md/` 清洗区以及 `阅读/`、`学习/` 两个成品分类示例；`ocr2md/` 下有 `示例书A/` 和 `示例书B/`。Obsidian 的 `.obsidian/` 配置由其管理，不在模拟目录中展示。两个 Vault 只用于检验 Root 切换，不访问真实文件。切换时勾选「模拟未保存修改」必须被阻止。**演示仅用于隔离验证，刷新页面会重置。**

不会访问磁盘真实文档、iCloud、GD，也不产生真实同步行为。不能将 Demo 的保存成功视作生产持久化成功。

## 最小验收清单（WP2）

1. 选择 Vault Root（而不是书籍工作区），首次进入 `/` 可见 `ocr2md/` 及根级分类目录，切换两个模拟 Vault 保留各自 Fixture 数据；旧页面无全页刷新。
2. browse、create-folder、create-file、rename、copy-file、move、delete、recursive delete，目标不存在及目录非空拒绝。
3. stale revision / stale nodeId 冲突、相同 requestId 幂等、同 requestId 不同请求冲突。
4. 多操作事务在任何一步失败时不产生半成品。
5. 目录分页游标失效、外部变更通知与刷新、不同 Workspace 隔离。
6. dirty/saving/operation 阻止切换，新工作区 open 失败则原工作区与用户修改保留。
7. 现有根测试链、v2 类型检查与生产 4176 服务保持正常。

## 尚未解决、不能偷换为已完成的事项

- 真正本地 APFS 的安全根目录/符号链接/大小写处理、文件协调、外部修改监听、持久化 CAS 和崩溃恢复：WP3。
- v2 现有 `/__workspace/directories`、`/__workspace/project-directory` 仍由旧 Python 服务实现。**WP2 组件独立运行，不等于生产 UI 已切换到 v3**；切换必须通过 WP3/WP4 与业务完整回归。
- AG Grid、PDF 大型文件的本地性能和 iPad Safari：后续 WP4–WP8。
- 目录组件与 v2 主 UI 的 Feature Contract/UIC 正式上线合同：接入生产 UI 时补充并完整执行对应测试。

## WP2 隔离实测记录（2026-10-08）

- 核心合同测试：`node out/v3DirectoryController.test.js` → **51 scenarios passed**。涵盖 CRUD、复制移动保持/生成身份、递归确认、stale revision、跨工作区保护、原子批次失败回滚、幂等 requestId、外部变更通知、真实游标分页/失效、切换的 dirty/saving/inFlight/open failure 回退。
- 浏览器 UI：`npm --prefix ui-spikes/v3-directory run test:ui` 使用本机已安装 Chrome 成功，确认新建文件夹/文件、重命名、复制、移动、删除、切换时 dirty 提示以及页面无 reload。Playwright 自带 Chromium 不存在，脚本显式使用 Chrome channel；无 Chrome 的 CI/宿主需单独安装浏览器或另行配置可用 channel。
- 演示应用：`npm --prefix ui-spikes/v3-directory run build` 产出 `ui-spikes/v3-directory/dist/app.js`，只含前端测试数据，不读写生产路径。
- 生产边界审计：现有 4176 `/__workspace/directories?path=` HTTP 200；v2 的既有已修改文件列表没有增加；仅根 `package.json` 新注册 v3 测试、增加 v3 独立文件。尚未提交 GitHub。
- 性能说明：WP0 测得 Mac 本地目录 P50≈3.81ms、同机公网回环 P50≈1.689s。WP2 验证了无需 reload 的组件架构，但**不能**由 Fixture 测试推断 iPad 上公网/实际磁盘加速。生产端到端性能提升仍待真实 Adapter 和 iPad 实机验证。

## 2026-10-08 · iPad 实机人工验收入口

**公网入口：** https://ocr2md.laity.bid/v3-directory/

不更改网络拓扑；利用当前 4176 服务的静态文件根路径 （`ui-spikes/v2`），将独立演示的 `index.html`、`dist/app.js` 两个构建产物通过 `npm --prefix ui-spikes/v3-directory run publish:preview` 复制到 `ui-spikes/v2/v3-directory/`。这个目录仅为静态预览分发，不接入 v2 的 Python 业务路由、不访问真实文件、不需要重启 4176。刷新页面会重置 Fixture 数据。

**公网检查：** `/v3-directory/` 和 `/v3-directory/dist/app.js` 均 HTTP 200，静态 JS 两侧 SHA-256 相同；远端运行时全部逻辑由浏览器内存中的 Fixture WorkspaceFS 执行。

**触屏模拟回归（Mac Chrome，非 iPad Safari 设备验收）：**
- iPad 834x1194：**新版 Vault Root 公网触屏模拟通过**，浏览 Root、进入 `/ocr2md/`、创建 `ipad-wp2/check.md`、阻止脏稿切换及跨 Vault 切换正常，无 JS 错误、无横向溢出。
- iPhone 390x844：**新版 Vault Root 公网触屏模拟通过**，同上，无 JS 错误、无横向溢出。
- 两者均未调用任何 ocr2md 工作区写入 API，页面中无云盘凭据或真实文件 IO。Cloudflare 自带的 `/cdn-cgi/rum` 统计请求不属于应用文件写入。

**待用户在 iPad Safari 人工确认：**
1. 打开上述网址，确认初始 `vault-primary:/` 是 **Obsidian 库根目录**，包含 `ocr2md/`、`阅读/`、`学习/`；进入 `ocr2md/` 能看到两本待清洗的示例书籍。
2. 在 `vault-primary:/ocr2md/` 下新建 `ipad-wp2/`，进入并创建 `check.md`，返回父目录。
3. 选中工作目录 → 重命名；选择文件 → 复制/移动；进入根级 `阅读/` 查看示例成品文件。真正的“清洗完成导出”功能尚未接入。
4. 勾选“模拟未保存修改”，选择第二个 Obsidian 库切换，应被阻止；取消勾选应可切到 `vault-secondary:/`，然后切回 `vault-primary:/`，无需页面重新加载。
5. 再刷新 Safari，数据重置是预期行为。**不能**将其视为 iPad 本地持久化验收；那属于 WP6/8。

手动验收结论当前仍为「待用户审核」，Mac Chrome 触屏模拟通过不等于 iPad Safari 实机通过。


## Obsidian Vault Root 模型修订（2026-10-08）

Root = Obsidian 整个库。`/ocr2md/` 为工作区，每本书是其子目录；成品导出到 Root 之下的其他用户自定义分类目录，不允许无条件移动原始清洗工作稿。详细边界见 `docs/v3/ADR-0002-OBSIDIAN-VAULT-ROOT.md`。当前入口仍为纯内存 Fixture；真实文件夹挂载/导出并未实现。

新版 Vault Root 公网自动回归入口：`npm --prefix ui-spikes/v3-directory run test:touch-public`（Chrome 手机/平板触屏模拟）；正式 iPad Safari 仍为 `manual-external`，须用户实机审核。
