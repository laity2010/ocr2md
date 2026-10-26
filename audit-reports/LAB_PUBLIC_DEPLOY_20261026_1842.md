# OCR2MD Lab 公网部署记录 · 2026-10-26 18:42

## 发布对象

- URL: `https://ocr2md.laity.bid/labs/cm-html/`
- 原版本：`v6-lab-cm-html-20261026-145357`；新版本：`v6-lab-cm-html-20261026-184207`。
- 发布源：`experiment/virtual-chapters-wp0-2` Git `53c10f1`，`V6_LAB_ID=cm-html npm run build` 成功。
- 只将 Lab 静态产物发布到已有的 `/Users/daisor/AgentDock/ocr2md-v6/labs/cm-html/dist/`；没有触及根路径正式版 `dist`，也没有删除老的内容哈希静态资源（保护仍在打开的旧标签页）。
- 同步将 LaunchAgent `com.laity.ocr2md.cm-html` 的程序入口从过期的 `ocr2md-v6-experiments/wcp-lab/.../chapter-server-launch.py` 指向当前 `ocr2md-v6-experiments/virtual-chapters-wp0-2/.../chapter-server-launch.py`。原监听 `127.0.0.1:4408`、现有 Cloudflare 路由、正式根站点服务均保持不变；实际有效及用户级启动 plist 同步更新。
- Lab `V6_LAB_RUNTIME` 继续为 `/Users/daisor/AgentDock/ocr2md-v6/labs/cm-html/.runtime`。未复制、改写、清空 Lab 文档/设置/媒体或六个历史章节；没有执行 WP7 正式数据迁移。

## 公开网页及后端回读

- HTTPS `/labs/cm-html/release-version.json` 返回新版本及 Git `53c10f1`。
- HTTPS `/labs/cm-html/` HTML 引用 `/labs/cm-html/assets/index-ClKG7Rna.js`；该资源 HTTP 200。
- HTTPS `/labs/cm-html/api/document` 返回 `ETag: "33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc"`，实际完整文档 SHA-256 与发布前一致。
- 从公网执行 `ag-query.browser.test.mjs`，**Chrome PASS / iPad WebKit PASS**：6 个虚拟章节，全文标题 19 / 媒体 11 / LaTeX 42；章节 001 标题 10 / 媒体 5 / LaTeX 25；仍使用原三张 AG，物理章节加载 0，源码未变。
- 正式根站点 `https://ocr2md.laity.bid/release-version.json` 仍为 `v6-20261026-102651`。

## 版本兼容注意

旧标签页不会被强制刷新。由于新后端强制 `If-Match` 比对，旧版已打开的 HTML/JS 若有未保存 Lab 编辑，直接从旧页保存会收到 HTTP 428。应先保留/复制未保存内容，再刷新成新客户端；新客户端会读取 ETag 并安全保护编辑。该限制属于部署切换中需要注意的会话兼容问题，不能宣称旧页保存依然可用。

## 工程门禁

此次仅更新公网 **Lab**，不表示 WP8 已经获得 Grok/Muse 独立签署，也不授权合并主线或删除实体章节；相关 BLOCKED 项仍然保留。部署不引入新的正式 AGENTS.md 规则。发布资产依据构建、测试和 Git 追溯，不维持另一套运行时发布槽。
