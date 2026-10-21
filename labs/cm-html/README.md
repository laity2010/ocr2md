# cm-html · V6 旁路技术验证

这是 AGENTS.md 第 5 条的第一项旁路实验，不是 V6 主线功能。

## 目的
比较两种 Markdown 章节标定：HTML 注释与 HTML 自定义标签。标记使用当前 V6 大纲已有的 MinerU 标题 ID；独立成章=0 表示并入前一章，1 表示独立。标记独立占一行，紧贴对应标题；通过 CM6 Transaction 更改，CM6 原生撤销、重做、保存、重读。

注释示例：

    <!-- ocr2md:chapter:v1 id="mineru:0:1:0" independent="0" -->
    ## Andrea Frazzini, David Kabiller & Lasse Heje Pedersen

标签示例：

    <ocr2md-chapter data-id="mineru:0:1:0" data-independent="0"></ocr2md-chapter>
    ## Andrea Frazzini, David Kabiller & Lasse Heje Pedersen

## 主线只读复用、实验隔离
- 实验构建只读导入 V6 的 Dockview、CM6 主题和扩展、原有 Markdown 大纲索引、AG Community 筛选器、Zustand、Markdown 预览及滚动同步。
- 构建插件只重定向一次特定 import：原始 workspace 导入的 outline-grid.js，替换为本目录的实验 outline-grid.js；其它主线组件一字不改。
- 实验代码和产物只放在 labs/cm-html/。实验服务运行在 127.0.0.1:4408，只响应 /labs/cm-html/ 前缀，采用独立密钥、独立 Cookie 和独立保存授权。
- 实验文档仅写 labs/cm-html/.runtime/document.md。首次读取未创建时，临时读取主线样本 fixture；生产 V6 的工作文件、源码和发布目录始终只读。
- Cloudflare Tunnel 按路径 /labs/cm-html/ 分流到实验服务。其余路径仍指向稳定版 127.0.0.1:4396。实验服务不剥离前缀。

## 构建、检查
从 V6 根目录运行：

    python3 scripts/v6_git.py build --change "cm-html旁路章节标定实验" --purpose "只读复用V6三窗并验证两种HTML标定格式" -- node node_modules/vite/bin/vite.js build --config labs/cm-html/vite.config.mjs
    python3 labs/cm-html/server.py

实验 URL：https://ocr2md.laity.bid/labs/cm-html/

浏览器实测：node labs/cm-html/test.mjs；版本检测与未保存保护测试：node labs/cm-html/auto-refresh.test.mjs。独立截图放到 labs/cm-html/.runtime/evidence/，不提交用户文档和授权令牌。标签渲染/清洗器兼容性必须实测，不预先假设标签优于注释。未获用户验收批准不并入主线。

## 实验版自动更新（仅 Lab）
- 页面每 6 秒通过只属于实验的 `/labs/cm-html/healthz` 查询构建版本，Safari 从后台回到前台时也会检查。
- 无未保存修改、无保存请求时自动重新载入新构建。
- CM6 存在未保存修改、授权弹窗或保存请求时绝不自动刷新；顶栏额外显示显眼的“新版 · 待保存”按钮，保存成功且修改均已落盘才会自动更新。点击可在明确确认后放弃未保存修改并更新。撤销回已保存内容时解除阻挡。
- 只读检查版本，不访问 V6 主线 API；版本检测失败不影响编辑。
- 每次网络检测最长等待 8 秒，超时后允许下一次检测，不让单次网络异常永久堵塞自动更新。

## 章节归属与导出（Lab 独立）
- AG「章节文件」列从 CM6 当前正文与「独立章节」标定即时推导，未导出时显示计划文件名；已经导出并匹配当前源文档时显示可点击下载的文件名。
- 第一标题独立成章；取消任一后续勾选仅合并到前一独立章，不改变 Markdown 标题层级。编号按独立标题顺序分配。
- 点击「导出章节」后，如有未保存修改先按实验授权保存母文档，再切分成 `labs/cm-html/.runtime/chapters/*.md`。用暂存目录整体替换上次生成结果（只管理生成文件），并生成 `manifest.json`。
- 在完整 `minerujson:block` 起点切分以保留证据配对，CM-HTML 标定注释不写入章节成品。尾部的 `minerujson:source` 原始压缩 JSON **只留在母文档**：这些章节是 Obsidian 可阅读的投影，**不具备各自独立逆转 MinerU JSON 的能力**。如果切分点不能安全定位块边界则拒绝导出。
- GET `/labs/cm-html/api/chapters` 查看清单，`/api/chapters/<文件名>` 查看 Markdown；POST `/api/export-chapters` 必须有独立 Lab 授权及同源校验，绝不覆盖 V6 主线或母文档。
