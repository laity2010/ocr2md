# Lab OCR · Block 拖动改变关系 WP1–WP5（WCP41）

> **WCP47 · 相邻页 Block 续接（2026-11-13）**：在既有单页操作之外，允许后一个**物理 PDF 页**的 para 根块，通过拖动标签并命中前一页的 Block 覆盖框，以 `child` 归入前页父块。命中前页原有子块时采用该子块的顶层父块（不产生孙块）。源根块的原有子块随同提升到新父块的一级子块，PBS 使用**逻辑父块页码**（例如物理第 2 页的块显示为 `p1b1s1`）；`global_page`、`block_id`、原始 `source_block_key`、bbox、MinerU JSON/PDF 均不变。源页剩余根块会正常重编为 `p2b0` 等，落点自动滚页仅发生在手势期间；提交后仅重画受影响的两页，滚动与缩放不跳。暂不开放跨页「之前／之后」、倒序归入或相隔两页以上的归入。

> CM6 仍拥有唯一可写运行态。跨页或已存在跨页关系的后续同页操作采用全局父关系图规划，但**只保存变化的 BlockID 差量**；操作历史用 `scope:'delta'` 和 `pages:[物理页码…]` 标识，原单页历史不变。SQLite 使用 `block_review` 扩展表写回（旧 Block 表兼容），CAS/idempotent 事务及 Undo/Redo 对同一差量原子校验/回放。失效父块、第三层、循环与跨页反向操作一律拒绝；PDF、AG、CM6 用固定 BlockID 更新。独立验收 `lab-ocr-cross-page.test.py`、`lab-ocr-cross-page-runtime.test.mjs`、`lab-ocr-cross-page.browser.test.mjs`，Chromium/iPad WebKit 检查两页标签、撤销重做、保留物理页与无视口漂移。真实 iPad 长距离自动滚页拖动仍须手动验收。

> **WCP45 · 拖动后 PDF 版面不得漂移（2026-11-13）**：成功松手后仅 CM6 改关系，AG 按 BlockID 行补丁，PDF 缓存页重画 PBS/覆盖框并更新橙色高亮；**禁止触发 AG→PDF 的跳页/居中定位**。原因：WCP44 以前的 `reflectCmBlockChange` 使用 `focusPdfBlock({id,page})` 默认跳转，在 PDF.js 中先 `currentPageNumber=page` 重置滚动，再 `scrollIntoView` 将源块居中。现通过 `focusPdfBlock({id,page,reveal:false})` 传递至公共 `focusBlock`，原位选中，不移动 `scrollTop`/`scrollLeft`，不修改 PDF zoom、页码或纸页视觉原点。显式用户从 AG 点击 Block 仍保留 `reveal:true` 定位。浏览器红测记录缩放前 PDF `scrollTop=40`，旧版松手后变为 `0`；修复后 Chromium/iPad WebKit 对拖动、125% PDF 缩放后的 Undo 断言位置稳定，仍沿用既有 SQL 异步保存/历史。

> **WCP44 · 父子两级硬约束（2026-11-13）**：仅允许父块 `p6b4` 与一级子块 `p6b4s0`、`p6b4s1`、`p6b4s2`……；**不允许孙块** `p6b4s2s0`。此前将自带子块的父块归入另一个父块时，旧子块跟随源父块产生第三层。现在 CM6 `planBlockMoveInMemory` 与 SQLite `plan_block_move` 都在计划结果中深度优先展开至同一顶层父块。来源 `block_id`、`source_block_key`、`block_path`、`block_json`、bbox、Span、MinerU JSON 与 PDF 全部不变；只修改审阅关系 `parent_block_id`、兄弟顺序和展示 PBS。
>
> **旧数据修正**：首次从 SQL 载入 Block 时，检测跨级 ParentID 或 PBS 中连续两个 `sN` 的页面；先在 CM6 中按原逻辑阅读顺序将孙块提升为一级子块（如已有 `p6b4s0`、`s1`、`s2` 时，`p6b4s2s0` 升为 `p6b4s3`），AG/PDF 立即投影，再追加 `{action:'flatten',page}` 进入现有空闲或全局保存的 SQLite CAS/幂等批次。每次只改涉及页面，不改原始内容；原始关系和新关系完整保留在历史 `before/after` 快照。保护性修正不得通过普通 Undo 恢复违反两级约束的旧孙块；之后的正常拖动仍可 Undo/Redo。历史审计仍能检查旧关系。
>
> 直接回归：`tests/lab-ocr-cm-block-runtime.test.mjs`、`tests/lab-ocr-block-edit.test.py`、`tests/lab-ocr-cm-deferred-persistence.test.mjs`；Chromium+iPad WebKit 实际 PDF.js/AG/CM6/SQL mock：`tests/lab-ocr-two-level.browser.test.mjs`。与 WCP42 异步保存、Main 风格长按拖动、iPad 放大后坐标修正兼容。

> **WCP42 更新**：本契约仍定义拖动规则和 BlockID/SQLite 事务的关系约束，但 WCP41「松手后立即写 SQL」流程已经被 **CM6 单一内存运行态 → 空闲／全局保存异步批量落盘** 替代。最新写入/Undo/Redo/冲突语义以 `lab-ocr-cm-runtime.md` 为准。

本模块只在 Lab OCR 实验分支使用；Main 不修改。

## 适用范围与保留原则

- 仅处理 `block_group='para_blocks'`。MinerU `source.original_bytes`、原 JSON/PDF 文件、`span`、`source_block_key`、`block_path`、`block_json`、bbox 和稳定整数 `block_id` **永远不因拖动改变**。
- 本阶段关系操作限制在**同一 PDF 页**。父块可以连同完整子树在两个顶层父块「之前」「之后」移动，或归入指定父块末尾（对目标子标签点击“作为子块”时，归入该子标签的直接父块）；同父子块支持「之前」「之后」兄弟排序。子块改挂其他父块、跨页归入、拆分独立，以及虚拟正文 `s0` 的结构变换**不在本阶段开放**。
- `block_id` 和 `parent_block_id` 是关系身份；`pbs` 只从页面根块 + `sibling_order` 递归生成供显示，不能作为数据库写入标识。父块本身含有的 `lines[]` 始终保留在父块 `block_json`，不生成冗余原子数据。
- 任一操作禁止自身归入、归入后代、错误的目标层级、跨页、多父、坏引用和循环。任一非法请求拒绝写入。

## GUI／PDF 公共端口

Main 参考：`main/ui/pdf-preview.js` 长按手势，`main/ui/pdf-pbs-drop-hit.js` 覆盖框命中。Lab OCR 采用适配后的只读意图组件 `ui/lab-ocr/pdf-block-drop.js`，不引入 Main 的 CMD 文本编辑器。

- PBS 标签长按 370ms 发出拖动箭头；源标签保留原地，鼠标、触摸、触控笔均走 PointerEvents。对 PDF 原始覆盖框或明确的 PBS 标签命中目标，显示「之前／作为子块／之后」落点导轨。选择失效目标或未落点，整次拖动取消，不触及数据库。
- 边缘自动滚动只在已经长按激活且实际拖动后运行；`pointercancel`、PDF 切换/卸载、书籍切换、短滑动等都取消手势。松手抑制一次意外模拟点击。
- 公共 `setOverlays({onBlockDragIntent(intent)})` 仅回报 `{sourceBlockId,targetBlockId,placement,page}`，不直接操作 SQL。现有 `focusBlock()` 不变；新增 `invalidateOverlayPage(page,changedRows)` 精确清理该页 Block/Span 缓存，处理过期异步读取，仅重取相关页覆盖框，**不重新加载 PDF**。
- Frame 只代理 `invalidatePdfBlockPage`、`patchSqlBlockRows` 和 `setSqlEditHistory`，不自行实现 OCR 关系和 Undo 状态。AG Grid `rowNode.updateData` + CM6 StateField Effect 根据 BlockID 更新，原表筛选和当前焦点保留；PBS 默认以数值路径排序，而非字符串字典顺序。

## API 与事务契约

所有请求走现有单一 Lab OCR Loopback API `/labs/lab-ocr/api/ocr/`，复用 Main Cookie 授权目录与 POST Origin 检查，不建新服务/Tunnel。

| API | 职责 |
|---|---|
| `GET block-edit-state?workspace=...` | 返回 `revision`、`canUndo`、`canRedo` |
| `POST block-edit {action:'plan',workspace,sourceBlockId,targetBlockId,placement}` | 只读预演返回当前修订号和预期变更 |
| `POST block-edit {action:'apply',workspace,sourceBlockId,targetBlockId,placement,expectedRevision}` | 原子提交；冲突拒绝 |
| `POST block-edit {action:'undo'\|'redo',workspace,expectedRevision}` | 原子恢复当前书籍最近的结构快照；事务冲突拒绝 |

Python 纯核心：`plan_block_move(rows,source_id,target_id,placement)`。持久化层：`apply_block_move()`、`undo_block_move(redo=...)`。跨层通过受控 JSON 结构连接，不向 PDF 返回正文、用户磁盘路径或原始 OCR JSON。

- 写入前以 `BEGIN IMMEDIATE` 锁定书籍独立 `ocr2md.sqlite`，对照 `expectedRevision` 和来源指纹；一次事务只更新当前页相关的 `parent_block_id,sibling_order,pbs`，其余字段不变。PBS 唯一约束采用事务内临时标签再写新标签，避免互换编号时瞬态冲突。
- `block_edit_meta` 和 `block_edit_history` 是唯一历史源，维护书籍版本、历史位置及操作前后快照。每次 Undo/Redo 都增加 revision；新操作从 Undo 分叉时放弃旧的 Redo 分支。历史在关闭页面、关闭 API 后仍存在 SQLite。
- 已经人工编辑的派生 Block，若导入来源签名变化，`minerujson2block` 与 `import_workspace(replace=true)` 拒绝静默重建。来源未变时重新初始化为幂等，不删除用户关系/历史。独立 Span 表依然可以初始化且不会把编辑历史判定为未知表。
- `expectedRevision` 不是 optional；服务端与前端双重拒绝旧版本，保证不同窗口不能误覆盖。客户端在冲突后要求用户重新发起手势。

## WP1–WP5 验收门槛

- **WP1**：`tests/lab-ocr-pdf-block-drop.test.mjs`；`lab-ocr-block-gesture.browser.test.mjs` 真 PDF.js/AG，长按/箭头/落点/短点击无写入，iPad WebKit + Chromium。
- **WP2**：`tests/lab-ocr-block-edit.test.py` 纯计划、父块连子树归入、同父兄弟、root before/after、禁止自身后代/跨页/循环。
- **WP3**：同一 Python 测试验证真实 SQLite 事务、stale CAS、Undo/Redo、撤销分支、源字节/Span/BlockKey 不变、人工编辑重建门禁；`lab-ocr-block-edit-http.test.py` 验 Main Cookie 和 POST Origin。
- **WP4**：浏览器 E2E 应保持 PDF 请求计数=1，Block SQL 全量读计数=1，Apply/Undo/Redo 后 AG+PDF 均显示新 PBS/ParentID。无全文重刷、无未保存阻塞。
- **WP5**：所有 Lab OCR Python/API、PBS 标签密集避让、Block/Span 过滤、默认导航、PDF 缩放与双浏览器回归通过；提交独立 Git SHA，正式 Lab 构建与发布清单校验后公网 HTTP 校验一致，人工实际 iPad 手势验收仍由用户完成。

**不宣称已验收**：真实用户书籍的大量跨页/跨栏关系修订、子块独立成父及其实体正文 `s0` 规则、真实 iPad 手感与屏幕录制，这些均需要后续单独目标，不通过静默扩张本次写入能力来冒险。
