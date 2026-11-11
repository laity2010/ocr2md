# lab-ocr · OCR 审阅实验起点

本实验从 `frame/base@ea458246cae4748669d2518051ecc0b7ce614411` 派生。
保持空白框架的 Dockview 四窗、AG Grid、CM6、设置和导航，尚未接入 OCR 数据、SQL 或 PDF。
标牌为 `lab-ocr`，与 `lab-frame` 使用不同的发布路径和本地设置命名空间。
新业务逻辑仅在本实验分支开发，禁止直接修改空白框架基线。

构建：`npx vite build --config labs/lab-ocr/vite.config.mjs`
发布：`python3 scripts/v6_lab_ocr_publish.py --release-root /Users/daisor/AgentDock/ocr2md-lab-release`
公开入口：`/labs/lab-ocr/`。发布沿用 Agent Link 单一 Lab 网关，禁止单独建 Tunnel。
