# OCR2MD V5 WP0 · 继承底座验收报告（2026-10-16）

## 最终结果

**WP0 底座通过；六个 V4 业务模块尚未迁移。** V5 的 WCP Loader 0.1.7（回退 0.1.6）、TriPane 0.2.1、ResidentHost 1.0.0 与 Dockview CSS 均继承版本化、SHA 固定的发布资产。业务注册系统采用 V4 的 manifest 自动发现逻辑；当前只启用 `ocr2md:bootstrap` 技术入口，其余 Settings、Filesystem、Workspace、Chapter Boundary、Chapter Cleaning、Media 在 WP1–WP6 独立逐项接入。

| 核验对象 | 结果 |
| --- | --- |
| V4 当前开发源 | 287 个文件 SHA 基线冻结，复核零变化 |
| V4 正式发布槽 | v4-261014-0816，原发布清单中 8 项资产一致 |
| V4 候选发布槽 | v4-261015-1846，原发布清单中 34 项资产一致 |
| V4 插件契约 | 6 个插件 manifest 冻结，源文件仍留在 V4 |
| WCP 官方发布版 | 0.1.7 + 0.1.6 回退资源，SHA 一致 |
| TriPane / ResidentHost | 0.2.1 / 1.0.0，SHA 一致 |
| 模块源码私有跨目录导入 | 0（WP0仅2份自有脚本的2项导入；非六插件最终审计） |
| Chromium / WebKit | 双引擎 WCP 0.1.7 挂载 12 项检查通过 |
| 浏览器 POST / 外部网络 | 0 / 0 |
| 仓库外独立运行 | /private/tmp 中仅复制 V5 + npm ci + Chromium/WebKit 通过 |
| V5 AEL 正负样例 | Settings 自身修改零越界；故意跨写 Workspace 标红 |
| V4、WCP、真实 Vault | 不修改、不发布、不重启，不触碰真实书籍 |

## 工程边界和下一航点

WP0 独立目录 `ui-spikes/v5-directory/`；发布版 WCP 资产存在 V5 自有 `vendor/`、`components/`，不需要 V4 的 JavaScript 源码，不依赖 V4 运行时。版本化的 Loader、CQE 接口、插件清单和基础 Shell 已有真实贯通。但 **V4 原有完整顶栏、Settings 样式、AG/源码/PDF 三窗与 Safari 手势尚未迁入 V5**，仍按各模块原 UIC 逐项继承验收；不能以 WP0 通过替代业务层通过。

AEL 采用一份 V5 专用 `.runtime/ael.sqlite`，内含每任务 `module/category`、变更路径和测试耗时，对照 MOPJO `AEL_REFERENCE_V1.json` 统一指标。WP0 的 tooling 任务创建了 Shell 与 bootstrap，因此账本会留下**预期的 BOUNDARY/SPREAD 警告**，不应假称“文件零扩散”；这些有意跨所有者的首次搭建例外不得推及 WP1 以后。首次 Chromium 无本机 Playwright 版本内置浏览器、首次 Shadow DOM 测试定位失败，也都留有真实失败测试记录；已分别修复为系统 Chrome 和 ShadowRoot 查询，重跑全绿，不能删改历史记录。

### WP1 Settings 起点

先执行 `python3 scripts/ael.py check`，再从 V5 项目根执行：

```bash
python3 scripts/ael.py begin --module settings --category migration --task 'WP1 Settings 迁移'
```

即使 `plugins/settings/` 尚不存在，AEL 也会根据 WP0 冻结的六个原插件清单授权这一迁移任务，然后才能开始修改 Settings 目录。接入时在同一候选中替换技术性 `bootstrap`，验证原 Settings 的状态、Undo/Redo、保存、AG + 源码 + 预览、TriPane/ResidentHost 的 UIC，以及模块特有回归。退出 bootstrap 引起的跨所有者变更必须如实记账，未来稳定后不能再以迁移为理由长期豁免模块边界。

**未执行**：Git commit/push、V5 网络发布、V4 正式/候选发布、Mac Vault 读写或真实 iPad 人工审核。
