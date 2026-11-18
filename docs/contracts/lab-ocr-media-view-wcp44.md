# WCP44 · Lab-OCR 媒体 View 公共契约（实验）

## 数据权威及隔离

- 当前书籍 CM6 MD StateField/SQL `md` 行表是**唯一文档文本权威**。`Media` 只读取当前 `frame.mdDocument()`，不在 SQL 新建 `media`、`media_asset` 表或保存第二套 Markdown。
- 已下载图片文件及断点临时文件是书籍目录下的 `media/`；**不能**调用 Main 的 `/api/media/*`，其 `active_doc()` 指向 Main 的文档。实验版仅通过 `/labs/lab-ocr/api/ocr/media-*`，复用 `scripts/v6_media.py` 字节级实现，以经过 Main Cookie 授权且 `_book` 校验的 Lab `workspace` 为根。禁止直接将客户端指定的文件系统路径用于媒体读写。
- 单项或批量下载完毕，重新扫描**当时**的 CM6 文本；只替换值仍相等的 URL 区间，一次 CM6 history transaction。后续 Undo/Redo 和 md-save SQL CAS 沿用 Frame/MD 持久化，不由媒体模块独立保存。
- 源码被改动、书籍切换、HTTP 403、非法媒体路径或失败分块必须拒绝错误替换，成功下载的媒体文件不会被撤销/清理，且应在未引用媒体清单中可见。

## UI 与最小 API

- AG 过滤视图 `媒体`，复用 Frame AG Grid 和 View 下拉，显示 `预览 / 源码行 / PBS / 来源 / 状态 / 进度 / 引用 / 媒体链接 / 操作`。右侧操作列固定适合触摸；源码行可定位至源文、Markdown 预览与 PDF。
- `ui/lab-ocr/media-view.js` 的公开接口：
  - `findLabMedia(source)`（M00）：沿用 Main `findMedia` 并仅在 Lab 媒体视图补识 MinerU `![image](<URL>)` 角括号目标；返回精确 URL 源码偏移及物理行，跳过原始 MinerU 注释。**不修改 Main 扫描器和已恢复正常的 Lab 启动入口**。
  - `projectLabMedia({source, mdRows, blocks, inventory, states, running})`（M01）：从 Main `findMedia` 解析器及文件清单产生只读行，包含未引用文件。不触碰编辑器、SQL 或网络。
  - `createLabOcrMediaView({request,read,replace,onChanged,onStatus})`（M02）：唯一 UI 适配器 façade，公开 `rows/scan/downloadOne/downloadAll/previewCell/actionCell/setActive/dispose`。不创建新的 Grid 或持久化文本，依赖 Workflow 提供的单一编辑端口。
- Frame 新增 `setMdPreviewMediaResolver(fn)`，只转换 Markdown 预览**渲染出的**本地图片地址为当前 Lab 书籍的 `media-file` 授权 URL，不改原文、不访问 Main `/media`，仍复用原 Markdown 渲染器与阅读定位。
- Frame 公共新增端口 `replaceMdMediaReferences(edits)`：在同一 CM6 事务验证原文、范围、路径，保留物理行数和稳定 LineID。`patchMediaRows(rows)` 只差量更新已有 AG 表，不反复重建 Grid 或缩略图。
- Lab 后端：`GET media-inventory`、`GET media-status`、`GET media-file`、`POST media-chunk`；均带工作区，复用现有 Cookie/root/Origin、HTTP Range 和本地内容类型检查，不直连公网任意主机。图片范围与 Main 保持一致：MinerU CDN HTTPS（测试为 loopback）、JPEG/PNG/GIF/WebP；音频、视频及任意来源尚未支持，不伪报覆盖。

## 最小验收证据

- `python3 -m unittest discover -s tests -p 'test_lab_ocr_media_api.py' -v`：独立本地书籍中的媒体目录、内容读取、原有状态接口、非法路径/Origin/方法/未经授权工作区拒绝。下载过程用假响应，不进行真实 CDN 下载。
- `node tests/lab-ocr-media-view.browser.test.mjs`：Chromium + iPad WebKit，合成书籍的多处同 URL 引用、部分续传、一份下载替换多处 URL、未引用文件、CM6 单事务 Undo/Redo、原 LineID 保留、MD CAS 保存，且不修改 Block SQL。
- `node tests/lab-ocr-media-scan.browser.test.mjs`：M00/M01 独立直接测试，Chromium + WebKit 检查尖括号图片、普通图片、注释排除、URL 偏移、LineID/BlockID/PBS 映射及未引用文件不可虚构行号。
- `node tests/lab-ocr-media-view.browser.test.mjs` 额外检查真实显示的源码行、PBS 列、PBS 降序排序以及点击媒体时 CodeMirror 源码行聚焦；Local/remote 测试数据同时覆盖尖括号语法。
- Main `Media` 直接契约可沿用 `tests/media-public-contract.browser.test.mjs`，此实验模块不修改 Main Media 本身。

## 待扩展

- 支持非 MinerU 图片源或其他媒体类型前，另立 URL/文件类型/重定向/大小/MIME/SVG XSS 和失败回退的安全契约与测试，不放宽当前服务端 allowlist。

## WCP44 回退后源码行/PBS 空值修复（2026-11-18）

- `aa7a4d9` 源码回到可启动的 `d813e4c`：共享 Main `findMedia` 没有 MinerU 角括号格式支持。媒体目录中不在 MD 被该解析器识别为引用的本地库存呈现为「未引用」，其 `line_no` 和 `pbs` 正确地为空，但用户无法对这些书籍中的真实引用做排序和定位。
- 只读 Buffett SQLite 舞台样本证实 `md_line` 有 `![image](<https://...jpg>)`；这些行拥有稳定 BlockID，并能通过 `block.block_id` 关联真实 PBS。修复不假造目录文件的源码归属：仅识别真实 MD 引用，再使用既有 `projectLabMedia` 读取的 `mdRows` 与 `blocks` 关联，PBS 作为固定左列可排序、点击后仍走 `locateReview` 四窗定位消息。
- **局部修复只发生于 Lab-OCR Media 适配器及其 View 列定义**。刻意不再直接修改 Main 的 `findMedia`，也不改 HTML、Frame 启动流程、SQLite、PDF、书籍媒体数据。保留此前已恢复的启动路径。
