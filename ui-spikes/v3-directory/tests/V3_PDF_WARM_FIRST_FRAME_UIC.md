

## FC-V3-PDF-FIRST-CANVAS-001 / UIC-V3-PDF-FIRST-CANVAS-001 · 后台完成代表页面真的已绘制

- **初始**：用户选定 `Obsidian/ocr2md/ocr2md/<书籍>` 进入工作台章节定界，默认显示 MD；合法授权的 PDF.js Range 预览在其后以真实布局尺寸后台初始化。顶部 PDF 活动摘要只有 `loading/rendering` 时显示，完成后自动退出。
- **错误原因**：旧 `pagesinit` 仅代表已建立页面视图、知道总页数，旧实现却把 `PdfPreviewStatus.phase` 设为 `ready`，并启用 PDF 标签和清掉后台任务。后续真正的 `pagerendered` 仍可能尚未发生；用户切换 PDF 又无条件调用 `resize()` / `viewer.update()`。实测隐藏与显示面板的 PDF 滚动高度存在 **35px 标签栏差**，即使宽度相同也触发不必要的 Viewer 更新。
- **修复操作**：文档 `getDocument` → `pagesinit` 将状态设为 `rendering` 且向 Viewer 发出背景首屏绘制请求。只有 PDF.js `pagerendered` 且页 1 Canvas 存在并具有非零宽高、没有 render error 才成为 `ready`、启用 PDF 标签并从后台活动栏移除 PDF。PDF.js 渲染报错不能触发 ready，而进入 error。不会后台下载或绘制全书。
- **MD→PDF 切换**：保持隐藏预览的真实宽度，使用已绘制的 Canvas。当 `clientWidth` 不变且模式为 `page-width` 或自定义百分比缩放，即使隐藏面板与显式 flex 面板的 `clientHeight` 相差 35px，也不执行多余 `viewer.update()`，避免 GPU 重绘。`page-fit` 缩放仍需根据真实高度刷新；真正的窗格宽度变化仍执行必要的重新排版。`data-pdf-resize-updates` 保留轻量观测值，初始载入为 0。
- **AG→PDF 非首页定位**：MD 仍在前台时，用户点 AG/OCR 标题，原来的 PDF 页证据继续严格验证。对连续点击采用 `200ms` 合并，只预热最后一次选择的 PDF 页；PDF.js 继续执行懒加载，按需读取其对应的真实 Range 和绘制 Canvas，不打开 PDF 标签、不过早绘制未经审核的 OCR 高亮。目标页完成绘制后，后台 PDF 活动条退出；打开 PDF 标签时复用这张 Canvas，再按原规则应用证据框与首次聚焦。用户自己滚动或手指拖动时仍可取消自动定位。若用户在 PDF 已打开后进入尚未绘制的页，`renderingPage=N` 保持页面可操作、在状态栏显示“正在渲染第 N 页”，绘制成功后退出；页渲染失败保留 error。
- **约束与副作用**：文件服务仍保持 64KiB Range、`disableAutoFetch:true`、`disableStream:true`，iPad Canvas 像素上限 1.5MP，禁止全 PDF Blob 与整书渲染。无 PDF/MD/DIRjson 保存、无后台写入、不预先猜测或修改 OCR 证据，未选择工作目录不访问 PDF。新的本地页缓存只在 PDF.js Viewer 生命周期内，切换书籍、手动重新加载和关闭会释放；不以隐藏状态吞掉失败。
- **回归**：`npm run test:pdf:warm-start`（Chromium/WebKit，真实临时授权 PDF），验证 MD 保持选中、PDF `ready` 时第 1 页 Canvas 真实已绘制、切换 MD↔PDF 复用同一个 Canvas、`pdfResizeUpdates=0`、零 Vault 写入。`npm run test:pdf:target-warm`（双页扫描夹具）核实隐藏 MD 下 AG 明确选择第二页标题后预热第二页、状态完成后复用目标 Canvas、零 Vault 写入。`node tests/irWorkbenchBrowser.cjs` 与 `chapterPublishBrowser.cjs` 进一步覆盖 PDF OCR 定位、用户自由滚动、MD/PDF 切换、章节发布。真实 iPad Safari 的 GPU 性能与实际秒开主观验收仍为 `manual-external`，不以桌面 WebKit 替代真机结论。
