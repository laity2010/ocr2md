# OCR2MD · 单一发布入口和 V4 冻结规则（2026-10-17）

对外唯一入口：`https://ocr2md.laity.bid/`（根 URL，无 `/v5-directory/` 等版本路径）。**默认开发/本地 iPad 验收使用内网 `https://192.168.1.10:4443/`，iPad 在外网时才使用公网 `https://ocr2md.laity.bid/`。这不是两个版本或两个发布目录：前者通过 `scripts/lan_https_proxy.py` 的 TLS 代理指向相同的 `127.0.0.1:4385`，后者通过 Cloudflare 也指向此网关。两端返回完全相同的 `release-info.json` 和静态 SHA。旧 V4 4443 网关禁用，新 V5 LAN 服务单独注册同一端口。**

唯一实际对外发布目录是仓库 `.runtime/ocr2md-public/`，**不由 Git 跟踪**。V5 源码位于 `ui-spikes/v5-directory/`，其中 `scripts/publish-single-release.py` 只复制运行资产并原子切换发布目录，旧目录备份移动到 `.runtime/ocr2md-release-rollback/`（仅供回退，不对外提供）。唯一静态网关是 `scripts/release_gateway.py`，LaunchAgent 为 `bid.laity.ocr2md-v5-single-gateway`，仅侦听 Mac 回环 `127.0.0.1:4385`。Cloudflared 原有共享 tunnel `ocr2md.laity.bid` 的 ingress 仅从 4176 改至 4385，未触碰其他主机名。

V4 原开发源码、未提交 WIP 与原正式/候选发布快照仍然保留，`verify-v4-freeze.mjs` 核验 287 个冻结 SHA 文件和历史发布资产。V4 公网 `/v4-directory/`、`/v4-wp3-candidate/` 以及历史 `/v5-directory/` 返回 410；不可通过发布服务访问旧资产。V5 通过 [UI_V4_INHERITANCE.md](./UI_V4_INHERITANCE.md) 继承 V4 顶部三层布局和组件样式。V5 当前开发版只有 `settings` UI 处于注册状态。旧 `filesystem` 混合服务因工作目录尚未接入且含越界文档语义已停用注册，并由发布器从可访问文件中剔除；历史源码留档供审计。

V5 WP2 无书籍修改入口。网关只转发 `/__v3/fs?op=status`（授权状态，不含目录信息）；`list`、`stat`、`read`、`pair`、`bootstrap`、其他 API 和任何写请求全部被拒绝，因为后端把 loopback 连接视为本地授权，绝不可由公网代理直通。后续 WP3+ 若要增加命令，必须先编写功能契约、授权与 CSRF/来源验收，再显式增加代理白名单，不准笼统转发 `/__v3/`。

验证：`node tests/wp2-contract-isolation.mjs`、`node tests/wp2-browser.mjs`、`npm run test:lan`（默认）及需要远程回归时 `npm run test:remote`；公网 `GET /` 200，旧 URL 410，`GET /__v3/fs?op=pair` 403，`GET /release-info.json` 显示两模块。实机截图使用仓库 `scripts/ipad_safari_capture.py --url-contains 'https://ocr2md.laity.bid/'`，其内页面标题必须是 V5。

回退只用于 V5 事故恢复：Cloudflared 的 ingress 备份单独保存在受限权限的 `.runtime/cloudflared-ocr2md-before-v5-*.yml`；发布目录旧内容在 `.runtime/ocr2md-release-rollback/`。回退必须明确说明是否重新开放旧 V4，不能悄悄恢复多入口。

## 固定开发和发布流程

开发和实机验收的**默认入口始终是内网 HTTPS** `https://192.168.1.10:4443/`；iPad 离开局域网时才切换 `https://ocr2md.laity.bid/`。两个入口是同一个 V5 网关发布进程的两个网络到达路径，不是独立部署，也不对用户展示 `/v5-directory/` 等版本目录。

调整模块：先在 V5 源码目录运行模块测试与 `npm run test:lan`；验收通过后只运行一次 `python3 scripts/publish-single-release.py` 更新唯一发布目录。发布后运行 `npm run test:parity` 确认 LAN 和 Cloudflare 的页面、脚本、V4 继承样式、共享组件及发布哈希全一致。最后用 `scripts/ipad_safari_capture.py --url-contains 'https://192.168.1.10:4443/'` 截取真实 iPad Safari 的内网页面，AgentDock 原生图片卡验收。公网只做必要的远程连通复验，不再作为每次开发默认访问地址。

只有一个 release 根目录 `.runtime/ocr2md-public/`，LAN TLS 仅负责代理，不存在独立的 LAN 构建目录。TLS 使用既有受信任的 Mac LAN 根证书，不重新签发、不降级 HTTPS。公网通过已有共享 Cloudflare 隧道；其他项目的隧道配置保持不变。

## 开发阶段新构建立即上线（2026-10-17）

用户决定 OCR2MD V5 当前没有“候选与正式发布”分级：通过必要的模块边界、冻结基线和浏览器检查，新构建**立即覆盖单一**开发入口 `https://192.168.1.10:4443/` / `https://ocr2md.laity.bid/`。

发布器 `python3 scripts/publish-single-release.py` 从 `agent-link-monitor/shared-settings/src` **权威源码**构建最新 Settings 开发包，将结果及只作用于本 V5 的 manifest 放进原子 stage，不提升中央 stable 指针，不写入中心共享发布目录；WCP AppFrame 缓存必须与其已构建权威包完全一致。旧发布快照存入 `.runtime/ocr2md-release-rollback/`。

开发验收：`NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/ocr2md/lan-tls/root-ca.crt" node tests/live-dev-ui.mjs`（LAN Chromium/WebKit 实际运行），`python3 tests/single-release-parity.py`（内/公网 9 个资产字节一致及 410/403 安全边界）。如回归失败，用前一发布快照恢复单一入口，不启用历史 V4 多入口。

发布模块集合不得在 `release-info.json` 手写；发布器从当前 `plugin.json` 中仅采集 `enabled` 的模块并交叉核对生成注册表；`disabled` 的业务目录不会进入公开发布包。旧发布快照继续保留作回滚。

## 已打开页面的开发构建自动更新（2026-10-17）

浏览器已打开的旧 JS 不会由于服务器替换发布目录而自动重新执行，`Cache-Control: no-store` 只能保证**下一次网络请求**新鲜。Shell 引用 `assets/app-live-update.js`，每 15 秒通过同源 `release-info.json?updateCheck=<时间>` + `cache:no-store` 对比发布 `buildId`，并在 Safari `pageshow` / `focus` / `visibilitychange` / 恢复在线时即时复查；版本改变则自动 reload 当前页面，始终指向内外网唯一开发入口。

保存安全：先通过模块 `isDirty()` API 查询未保存修改，若有草稿则只提示“发现新构建，请先保存”，不执行刷新；接收 `ocr2md:v5:ui-settings-saved` 后立即复查并加载新构建。Settings 独立适配器比较公开 `values`、`sourceText`、`disabledIds` 对应最近保存快照，不再错误地将“可撤销历史存在”当作未保存草稿。断网与后台定时器暂停不会破坏页面状态。**第一次从尚未内置监听器的旧页面升级时，仍需手动刷新一次；以后有新构建时可自动生效。**

隔离验收 `node tests/app-auto-update-browser.mjs` 用 Chromium、WebKit 模拟服务端原子版本替换，覆盖闲置自动更新、未保存保护/保存后更新和 Safari 回前台；线上验收 `tests/live-dev-ui.mjs` 验证真实网络版本检测发起以及设置初始清洁状态。

## 更新器归属修正：WCP AppFrame 1.0.2

此版本起原 `assets/app-live-update.js` 已移除；自动更新由 WCP AppFrame 公共 `frame.watchBuild()` 完全负责。之前本文件描述的版本检测、Safari 恢复、草稿保护仍有效，但**唯一权威代码**是 WCP 仓 `src/component/app-frame/index.js`。发布时检查 WCP 1.0.2 的 JS/CSS 中心不可变SHA、V5 镜像完全匹配，并保证不存在另一份更新器源码。

## WCP Core + AppFrame 一份清单（0.1.8）

部署器校验 `web-component-platform/published/components/v1/manifest.json` 的 `stable=0.1.8`；同一条 `releases/0.1.8` 内包含 `wcp-workbench.js`、`app-frame.js`、`app-frame.css` 的真实 SHA。V5 使用唯一 `vendor/wcp/components/v1/loader.js` 启动两种内部模块，旧独立 AppFrame `components/app-frame` 历史镜像不进入线上发布；`release-info.json` 统一记录 `wcpVersion`。WCP 发布只运行 `node scripts/publish.mjs 0.1.8`。此前提及两个独立 WCP 版本的章节仅为历史开发记录。
