# OCR2MD V4 · 单发布源 / 本机、局域网、公网统一访问（2026-10-14）

## Feature Contract

**目标**：正式版、候选版各自只有一套物理运行文件；本机、内网 iPad、公网手机读取相同文件，并调用相同 Mac Vault 后端。不同版本只由**正式/候选发布槽位**决定，不由使用的网络决定。取消旧的 4292 复制发布及多条公开覆盖命令。

- **操作：从任一网络打开正式版/候选版。** 需要：根目录 `ui-spikes/v2/{v4-directory,v4-wp3-candidate}` 是唯一文件源；Cloudflare `ocr2md.laity.bid`→127.0.0.1:4176；局域网 FastDev 4292 的 v4 两个目录是该物理位置的符号链接，而非独立目录。效果：三个通道的相同发布槽位具有完全相同的 build-info、静态 HTML 和 8 个 manifest SHA。
- **操作：候选版发布或经用户明确验收的正式版晋级。** 需要：保持独立 staging + 审批/回退，发布前、后必须通过 `link-lan-origin.mjs --check` 物理路径/HTTP 哈希验证。效果：晋级后局域网链接自动解析新的 canonical 路径，**无需再做局域网发布**。旧的 `publish.mjs`、`release-public.mjs` 直接覆盖接口已失效；旧 `release-lan.mjs` 只能检查拓扑，不能再产生独立网页副本。
- **操作：iPad 通过局域网使用工作台。** 需要：Safari 安全上下文，使用绑定 Mac 局域网 IP 的 HTTPS 4443；Mac 本地证书签发私钥仅存 Mac，iPad 用户自主安装和信任本地根 CA 证书。效果：Web Crypto `crypto.subtle` 可用，WCP 能初始化；TLS 前端仅转发到同一 4292 的已授权路由，不生成另一份静态站。
- **数据不变量**：不更改 PDF、DIRjson、MD、Vault 授权键；4292 保留并使用已有 Origin 检验与客户端非回环地址转发；4443 对 POST 限定章节 API、Origin=https://本机局域网IP:4443、JSON、明确 Vault key 和请求体大小；不暴露私钥，不记录 URL query 或正文；4176 仍只监听回环，不因 LAN 改动开放生产后端。
- **安全说明**：局域网 CA 的根证书导出为公开 `.cer` 供设备安装，根私钥以 0600 存于 Mac 应用数据目录，决不在网页发布目录。信任自签根 CA 由 iPad 用户手动确认，不能自动替设备放宽 TLS 校验。证书签发有效期为一年，到期前须重新签发终端证书。Wi-Fi IP 改变时须更新 SAN/入口，不能忽略证书错误。
- **操作：回退**：正式/候选发布脚本保留其既有版本化 rollback 目录；两条局域网旧静态副本移到 `/tmp/wcp-tripane-lan-v4-20261013/retained-pre-unification-static/`，不再被 HTTP 公开，且**没有删除**。4392 以外的其他 WCP FastDev、其他服务/隧道不受影响。

## UI Interaction Contract (UIC)

| UIC | 初始状态 / 用户操作 | 预期用户界面与结果 | 副作用/边界 | 等级 |
|---|---|---|---|---|
| NET-01 | 本机 4176、内网 4292、局域网 HTTPS 4443 打开同一 `v4-directory/` | 都显示正式版 0816；读到相同资源字节 | 不重启公共服务、不改 Vault | 自动 HTTP/HTTPS 哈希 + `realpath` |
| NET-02 | 同三条路径打开候选 `v4-wp3-candidate/` | 都显示候选 1453；由候选发布更新后立刻同步 | 与正式版分离但各自只有一份文件 | 自动 HTTP/HTTPS 哈希 + `realpath` |
| NET-03 | 从局域网普通 HTTP 4292 访问 WCP | 部分 JS 初始化因非安全上下文而失败；必须引导用户使用 HTTPS | 不注入 WebCrypto 伪实现绕过浏览器安全限制 | WebKit 已复现旧 HTTP 失败 |
| NET-04 | iPad 信任 Mac 本地根 CA 后，通过 4443 打开候选 | WCP `ready/mounted`，AG 网格可用；`crypto.subtle` 存在 | 证书信任必须由用户手动完成 | WebKit+Chromium HTTPS 预检已通过；实体 iPad **待审核** |
| NET-05 | 未携带 Vault key 的 4443 POST 试图写入 | HTTP 401/403，不修改书库；可信页面的真正显式写入仍由后端规则鉴权 | 严禁裸 HTTP 携带 Vault key | 自动拒绝测试通过 |
| NET-06 | 构建/候选发布/正式晋级 | 改动一次对应 canonical 槽位，公网和 LAN 自动看到同一 build；禁止旧独立 `publish` 捷径 | 不允许开发构建自动晋升正式版 | 兼容脚本、发布门禁 UIC |

## 实际拓扑（统一后）

```text
                           Mac: ui-spikes/v2/
                    ┌─────────────────────────┐
                    │ v4-directory/    (0816) │
                    │ v4-wp3-candidate/(1453) │
                    └─────────────┬───────────┘
                 同一物理目录，两个发布槽位
      ┌─────────────────┼──────────────────────┐
 localhost:4176     LAN:4292 路径 symlink    Cloudflare TLS
      │                       │                ocr2md.laity.bid
      │             LAN:4443 HTTPS TLS               │
      └─────── 4292 受控 Vault 代理 ──────────────────┘
                               ↓
                Mac 4176 后端 / Mac Obsidian Vault
```

路由说明：`4292` FastDev 继续承载 WCP 其他独立开发页面，但其 OCR2MD V4 两条 URL 只是 canonical 的直链，不得再使用此服务单独发布 OCR2MD 文件。Safari LAN 访问必须从 **4443 HTTPS** 进入，4292 仅做内部代理与 CA 公开证书下载，不是完整工作台入口。外网由 Cloudflare 颁发公众信任证书；局域网 HTTPS 用独立 Mac CA，非同一主机名（后续可单独研究局域网 DNS 分流）。本次没有改变平台 WCP 远端 Loader 的依赖，所以离线时不保证全功能运行。

## iPad 首次 HTTPS 信任（人工）

1. iPad 已连接同一局域网，Safari 下载**公开证书**：`http://192.168.1.10:4292/ocr2md-lan-root-ca.cer`。
2. 根据 iPadOS 提示，在“设置 → 通用 → VPN 与设备管理”安装下载的证书配置；随后在“设置 → 通用 → 关于本机 → 证书信任设置”手动启用 OCR2MD Local LAN Root CA 的完整信任。根 CA 可为这台设备验证其他 HTTPS 主机，因此**仅在确认为自己 Mac 时信任**；若不愿安装根 CA，可继续使用公网域名 HTTPS。
3. 在 Safari 打开 `https://192.168.1.10:4443/v4-wp3-candidate/`；候选版本应为 1453，WCP 组件和 AG 表正常加载。真实书籍读写只有在用户使用现有 Vault 授权后才可用。
4. 正式版：`https://192.168.1.10:4443/v4-directory/`。公网对应 `https://ocr2md.laity.bid/{same-slot}/`；版本号自动一致。

## 代码与测试

- `scripts/link-lan-origin.mjs`：第一次迁移已有快照到非 HTTP 归档并建立两个 symlink；以后 `--check` 只读验证 realpath、build-info、8 个浏览器资源哈希。`scripts/release-lan.mjs` 已变为只读兼容检查。
- `scripts/build-test-push-ipad.mjs`：历史名字保留，但现在仅构建/测试源码，永不直接修改任何已经发布的 V4 槽位。
- `scripts/release-wp3-candidate.mjs` 与 `scripts/release-production.mjs`：保留原有审批/回退要求，增加两条发布路径指向同一物理文件源的前后验收。
- `scripts/lan-https-gateway.py`：只在局域网 IP 4443 启动，TLS 卸载并用 HTTP 代理到既有 4292，透传受控接口并验证 Origin；不维护静态副本。
- `scripts/setup-lan-https.py`：生成 Mac 本地 CA（仅一次）及受限 HTTPS 服务证书，创建 macOS 当前用户的 launchd LaunchAgent，并在 4292 暴露**根 CA 公开证书**。证书私钥在 Mac `~/Library/Application Support/ocr2md/lan-tls/`，权限 0600，不上传。

### 验收记录

- 2026-10-14：Mac 的 4292 旧版 `v4-directory` 和 `v4-wp3-candidate` 静态拷贝均归档移出 HTTP 根，两条 symlink 已连接 `ui-spikes/v2/`。`node scripts/release-lan.mjs --check` PASS；两个版本在 localhost 4176、LAN 4292、LAN HTTPS 4443 三条路线中分别一致，8 个静态 manifest 文件校验通过。
- 4443 根 CA 通过 SAN=192.168.1.10、完整证书链的 Python TLS 客户端验证；证书私钥权限 0600。经 Mac WebKit / Chromium HTTPS 预检，`isSecureContext=true`、`crypto.subtle` 可用，WCP `ready/mounted`、AG 网格存在。没有导入实体 iPad Cookies/Vault keys，因此 **iPad 证书安装和实际内网 HTTPS 验收仍待人工确认**。
- 4443 `GET /__v3/fs?op=status` HTTP 200 报 unauthorized；未经可信 Origin 的 `POST /__v3/ir/markings/commit` HTTP 403，拒绝非授权写入。该测试不会修改书籍或保存任何用户内容。
- 当前正式 `0816`、候选 `1453` 不变；WP4 正式晋升和实体 iPad 验收相互独立，不因网络路由合并而自动晋级候选。

## 2026-10-14 18:17 · 实体 iPad 局域网 HTTPS 首次验收

- 用户提交 iPad Safari 实机截图，地址栏显示 `192.168.1.10`，**已不再出现“此连接非私人连接”**，当前站点版本 `v4-261014-1453`，WCP 工作台已进入 `章节定界：/ocr2md/Buffett’s Alpha`。结合前述 4443 HTTPS 安全上下文浏览器验收，确认 iPad 已能通过局域网地址加载候选站点。截图不能单独证明 IP 层网络路由未经过 VPN；本结论只涉及局域网 IP 服务可用性。
- 工作台状态栏可见 `已恢复保存的 DIRjson · 224 块 · 人工补录 0 标题 · 来源校验通过（未重算 OCR 初始化）`，AG 标题表、MD 源码、PDF 原文三窗均可见。真实文档加载说明网络、WCP、业务组件及当前 Vault 授权流程整体可用。
- **NET-04 实体 iPad 开启成功：PASS**。本轮仅确认可读、可展示，不把此截图视为对章节保存/发布写入行为的验收。
- **UI 回归待修**：章节定界 AG 表为明显白底，WCP 框架/MD 源码/PDF 显示区域采用深色主题；应归入章节定界模块的局部 CSS/AG 主题修复，不因此再次分叉公网与 LAN 发布目录。
- WP4 正式晋级仍需其自身审批门禁；候选 `1453` 的 LAN 读写显示验收不代表正式 `/v4-directory/` 已晋级。
