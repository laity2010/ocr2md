# @ocr2md/pdf-viewer · 可视化 PDF 公共组件（开发版）

**当前版本** `0.1.0-dev.0`，独立公共包源码在此目录，是从 Main 验证过的 PDF.js Viewer 初始化方式、首页就绪标准与 `pdfOverlayRect` 坐标算法提取的独立模块。Main 既有的 CMD/AG/ViewStore、文件路径、文本提取和结构编辑逻辑均不在此包中。

**目前尚未发布到 npm/GitHub Packages**，`private: true` 防止开发期误发布。`lab-pdf` 使用 Vite 直接导入 `src/index.js` 进行真实界面和 API 验收。后续构建独立可分发包、规范版本后，其他 Git 工作树再通过可锁定依赖升级，不应复制实现。

## 公开 API（V1）

```js
import {createPdfViewer} from '@ocr2md/pdf-viewer';
const viewer=createPdfViewer(host,{
  onBlockClick:({blockId,parentId,label,pageIndex})=>{/* 交给 AG/CM6 宿主 */},
  onPageChange:({pageIndex})=>{},
  onStatusChange:({status,message})=>{},
});
await viewer.open('/pdf/authorized-read-only.pdf'); // 或 Uint8Array；仅加载一次
viewer.setBlockOverlays([
  {blockId:126,parentId:125,label:'p4b3s0',pageIndex:3,
   bbox:[80,120,450,165],pageSize:[595,842],type:'text',status:'normal'},
]);
await viewer.focusBlock(126);
viewer.dispose();
```

| API | 约定 | 直接测试 |
| --- | --- | --- |
| `createPdfViewer(host, callbacks)` | 创建自带工具栏、PDF.js 连续页面和文字层的界面；不能在一个 host 重复挂载 | `tests/lab-pdf-viewer.browser.test.mjs` |
| `open(source)` | 接受 URL 或 Uint8Array，加载页面并等待首页真正绘制成功；失败报错并发事件；一个实例仅能 open 一次 | 同上 |
| `setBlockOverlays(blocks)` | BlockID 索引，完整覆盖当前集合，增量刷新被改变的页面；不重载 PDF/文字层；支持 0-based bbox/pageIndex | `packages/pdf-viewer/tests/geometry.test.mjs` + 浏览器 |
| `focusBlock(blockId)` | 按 BlockID 滚动到原始 PDF 对应页、覆盖框并高亮，不触发 AG 写操作 | 浏览器 |
| `dispose()` | 撤销事件、渲染资源与 DOM，允许 Dockview 关闭/重开；重复调用安全 | 浏览器 |

事件**只有通知语义**，不修改项目数据。`status` 值为 `info`/`ok`/`error`，由调用者送到统一状态栏。

字段规则：`blockId` 为数字或字符串稳定身份，同类值唯一；`parentId` 是同类型的外键/父 ID，可能随人工编辑变化；`label` 是 PBS 或任意可变文本，不用于定位/关联；`pageIndex` 从 0 计；`pageSize` 和 bbox 使用 **MinerU 顶左坐标系**，必须与 PDF 页面比例/方向一致，否则拒绝覆盖。`status='empty'` / `missing` 用虚线。覆盖框透明区域不阻挡 PDF 文字选取，点击标签触发 `onBlockClick`。

公共包负责 **PDF 加载、页面导航、放缩、文字层、覆盖框、选中高亮、重新绘制及事件**。宿主负责权限读取、OCR/SQLite、BlockID/ParentID/PBS 来源、持久化和跨窗定位。当前版本未实现父子拖动、编辑 bbox、侧栏避让引线或 OCR 原文提取，后续均应以公开契约和直接测试逐项增加。

## 开发验证

```bash
python3 scripts/generate_lab_pdf_fixture.py  # 生成原创的、无隐私内容的样本 PDF
node --test packages/pdf-viewer/tests/*.test.mjs
node node_modules/vite/bin/vite.js build --config labs/lab-pdf/vite.config.mjs
node tests/lab-pdf-viewer.browser.test.mjs
```

静态 Lab 不访问用户本地工作区，也不会调用 Main 的 `/api/pdf`。部署复用统一 `/labs/lab-pdf/` 目录与既有静态发布器。组件资源由 Vite 生成带哈希的 JS、PDF.js worker 和 CSS；不得另建 Tunnel。
