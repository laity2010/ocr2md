# WP8 · 旧实体章节入口 CAS 旁路验收补充

本记录追加于 WP8_POST_CAS_WCP_REVIEW.md，不改写之前的审计正文。

- 测试对象：同一隔离实验 .runtime/wp8-legacy-cas 下的独立复制品，保留未迁移母文档与原版六章清单；不使用正式仓库、正式 Markdown 或 WP7 迁移候选作为写目标。
- 入口：GET/PUT /api/document?chapter=001-Buffett-s-Alpha.cmd.chapter.md。两个已授权且 Cookie 互不共享的 HTTP 编辑端先读取完全相同的实体章节和 ETag。
- 验收：缺失 If-Match → HTTP 428；首次使用正确版本 → HTTP 200；第二编辑端继续使用相同旧 ETag → HTTP 412，磁盘内容仍为第一编辑端的版本。再次以当前 ETag 保存原文 → 200。
- 完整性：实体章节 SHA-256 恢复为 4ac185442c57b0313211c8b4c7715f766d2cd93c770e2194c3ea806a47c94c77，六章清单中的 sourceSha256、各文件名称、字节数与 SHA 全部保持原值。清单的 generatedAt 由原有导出器在成功保存时更新，此字段变化符合旧实现语义。
- 实际结果：WP8_LEGACY_CHAPTER_CAS_PASS。测试文件：labs/cm-html/wp0-2/wp8-chapter-cas-audit.py。
- 使用条件：WP8_AUDIT_ORIGIN 为只在本机环回监听的独立实验服务；WP8_AUDIT_TRIAL_DIR 必须指向 wp8-legacy-cas 目录，其 document.md、chapter/ 与独立授权码均需从隔离测试快照初始化。
- 安全边界：服务器端 CAS 使用当前单进程的 DOC_WRITE_LOCK；多进程共享磁盘写入不在本轮证明范围。旧实体章节以后仍应退休为只读证据，不能因它通过 CAS 就视作正式继续双写。

**补充结论**：除了唯一母文档的 CAS，旧实体章节兼容 PUT 入口也不存在本轮复现的无条件覆盖旁路。WP8 的独立 Grok/Muse 正式审计签字仍然未获得，本补充并不替代签字。
