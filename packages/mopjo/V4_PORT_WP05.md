# WP05 · V4 章节清洗 MOPJO Port v1

## 状态与边界

- **接口原型已实现**：`src/v4Port.ts`，只有 `@ocr2md/mopjo` 内部依赖，不修改 WCP、V4、Vault 或真实章节。
- **真实 V4 页面尚未切换**：当前 `plugins/chapter-cleaning/cleaning.js` 仍启动旧 `V3Workbench`、通过 `clean.chapter.begin/append/commit` 写入整份 MD。当前 CQE 只能原样保存 MD，**不具备 MOPJO 章节增量 CAS 语义**，不可将两者混称已接通。
- 这个 Port 是供 V4 章节清洗通过自身模块边界调用的数据服务契约；WCP 内核不需知道 DIRjson、PDF 坐标或具体编辑逻辑。

## 权威数据、不变量

一章的权威状态为：`{immutable <stem>.dir.json, mutable <stem>.changes.json}`，且其原始 PDF 只读。MD 始终由 `chapterMarkdown` 派生，无独立文件权威。没有打开过整书 DIRjson 的章节也可单独工作。修改内存草稿 **不产生 IO**；明确点击保存时只调用 `commitDelta()`，且必须由有权限的服务端实现 **原子** expected-bytes CAS。调用方不可把本仓库测试桩中的“二次比较 + rename”当成生产跨进程 CAS。

`V4ChapterPort` 唯一约束：

```ts
interface V4ChapterPort {
  listChapters(): Promise<readonly string[]>;
  readChapter(filename:string): Promise<{
    original:Uint8Array; delta:Uint8Array; pdf:Uint8Array
  }>;
  commitDelta(filename:string, expected:Uint8Array, updated:Uint8Array): Promise<void>;
}
```

读操作必须由已授权 Vault/文件服务封装，不能直接在浏览器暴露 Mac 绝对路径、用户凭据或写权限。不能用旧的整章 MD commit 代替 `commitDelta`。真实后端需保证 revision CAS 是**单个原子条件提交**，并防护路径穿越和符号链接。Port 里对书籍文件名做了第一层验证，防护本地存储由宿主负责。

## 章节清洗面向 UI 的方法

| UI 需求 | MOPJO Port v1 方法 | 边界 |
| --- | --- | --- |
| 导航目录 | `MopjoV4ChapterSession.list(port)` | 返回合法章节文件名；不会自行扫描 Vault |
| 打开单章 | `MopjoV4ChapterSession.open(port,filename)` | 重验原始 JSON、增量、PDF 来源；版本 SHA |
| AG 元素与原始来源 | `elements()`, `evidence()`, `segments()` | 包含 OCR 与未验证 discarded 的区别 |
| 标题/注释审核 | `tree()`, `notes()` | 不能伪造注释自动配对 |
| CodeMirror 文本 | `markdown()`、`editMarkdown(fullText)` | 一次仅接受安全、可归属单块编辑；旧稿拒绝 |
| 结构化编辑 | `operate(semanticOp)` | 由 MOPJO 验证来源与操作边界 |
| PDF.js ↔ MD | `pdfPoint(page,x,y)`, `markdownOffset(fullOffset)` | 坐标按 PDF 全书原页和归一化 0..1；MD 偏移统一含投影版本头（UTF-16） |
| 脏状态、放弃 | `summary()`, `discardDraft()` | 内存草稿；不触碰磁盘 |
| 保存 / 重开 | `save()`, 重新 `open()` | 增量 CAS、原始证据及 MD 重放读回验证 |

## 下一项生产接线工作

V4 的 **chapter-cleaning 组件**需要使用上表接口替换旧 Workbench 的章节状态读写。由业务侧（不是 WCP 内核）定义版本化、可校验的 CQE 消息，并让 filesystem 服务只处理已授权的章节 `dir.json` / `changes.json` 加条件更新；若使用浏览器运行时，MOPJO 内核应在 Mac 文件服务侧提供调用出口，不把 Node 文件依赖打进浏览器 UI。UI 三窗和 PDF.js/AG Grid/CodeMirror 应留在该业务组件，不修改公共 WCP。

该操作会触及 `ui-spikes/v4-directory/`，须独立开始 AEL 边界账本、按功能契约/UIC 验收。此前决定“WP05 只动 `packages/mopjo/`”，因此此步骤 **尚未执行**，不属于目前 Port v1 的通过声明。

## 验收

```bash
npm --prefix packages/mopjo run test:wp5
npm --prefix packages/mopjo test
```

固定只读真实书 `Bufett’s Alpha` 现有保存 IR 和章节映射，测试仅在临时目录创建 6 章文件样本；校验 224 块、315 OCR 证据（含 91 个未验证 discarded）、版本头 UTF-16 偏移、内存草稿、增量 CAS、冲突拒绝、存储重开、来源 SHA 不变。测试专用 FileChapterPort 仅是单写者模拟，不代表生产并发保证。

**WP05 完结判据：** Port 通过只是 WP05 的数据侧入口完成；仍需 V4 真实页面调用、持久服务原子 CAS、三窗交互 UIC 和 iPad/公网验收后，才可称整个 WP05 集成完成。
