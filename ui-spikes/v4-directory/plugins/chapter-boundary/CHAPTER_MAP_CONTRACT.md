# 章节定界 · 独立章节映射（BND-15）

## 功能契约（操作 / 需要 / 效果）

- **操作**：勾选/取消“独立成章”，修改章节文件名或起始序号，然后点击全局“保存标定”。
- **需要**：已持久化且可信的原始 DIRjson（PDF/OCR/各块 stable ID），已授权的本书工作目录。初次 OCR 导入仍由原 DIRjson 初始化流程执行。
- **效果**：独立保存 `.ocr2md/chapters-map.v1.json`。唯一业务数据为 `markings.segments[] = {startBlockId,endBlockId,fileName}`；endBlockId **包含**在本章中。所有区间连续、顺序一致、无重复/遗漏；可在重新打开后准确恢复独立成章/文件名。
- **禁止**：普通分章标定保存不允许重建全书 ZIP、重写 DIRjson、触碰 PDF/OCR、写 `chapters/`。勾选本身仅是内存草稿。文件版号由后端保管；未明确请求覆盖的旧修订号仍返回 409。用户点击“保存标定”显式带 `overwrite=true`：必须先备份旧章节映射，再原子替换；原 PDF/OCR/当前 DIRjson generation 不允许覆盖或忽略校验。
- **旧数据**：仍读取历史 `.ocr2md/ir-markings.v1.json`（layout/chapterNames/operations）。仅当用户手动保存时写新的 map；旧文件原样保留以供审计/恢复。新文件优先，遇到旧 generation 不能暗中恢复旧 map。
- **发布**：明确点击“发布章节”后，Mac 将**当前已保存**的原 DIRjson 与同代章节映射只在内存中叠加，经既有投影器生成 Obsidian MD，并显式替换 `chapters/`。不产生新的 DIRjson generation；先确认合法出版目录、冲突校验、来源 SHA。旧 `chapters/`（含人工清洗、imgs）完整备份。`chapter-cleaning` 后续只管理已经发布的 MD；WCP 仍只承担消息路由。
- **保留的边界**：已有的 OCR/标题正文修正仍由旧 DIRjson 全量保存链路处理，**不混入章节 map**。源码修正能力后续应独立归于 OCR 校对模块；本轮不在缺失专用模块时删除旧编辑功能。

### JSON 示例

```json
{
  "kind": "ocr2md/chapters-map",
  "schemaVersion": 1,
  "book": "/ocr2md/示例书籍",
  "baseGeneration": "<原 DIRjson 版本 SHA-256>",
  "requestId": "<幂等事务 ID>",
  "markings": {
    "segments": [
      {"startBlockId": "blk_a", "endBlockId": "blk_h", "fileName": "01 - 前言.md"},
      {"startBlockId": "blk_i", "endBlockId": "blk_z", "fileName": "02 - 第一章.md"}
    ]
  }
}
```

外层 `baseGeneration` 和 `requestId` 是并发安全元数据，并非章节业务字段。所有块 ID 都必须是**真实 DIRjson 块 ID**，上述 `blk_a` 等仅作结构示意。

## UIC BND-15（浏览器 + Mac 后端隔离验收）

| 初始状态 | 用户动作 | 预期界面 / 数据副作用 | 不变量 | 自动化 |
|---|---|---|---|---|
| 已保存书籍 | 连续勾选三次、保存 | 状态“已保存章节标定”，独立 map 中只有 segments；无 ZIP 上传 | 没有 IR/MD/其他模块写入 | `workbenchMarkingsFixture.mjs` Chromium/WebKit |
| 已有新 map | 刷新、重新编号、再次保存 | 恢复勾选及文件名；CAS 版本变化 | 纯修订号漂移可安全重试；不同内容 409 | 浏览器 + `v3IrMarkingsSmoke.py` |
| 仅有旧 sidecar | 打开、修改、保存 | 新 map 写入，旧文件字节未改 | 可回退、无静默升级 | `v3IrMarkingsSmoke.py` |
| 已保存且完整覆盖 | 点击发布章节 | `chapters/*.md` 可供清洗，文件数/范围准确 | 原 DIRjson generation、IR snapshot SHA、map revision 全部不变 | Python 隔离 + WebKit 浏览器 |
| 已清洗 MD | 确认重新发布 | 原手工改动进入章节备份，再发布新版本 | 不无提示丢失清洗成果 | Python 隔离 |
| 恶意/失序/缺块 map | 提交保存 | HTTP 400/409 且浏览器草稿保留 | 不产生指针变化、非法路径被拒绝 | Python 隔离 |

**用户人工审核状态**：待 iPad Safari 真机验收；自动测试通过不代表用户已批准发布。


## UIC BND-16 · 用户主动覆盖标定（2026-10-13）

- 初始：旧/新页面持有同一本书旧章节映射 revision，其他设备曾修改过同一章节映射；当前页面仍有未保存的独立成章草稿。
- 用户动作：直接按顶部“保存标定”，无需重新打开书籍，无须输入密钥之外的调试参数。
- 预期：发送 `overwrite: true` 的合法小型 JSON，前版本写入 `/.ocr2md/chapters-map-backups/*.json`（严格授权内部路径），新版本经原生协调器原子替换，读回版本和映射一致后清除 dirty。
- 失败：若原 PDF/OCR 或 DIRjson generation 已变化、无效块 ID、跨书籍或协调器检测写入中再次变化，仍拒绝，保留页面草稿。不能绕过原文来源校验。
- 自动化：`ui-spikes/v2/tests/v3IrMarkingsSmoke.py` 验证 stale CAS 默认 409、`overwrite: true` 的备份+替换、错误 generation 仍拒绝；`web-component-platform/tests/workbenchMarkingsFixture.mjs` 两种浏览器真实点击，Chromium 中注入外部合法不同内容修改，验证覆盖及备份。
- 状态：隔离测试待执行/通过；4292 现网升级及实体 iPad 真机待独立验收。
