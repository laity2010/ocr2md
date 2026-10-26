# OCR2MD Lab · 导航虚拟章节视图（2026-10-26）

- 构建：`v6-lab-cm-html-20261026-191006`，源码 Git `2636add`，Lab 分支 `experiment/virtual-chapters-wp0-2`。
- 入口：`https://ocr2md.laity.bid/labs/cm-html/`。默认导航仍为「章节定界」，原有独立成章复选框与起始编号不变；「章节文件」选项来自 CMD 当前六个逻辑章节，并用现有 `chapterAssignments` 产生与章节定界 AG 一致的 `.cmd.chapter.md` 名称。改变独立成章后列表会即时增删、后续重编号；变化起始编号同步更新。
- 选择章节文件改为设置 CM6/CMD 全文的可见章节范围，切换中不读取 `/api/document?chapter=`、不调用导出 API、不创建第二 EditorState；三张原有模块 AG 仍维护标题/媒体/LaTeX 元素审阅。回到章节定界恢复母文档全视图；Settings 入口仍在。
- 「导出章节」按钮在 Lab 中隐藏；章节定界 AG 的章节文件列显示普通虚拟章节名，不再提示「尚未导出」或提供实体文件下载。旧实体章节数据不删除、不改写，仍保留为迁移审计证据。
- Chrome 与 iPad WebKit：`VIRTUAL_CHAPTER_NAVIGATION_PASS`，分别在本地及公网实机通过；六章导航、勾选合并为五章再恢复、起始编号实时变化、跨章节保持元素类型、唯一源码窗、未保存正文不丢失、无实体章节读取、无服务端业务写入，均通过。
- WP1/WP2 全文索引、WP4 编辑范围单元测试及 WP7 无损历史审阅重建回归通过。独立 Lab 母文档 SHA-256 始终为 `33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc`。
- 公网回读版本 `v6-lab-cm-html-20261026-191006`，HTML 引用资源 `index-DGudCAp1.js` 返回 HTTP 200；正式站点版本仍为 `v6-20261026-102651`。
- 此次为实验增量发布，不代表 WP8 独立 Grok/Muse 审计签署完成，也不授权合并正式主线、清理旧实体章节文件或迁移用户正式文档。
