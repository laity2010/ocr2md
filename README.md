# ocr2md

`ocr2md` 是一个本地运行的 OCR Markdown 校对、标定和结构化导出工作台。它不会修改源 Markdown，而是保存人工标定，并在导出阶段生成修正后的章节文件。

## 功能

### 标题

- 扫描 Markdown 标题和疑似纯文本标题
- 修改标题文本、层级和逻辑序号
- 批量设置导出目录名
- 指定导出文件名并按标题边界拆分章节
- 在原文位置手动新增标题

### 注释

- 提取注释引用候选
- 标定引用、正文或排除类型
- 设置注释组并绑定对应标题
- 导出为 Markdown 脚注：引用使用 `[^注释号]`，正文追加为 `[^注释号]: 正文`

### 图片

- 提取 Markdown 中的外部图片链接
- 下载图片到 `output/imgs/`
- 导出时将已下载图片的外部链接替换为本地路径

### 非法断行

- 检测 OCR 或排版造成的疑似非法断行
- 支持多选设置高、低置信度
- 可按高、低或全部候选筛选和复查
- 导出时只合并高置信度断行，低置信度保持原样

### 翻译

- 独立处理 `output/**/*.md` 中已经清洗导出的 Markdown
- 按空行切分正文文本块，层级标题即使没有前后空行也作为独立文本块
- 数据表覆盖文件中的非空内容行，并标记 `YAML 元数据`、标题、文本、列表、图片、图题、图注、表题、表格、表注、公式、代码、分隔和注释正文等类型
- 用于合法切分文本块的空行不显示在数据表中；列表、图片源、代码、公式等结构行默认标为不翻译，但仍保留
- 支持编辑译文、批量设置状态、保存翻译工作区
- 导出 `org` 原文、`trans` 译文、`cross` 交叉三套 Markdown 到 `output_translated/`，不覆盖清洗后的中文章节文件

### 工作区

- 扫描输入目录下的 `.md` 文件，自动排除 `output/`
- 支持表格筛选、三字段排序和多选批量操作
- 保存当前模块、筛选、排序、选择和面板布局
- 在预览窗中定位原文，在控制台查看扫描、下载和导出进度

## 运行

使用 Python 3.11 或更高版本。当前工作区推荐使用共享环境：

```bash
/Users/daisor/Documents/Github/.venvs/py313/bin/python -m ocr2md_workbench.server
```

打开页面后，在顶部输入 OCR Markdown 目录并点击“扫描”。

也可以启动时指定目录：

```bash
/Users/daisor/Documents/Github/.venvs/py313/bin/python -m ocr2md_workbench.server "/path/to/input"
```

默认地址为 [http://localhost:8765/](http://localhost:8765/)。

## 输出

工作目录内会生成：

```text
source/
├── md-workspace
├── output/
│   ├── title_manifest.json
│   ├── translation_manifest.json
│   ├── translation-workspace
│   ├── imgs/
│   └── 导出的章节文件.md
└── output_translated/
    ├── org/
    │   └── 原文章节文件.md
    ├── trans/
    │   └── 译文章节文件.md
    ├── cross/
    │   └── 交叉章节文件.md
```

- `md-workspace`：完整标定数据和界面状态
- `output/title_manifest.json`：可读的标定清单
- `output/translation-workspace`：翻译文本块、译文和翻译界面状态
- `output/imgs/`：下载后的图片
- `output/**/*.md`：按标题设置拆分并完成注释、图片和断行修正的 Markdown
- `output_translated/org/**/*.md`：按 `output/` 结构生成的原文 Markdown，普通文本按句输出 `^sid-块号-句号` 并用一个空行分隔句子，标题和嵌套块、注释正文等结构块在 ID 后输出 `空行 + <br> + 空行`；嵌套块的 ID 前先输出独立 `>` 行
- `output_translated/trans/**/*.md`：按 `output/` 结构生成的译文 Markdown，普通文本按句输出 `^sid-块号-句号` 并用一个空行分隔句子，标题和嵌套块、注释正文等结构块在 ID 后输出 `空行 + <br> + 空行`；嵌套块的 ID 前先输出独立 `>` 行
- `output_translated/cross/**/trans2org 原文件名.md`：译文对照原文，标题和普通正文逐句用 `>[! ds]-` callout 加 `>![[...#^sid]]` 嵌入预览到 `output_translated/org` 中相同 `^sid` 的原文位置；嵌套块、图表注等非正文内容按同一个 `block_no` 整体用 `^bid` 交叉对照，嵌套块的 ID 前先输出独立 `>` 行；注释正文直接输出 `译文 + <br>原文 + ^bid`，避免注释块嵌入无法渲染；块分隔使用 `空行 + <br> + 空行`
- `output_translated/cross/**/org2trans 原文件名.md`：原文对照译文，标题和普通正文逐句用 `>[! ds]-` callout 加 `>![[...#^sid]]` 嵌入预览到 `output_translated/trans` 中相同 `^sid` 的译文位置；注释正文直接输出 `原文 + <br>译文 + ^bid`

## 测试

```bash
/Users/daisor/Documents/Github/.venvs/py313/bin/python -m unittest discover -s tests
```
