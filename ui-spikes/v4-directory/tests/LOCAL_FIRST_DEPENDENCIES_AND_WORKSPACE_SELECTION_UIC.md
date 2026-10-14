# OCR2MD V4 · 就近加载公共依赖 / 工作目录 AG 单选 UIC

日期：2026-10-14。基线：正式 0816；候选 1932。用户明确要求优化局域网启动，并将工作目录 AG 样式匹配设置 AG，且对选定目录显示唯一的单选标记。

## Feature Contract（操作 / 需要 / 效果）

1. **操作**：打开任一 OCR2MD V4 发布槽位（Mac 4176、LAN HTTPS 4443、公网 HTTPS）。**需要**：同一 canonical 槽位下携带独立组件正式发布字节镜像 `vendor/`，启动时优先使用相对路径。**效果**：无需先请求外部 `wcp.laity.bid`、`agent-link.laity.bid` 才能呈现工作目录；公网和局域网依旧相同文件源。
2. **操作**：加载 WCP。**需要**：从现有 WCP 已发布的 manifest 和 immutable release 字节复制，编译时核实所有 release SHA256+size；WCP Loader 原封不动、`crypto.subtle.digest` 对 manifest SHA 验证照旧，WCP 自带 previous release fallback/dirty guards 照旧。**效果**：只改变读取路径，不修改 WCP 行为。若本地 Loader 资源不可用，可以从原官方地址恢复；若 manifest/已签 SHA 校验不一致，必须失败关闭，不得跳过完整性检查。每次 OCR2MD 候选构建从官方本机已发布仓库重同步组件的 stable/previous 版本；不越权更新任何 WCP、Shared Settings 或 Source 项目。
3. **操作**：加载共享源码/设置组件。**需要**：镜像设置组件所有 manifest 声明的 stable/previous 资源及源文件；设置模块使用自己的实例设置 `source-module-url` 指向相同 local source 镜像。**效果**：工作目录不再等待公网编辑器；用户转设置时预热后的设置 AG、源码仍可用。页面先完成工作目录再触发后台设置预热，不使用 WCP 内核管理业务 UI。
4. **操作**：工作目录在 AG 表单击一项目录前的新单选指示。**需要**：仅目录行有 radio，列锁定左侧且不可拖动，业务模块保留 `selectedDirectory` 独立于文件预览的 `selected`；双击目录仍可进入，单击文件仍可查看详情。**效果**：所有目录项同一个 name 分组且至多一个 checked；选中 A 后选 B 即切换；点选文件不清空原目录指示，点击「设为工作目录」使用选中目录；进入新目录列表重置当前选择。
5. **操作**：设置 ↔ 工作目录 ↔ 章节定界。**需要**：每个模块仍维护自己原 AG 实例，沿用 Dockview/ResidentHost；不引入 shared view manager。**效果**：工作目录 AG 与设置 AG 共享背景 `#1d2732`、表头 `#253343`、文字 `#dbe5f0`、Sarasa 字体；章节定界保留自身深色和标题红色；工作目录的选中目录在切换回来时完整保留。

## UI Interaction Contract

| UIC | 初始状态 | 用户操作 | 预期显示与状态 | 数据副作用 | 自动验收 |
|---|---|---|---|---|---|
| WCP-FAST-01 | 新会话无已缓存的公开模块 | 从局域网 HTTPS 打开候选 | 首屏工作目录可见，读取 WCP/Shared 的起始请求都在当前 V4 origin；WCP `ready`，无跨域 WCP 请求 | 不访问真实 Vault | WebKit/Chromium 静态源、模拟目录 HTTP 只读；真 iPad 待确认 |
| WCP-FAST-02 | 候选编译 | 同步公共发布依赖 | SHA256/size 检查，manifest 所有 WCP 版本仍被镜像保留；build-info hashes 覆盖 vendor 字节 | 不写上游发布仓库 | 构建与发布 manifest 校验 |
| WS-RADIO-01 | 目录列表含 4 目录 1 文件 | 单击第二目录、再选第三目录 | radio 只有 1 个选中，指向第三目录；文件行不提供 radio；左侧固定列 | 仅业务模块内临时选择，不修改 PDF/MD | WebKit/Chromium |
| WS-RADIO-02 | 第三目录选中 | 切到设置，再切回工作目录 | 原目录仍选中，设置 AG 与工作目录 AG 背景一致，五项可见 | 目录状态不落盘 | WebKit/Chromium |
| WS-CSS-01 | AG Grid 全局结构 CSS 已存在 | 打开工作目录/设置/章节定界 | 工作目录、设置共享暗色和 Sarasa；章节定界独立颜色 | 不改其他业务模块 CSS | 浏览器样式检查 |
| WCP-FAST-03 | 公网组件不可用/有完整性错误 | 新建会话 | 本地镜像支持启动；本地 Loader 不可用才尝试官方 URL；SHA 不符不得运行非法内容 | 无凭据及书库写入 | 自动模拟网络断开及原有 WP2 failure/rollback 门禁 |

## 安全/发布限制

- 原有 `v4-directory` 正式发布、v3 和 Obsidian Vault 不变；候选执行受控构建/门禁，用户 iPad 验收后才正式晋级。
- 单机 WCP 发布资源镜像不等于复制另一份 OCR2MD 网页，不新建 HTTP 根、无局域网单独发布：公网 / 4176 / 4443 使用相同的 V4 槽位下 vendor 目录。
- WCP 自动升级检查仍使用该构建的**完整正式发布 manifest**，可以接受此发布包内的版本及 previous 回退；**新上游发布版本要通过下一次 OCR2MD 构建/发布同步，不承诺不更新 app 就热升级 WCP**。此为有意选择的可复现版本固定，不绕过 WCP SHA 规则。
- 不能用外网断开演示取代真实 iPad LAN HTTPS；用户仍需真机检查首次可见时间、真实 Vault 鉴权后的文件列表及 radio。

## 实测记录（逐项更新）

- 基线：LAN HTTPS 小资源 16–20 ms，公共组件需多个公网请求；WebKit 首屏工作目录 7.8 秒。Playwright 使用相同 WCP 本机发布字节的对照实验约 2.0 秒。
- 新源码隔离测试：WebKit 约 1.9–2.1 秒，Chromium 约 5.6–8.8 秒（冷启动波动），工作目录 5 行可见、4 个目录 radio 且唯一选中，切换设置再回来选中不变；设置 AG 与工作目录 AG 都是 `rgb(29,39,50)`；没有 WCP/Shared 跨域请求、JS 错误或写操作。**这些计时不是实体 iPad 结果。**
- 受控候选 `v4-261014-2015` 已发布（原候选 1932 完整备份保留），**正式版 0816 未动**。`--upgrade --local-fast-start` 门禁核对完整发布差异 32 项，其中 26 个 vendor 文件；全量发布包 170 文件，build-info 34 个 SHA。升级/Loader failure/retry/registry failure/mixed assets 门禁 6/6 PASS；WebKit+Chromium 5 行布局、深色、空白 pinned spacer 故障注入回归 PASS；两引擎目录单选、设置深色与切换状态保持 PASS；公网与 LAN 同槽位字节 SHA 一致。
- 发布后 LAN HTTPS 4443 WebKit 只读隔离冷启动约 **3.25 秒**到工作目录 mounted/ready；基线为约 7.8 秒。该真实 LAN 线路上未触发 WCP、Shared Settings、Shared Source 的公网请求；Mac 自身浏览器代测，非 iPad 实机耗时。不同设备和网络下时间仍有波动。
- 实体 iPad：**待用户审核**，重点检查首屏延迟、4 个目录唯一单选、单击目录与双击进入、设置与工作目录同色、切回保留已选目录；只有人机真实点击验收后再考虑正式晋级。
