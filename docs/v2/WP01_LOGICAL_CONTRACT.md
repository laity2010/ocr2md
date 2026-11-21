# V2 WP01 · 初始逻辑块映射契约（只读验证）

受审起点：WP00 `309f29b`。仅定义纯转换和验收，不修改 SQLite、用户原件、Frame 或界面。下一航点验收前不迁移既有 SQL Schema。

## 原始组与逻辑层

- `mineru_base` 无损保存 MinerU 的三组基础记录 `preproc_blocks`、`discarded_blocks`、`para_blocks`，含 `blockid=0` 原始文件归档。**三组不是 539 个独立正文**：`preproc` 是前处理证据，`discarded` 含页眉页脚、页码等。不得直接拼成可编辑正文。
- 初始逻辑块只取 `para_blocks`，每个最终 OCR 块生成一行逻辑记录；初始一对一，样本为 **224** 条逻辑记录，对应 22 页中已归档的 539 条基础记录。其余 315 条原始记录继续可从基础表/源 JSON 恢复，不删除、不伪装成正文。
- 当前五列结构足以**表达初始扁平逻辑状态**：`logical_id = base_blockid`（稳定原始指针）、`base_blockid` 外键指向来源、`parent_id = NULL`（未经审阅不得推断父子）、`logical_order = 1..N`（PDF 页序 → `para_blocks` 页内顺序）、`markdown_text` 为从原始内容派生的可读 Markdown。跨页不按视觉猜测合并，表格原有 `blocks` 子树仍存在原始 JSON。
- 块组、原始页码、bbox、OCR spans、score、媒体链接和未知键**只从** `mineru_base.block_json` 查找，不另建扩展物理表；逻辑表只存当前最新编辑状态，不写历史。后续拆分一条来源成多个逻辑块、跨来源归并、父子块、span 光标定位等尚**未验证**，必须在对应航点扩展契约和测试，不能冒充 WP01 完成。

## 文字投影限制

- WP01 的 `project_block` 是有版本约束的**初步可读投影**：正文 span 同行连接、跨行空格；标题对应 `#` 层级；独立公式用 `$$`；表格保留 HTML；媒体用 Markdown 图片链接，复杂父块按 MinerU 原有子块序列展开。空 OCR 块可保留空文本。
- 此 Markdown **不是原始 MinerUJSON 的无损替身**，不宣称与 V1 的 Markdown 完全一致，也不修改/解析 MinerU 原件。完整恢复权威始终是基础表 `block_json` 与 `blockid=0` 原始字节档案。WP03 的无损往返只指逻辑行→无标签 Markdown+外部内存位置清单→同逻辑行，无论是否包含空块；不是直接从裸 Markdown 恢复所有 OCR 布局信息。
- 不嵌入 CMD 注释标签，不新建 `md_line` 第三物理表，暂不绑定 CM6 编辑会话；只读导出/往返由 WP03 独立实现、验证。

## WP01 门禁

仅对 fixture 和合成越界样本运行纯函数测试：组别过滤、一对一映射、身份稳定、全覆盖、全类型投影、无块序/隐式父子变更；该航点不可改写磁盘数据库。WP01 通过才允许 WP02 在授权范围内显式初始化逻辑层。
