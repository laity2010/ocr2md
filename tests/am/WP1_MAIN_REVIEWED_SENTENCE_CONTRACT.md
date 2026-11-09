# OCR2MD WP1 · Main 审阅 MD / Lab 分句 JSON 合同与验证

范围：只实现 Main 审阅文档只读发布、Lab 显式只读导入、分句 Lab 版本句表发布；**不修改 Main 工作树或旧 AI/校译数据**。本文件仅记录 WP1 事实、测试及已登记接口，不新增 `AGENTS.md` 原则。

## 模块边界

- Main（R01/R02）：从当前保存的 CMD 独立确定 `reviewed.md`，只移除来源注释及经人工审定的 `lb="m"` 断行。Main 不使用分句引擎、句界仲裁或译表。随文件提供可逆 UTF-16 `sourceMap.patches` 和 `blockAnchors`；`documentVersion` 是审阅 MD 的 SHA-256。
- Lab 分句（Q01/Q02）：显式访问 Main HTTP `GET /api/main-reviewed`（默认通过 Mac 的 `127.0.0.1:4396`，仅 loopback），验证来源后只在 Lab `.runtime` 保存固定版本，不能直接读取 Main 工作目录。相同 CMD 来源保留现有人工仲裁；新 CMD 来源先归档旧 CMD 与 sidecar，再初始化新 sidecar。Main 不能直接读写 Lab 数据。
- Lab 分句（Q03/Q04/Q05）：原有 `buildTranslationTable()` 不改其 394 行/来源坐标；新版 `unitVersion` 单独由 `documentVersion`、`sourceSha256`、`reviewRevision` 和**全部有序原句/来源范围**计算，防止源 CMD SHA 相同却混用 402/394。标准 `sentence-units.json` 与不可变版本副本保存在 Lab 独立 `exports` 中，`GET /api/sentence-units` 只读供后续翻译 Lab 调用。修改/过期输入拒绝，不自动更改 CMD 或任何译文。
- 旧 `/api/reviewed-source`、402 行校译输入维持**兼容期历史路径**，不晋升为 Main 审阅 MD 的生产者。真正替换校译数据入口在 WP3；用户不应把旧校译兼容包当作新版 Main 审阅 MD。

## 数据格式

Main `ocr2md-main-reviewed/v1`：`sourceCmdSha256`、`documentVersion`、`sourceCmd`、`reviewedMd`、`sourceMap.coordinate=UTF-16`、`sourceMap.patches`、`sourceMap.blockAnchors`、`documentName`。

句表继续使用 `ocr2md-translation-units/v1`，新增 `documentVersion`、`reviewRevision`、`unitVersion`；其 `sourceSha256` 仍绑定 CMD。`corrected` 和 `translation` 均为 `null`，不由分句 Lab 管理。

## 已覆盖的直接契约入口及测试

- `R01/R02/Q01/Q02`：`python3 -m unittest discover -s tests -p test_v6_main_reviewed.py -v`
- `Q03`：`node --test tests/sentence-benchmark-unit-version.test.mjs`（与 Python Q04 哈希一致）。
- `Q04/Q05` + 真实服务路由：`python3 -m unittest discover -s tests -p test_v6_main_reviewed_http.py -v`（两台随机端口隔离服务；不触碰 Mac Main）。
- 句表/断行/CM6 原测试：`node --test tests/sentence-benchmark-public.test.mjs tests/sentence-benchmark-translation-table.test.mjs tests/translation-review-clean-md.test.mjs tests/translation-review-reading.test.mjs`。
- 已知全量 AM 既有阻断：旧 `tests/am/registry.sql` 的 `visibility=callback/constructor-callback/module-port` 仍无法通过 Schema CHECK。不得把本轮新增条目通过直接测试等同于全量 AM PASS；不得为跑通 WP1 私自放宽旧规则。

## 上线/晋升限制

Main 的新只读接口当前仅在 Lab 工作树同源代码实现；**未经过授权晋升到开发 Main 前，正式 Main 仍没有 `/api/main-reviewed`，Mac 正式 Main↔Lab 的新导入按钮暂不可实际联网成功**。集成测试用两台独立同 SHA 服务验证合同，不能冒充正式 Main 已部署。正式部署仍须依批准的 Main→Lab 镜像、正常 Git 晋升和验收。
