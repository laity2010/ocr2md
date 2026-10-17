# V5 AEL · 模块内构建门禁 / 整站发布分离

权威 AEL 仅在 `../../../web-component-platform/tools/ael/ael.py` 维护；V5 不再发展第二套 AEL。原 V5 SQLite（`.runtime/ael.sqlite`）仍作为只读历史留存，未删除、不迁移。

## 已验收接入

- `ael-policy.json` 声明 Workspace、Settings、隔离的 filesystem、WCP/资源镜像、Shell、Tooling 的**唯一文件所有者**，并规定模块内 `buildDirs` 与必需 API 契约测试。
- 2026-10-18 接入时扫描 130 个文件；所有文件均有归属；旧 AEL 检查为零差异，未使用 reset/clean/rebase，也未丢弃历史 WIP。
- 新 AEL 本地 SQLite：`.ael/ledger.sqlite`，仅是**新的开发任务账本**，不复制旧历史。变动检查基准是经过归属核对的完整当前源码。
- 原生 ESM 模块无编译输出；模块内的 `build` 门禁执行 `node --check`，然后必须通过独立的 API/浏览器契约测试。不能制造无意义的 bundle 或重写 Shell。

## 模块单独开发（以工作目录为例）

```bash
cd ~/AgentDock/ocr2md-codespaces-spike/ui-spikes/v5-directory
npm run ael:check
npm run ael:begin -- --module workspace --purpose "具体任务名称"
npm run ael:build -- sh -c 'for f in *.js; do node --check "$f" || exit; done'
npm run ael:test -- --name workspace-contract-v1 -- node plugins/workspace/tests/ownership-gate.mjs
npm run ael:test -- --name workspace-browser-lifecycle -- node plugins/workspace/tests/independent-lifecycle.mjs
npm run ael:finish -- --result passed
```

Settings 同理，`--module settings`，契约命令为 `node plugins/settings/tests/settings-contract-v1.mjs`，也可再加 `node plugins/settings/tests/settings-contract-browser.mjs`；`settings-contract-v1` 必须通过。外部 **Shared Settings** 源码在它自己的仓库编译，不属于 V5 Settings UI 插件源码。

## 独立组件准备（不是整站发布）

```bash
npm run component:prepare-settings
```

这条命令在 `~/AgentDock/agent-link-monitor/shared-settings` **所属模块目录**调用其权威 `npm run build`，产物写入非服务目录的 `../../.runtime/ocr2md-component-candidates/`，记录外部源码 digest、组件版本、两个 bundle 的 SHA。它**不发布页面，不推动中央组件 stable 指针**。

## 整站发布：只组装，不编译

```bash
npm run ael:check
npm run release:publish
```

发布器必须在真实 V5 新 AEL 账本存在且 `active=null, files=0` 时运行；只读取前一步的 Shared Settings 预构建候选及 WCP 镜像，核对文件 SHA、外部源码 digest 和版本，再做不可变发布及浏览器截图验收。

- 没有候选或外部源码改动导致候选过期 → **阻止发布**，要求重新执行组件准备。
- 未登记修改任何模块 → **阻止发布**。
- 组件代码改动需要对应模块单独的 AEL 任务、模块级构建与 API 契约测试；跨模块改动不能偷偷使用同一任务 `passed`。
- 原 Shell `npm run build` **仅生成插件 registry**，属于 Shell/Tooling 级变更，不代表 Workspace/Settings 组件构建，不应在某模块任务中执行。
- 内网和公网共用一个发布目录；不修改原有自动上线和视觉验收方式。

## 安全边界和剩余限制

AEL 是验收型守门器，不是 OS 级隔离沙箱；恶意命令执行时仍可能访问其他文件，AEL 会在执行后发现越界并拒绝验收。当前外部 Shared Settings 由源仓独立构建、候选哈希校验，但其源码不属于 V5 新 AEL 的本地所有权快照（跨仓保护应由 Shared Settings 自己的开发门禁负责）。旧 V5 SQLite 的未关闭审计发现仍保存在历史中，不因启用新账本声称它们已修复。

## 样板验收

`python3 tests/publish-build-badge.test.py` 模拟无候选/过期候选/真实预构建产物三条发布路径；真实 V5 还人工制造未登记文件，确认整站发布阻断且当前版本保持不变，并确认工作目录和 Settings 在 Chromium/WebKit 上通过 API 回归。
