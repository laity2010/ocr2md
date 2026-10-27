# V6 Lab 镜像与无功能移植晋升机制 · 实际验收（2026-10-27）

## 用户批准的强制工程原则

`AGENTS.md` 第 5 条替换为：Lab 是 Main 的隔离 Git worktree，不是变体应用；Lab 晋升 Main 是代码版本晋升，而不是重新复制组件/业务模块。唯一差异为目录、URL/端口、授权/设置/文档/缓存隔离。

## 删除旧设计的变体入口

- 删除 Vite 构建时 `labVitePlugin.resolveId` 按 `labs/cm-html/lab.json` 覆盖业务模块逻辑。Lab `lab.json` 现在是 `{}`；任何非空 `modules` 都返回 `LAB_MODULE_OVERRIDE_FORBIDDEN`。
- 默认 Main 与 Lab 均从同一套 `ui/`、CMD/WCP/AG/CM6/Markdown/PDF/Settings 和 `scripts/v6_serve.py` 装配；归档 Lab 模块不参与活跃构建。
- 正式 Python server 的实验专用 `document-router.py` 业务路由动态加载已停用；Lab 的所有普通 API 与 Main 使用同一实现，只存在路径和独立数据作用域区别。
- 新镜像 worktree `experiment/cm-html` 从 Main 的完全相同 Git SHA 创建，没有实验初始化额外提交；原冻结实验 `experiment/virtual-chapters-wp0-2@043cbf5` 不变。
- 新 `scripts/v6_lab_publish.py` 必须检验 Git HEAD / 两种构建的实际 Rollup module graph 指纹后，才允许将 Lab 静态产物从镜像工作树晋升既有的 `/labs/cm-html/dist`；不会写入 `.runtime`。
- `scripts/v6_lab_worktree.py` 现可从 Main 或 Lab 工作树运行；未分叉同步使用 fast-forward，晋升检查先运行模块清单指纹校验与 Git merge-tree，不改动 Main。

## 真实构建与浏览器证据

在**同一源提交** `3ac3f110e86962f607139115a27dddd3fb04f628` 的镜像工作树分别运行 `npm run build` 与 `V6_LAB_ID=cm-html npm run build`。生产构建与实验构建均成功，分别得到 `v6-20261027-225414` 与 `v6-lab-cm-html-20261027-225443`。实际 Rollup module graph **155 个模块**，路径与源码文件内容 SHA256 一模一样，总指纹：

`7b30f0036cd809e53719105b73fb7077021b6876a5f2cf341aa21dee3eb75582`

`node scripts/v6_lab_parity_check.mjs cm-html` PASS，`python3 scripts/v6_lab_worktree.py parity-check cm-html` PASS，`merge-check cm-html` PASS (`ahead=0,behind=0`)。

`node tests/v6-lab-mirror.browser.test.mjs` 在**完全隔离的 Main/Lab 临时母文档与设置**上，以下四种条件真实点击 PASS：Main Chrome、Lab Chrome、Main iPad WebKit、Lab iPad WebKit。均可以展开新 Tom Select 导航、AG 取消/恢复「全部」、切换章节及进入全局设置，零 JS pageerror、零业务 API 写入。Lab 未带 `/labs/cm-html/` 前缀的 API 返回 404；GET 带有强 ETag，测试母文档与设置按字节未变。

## 实际 Lab 发布与服务迁移

原 Lab 端口 4408 的 launchd `com.laity.ocr2md.cm-html` 原先指向被冻结的 `experiment/virtual-chapters-wp0-2/.../chapter-server-launch.py`；现在指向 `experiment/cm-html/labs/cm-html/server.py` 的**同源码通用服务**，仍使用以前的静态路径和 `.runtime` 数据。改动有启动配置备份与失败恢复流程。

正式 Main 公网根仍是 `v6-20261027-221615`；内/外网 Lab `/labs/cm-html/` 均为 `v6-lab-cm-html-20261027-225443`。托管 Lab 数据 SHA256 前后保持：

- 母文档 `649c0de9ce82896ef2c7a04f4fea0cc79ade32d0657cc3ebc47cc9d9864ebe6f`
- 全局设置 `365284a9e9578cd134e27362a09d3ce0df6caac0565bf1981d9cdefc9070b7fe`
- Main 母文档 `c998da7aeea5410f1d7be10975c05e59efb5cdf6bfcf750595b27a048c5e3e19`
- Main 设置 `18fdc687751150f8f0c994c9889b36caf326c8e1482ddacededc6362e5c07c23`

**实际站点点击**：LAN Chrome / LAN iPad WebKit / Public Chrome 三端 PASS，现有 Lab 母文档均识别 6 个虚拟章节，AG「全部」可取消/恢复、Settings 可进入；无页面脚本错误或任何 API 写入。普通生产 Main 入口没有发布本次开发改动，历史 Lab 冻结分支亦未动。

## 注意

这是「镜像与可晋升」机制的系统验收，不等于所有 OCR2MD 业务回归项或 Grok/Muse 独立全量 AM/Git 审计已经完成。今后每个 Lab 完成开发仍须进行第 5～7 条要求的全部适用测试，正式发布还须遵守现有门禁。
