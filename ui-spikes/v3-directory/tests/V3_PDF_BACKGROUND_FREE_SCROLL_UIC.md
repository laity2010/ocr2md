# FC-V3-PDF-BACKGROUND-001 / UIC-V3-PDF-FREE-SCROLL-001

- 功能：书籍 PDF 在 Markdown 预览期间后台加载，PDF 标题定位只执行一次，滚动优先于自动定位。
- 操作：设置书籍工作目录 → 保持 MD 预览 → 等待 PDF 元数据及首屏按需渲染；点击 AG/源码标题 → 打开 PDF 标签；随后滑动滚轮/触摸拖动 PDF，必要时切回 MD 再打开 PDF。
- 需要：工作目录有获授权 PDF；OCR→PDF 位置来源校验有效；PDF.js 使用 Mac Vault authenticated Range FS。
- 效果：不需要先进入 PDF 标签也能在后台得到 PDF ready，保留实际宽高以便 PDF.js 按需渲染可见首屏。标题定位后显示来源框，首次聚焦可以滚到来源区域；之后 PDF 页面可以任意连续浏览，不被自动定位反复拉回。切换 MD/PDF 标签不重复定位；只有下一次明确选择新标题或手动点击定位才跳转。
- 不变量：不能把整本 109MiB PDF 放进内存；保持 Range chunk、懒加载页、iPad raster cap；不修改 PDF / DIRjson / MD；后台 PDF 无点击事件，不遮挡 MD 预览；用户 wheel / touch / pointer scroll 停止所有等待中的自动聚焦，不误取消用户下一次主动定位；来源框高亮不能因相同 PDF 页反复渲染而强制滚动。
- 自动化：`tests/chapterPublishBrowser.cjs`，在隔离的 2 页 PDF 中断言后台 PDF ready 且首屏容器有尺寸、焦点框可见、用户滚动自由、标签切换保留位置、明确重新选标题可以新定位。Chromium + WebKit。
- 人工审核：待用户在 iPad Safari + 实际大 PDF 上验收触摸滚动、延迟渲染和范围加载。


**2026-10-11 · PDF 可见首帧完成门槛（继承本 UIC）**：原来的“后台 PDF ready”只在 PDF.js `pagesinit` 之后触发，并不保证 Canvas 已完成绘制；当前改为第一页实际 `pagerendered` + 非空 Canvas 后才 ready/解锁 PDF Tab。MD 下 AG 选择非首页可触发 200ms 合并的目标 PDF 页预热，PDF 完成代表目标页也画好；切换 MD/PDF 不再重复宽度不变的 PDF.js 更新。完整契约与双浏览器回归见 `V3_PDF_WARM_FIRST_FRAME_UIC.md`，脚本 `npm run test:pdf:warm-start` 及 `npm run test:pdf:target-warm`。保持本 UIC 的用户滚动优先规则、懒加载 Range 和零写入约束不变。
