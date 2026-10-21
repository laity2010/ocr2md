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
- CM6 存在未保存修改、授权弹窗或保存请求时绝不自动刷新；顶栏提示新版已发布，保存成功且修改均已落盘才可自动更新。
- 只读检查版本，不访问 V6 主线 API；版本检测失败不影响编辑。
