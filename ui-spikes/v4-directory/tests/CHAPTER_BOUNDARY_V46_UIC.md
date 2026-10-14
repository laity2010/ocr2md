# OCR2MD v4.6.0 — 「章节定界」独立插件移植契约与 UIC（2026-10-13）

## 功能契约（操作 / 需要 / 效果）

- **设置工作目录**：在一级「工作目录」Tab 进入含 PDF 的具体书籍文件夹并点「设为工作目录」。需要已通过 Mac Obsidian Vault 授权。文件服务验证工作目录下有 PDF 后发布 WCP CQE `workspace.selected`，章节定界插件接收，不从另一个 UI 模块 import 逻辑；Shell 根据插件清单 `activateOn` 自动切换到一级「章节定界」Tab。未选择工作目录时手动点击 Tab 应显示引导，不自动读取其他文件夹。
- **查看定界**：以 v3 原有 `IrWorkbenchPanel` 为**实际业务控制器**（并非重新实现算法），保留：DIRjson 已保存版本优先读取，否则枚举书籍下 MinerU OCR JSON 生成；AG 标题候选、默认「只看一级标题」、独立成章列与文件名、全书连续 CodeMirror 源码、文档块证据与编号，三窗（AG/源码/PDF 或 MD 预览）以及 PDF.js Range Viewer。布局由 WCP TriPane，驻留由 WCP ResidentHost，v3 主题值与 Markdown 预览 CSS 限定在本插件范围。
- **修改定界**：标题判定、独立成章勾选、文件名和起始编号、源码联动、行号人工补录/删除标题、撤销重做、编辑正文、拆/并/移动，延用 v3 的 DIRjson 事务逻辑。取消「独立成章」只修改章节文件边界，不改 `#` 层级。切换 Tab 不卸载旧 AG/源码实例。
- **保存标定**：必须显式点击顶部「保存标定」并接受确认，先经 CQE 分段送授权文件服务，再由 Mac 原 `__v3/ir/commit` 进行版本检查和不可变持久化，提交后重新读取 DIRjson 并校验 SHA-256。不得写原 PDF/OCR，也不允许在初始化、勾选或切换 Tab 时偷偷写库。冲突或失败时保留浏览器草稿；仅保存在浏览器内并非保存成功。
- **发布章节**：要求定界准备完毕、当前 DIRjson 已成功保存并且无未保存修改；点击顶部「发布章节」并接受警示确认后，通过 CQE 调用 Mac 已有 `__v3/ir/publish-chapters`，从已保存 DIRjson 投影为 Obsidian 兼容章节 MD。Mac 事务负责覆盖前旧 chapters 备份，仍需读回 IR 指纹验证；禁止未保存草稿越过门禁。用户真实 Vault 写入只由主动点击引发。
- **浏览器兼容**：HTTP 局域网 Safari 不一定支持 `crypto.randomUUID()`，插件仅在缺少时使用 `crypto.getRandomValues()` 按 UUID v4 的版本位生成随机 requestId；无安全随机数源时禁止提交。

## 迁移边界与原版引用

- 单独插件 `plugins/chapter-boundary/`：`plugin.json`、`index.js`、`boundary.js`、`transport.js`、`template.js`、`contracts.js`、`legacy.ts` 打包产物及局部 CSS/PDF worker。
- `legacy.ts` 精确复用 `v3-directory/src/irWorkbenchPanel.ts`、`pdfPreview.ts`、`settings.ts` 以及原有 `src/v3HttpWorkspaceFs.ts`，不改 V3 实现。为了重用其老式 `document.getElementById`，由模块在保持连接 DOM 的 ResidentHost 内构建兼容控件，而不把 ID 或业务逻辑扩散至 WCP / 其他业务 UI 模块。
- 文件权限扩展集中在现有 `plugins/filesystem` 独立权威服务，CQE `boundary.*` 消息契约由本插件声明，`workspace.selected` 事件收件方和 `workspace.current` query 请求方追加章节定界。公共 app 只按 `activateOn` 的**泛型**导航约定切换，不硬编码章节业务。
- 已登记静态隔离白名单：此插件仅可显式引用上述 V3 legacy controller/FS，**不是跨模块随意直接引用的许可**。
- 默认内网开发：`http://192.168.1.10:4292/v4-directory/`。公网正式版 / V3 不动。外网 iPad 验收才发布独立公网候选。

## UIC

| 初始 | 用户动作 | 预期 UI | 数据副作用 | 不变量 | 验收 |
|---|---|---|---|---|---|
| 工作目录含 PDF，已授权 | 点「设为工作目录」 | 顶栏自动进入「章节定界」，三窗显示真实 PDF/OCR | 只读 | 工作台不重新定义章节逻辑，不能加载别的书 | Chromium/WebKit 真 Mac FS fixture |
| 未选目录 | 直接点「章节定界」 | 显示先设置工作目录，不伪造数据 | 无 | 不写 Vault | 浏览器烟测 |
| 首次 OCR JSON | 自动加载 | 生成完整 DIRjson 草稿、AG H1 默认筛选、全书源码 | 初始化仅内存 | 不拆成猜测的分章文件 | Chromium/WebKit |
| 已保存 DIRjson | 重开同一书籍 | 优先恢复经确认的快照 | 只读 | 不重新 OCR 初始化、校验工作区/PDF 来源 | 双引擎独立复查 |
| OCR H1/H2 候选 | 取消 H1 过滤；勾/取消 H2 独立成章 | AG 列/文件名同步 | 本地 DIRjson 草稿 | MD 标题层级不随文件边界变化 | 双引擎 |
| PDF 原文已加载 | 查看 PDF、页码及缩放；选择 AG 行 | PDF.js Canvas 按页绘制，并依证据定位 | Range 只读 | 不提前下载整份 PDF，不捏造 bbox | 双引擎真实 PDF |
| 源码行号已显示 | 点行号→补录标题→填页码/确认；或删除人工标题 | AG/源码及时联动，菜单浮层正确 | DIRjson 草稿 | 原 OCR、PDF 不改；撤销/重做有效 | 双引擎 |
| 有未保存的定界编辑 | 点顶部「保存标定」→确认 | 确认保存并显示 SHA 读回状态 | 唯一有权 Mac `IR commit` | 保存前修改无 Vault 写入，版本冲突不覆盖 | 双引擎 disposable Vault |
| 保存成功且章节可发布 | 点「发布章节」→确认 | 显示章节数与路径 | Mac 分章发布事务；旧版本备份 | 不绕过 DIRjson CAS、原 PDF/OCR 不变 | 双引擎 disposable Vault |
| 正在编辑 | 切换设置并返回 | AG/源码仍是原驻留实例 | 无 | 不自动写入或丢失焦点 | 双引擎 |
| iPad Safari 实体设备 | 点击/拖分隔条、行号、PDF 定位 | 需要人工触摸验收 | 根据用户确认 | 尚不能宣称实体触摸通过 | manual-external |

## 自动测试

执行位置：WCP 仓库 `node tests/chapterBoundaryMigration.mjs`；使用按次创建并清理的 Mac Vault 临时目录，包含真实 PDF、MinerU JSON、原服务上的真实 `IR commit` 与 `publish`，分别由 Chromium 和 WebKit 验收。已有 v4 保护测试：`node tests/workspaceKeepAlive.mjs`、`node tests/settingsTriPaneMigration.mjs`，业务隔离：OCR2MD 仓库 `node ui-spikes/v4-directory/scripts/check-plugin-boundaries.mjs`。

测试通过仅代表浏览器自动验收；实体 iPad Safari 的触摸与用户对旧版外观的人工审阅仍待完成。

### 本轮实机自动化最终验收附记

- Chrome 与 WebKit 对临时 Mac Vault 执行实际 `IR commit`→DIRjson SHA 读回→`publish-chapters`→重新打开已保存 DIRjson，均成功生成 2 个章节 MD；测试根目录按次创建/清理，与真实书库隔离。人工补录、删除、撤销重做、独立成章与起始来源不写入均通过。
- PDF.js 原文 Canvas 已渲染（Chromium 644×834，WebKit 361×468 测试页）、V3 行号样式 `rgb(39,47,52)`、激活绿色 `rgb(131,192,146)`、暗色源码背景 `rgb(29,39,50)`、独立勾选框 22px 均按旧主题检查。PDF.js 官方加载图标 `images/loading-icon.gif` 补齐，静态资产均为 HTTP 200。
- 发现并修复 WebKit 重型章节 PDF/AG 加载时，设置后台 TriPane 启动先于动态 CSS 属性 flush，导致宿主偶尔仍被识别为 `position:static`。设置模块在调用通用 TriPane 之前给 `.las-shell` 显式声明 `position:relative!important`，无需修改 WCP 内核。修复后 WebKit 章节→设置→章节返回及原 CodeMirror 实例连接通过。
- `node tests/settingsTriPaneMigration.mjs` 修复后 Chromium/WebKit 均 PASS，包含横纵分隔条拖动、AG 编辑、源码联动、撤销重做、设置保存、Vault 0 写入；`node tests/workspaceKeepAlive.mjs` Chromium/WebKit 保活双 PASS。WCP `npm run verify` 架构隔离 4/4、CQE 5/5、TS/Vite PASS。OCR2MD 插件边界自测 4/4，当前代码静态边界扫描 PASS。
- **UI 人工审核状态：待用户在实体 iPad Safari 对比旧版样式和手势**。本项目迭代的自动回归是预检，不自动替用户确认视觉、触摸体验已通过。
