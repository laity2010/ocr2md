# OCR2MD V6 · 技术手册

OCR2MD V6 是运行于 Mac 的 Markdown 校阅工作台，当前业务模块为**章节定界**。使用 MinerU JSON 转换出的 `.minerujson.md` 作为可编辑母文档，结合原始 PDF 进行定位核对。公网入口：[https://ocr2md.laity.bid/](https://ocr2md.laity.bid/)。

跨版本工程原则以 [`AGENTS.md`](./AGENTS.md) 为准；本文件只描述 **V6 当前实现和操作方法**。功能演进、问题溯源见 Git Commit，不在 README 中追加开发流水账。

V6 独立起步，不继承 V5 及更早版本的旧组件、AEL 或工程备忘，也不以 V5 作为运行后备。旧实现仅供按需只读参考。

## 当前工作台

- **Dockview 三窗／四窗切换**：左侧 AG Grid 章节表、右上 CodeMirror 6（CM6）源码、右下共用预览窗。预览栏默认用下拉框切换 Markdown 阅读预览或 PDF.js 原文；勾选「拆分」后 PDF 成为右下独立 Dockview 窗格，与 Markdown 预览左右并排，可拖动分隔线调宽；取消勾选回到原共用窗。PDF.js 实例、缩放和 OCR 定位保持不变，切换无需重新创建 PDF Viewer。
- **CMD / CM6 单一编辑状态**：CMD（`CMDocument`）是围绕 CodeMirror 6 的轻量文档接口；CM6 EditorState 持有唯一可编辑的 Markdown 正文及 Undo/Redo 历史。CMD 的 `getMarkdown()` 直接返回唯一正文；已完成的一次性 `minerujson:end` 迁移不再给正式编辑器增加过渡输出模式。iOS/iPadOS 使用 Safari 原生光标与文本选区，Mac 保留既有 CM6 选区。AG 与 Markdown 预览从正文派生，Zustand Vanilla 只传递修订号及定位事件。正常保存不清空撤销历史。
- **CMD 统一 HTML 读写**：`CMDocument.readHtml()` / `writeHtml()` 在同一个 CM6 Markdown 文档中处理标准 HTML 元素、自定义 HTML 元素和 HTML 注释；`writeComment()` 只是调用通用写入接口的便捷方法，不构成第二种数据格式。章节模块负责章节标定的业务语义，当前以 HTML 注释写入，同时可识别既有自定义标签，不设注释／标签双写入管线。
- **源码引用缩进**：第二行工具栏最右侧的 `>+` / `>−` 按钮针对 CM6 光标行或选区覆盖的多行，各增加或移除一个前导 `>`；整组选区变化为一次撤销步骤，不重新定位源码滚动。`minerujson:block` 锚点允许带一层或多层引用前缀，AG、PDF 和章节导出仍按原 ID 定位；多行原始 JSON／PDF 证据注释不允许缩进以保护原文。
- **章节定界**：AG 按顺序显示标题（固定首列）、层级、PDF 页码、独立成章、章节文件；勾选通过 CM6 的 HTML 注释标定正文。修改标题和勾选实时更新大纲，保存后持久化。起始编号默认 `000`，保留用户输入的位数及前导零。
- **章节导出**：使用模块栏的「导出章节」，按当前勾选和编号生成母文档旁的 `chapters/*.md` 与 `manifest.json`。更改编号只重算显示，不自动写文件；章节文件与当前母文档匹配时可在 AG 中打开。
- **滚动与定位**：CM6 ↔ Markdown 阅读预览可按文本元素同步滚动；**PDF 不跟随 Markdown 连续滚动**。明确点击 AG、Markdown 内容或 CM6 源码时，PDF 才跳到相应 OCR 区域并显示可见高亮。直接滚动 PDF 不反向牵动其他窗格；预览下拉切换不改变 PDF 当前阅读位置。
- **PDF 阅读**：官方 PDF.js Viewer、深色显示、连续页面、缩放与页码跳转。高亮根据 MinerU `page_size` / `bbox` 定位的是 **OCR 文本区域**，不是 PDF 逐字字形匹配；PDF 只读。
- **MinerU 无损审阅注释**：原始 JSON 的 `discarded_blocks`（页眉、页脚、页码、侧栏、页脚注释等）、与正文不同的 `preproc_blocks` 及版面元数据，按 PDF 页附于 Markdown 的 HTML 注释中，包含 OCR 文字、坐标和完整结构；正文不混入未审阅的附属内容。原始 JSON 仍压缩保留、可逆还原。对现有已编辑母文档采取仅插入注释的迁移，保留原有章节标定。
- **工程菜单**：点击顶栏版本标牌可以选择「初始化数据文档」。经编辑授权和确认后，先备份已保存的母文档，再恢复原始转换样本并重载工作台（撤销历史重新开始）；未保存的编辑不在备份中。此前导出的 `chapters/` 不会被此操作删除。

当前界面使用 Everforest 深色风格和完整 Sarasa Fixed SC 字体；Mac Chrome/WebKit 支持模拟 iPad 横屏检查，最终触控体验仍以真实 iPad Safari 验收为准。

## 结构与数据

| 位置 | 职责 |
| --- | --- |
| `ui/main.js`、`ui/workspace.js` | 应用入口、操作编排、Dockview 三窗／四窗预览拆分与恢复 |
| `ui/cm-document.js`、`ui/chapter-markers.js` | CM6 文档封装及章节 HTML 标定 |
| `ui/outline-index.js`、`ui/outline-grid.js`、`ui/chapter-files.js` | 章节索引、AG 表、文件归属及导出内容 |
| `ui/markdown-preview.js`、`ui/pdf-preview.js` | Markdown 只读投影、PDF.js 原文及 OCR 区域高亮 |
| `ui/scroll-sync.js`、`ui/view-store.js` | CM6/Markdown 连续滚动及跨视图点击定位事件 |
| `packages/minerujson-md/` | MinerU JSON ↔ Markdown 转换；格式限制见[组件说明](./packages/minerujson-md/README.md) |
| `scripts/v6_serve.py`、`scripts/v6_chapters.py`、`scripts/v6_initialize.py` | 正式静态服务、授权文件接口、章节发布与工程初始化 |
| `scripts/v6_git.py`、`scripts/v6_publish.py`、`tests/` | Git 构建/回退、唯一发布目录及隔离测试 |

默认运行数据在 Git 忽略的 `.v6/` 中：

- `.v6/workspace/buffetts-alpha.minerujson.md`：可保存的工作母文档；首次不存在时从仓库中**只读** Buffett’s Alpha 转换样本加载。
- `.v6/workspace/buffetts-alpha.original.pdf`：原始 PDF 的经哈希校验的**只读工作区副本**，供 macOS 后台服务读取；不是同步编辑中的 PDF。
- 母文档所在目录的 `chapters/`：导出章节及 manifest；`.initialize-backups/`：工程初始化之前已保存母文档的备份。
- `.v6/release/`：唯一正式静态发布目录；`.v6/private/`：本机编辑授权资料，不能提交 Git。

`V6_DOCUMENT_PATH`、`V6_PDF_PATH` 可将服务指向**独立测试母文档/PDF**。正式服务默认读取上述工作区文件；浏览器通过 `/api/document`、`/api/pdf`（支持 HTTP Range）、`/api/pdf-map` 和 `/api/chapters` 获取当前数据，保存、导出、初始化需通过编辑授权及同源校验。

## 开发、测试、发布

本机需 Node.js/npm、Python 3；浏览器测试需 Mac 上的 Chrome 与已安装的 Playwright WebKit。

```bash
npm ci
npm run dev                         # Vite 本机开发，http://127.0.0.1:5196/
# 有意义的正式构建必须经过 Git 检查点（包含修改目的）：
python3 scripts/v6_git.py build --change "改动摘要" --purpose "原因与验收" -- npm run build
python3 scripts/v6_publish.py      # 将 dist/ 发布至 .v6/release/
```

正式站点通过 Cloudflare Tunnel 指向 Mac 的 V6 服务 `127.0.0.1:4396`；发布 Python 服务端代码后，还需要单独重启 V6 LaunchAgent 才能生效。页面通过 `/healthz` 检查构建版本并在安全时自动刷新。发布本身不执行数据初始化。

旧母文档无损注释升级是**一次性、显式、增量**操作，不能用重新生成的样本覆盖已编辑正文。先编译转换器，再用只读预检和 SHA 条件保护；应用前自动保留原文备份：

```bash
npm --prefix packages/minerujson-md run build
node scripts/v6_annotate_document.mjs --document .v6/workspace/buffetts-alpha.minerujson.md
# 仅在核对预检结果和当前 SHA 后执行；会留下 .lossless-audit-backups/ 备份：
node scripts/v6_annotate_document.mjs --document .v6/workspace/buffetts-alpha.minerujson.md --apply --expected-sha <当前母文档SHA256>
```

测试须使用 `.v6/tests/` 的隔离母文档及测试端口，**不要对正式 `.v6/workspace/` 执行初始化或写入测试**。常用回归入口：

```bash
npm run test:outline                 # AG/章节定界、CM6/预览定位
npm run test:scroll-sync             # CM6 ↔ Markdown 元素级滚动
npm run test:preview                 # Markdown 渲染
npm run test:shell                   # 顶栏、布局、Undo/保存
node tests/promoted-chapters-browser.test.mjs
node tests/shared-preview-browser.test.mjs
node tests/preview-split-browser.test.mjs
node tests/preview-split-browser.test.mjs
node tests/pdf-click-only-browser.test.mjs
node tests/engineering-initialize-browser.test.mjs
node --test tests/mineru-lossless-migration.test.mjs
node tests/mineru-lossless-ui-browser.test.mjs
```

部分 `node tests/*.mjs` 直接读取已构建的 `dist/`，应在本地完成构建后执行。测试中的 Chrome/WebKit 均应检查；真实 iPad Safari 的视觉/滚动仍需人工确认。Mac 上原生 Chrome iPad 模拟入口为 `node scripts/v6_ipad_chrome.mjs`（使用独立 Profile/CDP，不替代真实 iPad）。

故障与版本管理：

```bash
python3 scripts/v6_git.py status
python3 scripts/v6_git.py review                  # 本地提交和差异，尚不合并
python3 scripts/v6_git.py rollback --to <已知正常的Git提交>
python3 scripts/v6_git.py recover-source --build-id <构建ID>
```

上述回退使用独立 Git worktree 重建发布，不改当前开发分支。**日终 squash 与 GitHub 推送均需用户另行明确批准**；具体工程原则见 `AGENTS.md`。

## 边界与参考

- **现行文档体系**：V6 不使用 MOPJO，也没有 MOPJO 模块或数据库作为编辑数据源。文档编辑由 CMD/CM6 承接，MinerU JSON ↔ Markdown 转换器仍是独立组件；AG、预览和 PDF 定位读取文档派生结果。历史文档中的 MOPJO 称谓不代表 V6 现行模块。
- **文本块身份设计（已确定、尚未实施）**：原始 OCR 块以文档内的 `pageIndex:blockIndex`（`minerujson:block:v1`）作为稳定身份，无需逐块额外生成 UID；只有人工增补、复制为独立块或拆分出来的新块，才在创建时自动分配 UID（拟用 `ocr2md:block:v1:<UUID>`）。移动块时连同身份锚点一起移动，不重编原始 OCR 来源编号；PDF 来源另行关联，不伪造 MinerU 块。此规则是后续 CMD 文本块编辑功能的设计，不代表当前版本已支持增补或移动。
- **单起始锚点格式**：MinerU 转换器默认生成不含 `minerujson:end` 的 `.minerujson.md`；正式母文档已经完成 SHA 校验、备份和一次性格式迁移，保存及重新打开均保持此格式。离线迁移脚本保留供旧文档使用，运行时 CMD 不再提供特殊兼容投影。块来源仍是原始 `pageIndex:blockIndex`。人工增补块 UID、可视化移动操作仍属后续功能；不把无 `end` 误称为已支持任意跨块合并。

- 当前只实现章节定界业务；未声称已完成章节清洗、媒体本地化、通用多目录工作台或完整 Obsidian 功能。
- V6 的 MinerU 映射与 PDF 只读证据使用 Buffett’s Alpha 样本；扩大到新文档或动态 PDF 绑定，需要另行实现与验证。MinerU JSON 严格逆转换的可编辑范围见组件 README。
- `labs/cm-html/` 是已冻结的旁路实验（标签 `cm-html-lab-frozen-20261021`）；V6 主线不依赖其运行时文件。
- [`PROJECT_INIT.md`](./PROJECT_INIT.md) 记录早期 V7/V8 初始化 Git 标签的使用方式，是历史起点，不覆盖当前的 `AGENTS.md`；实现变更查 Git 历史。
