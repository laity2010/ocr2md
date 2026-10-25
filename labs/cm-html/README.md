# OCR2MD V6 · cm-html 兼容实验入口

该旧实验内容已经并入 V6 主线。这里不再维护独立的 CMD / AG / 章节标定实现。
保留原公网入口 `https://ocr2md.laity.bid/labs/cm-html/`，作为配置驱动实验模式的兼容入口。

- 构建：`V6_LAB_ID=cm-html npm run build`，产物只进入 `labs/cm-html/dist/`。
- 服务：`V6_LAB_ID=cm-html CMHTML_PORT=4408 python3 scripts/v6_serve.py`（既有 LaunchAgent 通过 `server.py` 委托）。
- 模块覆盖：`lab.json` 的 `modules` 默认为空，全部从 `ui/` 加载 V6 主线代码。
- 数据、PDF、授权和设置：均在 `.runtime/`，不读取或修改 `.v6/` 工作数据。
- Git branch / worktree：由 `scripts/v6_lab_worktree.py` 为新实验建立，不在这里继续开发旧的 HTML 标定实验。
- 验收：`node labs/cm-html/mainline-fork-browser.test.mjs`，Chrome/WebKit 检查完整模块、隔离 API 和持久化。

正式通用方案见主 README 的「主线和实验」章节。
