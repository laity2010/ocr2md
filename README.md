# ocr2md

本项目用于 OCR 后 Markdown 文件的标题标定、目录修正和后续章节切分。

第一版提供一个精简本地网页工作台：

- 扫描输入目录下的 `.md` 文件，排除 `output/`
- 纵览 Markdown 标题和疑似标题
- 修改标题文本、层级、书籍归属、书内序号、全局序号
- 在原文行附近补充手动标题
- 保存独立标定文件到 `输入目录/output/title_manifest.json`

## 运行

使用共享 Python 环境：

```bash
/Users/daisor/Documents/Github/.venvs/py313/bin/python -m ocr2md_workbench.server
```

打开页面后，在顶部输入 OCR Markdown 目录并点击“扫描”。

也可以启动时指定目录：

```bash
/Users/daisor/Documents/Github/.venvs/py313/bin/python -m ocr2md_workbench.server "/path/to/input"
```
