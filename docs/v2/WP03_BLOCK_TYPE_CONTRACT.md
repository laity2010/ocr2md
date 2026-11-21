# V2 · WP03 结构修正：一个 `block_type` 字段

修订日期：2026-11-21。基线 `deb1bb7`；只修改实验 V2，Frame/Main 与用户原始书籍无改动。**不增加类型审核状态列、第三物理表或额外编辑器。**

## 单一当前类型权威

- `mineru_base.block_type`：原始 MinerU 判断，严格只读保存，可能出错。
- `logical_block.block_type`：**当前、唯一生效的块类型**；在 `logical_id/base_blockid/parent_id/logical_order/markdown_text` 五列末尾新增一列 `TEXT NOT NULL DEFAULT ''`，共六列。
- 新建两表时逻辑类型从对应基础表自动继承；以后任何人工修正属于逻辑块当前状态，绝不写回基础表。今后标题、表格、LaTeX、审阅 View 的分类必须读取逻辑类型，不得再把原始 OCR 类型当作最新分类。
- Markdown 内存往返清单包含每段的 `blockType`，`to_markdown`/`from_markdown` 保留当前类型；纯文本 Markdown 不携带类型，不能绕过位置清单推断。此版清单格式为 `v2-logical-md/v2`；重构时仍以已有 `markdown_text` 为唯一文字状态，不因迁移或类型初始化重写编辑过的 Markdown。当前 WP03 AG 只读，**类型下拉编辑/Undo/Redo/CM6 读写联动尚未实现**，后续航点另行验收。

## 五列旧库安全迁移

- Frame F02 已保存、验证读写权限的目录，打开旧五列 V2 SQLite 时，只走**现有确认过的 `POST import`**，精确检测旧列名单、原始源文件和档案 SHA 与数据库身份一致后，在原库一个 SQLite `BEGIN IMMEDIATE` 事务内追加 `block_type`，只将新的类型列用 `mineru_base.block_type` 初始化。**旧五列一字不动**，不重建旧逻辑块，不更改顺序/父子、ID、Markdown 或基础表，也不覆盖 PDF/MinerUJSON。
- 同源旧五列为空时先追加第六列，再安全初始化逻辑块；已有非空逻辑状态完整保留。如原始来源已变且旧逻辑表有数据，拒绝迁移与覆盖。未知表结构不会假冒五列迁移。
- 类型修正后再次打开/重新导入不会从基础表复写当前逻辑类型，现有编辑结果仍是权威。升级中 SQL 或源检查失败，SQLite 事务整体回滚，旧逻辑表仍为五列且数据不变。
- 主动兼容**仅覆盖现有 WP03 的准确五列结构**。如用户已开启或编辑不兼容的实验旧九列结构，沿用对应 WP00 明确的重建策略，绝不把它冒充本次安全五列迁移。

## 回归门禁

覆盖新建六列与 539/224 样本、旧五列原地升级（包括人工修改的 Markdown、真实父子关系）、旧空表补全、来源变动拒绝、ALTER 中途失败回滚、重复导入保持类型修订、原始 OCR 类型不变、只读 Markdown+位置清单严格往返、真实 F02 授权、Chromium/iPad-WebKit 的 AG 六列显示、Frame 源码和统一门户回归。
