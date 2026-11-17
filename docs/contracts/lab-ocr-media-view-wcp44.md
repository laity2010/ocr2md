# WCP44 · Lab-OCR 媒体 View 公共契约（实验）

## 数据权威及隔离

- 当前书籍 CM6 MD StateField/SQL `md` 行表是**唯一文档文本权威**。`Media` 只读取当前 `frame.mdDocument()`，不在 SQL 新建 `media`、`media_asset` 表或保存第二套 Markdown。
- 已下载图片文件及断点临时文件是书籍目录下的 `media/`；**不能**调用 Main 的 `/api/media/*`，其 `active_doc()` 指向 Main 的文档。实验版仅通过 `/labs/lab-ocr/api/ocr/media-*`，复用 `scripts/v6_media.py` 字节级实现，以经过 Main Cookie 授权且 `_book` 校验的 Lab `workspace` 为根。禁止直接将客户端指定的文件系统路径用于媒体读写。
- 单项或批量下载完毕，重新扫描**当时**的 CM6 文本；只替换值仍相等的 URL 区间，一次 CM6 history transaction。后续 Undo/Redo 和 md-save SQL CAS 沿用 Frame/MD 持久化，不由媒体模块独立保存。
- 源码被改动、书籍切换、HTTP 403、非法媒体路径或失败分块必须拒绝错误替换，成功下载的媒体文件不会被撤销/清理，且应在未引用媒体清单中可见。

## UI 与最小 API

- AG 过滤视图 `媒体`，复用 Frame AG Grid 和 View 下拉，显示 `预览 / 源码行 / PBS / 来源 / 状态 / 进度 / 引用 / 媒体链接 / 操作`。右侧操作列固定适合触摸；源码行可定位至源文、Markdown 预览与 PDF。
- `ui/lab-ocr/media-view.js` 的公开接口：
  - `projectLabMedia({source, mdRows, blocks, inventory, states, running})`（M01）：从 Main `findMedia` 解析器及文件清单产生只读行，包含未引用文件。不触碰编辑器、SQL 或网络。
  - `createLabOcrMediaView({request,read,replace,onChanged,onStatus})`（M02）：唯一 UI 适配器 façade，公开 `rows/scan/downloadOne/downloadAll/previewCell/actionCell/setActive/dispose`。不创建新的 Grid 或持久化文本，依赖 Workflow 提供的单一编辑端口。
- Frame 公共新增端口 `replaceMdMediaReferences(edits)`：在同一 CM6 事务验证原文、范围、路径，保留物理行数和稳定 LineID。`patchMediaRows(rows)` 只差量更新已有 AG 表，不反复重建 Grid 或缩略图。
- Lab 后端：`GET media-inventory`、`GET media-status`、`GET media-file`、`POST media-chunk`；均带工作区，复用现有 Cookie/root/Origin、HTTP Range 和本地内容类型检查，不直连公网任意主机。图片范围与 Main 保持一致：MinerU CDN HTTPS（测试为 loopback）、JPEG/PNG/GIF/WebP；音频、视频及任意来源尚未支持，不伪报覆盖。

## 最小验收证据

- `python3 -m unittest discover -s tests -p 'test_lab_ocr_media_api.py' -v`：独立本地书籍中的媒体目录、内容读取、原有状态接口、非法路径/Origin/方法/未经授权工作区拒绝。下载过程用假响应，不进行真实 CDN 下载。
- `node tests/lab-ocr-media-view.browser.test.mjs`：Chromium + iPad WebKit，合成书籍的多处同 URL 引用、部分续传、一份下载替换多处 URL、未引用文件、CM6 单事务 Undo/Redo、原 LineID 保留、MD CAS 保存，且不修改 Block SQL。
- Main `Media` 直接契约可沿用 `tests/media-public-contract.browser.test.mjs`，此实验模块不修改 Main Media 本身。

## 待扩展

- 支持非 MinerU 图片源或其他媒体类型前，另立 URL/文件类型/重定向/大小/MIME/SVG XSS 和失败回退的安全契约与测试，不放宽当前服务端 allowlist。
