# WP23H · 多行块 Type 与标题 View（隔离验收）
基线 b8524c5。遵守 README 3.1、联邦 COMM 及两表/唯一 CM6/同一 AG 行集契约。

## 业务语义与接口
- `collectOwnedHeadings(source,intervals)` 从完整当前 CM6 正文及逻辑块 UTF-16 区间提取每块的 ATX 标题文本和绝对源码行号；沿用 V1 titleSourceParts 判断，使用既有 CM6 Markdown 语言解析器排除 fenced code（含跨块围栏）。普通正文中间的 #、缺空格的 # 或七级 # 不当作标题。保持逻辑 ID、PBS 和原始 SQL 类型。
- `ownedBlockType(storedType,headings)`：有任意有效标题则 title；最后一个标题取消时回到来源类型，原 title 降为 text。旧 v2 库保持既有 effectiveBlockType 首行规则。
- 标题 View 保持原生 EnumCheckboxFilter 与同一 AG 行集。列序 MD Block、PBS、源码行号、Type、其余列；不新增 Level 列。多条标题仍在同一 MD Block 单元格逐行显示，使用 V1 renderTitleMdCell、原全局基础字号与 Everforest 颜色；AG 原生 autoHeight。共同行的 md_block 仍保留完整正文，heading_lines 只是内存展示元数据，不持久化。
- `titleClickLine(row,target)` 给出点击标题或源码行号对应的实际行，其他单元格默认为首标题。原 v2-ag-row-click 增加可选 sourceLine；协调器按最新 CM6 所属逻辑身份复核，再走现有跨窗 focusSourceLine 接口，不能定位到其他块。无新的编辑器、AG 实例、SQL 查询入口或持久化表。

## 验收证据
- node tests/v2-owned-heading.test.mjs PASS：多标题、Unicode 偏移、跨块代码围栏、无效标记、类型恢复、指定行选择及安全回退。
- node tests/v2-ag-views.test.mjs、node tests/v2-live-block-type.test.mjs PASS：WP23B/C 原预设及分类回归，V1 renderer 源码字节不变。
- V2_TEST_OWNED_TITLES=1 node tests/v2-owned-edit.browser.test.mjs PASS（exit 0）：Chromium/iPad-WebKit 均使用真实 V2 Frame/CM6/AG、原有 V1 PDF.js 组件与隔离的真实 SQLite/Python dispatch。F02 授权为测试桩，PDF 为与原样本尺寸对应的合成 PDF，不等于实际 iPad 设备验收。原真实 MinerU 样本 267 块中第 24 号逻辑块含第 8 行一级标题，真实空行键入第 10 行二级标题；确认单一行对象、列序、原生 Type 筛选、两条视觉行分别着色、16px 统一字号、逐标题点击至实际 CM6 行并保留 PDF 所属块；删除两条标题标记，最后一条消失时退出筛选，撤销/重做恢复；每浏览器 7 次实际单块 SQLite md-commit，重新加载恢复标题。非目标块正文、所有块身份、SQL 来源类型及原始 PDF 坐标均不变。
- V2_TEST_AG_VIEWS=1 node tests/v2-mineru-base.browser.test.mjs PASS（exit 0，Chromium/iPad-WebKit）：旧 v2 标题 View 共同行对象、原生 Type checkbox、列序、页范围、定位、实时 Type 升降及返回逻辑块审阅保持原行为。
- python3 tests/test_v2_owned_edit.py -q、python3 tests/test_v2_owned_structure.py -q、python3 tests/test_v2_owned_split.py -q PASS：旧值冲突、两表、真实 LF、归组与分割持久化回归。
- python3 ../../.ops/verify-unified-layout.py PASS：统一布局、联邦/州契约和当前发布哈希保持合法。
- 本步不迁移用户库、不发布新协议。D–H 已完成隔离功能航点；生产迁移必须先验证明确授权的无损迁移/回退及发布门禁，不允许直接设置 fixture 标记冒充迁移。
