# OCR2MD V6（从零开始）

这是唯一 OCR2MD V6 源码仓库。V5 不再运行或充当回退，历史只由 V6 Git 提交回溯。首个独立验证组件是 `packages/minerujson-md/`，负责 MinerU JSON ↔ 标准 Markdown（含 HTML 注释）转换；不提供用户界面。

**供未来 V7/V8 复用的项目初始化基线**：本地 Git 标签 `ocr2md-init-v1`，保留发布流程、Git 回退与 Mac 原生 Chrome iPad 模拟环境；克隆命令、版本隔离要求及不包含的运行凭据详见 [PROJECT_INIT.md](./PROJECT_INIT.md)。该标签是初始化源码快照，不代表已发布到 GitHub 或无需改配置即可运行。

## 每日流程

1. 每次编译/构建都通过以下命令，`--change` 和 `--purpose` 缺一不可。构建失败也保存 Git 检查点：

   ```bash
   python3 scripts/v6_git.py build --change "修改功能" --purpose "修改原因" -- npm run build
   ```

   V6 现已提供 `npm run build`（WP1 CM6 浏览器验证）。上面的构建指令中的改动说明仍是示例。
2. 出错从 Git 提交重新编译发布：`python3 scripts/v6_git.py rollback --to <Git提交>`，只替换 `.v6/release/`，不改当前 HEAD。
3. 需要查看旧源码：`python3 scripts/v6_git.py recover-source --build-id v6-构建ID`，会在 `.v6/recovery/` 生成独立 worktree，不修改现有源码。
4. 日终先看提交和文件差异：`python3 scripts/v6_git.py review`。用户审查批准后执行：`python3 scripts/v6_git.py review --approved --summary "今日开发成果"`；会把当天小提交汇成 `v6` 分支的一个提交，同时保留本地细历史分支。
5. **另经明确批准**后手动执行 `git push origin v6`。未明确批准不可推送。
6. 次日：`python3 scripts/v6_git.py next-day`，基于已审查的 `v6` 新建当日开发分支。

Git 能回溯文件改动和差异，但目的需要写在 commit message，编译结果及产物需要另存。每日审查不能由构建脚本擅自代替人工批准。

## WP0 转换组件

唯一组件位于 `packages/minerujson-md/`，三项公开 API 为 `toMarkdown()`、`toMineruJSON()`、`version()`。首次转换的 Buffett’s Alpha 样本、格式限制和自动验收说明见 [组件 README](./packages/minerujson-md/README.md)。

## WP1 · CM6 单窗浏览器验证

仅以 `codemirror`、`@codemirror/lang-markdown`、`@codemirror/language` 的公开 API 管理单一编辑器。Dockview/Zustand 将分别在后续验证，不在 WP1 引入。

```bash
npm ci
npm run dev                  # Mac 本机 http://127.0.0.1:5196/
npm run build                # 编译后发布到唯一 release 目录
```

`ui/` 为唯一浏览器界面。`vite.config.mjs` 的 `/api/document` 仅实现一个固定路径的 GET/PUT 文件 I/O；默认首次从 WP0 的只读测试样本加载，第一次保存写到 `.v6/workspace/buffetts-alpha.minerujson.md`，后续打开该工作文件；不改写原样本，也不在服务端维护额外 MD 状态。实际界面直接从 `view.state.doc` 读取全文保存，保存后不重建 `EditorView`。

UI 原生 API 验收使用独立文件及端口，以免污染用户工作文档：

```bash
V6_DOCUMENT_PATH="$PWD/.v6/tests/wp1-document-test.md" npm run dev -- --port 5198
# 另一个 shell
npm run test:ui
```

测试覆盖读取真实 314KB Markdown、撤销/重做、Syntax Tree 全文元素计数、磁盘保存、滚动与选区保持、刷新还原，截图位于 `.v6/evidence/wp1/`（不进 Git）。命令要求本机已安装 Chrome。WP1 的 CM6 源码仍仅负责编辑；正式对外发布现已由下文的 V6 最小发布服务独立承担。

## V6 正式公网发布

唯一公网入口 `https://ocr2md.laity.bid/` → 共享 Cloudflare Tunnel → V6 本地 `127.0.0.1:4396`。唯一正式发布目录 `.v6/release/`，不保留 A/B 或 V5 运行版本。

- `scripts/v6_serve.py` 运行于独立 macOS LaunchAgent，静态服务只访问 `.v6/release/`，工作文档存 `.v6/workspace/`。
- 局域网 HTTPS：同一 V6 服务另外监听 `192.168.1.10:4443`，沿用 Mac 既有 `ocr2md/lan-tls` 证书；公网仍指向 `127.0.0.1:4396`。证书由本地 CA 签发，需用户主动信任 CA 才能在 Safari 无警告打开，不能假定证书已被系统信任。
- 开发：`python3 scripts/v6_git.py build --change "..." --purpose "..." -- npm run build`。
- 发布：`python3 scripts/v6_publish.py`。临时准备并替换唯一发布目录。
- Git 回退：`python3 scripts/v6_git.py rollback --to <已验收Git提交>`，使用临时 Git worktree 重建发布，不重写当前分支。
- 密钥位于 `.v6/private/`，不提交 Git；GitHub 推送需要另行授权。

## Mac 原生 Chrome · iPad 布局验收

运行 `node scripts/v6_ipad_chrome.mjs`。使用独立 Chrome Profile 和正常 GPU 渲染启动参数，**不通过 Playwright 启动浏览器**；由常驻轻量 CDP 连接维持 iPad 1032×642、DPR 2、触控模拟。再次运行会复用原窗口和字体缓存，不重复打开页面。

- 验收窗口直达局域网 HTTPS `https://192.168.1.10:4443/`。调试端口仅绑定本机 `127.0.0.1:19396`，截图工具按需连接，不负责浏览器生命周期；不要覆盖这个窗口的设备模拟设置。
- Chrome 进程与启动命令分离，但**保持 iPad 模拟仍需要轻量 CDP 连接在线**；脱开后 Chrome 不会退出，设备模拟可能恢复为 Mac 默认值。
- 真实 iPad Safari 的截图才是最终视觉验收依据；此工具仅用于 Mac 本机快速对照。

## Obsidian Everforest → CM6 源码样式

- 样式取自 Mac 的 OCR2MD Obsidian 仓库：当前主题 `Everforest`（dark），并参考已启用的 `daisor.css`。独立样式文件是 `ui/obsidian-everforest.css`，Markdown 高亮映射在 `ui/obsidian-markdown.js`，标题 `#` 标记同色扩展在 `ui/obsidian-heading-markers.js`。
- **字体不随 Obsidian 主题改变**：始终使用 V6 已验收、服务器托管的完整 Sarasa Fixed SC WOFF2，12pt / 16px；CM6 行高不改。
- 仅影响 CM6 Markdown **源码窗**的暗色背景、文字、六级标题、引用、链接、代码与标记等样式。不导入 Obsidian 的窗口/侧栏 CSS，不实现 Live Preview、独立 HTML 阅读渲染或第二份文档状态；Obsidian 改主题后也不会自动重载本地主题 CSS。
- 隔离测试：`npm run test:ob-theme`，在独立端口与独立测试文档上验证 Chrome / WebKit 的标题、字体、背景与原始标记保留；截图位于 `.v6/evidence/obsidian-everforest-*.png`。
- 标题字号沿用 Everforest `--h1-size`～`--h6-size`：相对 16px 正文为 2.125 / 1.625 / 1.375 / 1.25 / 1.125 / 1.125 倍（34 / 26 / 22 / 20 / 18 / 18px），**所有字号依旧使用 Sarasa Fixed SC**。
- 源码窗启用 CM6 `EditorView.lineWrapping`，随视窗宽度软换行，不新增 Markdown 换行符；真实换行处增加青绿色 `↵` 视觉标记，代码保存在 `ui/obsidian-heading-markers.js` 的视口装饰中。该标记不进入 `view.state.doc`、不增加行数或改变保存数据；测试还验证改变视口宽度后同一长段落软换行数量变化。

## Dockview 双窗 / Markdown 预览（V6）

- UI 采用官方 JavaScript Dockview 左右两窗：左侧保持原 CodeMirror 6 实例，右侧是 markdown-it 的只读 HTML 预览。窗格可拖动和调整宽度，关闭按钮暂隐藏，避免误关必要的工作窗格。
- Zustand Vanilla 只传递文档修订号、活动窗和位置通知；不保存 Markdown 全文、HTML 或撤销历史。预览在编辑后合并更新，重新读取 CM6 的当前文档。
- 预览使用 Markdown-it、HTML 表格、脚注和任务列表，KaTeX 渲染 math/latex/tex fenced 数学块，DOMPurify 过滤 HTML。原 MinerU 注释在源码中保留，但预览隐藏；采用原 Everforest 深色主题和完整 Sarasa Fixed SC 字体。
- 11 张原始图片对应的外部 URL 是否仍可访问，不属于预览器保证范围；后续需媒体模块处理本地化。尚不支持完整 Obsidian 插件、公式所有方言和双向元素定位。
- 回归测试：npm run test:preview。使用隔离工作文件及 Mac Chrome / WebKit 视口验证图片、HTML 表格、数学公式、实时更新、撤销、布局和 HTML 安全。

## V6 发布后浏览器自动更新

Vite 每次编译生成唯一 `v6-YYYYMMDD-HHMMSS` 标牌和 `release-version.json`，唯一发布目录的 `/healthz` 直接提供相同的 `version`。已载入新版的浏览器以 5 秒间隔检查构建变化；切回前台时也立即检查。没有未保存修改则自动刷新；有未保存修改、保存请求正在进行或授权对话框未关闭时不会中断编辑，成功保存后才自动刷新。临时网络故障不触发刷新。测试命令：隔离服务运行在 4397 时执行 `node tests/auto-refresh-browser.test.mjs`。

**以前已经打开的旧版页面未包含自动更新代码，需要首次手动刷新一次以启用后续自动更新**；后续 Git 构建发布无需手动刷新。此机制只检测发布版本，不新增 Markdown 副本或后台状态管理。
