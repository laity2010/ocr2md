# Lab OCR WCP46 · MinerU 原始表 + para Block SQL VIEW + 审阅扩展表

## 确定的当前结构

```text
minerujson        SQLite TABLE（唯一 MinerU 无损事实表）
   │ original_bytes：所有 MinerU 分段的原始 JSON 字节
   │ block/root：原始三组根块，只作来源索引，不是独立 OCR 派生表
   │ page_size_json：由原 JSON 计算的只读页尺寸缓存
   ▼
block             SQLite VIEW（只展开 para_blocks）
   │ 由 block_review 保存的稳定来源指针读取 MinerU 原始节点
   │ 与人工关系合并形成 BlockID/PBS/ParentID/覆盖框/Line/Span 原子
   ▼
CM6               唯一可写运行态 → AG / PDF → 空闲或保存时批量写扩展表
   ▲
block_review      SQLite TABLE（扩展表，非第二份 OCR 数据）
   │ 稳定 BlockID + source_block_key + source_root_id + source_json_path
   │ 全局页、源路径等定位信息 + ParentID / sibling_order / PBS
   └ 没有 OCR block_json、正文、图片或 PDF 内容
```

保留 `block_edit_meta` / `block_edit_history` / `block_edit_receipt` 作为审阅的版本／审计事务／幂等历史**技术表**，不是 OCR 内容实体表。当前不创建 `span` 表或视图；旧库里的 Span 只在用户显式初始化前以只读兼容模式留存。

## 初始化操作（显式且有损）

SQLite 导航长期显示 **「数据库管理 · 初始化 SQL（重建扩展）」**。它仅在用户点击且确认警告后向授权的 Lab OCR API 发送 `POST initialize-sql {workspace,confirmReset:true}`。

- 正常打开书籍、切换 SQLite 导航或刷新网页，**只做只读检查**，绝不自动重建扩展表。
- 首次绑定目录仍可导入 MinerU 无损源表；若缺少 Block VIEW，状态栏提示通过 SQLite 导航初始化，不暗中创建物化 Block/Span 表。
- 初始化使用**已导入的 MinerU 原始表**，校验每个源 JSON 的原始 bytes SHA 和来源指纹；按既有三组原始前序计算稳定整数 BlockID，但 `block_review` 只登记 para 身份，OCR 正文不复制。
- 在同一个 `BEGIN IMMEDIATE` 事务内重建 `block_review`、`block` VIEW，并删除旧物化 `block` / `span`、旧审阅事务历史。失败全量回滚，原来的 VIEW/扩展表和源字节保持原状。成功后清空 CM6 旧关系缓存、刷新当前页覆盖框，再按新 VIEW 建立 CM 状态。
- **这是一项有损操作**：之前的人工 ParentID/PBS/顺序和 Undo/Redo 历史将被重置。必须由 UI 明确确认；不适用于静默启动、后台定时和未授权 API。
- 操作不修改书籍目录中的 MinerU JSON 或 PDF，也不修改 SQLite 中 `source.original_bytes`。如果磁盘源 JSON 已改变，不能假称源表已经重新导入；源数据更新需要单独授权的重导入流程。

## VIEW 实现与性能

`block_review.source_root_id` 指向 `minerujson` 里对应 para 根块的物理行；`source_json_path` 如 `$`、`$.blocks[2]`、`$.blocks[2].blocks[0]` 是原始结构的只读路径。SQLite VIEW 通过 `json_extract(m.block_json,r.source_json_path)` 动态读取块自身（去除嵌套 `blocks` 后提供 `block_json`），并计算 `line_count`、`span_count` 等。**不存在把 OCR 内容复制进扩展表的物化块行**。

在隔离的 160 页 × 40 根块（6400 para 块）样本上，Mac 测得：

- 显式初始化约 1.51 秒；
- 200 行 Block VIEW 读取（包含总数统计）约 0.20 秒；
- 第 90 页 40 个 PDF 覆盖框约 0.009 秒。

这是样本性能，不保证复杂多层 MinerU 实书相同速度。此前递归 CTE 全量扫描版对应读取约 1.06 秒和 0.225 秒，已被稳定 JSON 指针方案替代。

## 迁移边界与不变量

- 旧版 `block` 实体表不会因为正常访问而丢失；UI 允许查看并提示迁移，只有显式确认才清除它。人工审阅结果不从旧表自动合并到新扩展表。
- 进入 VIEW 架构后，既有 `block_rows`、PDF block overlay、CM6 BlockID 关系变更、Undo/Redo 和 CAS batch 仍使用相同公开端口。SQL 更新通过 `block_review` 而非尝试 `UPDATE block VIEW`。
- ParentID 和 PBS 仍限定两级结构；稳定来源 BlockID 不依赖会变的 PBS；刷新和异步 SQL Ack 不得反向覆盖 CM6 未落盘内存。
- `source.original_bytes` 与磁盘 JSON/PDF 必须字节级不变。明示重建失败不能留下一半 VIEW 和一半扩展表。
- API `minerujson2block` 暂保留为只读兼容探测，不能再隐式生成实体块表；`minerujson2span` 在新结构下不创建表。旧 Python 实体生成脚本只留作遗留迁移测试参考，不是新运行态架构入口。

## 验收

- `tests/lab-ocr-block-view.test.py`：真正的 SQLite VIEW、嵌套 para、原始 JSON 字节、稳定身份、审阅扩展写回、Undo、重建重置。
- `tests/lab-ocr-initialize-http.test.py`：Main Cookie、Origin、`confirmReset` 权限门禁、不能自动创建实体表、原始字节守恒。
- `tests/lab-ocr-initialize-view.browser.test.mjs`：真实 Chromium/iPad WebKit UI，取消/确认/重载不重复重建、Span 禁用、Block AG/PDF 呈现。
- 原有 `lab-ocr-block-gesture.browser.test.mjs`、`lab-ocr-pbs-link.browser.test.mjs`、`lab-ocr-sample-flow.browser.test.mjs` 验证已验收的拖放、PDF 块标签和旧库读取没有回退。
