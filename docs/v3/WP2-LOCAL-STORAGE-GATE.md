> **历史记录：** 2026-10-08 后 v3-directory 正式页面已改为 Mac 真实 Obsidian Root 文件 API。本文件描述先前 IndexedDB 实验，非当前线上工作区；请参阅 `WP3-MAC-VAULT-ROOT.md`。

# WP2 验收纠偏：真实 iPad 本地存储门禁（2026-10-08）

## 为什么补做

WP2 第一轮只用 `FixtureWorkspaceFS` 的 JS 内存对象做目录操作，刷新后重置；这**不是**用户要求的实际存储环境。不能以模拟目录验收替代真实持久化验收。

## 已实现的 Browser Local 真实存储（但不是 Obsidian Files.app）

演示网址：`https://ocr2md.laity.bid/v3-directory/`

- `src/v3IndexedDbWorkspaceFs.ts`：基于浏览器 IndexedDB 原生持久化工作区，Vault Root `/` 及 `/ocr2md/` 清洗区、根级成品分类，业务文件内容以 `Uint8Array` 存入本设备浏览器数据库。
- 以单个 IndexedDB `readwrite` transaction 读取当前快照、执行 CAS 文件变更、写回快照并等待 `oncomplete` 才回报保存成功；工作区之间彼此隔离，多标签页事务串行。适合小文件和目录的首次验证，不代表大 PDF 高性能；真实 PDF/多 GB 容量需要 WP6 专门测。
- 网页可输入新建文件正文，保存后选中该文件“从本地读取选中文件”回读；工作区切换、目录增删改移均在 IndexedDB 上提交。
- `ui-spikes/v3-directory/sw.js` 缓存验收页面 JS/HTML，首次联网加载后支持离线打开和读取已有 IndexedDB 数据。
- 浏览器的 `navigator.storage.persist()` 仅向系统请求保留存储，不承诺永不驱逐。Safari 私密浏览模式、清理网站数据、系统回收可能移除 IndexedDB；**不能存唯一重要书稿**。
- 样例根级分类与书籍仅在第一次创建该数据库时初始化；刷新或再次打开不会重新填充已删除的目录。演示中不会访问真实 iCloud/Obsidian 文件夹，不触发文件云同步。

## 自动化验收（Chrome 浏览器私有数据空间）

- `npm --prefix ui-spikes/v3-directory run test:persistence`：验证从 UI 写入带中文正文的 `local.md` → IndexedDB 原生查询存在且字节内容吻合 → Safari 类似 reload 后重新浏览回读正文 → 同 origin 第二标签页读到文件 → 断网后 Service Worker 缓存页面重新加载且能回读 IndexedDB 内容。
- `npm --prefix ui-spikes/v3-directory run test:ui`：目录 CRUD / Copy / Move / Delete / 未保存修改切换拦截。
- `npm --prefix ui-spikes/v3-directory run test:touch-public`：公网 iPad/iPhone 尺寸触屏 Chrome 仿真；**并非真实 iPad Safari 的设备级验证**。
- 构建及根仓库 TypeScript tests 持续回归；v2 生产目录和 WIP 不动。

## WP2 的真正缺口

目标 Root 是**用户已经存在的 Obsidian 库**（例如 iPad 文件 App 的 `Obsidian/ocr2md` Vault），其内 `/ocr2md/` 为书籍工作区，根级 `/阅读/`、`/学习/` 等是 Obsidian 分类目录。

网页 Safari 的 IndexedDB/OPFS 私有 Origin 存储**不是** `文件` App 的 Obsidian Vault，也不会通过 iCloud 参与现有 Unison/GD 链路。因此：

- “浏览器本地持久化”验收可以过关；
- “直接挂载真实 iPad Obsidian Vault 根目录并由 iCloud 同步”仍应标注**未实现/未验收**。下一步必须做 iPadOS 原生文件桥或研究确认有持久可靠的第三方 File Provider 接入；不能继续宣称纯 Web 能直接挂载任意 Obsidian 文件夹。

## iPad Safari 必须人工完成的操作

1. 打开验收网址；第一次进入应显示“本地存储：ocr2md-v3-local-vault-review-v1 (IndexedDB)”，首屏为 `vault-primary:/`。
2. 进入 `/ocr2md/`，新建 `ipad-local-验收/`；进入它，输入文件名 `检查.md` 和内容 `这是 iPad 实际保存的内容`，点击“新建文件并保存”。
3. **彻底关闭本网页、重新打开**，再次进入 `/ocr2md/ipad-local-验收/`，选中 `检查.md`，点击“从本地读取选中文件”，应显示原文内容。
4. 第一次联网打开且缓存成功后，短暂断开网络，在 Safari 重新打开同一页面，检查本地文件仍可读取。若 Safari 在离线导航时没有成功使用 Service Worker，记录失败，不降级为内存演示。
5. 用真实 Obsidian 打开原本的 Vault，应**看不到**新建的 `ipad-local-验收/`，这是该方案的明确限制，并非同步延迟。

状态：浏览器持久存储有 Chrome 自动化证据；真实 iPad Safari 操作仍为 `manual-external`，不得预先登记通过。

## 2026-10-08 收口日志

- 本机 Chrome HTTPS/HTTP 存储测试：文件字节持久化读回、刷新恢复、第二标签页读取、离线读回及离线新建文件后二次刷新均通过。
- **公网真实发布路径**（Mac Chrome）：`WP2_PUBLIC_URL=https://ocr2md.laity.bid/v3-directory/ npm --prefix ui-spikes/v3-directory run test:persistence` 同样通过离线读写/刷新测试。
- 公网触屏模拟：iPad 834px、iPhone 390px 页面 HTTP 200，目录操作通过，无浏览器端业务写入请求、JS pageerror 及横向溢出。
- `npm test` 与 `npm --prefix ui-spikes/v2 run typecheck` 全部退出 0；4176 原生产入口仍 HTTP 200，未重启。
- **状态判断**：浏览器本地持久化自动化通过；真实 iPad Safari 人工验收未通过或未反馈；真实 Obsidian Vault Root 挂载仍未实现，绝不可按通过计数。
