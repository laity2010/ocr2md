# CHAPTER-FASTLOAD · WP0–WP6 Feature / UIC 与候选门禁

## 冻结的功能契约
- 操作：选定已保存书籍、进入章节定界。需要 Mac Vault 已授权、不可变 DIRjson 指针与可校验书籍版本。效果：若存在同代 **明确准备的** 派生工作数据，则仅通过 CQE 从专用 GET 加载 `chapter-index.v1.json`、`whole-book.md` 和当前章节侧车标定，AG 与源码优先呈现，无完整 DIRjson 请求；缓存不存在、损坏或错代就自动降级原本 `loadIrSnapshot()` 只读可信路径，绝不重做原始 OCR 导入覆盖已有 IR。
- 操作：旧书籍首次进入，用户点“准备工作数据”；或用户首次保存 DIRjson 后明确点此按钮。需要已有可信 generation 和无未保存编辑。效果：Mac 在 `.ocr2md/chapter-work-cache/<generation>/v1/` 通过 staging + 原子目录发布 **可重建的** index、MD 和 manifest；完整校验 OCR/PDF SHA；绝不修改已有 DIRjson、章 map、PDF、OCR、`chapters/`。普通 GET、进入模块、切换标签严禁隐式写入。
- 操作：勾选独立成章、更改章节文件名/编号、保存。需要正确当前 generation + markings revision。效果：AG 局部更新，保存只由专用 CQE CAS 写 `chapters-map.v1.json` 小 JSON 并读回语义确认；不传输完整 DIRjson、ZIP。切换模块 ResidentHost 保留草稿。
- 操作：人工发现漏章，需点击“启用源码编辑”。效果：**明确按需**重新读取真实完整 DIRjson，核对 sha/代际/标定 revision，在未丢失当前小标定草稿前提下提供源码增删改、补录、审核，仍沿用完整快照 CAS 保存；不把富媒体或正文修改挤进章节小 map。
- 操作：明确发布章节。效果：沿用后端当前可信保存版本+章节 map 生成 `chapters/*.md`，原 PDF/OCR、DIRjson 不动，旧章节完整备份。缓存仅优化加载，绝不成为发布权威来源。

## 派生索引约定
- `chapter-index.v1.json`：`kind=ocr2md/chapter-work-index`、`schemaVersion=1`、`book`、`baseGeneration`、`irSha256`、`projectionProfile`、`document`（去除仅用于回放 OCR 的原始大字段但保留可经旧 IR 校验的 block/source/定位）、`headings[]`、`ranges[]`。
- `whole-book.md`：从同代快照已有的受控 Obsidian 文本、按 `readingOrder` 连续投影。每个块由旧 `<!-- ocr2md-ir:block=... -->` 锚点定位。
- `manifest.v1.json`：文件 SHA256、块数、书籍/代际/投影版本、源 PDF/OCR 版本元信息。MD 与索引作为**非权威工作视图**，可根据不可变 DIRjson 重建；标定侧车永远不作为缓存删除。
- 所有 ranges 用 JS **UTF-16 单位**，包含始末位、来源块、PDF 页/bbox 等；不能把“只有 H1 的表”误认为完整 PDF→MD 映射。

## UIC 验收
| UIC | 初始 / 动作 | 预期副作用与不变量 | 实验 |
|---|---|---|---|
| FAST-01 | 全书已保存、首次无缓存，打开定界 | 只读降级旧 IR，无隐式准备，原数据不写 | 原 V4 WebKit/Chromium BND-02 |
| FAST-02 | 明确准备，之后刷新/返回定界 | 首次准备生成两份派生数据；缓存命中 0 次 `/__v3/ir` 完整读；AG/源码/PDF 正常 | `v3IrWorkCacheSmoke.py`、`chapterFastloadBrowser.mjs` |
| FAST-03 | 缓存命中后取消/勾选独立成章，再保存 | 单次小 sidecar CAS，0 ZIP 上传，0 自动缓存写，CAS 读回一致 | 双浏览器真实原书副本；`markingsReadback.test.mjs` |
| FAST-04 | 缓存命中后点击“启用源码编辑” | 只此时读取完整可信 DIRjson，页码/块 ID 不变；CodeMirror 可编辑 | 双浏览器 `chapterFastloadBrowser.mjs` |
| FAST-05 | 来源 mtime/size 改变、缓存 SHA 损坏、错误 generation | 缓存不得命中；内容不删除、不覆盖；用户原始 DIRjson/chapters-map 原样 | `v3IrWorkCacheSmoke.py` |
| FAST-06 | 未准备缓存时直接使用旧界面、跨模块返回/刷新 | 旧功能全部保留；不存在新 runtime 扩散；原 2310 回退路径可用 | `boundaryMountRecoveryBrowser.mjs` 与 WP2 门禁 |
| FAST-07 | 公网 iPad Safari 真机 | 工作台 AG/全文 MD/PDF 与点击交互正常，单击小标定 CAS 成功；按需编辑正常 | `manual-external`：用户验收之前不宣称真机通过 |

## 隔离测试实测（2026-10-15）
- 《Bufett’s Alpha》真实归档 **2,585,734 bytes**（224 块 / 21 标题）；可重建 index **743,749 bytes**、MD **100,805 bytes**。完整生成约 5.4 秒；此值不是缓存命中加载耗时。
- 新缓存 Python 隔离测试：CAS 代际错误拒绝、源 metadata 变更缓存失效、坏缓存拒绝、原 pointer 与 ZIP 未变。
- WCP 独立源码和动态 CQE 契约，未改变路由核心、其它业务插件或持久标定模型。
- 真实 224 块书籍复制到随机临时 Vault 的 WebKit + Chromium 浏览器：缓存命中 0 次完整 DIRjson GET；正常 AG、源码、PDF；取消/勾选并保存标定读回一致，0 次 ZIP 上传；按需完整 IR 恢复成功；原书库 0 写。
- 既有 2310 小标定 readback 六项回归已通过；正式稳定版 `v4-261014-0816` 保持不动。

**状态说明**：本文件是功能/UIC 契约和自动门禁记录，公网候选、刷新及实体 iPad 结果须以 WP6 实际发布/测试记录为准，不能从自动化臆造人工验收。


## WP6 收尾：2026-10-15 候选发布验收

- **收尾范围**：章定界缓存工作视图、保存恢复、授权缓存 GET/显式 prepare、候选静态部署。保持 DIRjson 与 chapters-map 事实层，保留正式静态版本、WCP 内核与其它业务模块。
- **候选版** `v4-261015-0114` 已发布到 `https://ocr2md.laity.bid/v4-wp3-candidate/`；原版本 `v4-261014-2310` 完整备份，旧正式版 `v4-261014-0816` 保持不变，内网别名与公网均为同一组候选文件。
- **发布门禁**：`release-wp3-candidate.mjs --upgrade --chapter-fastload` 以 exit 0 完成，`WP3_PUBLIC_CANDIDATE_RELEASE_PASS`；白名单仅允许 chapter-boundary 插件、filesystem 适配与自动构建标识；完整候选 170 份资源、34 份校验哈希；源站、公网及 4292 内网别名读回同一候选 ID；旧候选保留回退路径。
- **真实数据隔离测试**：224 块 / 21 标题；WebKit、Chromium 缓存命中后完整 DIRjson 请求均为 0；AG、连续 MD、PDF 能够显示；一次小 `chapters-map` CAS 保存与读回一致，不上传 ZIP，用户原始 Obsidian Vault 写入 0；人工启动完整源码编辑时才出现一次完整 DIRjson GET。
- **既有回归**：小标定 6/6、插件隔离 4/4、WP2 升级门禁 6/6、WP3 WebKit+Chromium 工作目录 5 项可见和深色布局通过；缓存来源、代际、SHA、损坏拒绝通过。
- **大小对照**：原归档 2,585,734 B；派生章节索引 743,749 B + 全书 MD 100,805 B，共 844,554 B，比归档少约 67.3%。这是数据本体大小对照，不等同于公网线速、HTTP 开销或 iPad 真机首屏性能；并非声称已取得精确首屏时延。
- **后端上线**：受 `launchd` 管理的 4176 后端完成单次受控重启，加载 `GET /__v3/ir/cache` 与 `POST /__v3/ir/cache/prepare`；公网无授权 GET 401、非法 Origin POST 403、授权只读 GET 200。原真实书籍的 cache 尚未显式准备（`exists=false`），本轮没有对原真实 Vault 执行 prepare 或标定提交。
- **待人工验收（manual-external）**：实体 iPad Safari 登录授权后进入候选，明确点“准备工作数据”（需用户授权实际写派生缓存），检查刷新后二次命中、AG/MD/PDF 定位、独立成章操作和保存读回；需实测公网冷/热加载与实际触屏体验。**自动化已通过不等于真机用户验收通过**，在用户确认之前不将候选推广为正式版。
- **回退**：若候选出现问题，恢复 `v4-261014-2310` 的已归档候选快照，旧 `loadIrSnapshot` 路径与正式 `v4-261014-0816` 保留；不清理 `.v4-wp3-previous-*`。


### 2026-10-15 LAN HTTPS route compatibility addendum

- The previously published `v4-261015-0114` candidate is unchanged. Fixed the *LAN-only transport whitelist* for the two chapter-cache APIs across HTTPS 4443, FastDev 4292 and isolated Vault backend 4337.
- Real TLS CA-verified LAN smoke: candidate+stable HTML and asset SHA pass; unauthorized GET 401, origin-rejected POST 403, no-key POST 401, unsupported route 404. Authorized read-only status was confirmed 200; actual book cache remains unprepared.
- Public 4176 and stable `/v4-directory/` remain unchanged; browser iPad verification after the new route update remains `manual-external`. See `UNIFIED_RELEASE_NETWORK_UIC.md` NET-07.
