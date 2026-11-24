# WP28 · V1 断块 View
基线 6a99dcd（WP27B 已发布 261124-220306）。V1 bf32515 的候选/合并/审阅控件原文件逐字节复制；公共 MD Line 适配当前 stable ID、PBS 两层和真实物理行。仅同组相邻 prose 候选；保留原 V1 守卫，非相邻物理行、后块多正文行、过期行引用/证据拒绝。AG 原列、92px 行高、默认全文、PBS 左固定和审阅右固定；A/B 源码着色、PDF 双端物理坐标，MD 预览保持普通定位。退出清除专用标记，恢复其它视图行高与布局。
合并使用 existing replaceMdLines 一次原生事务，A 拼接 B 文本，跨块断词去连字符，B 清空但保留 LF/ID/PBS/原始几何，原有 SQLite CAS 及 Undo/Redo。忽略、待定及已合并回执仅当前会话；不新增审阅表或持久化旁路。刷新后未合并候选重新计算，已合并正文保留，历史已合并行不重新显示。未修改用户原库。
直接测试 v2-block-break.test.mjs PASS；V2_TEST_BREAK_VIEW=1 node tests/v2-owned-edit.browser.test.mjs Chromium/WebKit 均 PASS：隔离 SQLite 样本构造真实父子断词对，实际 AG pinned 状态、A/B 源码与 PDF 标记、审阅菜单、忽略零写入、两块原生合并单次差量保存、Undo/Redo/reopen、原几何/ID 不变、标题列序不变。使用合成 PDF 渲染夹具；未手工操作用户 iPad。AG/MD Line/注释/LaTeX 直接回归及联邦布局检查 PASS。
