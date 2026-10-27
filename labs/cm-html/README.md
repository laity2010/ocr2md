# OCR2MD V6 · cm-html 镜像 Lab

**当前 Lab 是 Main 的完整隔离工作树，不是业务变体。** 本文只说明 Lab 的环境；工程原则见仓库根目录 `AGENTS.md` 第 5 条，操作流程见 `docs/engineering/lab-lifecycle.md`。

- Main：`/Users/daisor/AgentDock/ocr2md-v6`，开发分支 `build/2026-10-20`，正式入口 `/`。
- 镜像 Lab：`/Users/daisor/AgentDock/ocr2md-v6-experiments/cm-html`，开发分支 `experiment/cm-html`，实验入口 `/labs/cm-html/`，端口 4408。
- 从同一 Main SHA 建立镜像，以同一个 `npm run build` 分别生成 Main 与 Lab 产物（Lab 仅设置 `V6_LAB_ID=cm-html`）；**所有业务模块、API/WCP 依赖、Chrome/WebKit 验收相同**。`lab.json` 是 `{}`，禁止非空 `modules`，构建会拒绝。
- 通过真实 Rollup 模块路径与内容 SHA256 对比 `node scripts/v6_lab_parity_check.mjs cm-html`，任意模块差异均阻断晋升。
- 仅 Lab 静态发布使用新镜像构建输出，`python3 scripts/v6_lab_publish.py cm-html --host-root /Users/daisor/AgentDock/ocr2md-v6` 会在同一把发布锁内置换 `/ocr2md-v6/labs/cm-html/dist`，**绝不修改**其 `.runtime` 下的母 Markdown、设置、媒体或授权。
- 现有 Lab Python 服务由 `experiment/cm-html/labs/cm-html/server.py` 启动，调用同一版 `scripts/v6_serve.py`；不加载归档在 `labs/cm-html/modules` 下的旧实验专属业务路由。Lab/Main 接口差别仅在静态路径、隔离数据、Cookie、端口和授权作用域。
- `labs/cm-html/modules/` 与 `wp0-2/` 留作历史兼容/审计证据，**不作为当前 Main/Lab 的业务模块入口**。它们不应修改来实现新功能。业务模块的单一源文件在 `ui/`。
- 旧 `experiment/virtual-chapters-wp0-2@043cbf5` 及其历史保留冻结，严禁为了新 Lab 发布而修改/覆盖该实验工作树。

## 运行顺序

在 Main 工作区创建镜像（已有则不重复创建）：

```sh
python3 scripts/v6_lab_worktree.py create cm-html
```

在 Lab 镜像工作区执行：

```sh
npm run build
V6_LAB_ID=cm-html npm run build
node scripts/v6_lab_parity_check.mjs cm-html
node tests/v6-lab-mirror.browser.test.mjs
python3 scripts/v6_lab_worktree.py merge-check cm-html
python3 scripts/v6_lab_publish.py cm-html --host-root /Users/daisor/AgentDock/ocr2md-v6
```

实验完成先固定并验收 SHA；当 Main 未分叉可 fast-forward 晋升，分叉则正常 Git merge 并重新验收。晋升不是迁移、复制或替换业务模块。需要外部审计时固定新的 Main SHA，原 Lab 工作树冻结并保留数据。
