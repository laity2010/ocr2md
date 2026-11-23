# WP20 · 行号菜单「提取文本插入」「提取文本替换」

## 用户交互

行号按钮跟随**光标焦点行**（V1 Frame 组件样式）；菜单由原「删除当前行」扩展为三个动作：

- **删除当前行**：保持 WP17/V2 语义，只清空 `md_block`，保留逻辑块、空行、PBS 和虚拟 LF。
- **提取文本插入**：从**菜单所在源码行的 `logical_id`** 查找其唯一 PDF bbox 和物理页，不依赖 PDF 窗口原先高亮的块；通过 PDF.js `getTextContent()` + `pdfTextInBox` 只提取该框内原生文字层，按 WP14 单行规则归一化，再插入当前行的光标位置（若光标已移动至别的行则插入目标行开头），原 `md_block` 其余文字不变。无自动补空格、去重或改写 OCR 纠错；用户若要替换使用另一个动作。
- **提取文本替换**：相同 PDF 来源，当前 `md_block` 全文替换为提取的单行 PDF 原文，其余 266 个块不变。

打开菜单后两项 PDF 操作先显示为禁用，等待原 PDF.js 文本层加载结果。只有当前 PDF 实例有效、授权工作目录一致、目标逻辑块原始 bbox 有非空原生文字时才启用；无原始文字层、原始 bbox 失效、PDF 未加载时维持禁用。每次操作均以菜单捕获的 `logical_id` 为编辑身份，PDF 窗口选中其他框时也不会拿其文字替代。取消菜单或切换工作区后旧请求不落盘：菜单在 CM6 `load/clear/structure` 消息时立即关闭，`getPdfText` 返回加载时的 workspace 快照，`onPdfText` 写入前再次要求当前工作区与快照严格一致；操作阶段再次验证当前 CM6 logical ID 是否仍存在。菜单仍随页面滚动/焦点外点击关闭，保留 V1 触摸行为。

## 技术边界与现有模块

- **行号组件**：V2 `ui/v2-md-line-gutter.js` 继续以 V1 `ui/frame/md-line-gutter.js` 为基线，**仅 V2 副本**扩充 `getPdfText(logicalId)` 和 `onPdfText(logicalId,mode,text)` 两个可选外部端口。此后 V2 副本不再和 V1 字节完全相同；V1/Frame 实际源码及 API 不修改。菜单按钮样式与无障碍角色不重造。
- **PDF 组件**：V2 已有的 `ui/lab-ocr/pdf-viewer.js`（原 V1 PDF 实现在 V2 内的复制源）增加唯一只读方法 `readNativeTextInBox({page,bbox,pageSize})`。它复用同一个已加载 PDF.js `pdf` 与 `nativePageTexts` page text cache，不新建 PDF.js viewer、不另发 PDF 请求、不修改 V1 工作树。`ui/v2-pdf-viewer.js` 通过 `projection.byId` 取得真实物理页和 bbox，公开 V2 `getNativeTextForLogicalId(logicalId)`，并在 PDF 关闭/工作区更改时拒绝旧异步结果。
- **唯一正文**：`ui/v2-source-session.js` 仍以 `logical_block.md_block` 的 CM6 单文档为可写权威。扩展 `insertPdfText({blockId,text,mode='insert'|'replace'})`；复用现有 WP17 整文档位置重映射和 `blockTextEffect`，只允许目标行内容发生改变，Undo/Redo 及 SQL `md-commit` 旧值校验与 WP18 前缀安全规则保持一致。SQL 的 `logical_id`、PBS、逻辑行序、基础表、源 MinerU/PDF 均不变。全局顶栏通报结果，PDF 原工具栏按钮保留原插入路径。

## 验收门禁

- `tests/v2-line-pdf-extract.browser.test.mjs` Chromium/iPad-WebKit：真实 V2 + V1 PDF.js 文字层的合成 PDF；无字块的两个行号菜单项必禁用；PDF 先高亮 logical 12，再用菜单 logical 11 读取 logical 11 bbox；从行号菜单插入（光标位于正文第 10 字符）、替换分别落在同一 CM6 逻辑块，切换工作区清理旧菜单；Undo/Redo、SQL 9 次真实旧值提交、0 PBS 结构提交、PDF 获取只 1 次；保留原 V1 PDF 工具栏按钮及旧行号删除行为。
- 原真实 22 页 Berkshire PDF + 267 logical blocks 的 Chromium/iPad-WebKit 浏览器套件、WP15 跨页表格恢复、WP18 防前缀损伤、WP19 滚动焦点分离和 V1/AG 跨版本发布门禁继续通过。
