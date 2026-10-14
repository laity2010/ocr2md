# PDF ↔ Markdown 元素关联 · WP3/8 正式章节与工作 MD 锚点（2026-10-08）

状态：**WP3 纯数据映射引擎、真实章节夹具、单元与实书只读验收已完成；未提交 Sidecar、未更改 UI，人工审核待用户进行。**

## 1. 关联范围、证据路径和边界

输入是 WP1 `MineruElementIndex`、WP2 `compareMineruIndexWithOriginalMd` 的原始 Markdown 定位证据，以及同一书目录的 **6 对正式** `chapters/<name>/<name>.md` 与 `chapters/<name>/<name>.working.md`。

```text
PDF (22 pages) ⟷ MinerU JSON (224 para_blocks)
                       │ elementId, pageIndex, bbox
                       ▼
             MinerU 原始 MD (WP2 anchors)
                       │ original MD ranges + source SHA256
                       ▼
                  章节 MD
                       │ independent UTF-16 ranges + chapter SHA256
                       ▼
               章节 .working.md
                         independent UTF-16 ranges + working SHA256
```

- **只读纯函数** `src/mineruChapterMapping.ts:mapMineruToChapterDrafts(index, originalMd, chapterPairs)`；没有 FS 调用、网络、文件修改或自动审核。
- 源数据以原始 JSON SHA-256 和 WP1 Element ID 身份为主键，每项保留 `pageIndex/pdfPageNumber/bbox/type`；每个 Markdown 锚点保留 Vault 逻辑路径、该文件 SHA-256、UTF-16 半开 `[from,to)`、匹配片段及 80 字符前后文摘要。
- 文件位置**分别**在原始 MD、章节 MD 和 working MD 中查找，不能将某一文件的行号或 UTF-16 offset 搬到另一文件。
- 章节 YAML frontmatter 可能出现同样字符串，不纳入匹配内容范围；返回的 offset 仍按整个文件计数，和 CodeMirror 一致。
- **`01 Buffett’s Alpha 副本/` 只有工作稿、无配对 `.md`，故明确从自动章节映射排除**。不能因为内容相似就自动选择副本；未来如加入独立审核也需显式处理版本身份。
- `discarded_blocks` 91 个不当作正文 MD，仍供注释/页脚审计；任何自动结果的 `manuallyVerified` 必须是 false。

## 2. 精确/局部/歧义判定

- `candidate-complete`：**WP2 原始 MD 完整且唯一**，本元素每个构成 part 在**同一组**正式章节 MD 和工作 MD 中都完整且唯一匹配；属于可直接用于导航的候选，不是用户确认的结论。
- `candidate-partial`：原始文字或章节/工作稿只得到某些完整 part、或长段落在文本改写后只保留了两个有序唯一片段；只提供局部证据，不以片段包围区域伪装成原始文字完整锚点。
- `ambiguous`：重复标题、章节间同文本、文件内多次出现，或原始 MD 本来就不唯一；不能默认选第一个。跨章节分布的复合内容也保守进入歧义。
- `unmatched`：章节/工作稿没有足够证据；不能等价于 MD 缺失、OCR 错误。
- `unavailable`：WP2 判断原 JSON 没有可还原内容（如第 5 页缺 HTML 的表格或 8 个空 `lines` 文本）；不可臆造。

**特殊图片版本：** 本书现有章节 MD 来自另一批 MinerU 资源 URL。只允许对完整 Markdown 图片标记使用**不少于 40 位十六进制内容文件名 + .jpg/.jpeg/.png/.webp**进行候选识别；必须在整个正式章节集合中唯一，才能用于 `candidate-complete`。普通文件名 `image.jpg`、仅 alt 文字、非图片 URL 不可触发此规则。它只是版本间文件名证据，不会请求 CDN 或下载图片。

**安全约束：** 输入章节文件必须为合法成对的 `.md/.working.md`，路径不得包含 `..`、绝对 Mac 宿主路径，且每份文本与传入文件的 SHA-256 一致。用户编辑后需要重新计算证据，旧映射必须失效或重新审计；不得用旧范围写回新版本。

## 3. 《Buffett’s Alpha》真实 22 页验收

固定夹具：`ui-spikes/v3-directory/tests/fixtures/buffett-alpha-wp3.json`（6 对正式章节的**相对路径与 SHA-256**，明确排除副本；这里只保存元数据，不复制源文件内容）。

| WP3 最终状态 | 元素数 |
| --- | ---: |
| 完整唯一候选 `candidate-complete` | **123** |
| 部分匹配 `candidate-partial` | **47** |
| 歧义 `ambiguous` | **9** |
| 找不到章节/工作稿证据 `unmatched` | **36** |
| JSON 内容不足 `unavailable` | **9** |
| 合计 | **224** |
| 排除正文比较的 `discarded_blocks` | **91** |
| 完整文档位置证据（跨原稿/working 两组） | 306 |
| 局部文档位置证据 | 72 |
| **人工审核确认的完整关系** | **0** |

分类型：标题 15 完整、6 歧义；正文 text 63 完整、35 部分、2 歧义、35 未匹配、8 不可还原；图片 6 完整、1 部分；20 条公式和 19 条参考文献完整；表格 8 部分、1 不可还原；图表 3 部分、1 歧义。

此次运行读取并前后哈希复核 **17 份**实际 PDF/JSON/MD/working/copy 等文档，全部未修改。第 8/11 页旋转 PDF 的来源页号和 bbox 保持不变；WP5 才做真实高亮像素对齐。

## 4. 文件与复验

- `src/mineruChapterMapping.ts`：独立三层只读关联引擎（不访问磁盘）。
- `src/mineruChapterMapping.test.ts`：合成样例覆盖三层唯一、工作稿中间改写、两端片段证据、重复标题/跨章节重复、frontmatter 排除、完整长图片指纹、空表、改版 hash/不成对章节/重复 ID 拒绝、结果重跑一致。
- `ui-spikes/v3-directory/tests/fixtures/buffett-alpha-wp3.json`：正式章节文件的固定修订基线。
- `ui-spikes/v3-directory/tests/mineruChapterWp3Real.mjs`：从真实 iCloud 库只读打开，按 fixture 检查修订，不写源文件，只打印统计，校验自动候选没有升格成人工确认。
- `ui-spikes/v3-directory/package.json`：`test:chapters` 和 `test:chapters:real`。

仓库根目录执行：

```bash
npm --prefix ui-spikes/v3-directory run test:chapters
npm --prefix ui-spikes/v3-directory run test:chapters:real -- \
  "/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha"
```

`test:chapters` 编译测试到仓库本地忽略的 `.tmp/wp3`；全仓 `npm run compile` 仍受先前已记录的 `src/v3HttpWorkspaceFs.ts:84` 既有 WIP 类型错误影响，不在此航点修改非关联模块。

## 5. WP4 交接

WP4 将在获得用户授权的 WorkspaceFS CAS 写入能力和版本一致性门禁后，考虑把以上候选的原 JSON 身份 + PDF 区域 + 三层 MD 锚点/文件修订 + 显式待审状态写入 `.ocr2md/pdf-md-map.v1.json`；**保存版本必须与读取时的版本一致**，遇到冲突应拒绝或生成安全冲突处理，不自动覆盖现有 sidecar。

WP3 尚未提供 AG Grid/PDF Viewer 交互；不把 123 个唯一候选说成 123 个“正确 MD 元素”。用户确认与标定功能仍由 WP5–WP8 推进。

人工审核状态：**待用户审核**。
