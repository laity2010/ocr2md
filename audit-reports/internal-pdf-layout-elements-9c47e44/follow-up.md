# 内部预检补充：解除 SQL 解析阻断后的第二层发现

本文件是**增量调查记录**，不修改此前 `report.md` 的原始失败，也不意味着已修复正式 AM 契约。审计基线仍为冻结 SHA `9c47e44f1fc6b44b4f126030d68008854aced6ca`。

在从冻结 SHA 创建的独立 `fix/internal-am-pdf-elements-9c47e44` 工作树中，候选提交 `c618d68a7d582ad04824a26aeccbe44215585851` 仅将现有非法 `visibility` 值映射到 Schema 定义的枚举，并为较晚登记的冲突 API 编号 `C63/C64/C65` 临时分配唯一编号 `C125/C126/C127`；未放宽数据库约束或更动业务源码。**该候选未认证、未并入 Main、未推送正式分支**，必须继续核实字段语义及 API 真实拥有者。

在候选工作树中重新运行 `python3 tests/am/am.py build`，SQL 完整性阻断已转为后续静态契约检查错误，包括：

- `apis.G34.symbol` 仍引用已被稳定原生下拉组件取代的 `reviewDropdown`；必须核对真实公开 API，而不是重建废弃函数只为通过检查。
- 多处 `access_edges.X-*` 的字面源码锚点已失效：`X-BREAK-L38`、`X-JOIN-C57`、`X-MOVE-C58/C59`、`X-SUBBLOCK-C64`、`X-PDF-GUTTER-P19`、`X-WP6-C-L78/C73/L80`、`X-AG-PAGE-P23`、`X-TEXTBLOCK-GLOBAL-L84`、`X-FOCUS-C65`、`X-CHILD-REORDER-C121/P40` 等。需逐项用真实源码调用图确认是改名/改路由/已删除/越界，**不得简单取消断言或批量重写 source needle**。
- `X-PDF-TEXT-STATUS-P25` 同时提示非公开跨模块 API、源码锚点找不到及 API 所有者不匹配；这可能是实质模块边界问题，应独立复查。

因此状态仍是 `AM FAIL / REVIEW_REQUIRED`，不可把解除第一层 SQL 语法阻断当作通过全量 AM。原始冻结快照、PDF/MD 审计包、Grok/Muse 独立审计入口不变。正式 SOURCE_MERGE 与 PRODUCTION_CUTOVER 仍需完整修复、针对性回归及独立复审决定。
