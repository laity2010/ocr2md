# FC-V3-CENTRAL-SETTINGS-001 / UIC-V3-CENTRAL-SETTINGS-001

**权威组件**：`agent-link-monitor` / 网络设施项目 `/shared-settings/v1/settings-panel.js`，通过统一 ESM URL 直接加载，由共享组件自己的更新监测校验 Manifest，不阻塞首次渲染。AG 表、CodeMirror 共享源码、Schema、选择联动、高亮、分隔条均由网络设施负责；OCR2MD 不得复制/Fork 第二套设置面板。源码底层采用 `/shared-source/v1/source-surface.js`（独立共享 CodeMirror）。

**场景初始化：** 设置 Tag 是首列；页面默认仍可处于工作目录。切入设置后，左 AG＋右上源码＋右下参数预览（无 MD/PDF 预览）；设置组件版本 `0.1.13`，源组件 `0.2.4`。AG↔源码点击、光标和嵌套数组/对象双向高亮定位可用；拖动中缝不影响编辑、iOS 光标或存储。统一全局保存、恢复默认控制位于顶部 Tag 栏；`chrome="external"` 不重复显示内部操作按钮。

**业务存储兼容：** OCR2MD 使用 `loadDirectorySettings` 读取旧存储键 `ocr2md-v3-directory-settings-v1`；把 `DirectorySettings` + V2 兼容的中文说明投影为共享 Schema。`storage="none"` + `commit-mode="explicit"` 保证共享 AG 或源码改动只生成草稿；点击顶部“保存配置”后，共享组件先校验 JSON/枚举/对象/数组，OCR2MD 再用 `parseDirectorySettings` 严格验证嵌套字段，才写回旧存储键并实时应用。网络设施不持有 Mac Vault 密钥或对书籍的写权限。

**独立功能区（2026-10-11 更新，最高优先级）：** 设置组件的 AG 表和 CodeMirror 只负责可以映射成 Schema 设置项的值。不能纳入设置 Schema 的授权、连接、设备配对、诊断等业务功能，在页面里采用**独立兄弟区域**，不能强行放入 AG 表列、共享设置组件 footer 或 CodeMirror 内容。Mac Vault `settings-connection-details` 位于 `#panel-settings` 下，**与 `#v3-shared-config-layout` 平级**，默认收起为一行“Mac Obsidian 库 · 连接与授权”，访问拒绝时自动展开，用户可随时展开进行授权、记住设备、忘记授权或配对。展开只缩减可用纵向高度，不破坏 AG/源码内部结构；授权数据仍不写入设置 JSON。组件本身保留 `data-laity-footer` 兼容机制，但 OCR2MD 不使用它承载独立业务。

**例外/回退：** 共享源码模块不可用时，组件自动使用可编辑 textarea，功能不应变成只读；如果网络设施整体不可用，则其他 Tag 与文件工作台应继续运行，状态栏显示共享设置加载失败，不能伪称已应用更改。

**验证：** `tests/settingsLinkBrowser.cjs` (Chromium/WebKit) 验收 Tab 首列、公共组件版本、双向高亮、草稿保存、无效配置拒绝及恢复默认；`tests/chapterPublishBrowser.cjs` 验收工作台切换、章节编辑、场景样式；`tests/macVaultHttpSmoke.cjs` 验收授权面板缺失密钥自动展开、授权/文件写入/设置安全；`settingsLinkBrowser.cjs` 断言授权区是共享布局外的兄弟节点，打开时不侵占 AG 或源码窗。设备 iPad Safari 滑动、光标需真机审核。状态：待用户审核。


**v0.1.10 通用参数预览（2026-10-11）：** 右侧源码窗下方始终提供独立的 `参数预览` 子窗；它属于共享设置组件，独立 Mac Vault 授权区仍是设置页的兄弟区，严禁混入。左侧 AG 取消说明列、各行固定 40px 高、不因长注释或复杂配置值拉高。用户通过 AG/源码选择参数后，预览窗列出 Schema 的名称、键、描述，颜色参数提供当前色块及三个推荐色槽位，点击推荐色更新共享草稿；布尔参数提供开启/关闭二选一（aria-pressed 显示当前值）。只读设置禁用操作，严格枚举不允许候选越界；其他参数显示值和说明。源码自动生成 Schema 注释 `// 标签 — 描述`（只在现代模式启用）；支持带注释 JSON 解析，严格业务校验保持不变，保存和回传继续只存纯 JSON，不泄漏注释。UGC 未完成源码不覆盖上次有效草稿。回归为 `tests/settingsPreviewBrowser.cjs` Chromium/WebKit + `tests/settingsLinkBrowser.cjs` + Mac Vault/章节/PDF 既有测试；iPad 真机待审核。


**v0.1.11 语法与加载性能（2026-10-11）：** 源码组件的 `syntax="jsonc"` 在 CodeMirror 内对 key/string/number/boolean/null/comment/operator/bracket 赋予独立色与稳定 DOM 标记。仅编辑文档时重新词法标记，移动光标不重新解析，不引入语言解析器依赖。共享设置 AG Grid 由 `AllCommunityModule` 改成实际需要的子模块；OCR2MD 首次打开设置不再串行等 manifest 后才 import 公共 ESM，改由组件自己的版本监测负责提示新版本。设置启动、切换其他 tag、旧配置持久化、Mac Vault 授权与浏览器安全保持不变。验收应覆盖代码颜色类别、注释与字符串 escape 处理、原有场景/保存回归、模块体积与加载瀑布。iPad 真机仍需人工审核。


**v0.1.13 更纱等宽中文默认字体（2026-10-11）：** Shared Settings 通过公共 font stylesheet 定义 `--laity-ui-font`，统一为 Sarasa Fixed SC，包括 AG 表、CodeMirror、参数预览、按钮与输入框；引入方 OCR2MD V3 的全局控件、AG/源码也采用同一变量。Mac 安装了 Sarasa 则优先 `local()`，iPad/iPhone 用 SIL OFL Web Font（GB2312+界面常用字子集，约 1MB），冷加载不阻塞页面；部分稀有字符由等宽字体回退。**不改变用户显式设置的阅读正文字体选项。** 断言 FontFaceSet 加载、AG/CodeMirror/预览/宿主一致、跨域可用、Safari/WebKit，以及旧保存/授权回归。状态：待用户 iPad 真机审核。


**浏览器字体专项验收：** `npm run test:settings:font` 在 Chromium、WebKit 中模拟无本机字体，实际下载共享 WOFF2 并等待 `document.fonts.load()`；逐一核验宿主 body/Tag 按钮、目录 AG、设置 AG、参数预览、CodeMirror ShadowRoot、Mac Vault 输入框共享 `Laity Sarasa Fixed SC`，字体目录是网络设施唯一权威。不复制原 TTF 到 OCR2MD，也不改用户主动选择的阅读正文排版。

**字体加载优化：** OCR2MD 不再在 `<head>` 使用同步的远程字体 CSS `<link>` 阻塞首屏。共享设置组件挂载后异步注入中央 Sarasa CSS；UI 首先以声明的本机 Sarasa/等宽回退字体显示，字体加载后统一到共享字体。浏览器实测 CSS/CORS 字体请求可用，设置首屏不以 font stylesheet / manifest 为门禁；冷机 font-display:swap 允许短时字体替换。


**v0.1.13 源码自由滚动修复（2026-10-11，待用户审核）：** 初始：设置页源码显示约 400–500px，但 JSONC 源码长达 2,000px；旧版 `.cm-scroller` 同样被内容撑大、`scrollTop` 无法随滚轮变化，外层内容被裁切。操作：在右侧源码窗滚轮向下/向上，滚至任意参数后点 AG 参数再滚动；可切换 390px 窄屏。效果：CodeMirror 内部 `.cm-scroller` 高度始终匹配 `.las-code-host`，且 `scrollHeight > clientHeight`；滚轮确实移动源码 scrollTop，其他 AG 和参数预览的 scrollTop 不变；显式 AG 定位才可改变源码位置，之后仍可任意滚动。数据副作用：零存储写入、零源码修改；Syntax highlight/JSONC/参数预览/保存逻辑保持。底层共享 Source v0.2.5 引入 `scroll-container=true`，统一设置组件 v0.1.13 启用，不影响其他 Source 的 auto-height 场景。自动化：`node tests/settingsSourceScrollBrowser.cjs` Chromium/WebKit，回归 AG→源码选择与 preview；iPad 真机 `manual-external`。


## v3-directory-first-settings-idle-20261011at · 工作目录优先 / 设置后台完整加载门禁

- **初始状态**：HTML 直接展示 `工作目录`（`#tab-workspace aria-selected=true`）；顶部标签顺序保持 `设置 / 工作目录 / 工作台` 不变。`设置` 标签 `disabled`、`aria-disabled=true`、`data-settings-state=pending`，无法通过点击或脚本切换。Mac Vault 授权入口仍位于独立设置辅助面板，不进入统一 AG/源码组件。
- **用户动作 / 系统操作**：工作目录的初次初始化（成功或因无授权显示连接提示）已结束并至少两帧提交到浏览器后，才调度 `requestIdleCallback`（不支持时使用短时异步 fallback）。空闲任务开始设置模块 ESM 动态导入、AG 初始化、CodeMirror 源码初始化、参数预览构建、版本化 Sarasa 网页字体就绪；不可预先请求 Settings ESM 与工作目录争用网络和主线程。
- **预期界面**：加载期间用户可持续操作工作目录，`设置` 仍 disabled，不出现空白半初始化设置页。AG `data-ready=true` **且** CodeMirror `data-source-ready=true`、预览已存在、字体加载就绪/降级完成时，`设置` 标签变为可用（`data-settings-state=ready`）；不主动切换至设置。用户此时点击可正常显示 AG↔源码定位与参数预览。字体出错使用等宽中文 fallback，不因字体单独不可用锁死设置。
- **失败路径**：Shared Source 模块加载失败时保持设置标签 disabled 且 `data-settings-state=error`，title 给刷新提示；不可将半成品称作加载成功。工作目录始终独立可用。加载没有本地文件/Obsidian 写入。
- **测试**：`npm run test:settings:startup`；Chromium/WebKit 人为延迟 Settings ESM、Source、WOFF2，检查工作目录先显示、设置按钮门禁状态，模拟未安装 Sarasa 与已加载本地字体情形；另故意对 CodeMirror 返回 HTTP 503，证明设置不可进入但目录可用。真实 iPad Safari 空闲调度/触屏待用户审核。原有 UIC (`test:settings:preview`, `test:settings:scroll`, `test:settings:font`) 与章节/Vault 回归不得退化。


**工作目录首页默认根目录（2026-10-11）**：OCR2MD V3 的主标签仍优先 `工作目录`；文件目录从第一帧的显示路径与实际首次 list 均直接设为 `Obsidian/ocr2md/ocr2md`（逻辑 `/ocr2md`）。上级导航不会越过该目录；不迁移 Mac Vault 的物理根，不改变书籍内部 `/ocr2md/...` 文件路径，不自动选择工作台书籍。独立 UIC：`tests/V3_DIRECTORY_DEFAULT_ROOT_UIC.md`，浏览器检测命令 `npm run test:directory:home`。设置 Tag 的空闲加载门禁照旧。


**2026-10-11 · 章节定界工具栏精简**：相关业务契约见 `tests/V3_EDIT_HEADER_UIC.md` / `FC-V3-CHAPTER-TOOLBAR-MINIMAL-001`；以 AG 标题栏内的 H1 checkbox 取代原独立过滤条；旧其他模块/章节标定/顺序编号/目录编辑控件在章节定界模式隐藏。多份 OCR JSON 首次初始化仍弹出明确标注的来源选择；顶栏书籍／章节文件导航保留，业务必需。专项浏览器命令 `npm run test:chapters:clean-ui`；真实 iPad 待用户审核。


**v0.1.14 · Sarasa 配置默认值与设置 Undo/Redo（2026-10-11）**：上次统一的是 CSS 真实字体，漏掉了配置的 `mdFontFamily:monospace` 旧标签。现在配置默认 `sarasa`，读取旧 V3 `monospace` 时规范化为 `sarasa`，显式使用 `system` 者保持；**不在迁移时自动写回旧浏览器配置**，保存才采用新值。统一设置组件提供同源 Undo/Redo，OCR2MD 顶部两个真实按钮接入 `laity-settings-history` 事件并按历史状态禁用/启用；AG、源码、预览和恢复默认都可撤销，临时无效源码也可恢复；包含 ⌘Z/⌘⇧Z，恢复默认先成为草稿再按保存写入。更详细的底层契约见网络设施 `docs/SHARED_APP_SETTINGS.md` v0.1.14，自动化 `npm run test:settings:history` Chromium+WebKit，iPad 真机待用户审核。原先存量设置保留，严禁自动写入。


**2026-10-11 · 章节定界起始序号**：只在章节 AG 顶栏新增一个“起始序号”输入框，复用原来的 V2 文件顺序编号（输入 Enter/失焦提交草稿），不恢复被清理的旧编号按钮；只改独立章节的文件名，不改原 OCR 和章节层级。Undo/Redo 与保存发布继续由 DIRjson 控制。契约和测试见 `tests/V3_EDIT_HEADER_UIC.md` / `FC-V3-CHAPTER-START-SEQUENCE-001` 与 `npm run test:chapters:clean-ui`。


**2026-10-11 · 顶部五模块后台状态**：顶部独立摘要含设置、工作目录、工作台、DIRjson、PDF；完整业务/UIC 在 `tests/V3_MODULE_ACTIVITY_UIC.md`，`npm run test:status:modules` Chromium/WebKit。共享设置初始化中的源码自动预览文字不能被误报为真实待保存修改；共享设置自身历史事件负责判别。每模块持续跨 Tag 更新，内部旧状态节点保留但不重复显示。真实 iPad 横向滚动待审核。


**2026-10-11 · 后台完成即退出摘要栏**：顶部五模块状态的 `ready`/`idle` 项不再展示，`busy`、`dirty`、`error` 项保留；无人进行后台工作时整个摘要带收起。完整 UIC 和回归见 `tests/V3_MODULE_ACTIVITY_UIC.md` / `npm run test:status:modules`。保留真实模块状态与错误，不添加轮询或延迟隐藏。

**2026-10-11 · 章节清洗 MD 预览全元素继承 V2**：复用 V2 `BasicMarkdownPreview` 渲染器，改为构建时提取 V2 原 CSS 的完整 Markdown 文档元素样式，不再手工维护 V3 复制版；V3 仅保留 Sarasa / 字号行距与布局适配。修正 V3 全局 H1–H3 / P 造成的标题和段落间距覆盖。契约和自动测试见 `tests/V3_CLEAN_MD_PREVIEW_V2_STYLE_UIC.md`、`npm run test:clean:preview-v2`，实际 iPad Safari 需用户审核。


**2026-10-11 · MinerU fenced HTML table**：真实 Buffett MD 第 85 行 ` ```html ` 造成表格在预览中被渲染为代码块；现在 V3 章节清洗预览限定转换独立、经 DOMPurify 白名单过滤的 `<table>`，保留行号、来源链接、安全规则及源文件原样。完整 Feature/UIC 与测试见 `tests/V3_CLEAN_FENCED_HTML_TABLE_UIC.md`。

**2026-10-11 · MinerU math/LaTeX 围栏**：V3 章节清洗专门识别 ` ```math`/`latex`/`tex`，渲染 KaTeX 并在预览内横向滚动；有错误的数学源码不自动修复，显示“公式解析失败，请核对 PDF”。实际 Buffett 章节 12 个数学围栏完整渲染，独立 `UIC` 见 `tests/V3_CLEAN_FENCED_MATH_KATEX_UIC.md`；不修改 V2 渲染器或 MD/IR。
