# OCR2MD V6 · cm-html 实验版

使用同一份 V6 主线核心，实验差异只登记在本分支 `labs/cm-html/lab.json`：

- `settings`：CM 文件导航（章节定界母文档、全局设置以及导出后的章节只读打开）。
- `chapterFiles`：复用 V6 章节切分，将文件名统一成 `000-xxx.cmd.chapter.md`。
- `modules/chapter-server-launch.py`：由实验部署器复制到运行目录 `.runtime/chapter-server.py` 作为启动入口；只修改运行时 `v6_chapters.chapter_dir` 与文件名校验，复用既有导出和原子写入接口，不复制 V6 后端。

实验版章节输出在**实验工作文档同级目录的 `chapter/`**（例如 `labs/cm-html/.runtime/chapter/`）。
读取 `/api/chapters` 清单并显示 `章节chapter/文件名`；点击章节文件会在源码窗以**只读 CM6** 查看。母文档、设置和章节各自分离；不能将章节内容通过原母文档保存按钮误写。
标签 `.cmd.chapter.md` 表明该章节已完成定界，可以被后续元素清洗模块识别；**不表示本轮已启用章节内编辑/保存或元素处理**。

实验服务沿用现有 4443 HTTPS `/labs/cm-html/` 反代到 4408，保存授权和数据仍与正式 V6 隔离。部署的实验服务启动器位于实验 `.runtime/` 内，正式 `scripts/v6_serve.py` 及 `scripts/v6_chapters.py` 不改。

验收：`modules/chapter-export.browser.test.mjs` 在隔离测试数据目录中做授权导出、落盘、读取及源码只读打开；另运行 `modules/source-file-navigation.browser.test.mjs`、`modules/ag-module-toolbar.browser.test.mjs` 和主线实验完整回归。
