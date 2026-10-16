# OCR2MD V5 · V4 继承契约（WP0）

## 继承的是真实架构，不是重新研发六个模块

V5 继承 V4 已经使用的 **WCP Loader / CQE / manifest 自动注册 / external Chrome / ResidentHost / TriPane / 统一按钮与状态契约 / 功能 UIC / AEL** 设计与版本化公共组件；逐一迁入业务模块时，应复用 **已发布且验明 SHA 的第三方组件**，不把 V4 业务源码散落复制到 Shell 或其他插件。V5 不加载 V4 未迁入的插件实现，也不持有 V4 的真实 Vault 授权。

当前 WP0：只有 `ocr2md:bootstrap` 技术性占位组件；它不是迁移完成的业务模块，**WP1 将由 Settings 正式模块替换**。目前仅 WCP Loader 真实运行与模块发现得到验证；完整 V4 顶栏、三窗样式及设备手势必须在各 WP 按继承契约逐项验证，不能因为 WP0 壳加载了就声称已完整继承。

## 基线三元组（不可混用）

- Git HEAD 记录于 `baseline/v4-freeze.json`；此文件带有开发树中已存在的 WIP 路径列表与 **287 份文件 SHA**，不改变、清理、覆盖 V4 未提交数据。
- 原正式发布槽 `ui-spikes/v2/v4-directory`：**v4-261014-0816**，原候选发布槽 `ui-spikes/v2/v4-wp3-candidate`：**v4-261015-1846**。各自原 manifest 中列出的资产在 WP0 快照时 SHA 对齐。
- WCP 公共组件使用 V4 已镜像、发布过的 **0.1.7**，保留 **0.1.6** SHA 验证回退版本；V5 把必要发布字节固化为独立只读镜像，绝不引用、编写、修改 WCP 内核源码。
- V4 实际使用的 **TriPane 0.2.1**、**ResidentHost 1.0.0**、Dockview 样式与官方组件清单亦按发布字节 SHA 固化于 `components/`，详细见 `baseline/wcp-ui-pinned.json`；WP1 引入 UI 时只能复用这些独立组件，不能重造三窗/驻留。

## V5 WP 航点和拥有者边界

| 航点 | 独立所有者 | WP0 之后的准入条件 |
|---|---|---|
| WP1 | `plugins/settings` | 保留 V4 UI 与设置状态的原有功能/UIC；设独立 AEL；Bootstrap 技术占位退出 |
| WP2 | `plugins/filesystem` | 独立授权 CQE 服务，隔离旧 V3 控制器；拒绝未经批准的真实 Vault 写入 |
| WP3 | `plugins/workspace` | 依赖 FileSystem 公共契约，解除 V2 AG 私有实现绑定 |
| WP4 | `plugins/chapter-boundary` | 三窗、章节定界及 PDF/MD 定位、原件保护、旧版行为全回归 |
| WP5 | `plugins/chapter-cleaning` | 接入独立 MOPJO，Node 文件服务实现 delta-only CAS；保留标题/媒体/表格/公式 UIC |
| WP6 | `plugins/media` | 内聚媒体能力，组件可单独禁用、隔离和测试 |

业务插件全部通过 `plugin.json` + `index.js` 注册、接收 WCP host 和 CQE bus；其他插件只通过具有 schema/version/sender/receiver 的消息契约通信。禁止直接 import 其他插件源码、Shell 中写死业务 ID、WCP 反向 import 业务代码；只有认可的公共组件/外部 npm 包可以依赖。每个模块只修改自己的 `plugins/<owner>`（含本模块 AEL 对应测试），非本模块文件变动须按例外审计。

所有模块使用一致的审计字段：module、category、changedFiles、boundaryWarnings、spreadWarnings、tests（exit、seconds）、elapsedSeconds、原件 SHA 与回归结论；和 [MOPJO AEL 参考](../../packages/mopjo/AEL_REFERENCE_V1.md) 对照，但 **369 项测试、25 文件及 95.48 秒不是所有模块必须遵守的门槛**。

## WP0 不做

不迁入 Settings/Workspace 等 6 个业务插件，不改变 V4/WCP；不更新任何 V4 发布槽；不重启旧服务；不复制用户原书；不写 Vault、不请求用户凭据、不打开任何生产读写接口；不强制推送、不清理任何原有 WIP。**V5 的开发源入口独立于 V4 的发布目录，不意味着已有公网/内网地址指向 V5。**

