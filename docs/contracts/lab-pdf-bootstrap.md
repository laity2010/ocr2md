# Lab PDF · 开发底座（实验约定）

- **来源**：从已经验收的 `experiment/lab-frame` 提交 `a8406e1f9c756fa26f919f1cf622b0b68990038e` 建立 `experiment/lab-pdf` 独立 worktree。它是框架型 Lab，不是 Main 的镜像分支。
- **目的**：为未来 `packages/pdf-viewer` 公共 PDF.js 可视组件，以及 BlockID/ParentID/PBS bbox 覆盖框 API，提供独立开发、演示和浏览器验收环境。
- **当前实现**：已保留 Frame 四窗、导航、设置、状态栏，并在 PDF 窗使用 `packages/pdf-viewer` 的真正 PDF.js 查看器与 PBS 覆盖框 API；用自行生成的 3 页公共示例 PDF 验收。PDF 包仍是 Lab 开发版，Main/Lab OCR 尚未改为使用公共包。
- **隔离**：App ID `lab-pdf`，浏览器设置 `ocr2md.lab-pdf.settings.json.v1`，发布静态入口 `/labs/lab-pdf/`。不调用 Main CMD/SQL 或修改用户 PDF，开发基线独立构建、提交、回退。
- **构建**：`node node_modules/vite/bin/vite.js build --config labs/lab-pdf/vite.config.mjs`。发布复用既有统一校验发布器 `python3 scripts/v6_lab_pdf_publish.py --release-root <统一发布目录>`，拒绝未提交源码，严禁新建 Tunnel 和业务后端。
- **验收**：`node tests/lab-pdf-refresh.test.mjs`、`node tests/lab-pdf-bootstrap.browser.test.mjs`、`node --test packages/pdf-viewer/tests/*.test.mjs`、`node tests/lab-pdf-viewer.browser.test.mjs`，验证独立身份、四窗/设置隔离，以及真正 PDF.js/BlockID/PBS 的所有公开 API。
- **公共 API（实验实现）**：`createPdfViewer` / `open` / `setBlockOverlays` / `focusBlock` / `dispose`，以及 Block 点击、翻页和全局状态事件。详见 `packages/pdf-viewer/README.md`。Main 与 Lab OCR 的适配尚未进入本次范围；BlockID 身份稳定，PBS 仅供显示。
