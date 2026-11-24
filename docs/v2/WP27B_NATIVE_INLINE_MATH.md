# WP27B · 原生行内公式定界与预览
基线 d170db8。用户反馈行内公式没有 $...$、MD 预览没有渲染。根因：V2 initial_md 直接拼接 raw_element_text，未处理段落内 typed inline_equation；MD renderer 仍采用旧 review-marker 门禁，未启用 V1 nativeInlineMath。
新初始化保留原 V2 文本归一化和原始表，按类型包装行内 span（原本有定界、空串、多行或内含不安全美元符号不重复包装）。V1 的 latex-inline-preview.js / markdown-preview.js 按 bf32515 逐字节复用；仅 V2 reader 启用 nativeInlineMath。原已审阅 ignore 语义保留。原 V1 renderer 也含独立公式紧邻普通段落的 paragraph termination 修复。
已有书籍不自动重建、迁移或写库；LaTeX 功能菜单增加「补全行内公式定界」。按稳定 logical_id + base_blockid 原始 Span，只有完整未编辑且单非空行的 text/ref_text 段落可以安全补全；已补全跳过，人工改动/不确定跳过。全部更新由现有 replaceMdLines 同修订 CAS 原生事务执行，整体 Undo/Redo，原始 LF 和原始两表不变。
直接测试 v2-latex、test_v2_inline_math、test_v2_pdf_projection、fresh_owned_init、logical_init、AG、note、MD line PASS。真实 sample 的 mode=ro 备份副本 Chromium/WebKit：16 块差量保存、21 条已匹配且 $ 定界、22 处真实行内 KaTeX 渲染；重复操作零写入；Undo/Redo/reopen 保留。未写用户原书。
