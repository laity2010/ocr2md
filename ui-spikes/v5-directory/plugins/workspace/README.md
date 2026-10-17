# 工作目录 · V5 已注册独立导航组件

本目录从冻结的 V4 工作目录提取，现已通过标准 manifest 接入 V5。只负责**目录导航、目录选择和文件元数据展示**，不读取文件正文、不解析 DIRjson、不判断章节或 PDF 数量，也不提供写操作。复用已有 AG Grid、共享源码组件（仅显示元数据）与 WCP TriPane。

## 唯一所有权与交互边界

- `workspace.js`：工作目录页面的 DOM、AG、源码窗、工具条、选择及生命周期；通过公共 `components/resident.js` 的 `ResidentHost` 在页面会话内维持一个模块自有的常驻视图，显示时只绑定 WCP 传入的 `host` 定位锚点，隐藏时保持 AG、CodeMirror、Dockview 的 DOM 连接及实例，不访问 WCP 内部节点。**不能使用 V4 专有 mount/toolbar 锚点，也不能自行创建全局悬浮层。**
- `workspace-grid.js` + `ag-grid-base.min.css`：来自 V4 的 AG Grid 已构建组件和样式，只作为 workspace 自己的内部视图。`vendor/shared-source` 是 WCP 公共只读源码组件；`components/tripane.js` 是公共布局组件。
- `directory-service.js`：内部 `ocr2md:directory` 服务，标记 `inventoryRole:'internal'`，仅通过授权网关使用 `GET /__v3/fs?op=status/list`，选择只改变内存状态并发布 `workspace.selected({path})`。WCP 组件清单及诊断仍保留它，V5 面向用户的 Settings 清单不再展示其空白占位行。
- `directory-contracts.js`：唯一对外 WCP CQE v1 契约。UI 不直接 `fetch`、访问其他插件或改动全局状态。
- `index.js`：统一导出 `modules=[directoryModule,workspaceModule]` 和对应 `contracts`，无业务注册逻辑分散到别处。

`plugin.json` 为 `enabled=true`，通过 WCP 实际组件注册而非手工补目录条目；Settings 通过公开目录接口生成无参数的空白占位行。旧 `plugins/filesystem` 混合 DIRjson/章节文件服务继续禁用并隔离。V5 网关在转发时主动禁止旧后端回环免密特权，强制后端验证 Vault 访问密钥；禁止 `pair/read/stat` 与全部写入。密钥仅存浏览器 sessionStorage，不经 WCP 消息公布。

## 隔离与网关验收

```sh
node plugins/workspace/tests/ownership-gate.mjs
node plugins/workspace/tests/independent-lifecycle.mjs
python3 tests/workspace-gateway.test.py
node tests/wp2-component-candidate.mjs
node scripts/check-plugin-boundaries.mjs
node scripts/verify-v4-freeze.mjs
```

隔离生命周期测试在 Chromium 与 WebKit 中验证安装、授权、AG 列表、元数据、目录选择、双击进入、WCP tab 切换、卸载和重装。网关回归验证只有携带有效密钥才能列目录，配对、正文读取、越界路径和写入都无法转发。隔离测试不读取真实 Vault，也不写文件或 MOPJO。

**工作目录 1.3.2 切换语义：** 首次进入读取目录；切去设置时常驻视图隐藏但不拆卸组件，切回来只重新显示已有视图（原 AG/源码 DOM 与编辑器实例不变），不重新检查授权、不请求目录、不显示短暂空白；用户点击「刷新」才重新读取当前目录，双击进入新目录时读取该目录；浏览器整页重载则重新初始化。已授权时连接表单必须确实隐藏（`[hidden]` 不被 flex 样式覆盖）。Chrome/WebKit 的回归以视图身份、连接状态、目录请求次数和点击刷新后的真实请求为验收依据。

**1.3.3 样式隔离审计：** 常驻视图使原来只在工作目录激活时存在的 `ag-grid-base.min.css` 一直连接到 DOM，其未限定模块的 AG Grid 默认浅色选择器会覆盖 Settings 的深色 AG 样式。工作目录离开时必须把该样式链接的 `media` 切为 `not all`，恢复时切回 `all`；保留编辑器与布局实例，不让工作目录 CSS 对 Settings 等外部组件继续生效。Chromium/WebKit 生命周期测试检查该媒体状态；真实设置页切换后的 AG 色彩仍需浏览器回归验收。

**实机待核：** 使用 iPad Safari 的已有授权会话或用户自行输入密钥，验证真实 Mac Vault 的目录导航和路径选择。

## 可选的 30 天记住设备（V5）

- Settings 的「工作目录 / 授权 / 记住此设备 30 天」为**真实布尔设置**，默认 false；保存后才生效。选择 true 且当前已输入有效密钥会立即签发，未登录时则在下次成功输入 Vault 密钥后签发。
- 授权网关 `scripts/remember_device.py` 负责短期签名令牌及过期校验；浏览器仅保存主机独有的 `__Host-ocr2md-workspace` HttpOnly、Secure、SameSite=Lax Cookie，有效期 30 天，绝不把原始 Vault 密钥放进长期浏览器存储。浏览器关闭后凭证仍有效，直至到期或 Vault 密钥轮换。
- 切换为 false 并保存，会调用仅当前站点可访问的 `POST /__v5/auth/remember` 删除此设备 Cookie；**不会**销毁当前窗口的临时 sessionStorage 登录密钥。
- 内网 IP 与公网域名分别具有第一方 Cookie，不共享授权。服务端只在有效 Cookie/密钥下开放 `GET status/list`，其它 Vault 文件读取和写入接口继续禁止。
- 目录服务只通过公开的 `wcp:settings:read-v1` / `wcp:settings:changed-v1` 事件获取布尔参数，不依赖 Shared Settings 私有属性或存储键。

人工验收：关闭 Safari 后重新打开已授权过的同一站点，工作目录无需重新输入密钥；撤销设置保存后清除此站点 Cookie，关闭该窗口再开新会话必须重新授权。原始证据及未提交 WIP 不更改。
