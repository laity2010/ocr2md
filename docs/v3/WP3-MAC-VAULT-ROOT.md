# WP3 — Mac 真实 Obsidian Root，Mac Safari / 外网 iPad Safari 双入口（2026-10-08）

## 结论与真实存储位置

**已实现 Mac 后端挂载**（不是 iPad Safari 的本机文件）

```
Mac Safari http://127.0.0.1:4176/v3-directory/
       ↘
        /__v3/fs (same-origin, Mac service 4176)
       ↗         │
外网 iPad Safari https://ocr2md.laity.bid/v3-directory/
                 ↓
Mac iCloud Obsidian Vault Root
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/
├─ ocr2md/      # 清洗工作区
├─ books/       # Obsidian 分类
├─ tools/       # 其他文件
├─ Bossco/
├─ excalidraw/
└─ .obsidian/   # v3 不读取、不写入
                 ↕ iCloud Sync → iPad Obsidian app 的库副本
```

一个 Root、一个 Mac WorkspaceFS 后端；只是 Safari 访问入口不同。当前 iPad 访问时 Mac 必须在线，公网经既有 Cloudflare Tunnel；iPad 浏览器不再以 IndexedDB 作为 v3 主数据源。

## v3 API 分界

前端：`src/v3HttpWorkspaceFs.ts` → `V3DirectoryController`，同源 `GET /__v3/fs?op=bootstrap|list|stat|read|capabilities|status`，`POST /__v3/fs/commit`。`bootstrap` 将 Mount+Root stat+首层目录合并在一次远程请求，减少高延迟 iPad 首屏 RTT。Mac 与 iPad 同一个 Web bundle，不需要按设备重打包。

后端：`ui-spikes/v2/v3_mac_vault.py` 独立模块，`dev_server.py` 仅新增 v3 路由调用和启动挂载，不接触既有 v2 ChapterProjectStore 或 v2 保存路径。

当前支持单次目录/文件新建、文件读取、复制、重命名、移动、单文件删除和空目录删除。**故意不支持**：整树删除、多操作原子批次、已有文件的覆盖写入（`replace-file`）、直接大体积文件上传、跨进程/iCloud 文件协调。文件新建和读取单次限制 512KiB；PDF 以后需要分块 Range 下载和流式 API。文件元数据 revision 包含 inode/mtime/ctime/size，提供顺序 CAS 冲突拒绝；**不保证外部 Obsidian/iCloud 并发修改的原子文件协调**，不能把这一阶段称为最终生产级编辑器存储。

`.obsidian` 与隐藏目录从 v3 隐藏并拒绝读写，拒绝 `..`、绝对越界、分隔符混淆与符号链接。不能重命名/删除 Vault 根级分类目录（可以在 Root 下创建新分类，除非用户手动新建）。单操作使用进程锁，创建文件用临时文件+硬链接原子 ifAbsent，结果以 Mac 私有 SQLite 文件保存 `requestId` 幂等回执；极端崩溃跨文件和 SQLite 双写窗口需后续恢复策略。

## 两端授权

本机 `http://127.0.0.1:4176` 直接访问；检测逻辑要求环回客户端、严格 Host、没有 Cloudflare/代理头。外网经过 Tunnel，即使上游环回也**不**给予 localhost 授权。外网读取和写入都要求私有密钥 `X-OCR2MD-V3-Key`，无授权 bootstrap 401、pair 403。

访问密钥生成/保存在 Mac `~/.ocr2md-private/v3-vault-access-key`，文件权限 0600。不进入仓库、不硬编码到 JS、不写进 URL。**Mac Safari** 打开 v3 后点击「在 Mac 显示配对密钥」，将密钥手工输入到 **iPad Safari** 的访问面板，点击「连接真实 Obsidian 库」。默认保存在浏览器 tab 的 sessionStorage；用户可主动勾选「在此设备记住授权」，改为 localStorage 并实现以后打开页面自动进入 Root。后者仅适用于私人可信 iPad。

当前设计仍然依赖已有 Web 站点完整性；它不是每位用户独立的多租户云认证系统。Mac 现有 v2 历史端点的权限模式并未由 WP3 重构。

## 真实验收证据

- Mac 已确认 Vault Root 是真实目录（当前包含 `books`, `Bossco`, `excalidraw`, `ocr2md`, `tools`），而非 Fixture/IndexedDB。`GET /__v3/fs?op=bootstrap` 从本机与已授权公网读取到 **完全相同** 的 `workspaceId=obsidian-ocr2md`, `root=/` 与目录集合。
- 未授权公网 `/__v3/fs?op=bootstrap` 返回 HTTP 401；公网 pair 返回 HTTP 403；本机 status 授权 true、公网 status false。
- 独立 Python 真实临时磁盘合同测试：`python3 ui-spikes/v2/tests/v3MacVaultSmoke.py` → 7/7 通过，涵盖根路径、隐藏目录、二进制写读、CAS 冲突、重命名、复制、删除、软链越界、幂等回执、认证。
- 独立 Chrome 实际 HTTP Web UI 测试：`npm --prefix ui-spikes/v3-directory run test:ui` → 经新建的**临时真实磁盘**完成登录、新建目录/文件、刷新回读、复制、删除，并保全 `.obsidian/` 文件。
- `npm test` 与 `npm --prefix ui-spikes/v2 run typecheck` 通过；v2 `/`, `/__workspace/chapters`, `/__workspace/directories` 均为 HTTP 200。
- Mac 本地 v3 静态 HTTP 200 单次 ~10ms、公网 ~1.6s；此处为单次样例，不代表 PDF 页面整段耗时。

## iPad 人工验收（仍未由用户确认）

1. Mac Safari 打开 `http://127.0.0.1:4176/v3-directory/`，检查真实 Root；点击显示配对密钥。
2. iPad Safari 打开 `https://ocr2md.laity.bid/v3-directory/`，输入密钥并连接；确认出现真实 `ocr2md/`, `books/`, `tools/` 等目录，不再是 `阅读/`、`示例书A/` 等虚拟内容。
3. iPad 在 `/ocr2md/` 下创建唯一测试目录，再新建 `.md` 文本并从页面读回；在 Mac Obsidian 文件树查看该文件，确认 iPad 改动实际写入 Mac 库。
4. 在 iPad Obsidian 原库检查 iCloud 同步后的同名文件；允许 iCloud 异步同步延迟。只读可以先验收，实际写入建议用户明确指定测试路径。

用户实机验收前不得声称「iPad 已成功操作并同步到 Obsidian」，只能说已通过 Mac/Chrome 自动化及真实公网 GET 验证。

## 沿革

`WP2-DIRECTORY.md`、`WP2-LOCAL-STORAGE-GATE.md` 是历史内存/IndexedDB 验收。自本航点起 **正式访问路径已切换到 Mac 真实 Vault**。旧 IndexedDB 内容仍在各浏览器内，不自动删除、不自动迁移，也不会参与真实 Vault 写入。先前试验用的 Obsidian Vault Probe 插件是另一条备选路线，仍默认未启用且 v3 Web 不依赖它。

## 真实工作库生产验收补记（2026-10-08）

- 通过 Mac 4176 API **仅新建**文件 `/ocr2md/v3-mac-real-vault-proof-20261008-44c894b9.md`；API 提交成功且 Mac 真实 Obsidian 文件系统上字节核验一致。
- 浏览器模拟 iPad (834px) 和 iPhone (390px) 经公网、输入同一个私有访问密钥，进入真实 `/ocr2md`，均找到该真实 Markdown 文件并读回内容一致。此为 **Mac Chrome 模拟设备尺寸，不是用户 iPad Safari 实机**。
- 在 iPad 尺寸 Chrome 中经公网操作入口创建另一份唯一测试 `.md`，Mac 文件系统检查内容吻合，证明经 Cloudflare Tunnel 的授权远程写入链路可用。
- 该临时文件初次从页面删除时因冲突/外部版本变化未从目录消失，测试保留为失败信号；随后仅对**自建测试文件**从 Mac 4176 重新获取最新元数据并提交删除，已核验不再存在。真实存储对外部改动保持严格 revision 阻止覆盖，UI 提供中文刷新重试提示；请勿将该次删除判作公网一次成功。未触碰任何既有文档。
- Python urllib 测试客户端经 Cloudflare 返回 403 / Error 1010 属于 Cloudflare Browser Integrity Check，**并非**业务后端未授权（未授权 bootstrap 返回 401）；真实 Chrome 浏览器经相同公网域名可完成授权目录读取和文件读回。
- 当前这份 Mac 真实验证笔记保留在 Obsidian Vault 中，供用户在 Mac/iPad Obsidian 文件树中进一步确认 iCloud 同步。待用户实机确认后可以手动删除。
