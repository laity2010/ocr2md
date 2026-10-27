# OCR2MD V6 · Lab 镜像工作树生命周期

这是 `AGENTS.md` 第 5 条的执行说明；不创建新正式工程原则。

## 工程边界

- 同一提交在两个环境中使用 **同一套 `ui/` 源文件、模块装配、NPM 构建命令和 AM 测试**。`V6_LAB_ID` 只能改变静态发布前缀、输出目录、版本标识、Cookie、持久化文件夹与服务端口；`lab.json` 的旧模块覆盖清单禁止非空，构建直接报 `LAB_MODULE_OVERRIDE_FORBIDDEN`。
- 每份 `dist/module-graph.json` 来自 Vite/Rollup 的**实际模块图**，记录相对源码路径和字节 SHA256。相同 Lab Git SHA 依次构建 Main 与 Lab，`node scripts/v6_lab_parity_check.mjs cm-html` 要求所有实际模块路径和内容哈希完全一致。可见入口、模块契约及测试还需在浏览器中回归；静态图一致不能代替动态测试。
- Main 正式发布仍仅从 Main 工作树经 `scripts/v6_publish.py` 更新 `.v6/release`；Lab 独立工作树构建输出 `labs/cm-html/dist`，通过 `scripts/v6_lab_publish.py` 只晋升该静态产物到**已有的 Lab 托管工作区**，保留其 `.runtime` 母 Markdown、settings、cookie/token、媒体、日志和缓存。两个 worktree 不互相写入业务数据。
- Lab 服务入口由 Lab 镜像工作树自带的 `labs/cm-html/server.py` 装载相同 `scripts/v6_serve.py`；不能再从冻结旧 worktree 加载 `chapter-server-launch.py`。服务端禁止加载 Lab 专属 `document-router.py`，所有 API 行为与 Main 相同，差别只在运行数据目录和 URL 前缀。

## 创建 Lab 镜像

在干净的 Main 工作树：

```sh
python3 scripts/v6_lab_worktree.py create cm-html
```

如果已有 `experiment/cm-html` 和工作树，**不重复创建**；进入对应工作树核对其 `git rev-parse HEAD` 和 Main 基线，并检查 `labs/cm-html/lab.json` 无非空覆盖。原 `experiment/virtual-chapters-wp0-2` 已冻结，不得使用它继续开发，也不删它的历史。

## 构建、验证、部署 Lab

在 Lab 工作树（两次**同一个** `npm run build`，只是运行环境不同）：

```sh
npm ci --no-audit --no-fund
npm run build
V6_LAB_ID=cm-html npm run build
node scripts/v6_lab_parity_check.mjs cm-html
python3 scripts/v6_lab_worktree.py parity-check cm-html
python3 scripts/v6_lab_publish.py cm-html --host-root /path/to/ocr2md-v6
```

发布时需确认 Lab 工作树干净、构建时间内 SHA 未漂移，静态产物的 `baseCommit` 精确对应 Lab `HEAD`；仅把生成的静态文件提升到现有 Lab 托管目录 `/labs/cm-html/dist/`，不能写 `.runtime`。更改 Lab 后应先提交，然后重建并回归。

## 晋升 Main、冻结与独立审计

1. 冻结实验 SHA；完成主线功能的 Chrome/WebKit、AG/CM6/Markdown/PDF、Settings、保存 CAS、跨章节和模块边界等同一套验收。
2. `python3 scripts/v6_lab_worktree.py merge-check cm-html`：需要 clean worktree、已验证模块图和 Git merge-tree 无冲突。Main 已前进则先在 Lab 上 `sync` 吸收、解决冲突后重新测试，再在 Main 正常 `git merge`；Main 无分叉时可以 fast-forward。
3. 合并是版本晋升，不允许因为 Lab/Main 的构建装配不同而复制 adapter 或重连模块。晋升后在 Main 默认生产构建重复相同测试。
4. 建立冻结 Lab tag，保留工作树和全部实验数据；Main 继续开发，Grok/Muse 审计锁定 Main SHA。**进入 Main 不等于正式发布和外部签字**。
