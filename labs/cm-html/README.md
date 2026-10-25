# CM-HTML Lab · 当前 V6 主线核心的隔离实验副本

实验 URL：`https://ocr2md.laity.bid/labs/cm-html/`。根路径 `https://ocr2md.laity.bid/` 仍为正式 V6。

## 核心复用与实验入口

- 当前基线：V6 主线 `74b7383`（2026-10-25）。实验 `index.html` 是主线 `ui/index.html` 的同结构副本，仅改品牌和 JS 入口；`mainline-entry.js` **直接导入** `../../ui/main.js`，连同现成的 CMD、AG、MD/PDF、设置、媒体、LaTeX 模块。主线 `ui/` 未更改。
- `vite.config.mjs` 只将页面 API / media / healthz 请求前缀改成 `/labs/cm-html/`，独立发布到 `labs/cm-html/dist/`，版本随每次构建更新，并记下当前主线 UI 源码 Git 提交。若主线改了网络契约，需重新检查该局部路由适配。
- `server.py` 是稳定启动入口；`mainline-server.py` 是当次 V6 `scripts/v6_serve.py` 的实验用服务端快照，仅更改启动位置、API 前缀、实验 cookie 和文档/授权/发布路径。以后同步主线后端时须检查差异并重做薄适配，不能盲目覆盖。
- 完整主线四个模块可用。**旧实验的格式切换器不在新入口**：主线当前默认写标准 HTML 注释，但可读取旧式 `<ocr2md-chapter>` 标签。旧实验 `app.js`、`metadata.js`、`outline-grid.js` 等留在实验目录作参考，当前发布不加载它们。新的试验逻辑只在 `labs/cm-html/` 下增加。

## 文件和权限隔离

- 服务：`127.0.0.1:4408`，只服务 `/labs/cm-html/`。非前缀请求直接 404，绝不转发到主线 API。
- 文档：`.runtime/document.md`；全局设置：`.runtime/settings.json`；章节文件：`.runtime/chapters/`；授权凭据：`.runtime/private/save-token`；只读 PDF：`.runtime/reference.pdf`。全部独立于 `.v6/workspace` 和 `.v6/release`。
- 授权 cookie 名称 `cmhtml_edit`，Path 限于 `/labs/cm-html/`；公共 HTTPS 时 Secure，测试本地 HTTP 时不使用 Secure。服务器上的所有实际业务接口沿用主线的已有校验和原子保存方式。
- PDF 快照仅从已校验一致的冻结证据复制，SHA-256 为 `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`。实验进程不直接读正式 V6 工作文档或正式发布目录。

## 构建与验收

```sh
node node_modules/vite/bin/vite.js build --config labs/cm-html/vite.config.mjs --outDir /Users/daisor/AgentDock/ocr2md-v6/labs/cm-html/.runtime/sync-staging
CMHTML_STATIC_DIR=/Users/daisor/AgentDock/ocr2md-v6/labs/cm-html/.runtime/sync-staging node labs/cm-html/mainline-fork-browser.test.mjs
```

预先在 `labs/cm-html/.runtime/` 的独立暂存目录测试。双引擎通过后才将其替换为实验的唯一正式产物 `labs/cm-html/dist/`，并仅重启实验 LaunchAgent `com.laity.ocr2md.cm-html`。测试涵盖四模块、授权保存、重开、零主线 API 请求及主线文档与发布文件不变。每次构建按 `AGENTS.md` 先留下 Git 检查点；禁止将实验合入正式 V6，除非用户另外批准。
