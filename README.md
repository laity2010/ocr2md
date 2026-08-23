# ocr2md

`ocr2md` 是一个专用于 OCR Markdown 标定的 VS Code 扩展。项目仅保留四个工作模块：

- **章节定界**：合并序列 Markdown、维护定界工作稿，并按一级标题导出章节。
- **章节标题**：在章节工作稿中检查和调整标题层级，显示相对 `chapters/` 原件的增删改。
- **注释**：扫描注释引用与正文、配对确认，并维护订正工作稿。
- **图片**：扫描图片标题、链接、文本和 HTML，支持下载外部图片。

各模块的数据表统一支持 `已删除` 软标记。被标记的记录会保留用于审计，但不会参与订正、配对、导出或图片下载。

数据表固定为 `多选`、`行号`、`行类型`、`预览` 四列。单击“行号”“行类型”或“预览”可设为主排序；按住 `Shift` 再单击其他列可追加多列排序，箭头后的数字表示排序优先级。章节文件、注释 Pair 与图片本地路径显示在预览单元格内。

## 工作目录树

侧栏目录按处理状态显示为固定工作流树，而不是把 Markdown 文件平铺：

```text
工作目录
├── ocr
│   └── 未带章节定界 YAML 标记的原始序列 Markdown
└── chapters
    └── 章节文件
        ├── 标题
        ├── 注释
        └── 图片
```

- Markdown 开头的 YAML 没有 `ocr2md_chapter_split: true` 时，文件归入 `ocr`，并按自然序参与合并。
- 旧版输出目录 `output/` 与 `output_chapters/` 不参与新工作流扫描，也不会被删除。
- “创建/打开定界工作稿”将 `ocr` 中的序列文件拼接为工作目录根层的 `.ocr2md-merged.working.md`。
- “导出章节”将结果写入 `工作目录/chapters/`，作为该章只读原件，并写入 `ocr2md_chapter_split: true` 等章节定界 properties。
- 工作稿相对原件有改动时，章节 YAML 写入 `ocr2md_chapter_changed: true`，目录树中该章节会着色并标注“已变动”。
- 点击 `chapters/章节文件/标题`、`注释` 或 `图片`，打开该章工作稿；数据表只处理这一章，增删改相对 `chapters/` 原件比较。

## 开发运行

```bash
npm install
npm test
code .
```

在 VS Code 中按 `F5` 启动扩展开发宿主，然后打开包含 Markdown 文件的目录。

## 数据与输出

- `.ocr2md/`：模块基线、工作稿和标定 sidecar。
- `.ocr2md-merged.working.md`：章节定界合并工作稿。
- `chapters/`：章节定界导出的章节原件，用作比较基准；有工作稿改动时 YAML 含 `ocr2md_chapter_changed: true`。
- `.ocr2md/chapter-working/`：章节工作稿；标题层级、注释和图片相关改动写在这里。
- `imgs/`：图片模块下载的本地图片。

源 Markdown 不会因为数据表中的 `已删除` 标记而被删除。
