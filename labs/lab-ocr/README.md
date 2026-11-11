# lab-ocr · OCR 审阅实验起点

本实验从 `frame/base` 派生，并合并 `lab-frame@a8406e1`（2216 版）。
保持空白框架的 Dockview 四窗、AG Grid、CM6、设置和导航，复用 Frame 的授权目录树、整行选中、展开刷新、全局状态和文件保存。尚未接入 OCR 数据、SQL 或 PDF。
标牌为 `lab-ocr`，与 `lab-frame` 使用不同的发布路径和本地设置命名空间。
新业务逻辑仅在本实验分支开发，禁止直接修改空白框架基线。

开发入口：`ui/lab-ocr/entry.js` 仅导入共享 `ui/frame/frame.js`，避免 Vite 开发模式直接引用 `../frame/frame.js` 的路径 404。
构建：`npx vite build --config labs/lab-ocr/vite.config.mjs`
发布：`python3 scripts/v6_lab_ocr_publish.py --release-root /Users/daisor/AgentDock/ocr2md/release`
公开入口：`/labs/lab-ocr/`。发布沿用 Agent Link 单一 Lab 网关，禁止单独建 Tunnel。
