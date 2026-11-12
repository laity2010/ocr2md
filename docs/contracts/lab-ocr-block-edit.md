# Lab OCR · Block 拖动改变关系 WP1–WP5（WCP41）

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
