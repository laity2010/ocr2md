# Lab PDF · 开发底座（实验约定）

- **来源**：从已经验收的 `experiment/lab-frame` 提交 `a8406e1f9c756fa26f919f1cf622b0b68990038e` 建立 `experiment/lab-pdf` 独立 worktree。它是框架型 Lab，不是 Main 的镜像分支。
- **目的**：为未来 `packages/pdf-viewer` 公共 PDF.js 可视组件，以及 BlockID/ParentID/PBS bbox 覆盖框 API，提供独立开发、演示和浏览器验收环境。
- **当前实现**：仅保留继承 Frame 的四窗外壳、导航、设置、状态栏和 PDF 占位窗（PDF 渲染尚未接入，页面按钮应保持禁用）。**不得将空壳表述成公共 PDF 包已完成**。
- **隔离**：App ID `lab-pdf`，浏览器设置 `ocr2md.lab-pdf.settings.json.v1`，发布静态入口 `/labs/lab-pdf/`。不调用 Main CMD/SQL 或修改用户 PDF，开发基线独立构建、提交、回退。
- **构建**：`node node_modules/vite/bin/vite.js build --config labs/lab-pdf/vite.config.mjs`。发布复用既有统一校验发布器 `python3 scripts/v6_lab_pdf_publish.py --release-root <统一发布目录>`，拒绝未提交源码，严禁新建 Tunnel 和业务后端。
- **验收**：`node tests/lab-pdf-refresh.test.mjs`、`node tests/lab-pdf-bootstrap.browser.test.mjs`，分别验证独立自动更新身份与 Chromium/iPad WebKit 的四窗/设置/导航隔离。Frame 原有 API/设置回归继续适用。
- **未来方向（未实现）**：公共包 `createPdfViewer` / `open` / `setBlockOverlays` / `focusBlock` / `dispose`，以及 Block 点击和全局状态事件。通过直接测试和版本交付接入 Main 与 Lab OCR；BlockID 身份稳定，PBS 仅供显示。
