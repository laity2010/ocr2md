# WP25C · CM6 行级编辑
基线 7e95c41。新公共纯函数 planMdLineEdit 复用 WP25A 索引，按真实行的旧区间归属构建差量。在共享块边界的零宽插入，最后一个 LF 前的完整新增行归前块，剩余未终结前缀归原下一行；无 LF 的输入仍属于原行。EOF 输入归末块，跨块完整行删除可按块拆分，歧义替换/跨块合并拒绝；保留最少真实尾 LF、稳定 ID 及严格重组，原生 Undo/Redo 精确恢复旧区间。SourcePort getMdLineIndex 返回当前修订缓存索引，不增加可写正文。
直接测试 tests/v2-md-line-edit.test.mjs PASS。V2_TEST_LINE_EDIT=1 node tests/v2-owned-edit.browser.test.mjs：Chromium/WebKit 各 9 次真实 SQLite 差量提交；边界 Enter/多行输入、清空跨块、EOF、撤销重做和重开均一致，267 IDs 不变。WP25A 及原后端差量测试通过。未发布、未动用户库。
