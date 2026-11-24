# WP26A · 注释匹配公共行投影
基线 9fe720b。复用 V1 bf32515 的 note-match-index.js、note-match-view.js、note-match-view.css（逐字节 cmp）。只新增 V2 公共 MD Line 适配和同一 AG Grid 预设；默认全文，独立保留页范围，不改变标题/块视图。注号数值排序、注引/注文分别成行、缺号/缺端/多候选提示，原 V1 着色与原生表头过滤。PBS 按 p 筛选。缺端无虚假位置；点击端点按当前修订引用与原字符证据核对后使用既有四窗行定位；目前整行高亮，不宣称已复刻 V1 字符范围着色。
无新增 SQL 查询、业务表、可编辑文本或写入。规则暂用 V1 内置默认；人工决定和转换待 WP26B/C 单独验证。V1 的独立持久化审阅表不能直接照搬，两表不变。
直接测试 tests/v2-note-match.test.mjs PASS；V2_TEST_NOTE_MATCH=1 node tests/v2-owned-edit.browser.test.mjs Chromium/iPad-WebKit PASS：真实隔离 267 块 SQLite，实际 AG 表头、701/703 两对、702 缺号、双端定位、原生筛选模型、标题/块切换、原始数据不变、零写入。PDF 使用合成渲染夹具；实机 iPad 尚未验证。
