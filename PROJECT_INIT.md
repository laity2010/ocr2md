# OCR2MD · 后续版本的 Git 初始化基线

**固定本地 Git 标签：`ocr2md-init-v1`（2026-10-20）**

这是 **V6 已验证源码及工程流程的初始化快照**，不是 V6 正式运行目录，也不是已经去除业务代码的通用框架。V7、V8 等新版本可以从此标签检出源码，再独立配置；不要直接覆盖正在运行的 V6。

## 本基线保留什么

| 功能 | Git 内的实现 |
| --- | --- |
| 构建前 Git 提交、保留构建结果、按日审查及 Git 回退 | `scripts/v6_git.py`、`ENGINEERING_MEMO.md` |
| 唯一发布目录、临时 staging 后原子切换 | `scripts/v6_publish.py` |
| 静态服务、文档 I/O、`/healthz`、局域网 HTTPS 配置入口 | `scripts/v6_serve.py` |
| 构建版本号、检测新版本及保存前阻止误刷新 | `vite.config.mjs`、`ui/main.js` |
| 原生 Mac Chrome + CDP iPad 横屏模拟（非 Playwright 启动） | `scripts/v6_ipad_chrome.mjs` |
| Sarasa Fixed SC 完整 WOFF2、内容哈希和长期缓存 | `ui/public/fonts/`、`ui/styles.css`、服务端缓存规则 |
| 浏览器及发布流程测试样例 | `tests/` |

**不在 Git 中**：`.v6/` 运行状态、工作文档、浏览器 Profile 与缓存、授权密钥、证书私钥、`node_modules/`、`dist/`、本机 LaunchAgent 配置及 Cloudflare Tunnel 的本机凭据。这些必须由新版本独立创建，不可复制 V6 的运行密钥。

## V7/V8 从本地 Git 创建独立项目

在 Mac 上执行（以 V7 为例）：

```bash
git clone --branch ocr2md-init-v1 /Users/daisor/AgentDock/ocr2md-v6 /Users/daisor/AgentDock/ocr2md-v7
cd /Users/daisor/AgentDock/ocr2md-v7
git switch -c build/v7-init
npm ci
```

`git clone --branch` 检出固定标签后处于 detached HEAD；必须新建自己的工作分支。克隆产生的 `origin` 初始指向**本机 V6 仓库**，不是 V7 的 GitHub 仓库；待新项目仓库确定后再单独设置 remote，不得误推回 V6。

对 V8，把目标目录和分支名分别改成 `ocr2md-v8` 和 `build/v8-init`。如果将来明确批准把此标签推到 GitHub，也可以从远端仓库按相同标签检出；**当前仅保证本机 Git 可用，尚未推送远端**。

## 新版本启用前必须独立化

1. 修改项目标识与本地状态目录：`AGENTS.md`、`ENGINEERING_MEMO.md`、`README.md`、`vite.config.mjs`、`scripts/v6_git.py`、`scripts/v6_publish.py`、`scripts/v6_serve.py`，把所有 V6 专属名称、版本号、`.v6/` 与环境变量前缀改为新版本；保持 Git 每次构建必有检查点的约定。
2. 分配**新的** HTTP/HTTPS 服务端口、局域网地址/证书、LaunchAgent 名称及 Cloudflare 路由；不得直接占用 V6 的 `4396`、`4443` 和 `ocr2md.laity.bid`。
3. 调整 `scripts/v6_ipad_chrome.mjs` 的工作目录、独立 Profile、回环 CDP 端口（V6 为 `19396`）、测试 URL；不能连接 V6 当前的浏览器 Profile 或调试端口。模拟视口的 `1032×642` 和 DPR 2 可沿用，但仍须与真机核对。
4. 检查 `ui/`、`tests/`、`packages/` 中的 V6 业务和 Buffett’s Alpha 测试样本，仅按新版本需要保留，不默认视作通用架构契约。
5. 在新目录内独立执行依赖安装、测试与**Git 记录的构建**，检查 `/healthz`、静态资源缓存、浏览器模拟以及回退入口，再决定是否部署。未经批准不要碰 V6 的正式发布、域名、服务或密钥。

本快照的目标是**为后续版本保留可直接克隆的、经验证的开发起点**，不是保证 V7/V8 克隆后不经配置便可上线。真正跨版本复用的工具，需要在后续新版本中经独立验收后再抽象，避免现在提前重构 V6。
