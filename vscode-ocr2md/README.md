# ocr2md VS Code Extension Prototype

This prototype validates the first ocr2md interaction loop:

- pick a Markdown file from the Activity Bar view
- open a read-only source preview in the editor
- scan footnote refs and bodies
- inspect generated pairs in a Webview table
- click candidates or pairs to reveal and highlight source text

It does not modify Markdown files, write sidecars, or export output.

## Run

```bash
cd vscode-ocr2md
npm install
npm run compile
code .
```

In VS Code, press `F5` to launch the Extension Development Host, then open a folder that contains Markdown files.

Regex presets live in `src/regexPresets.ts`. After changing presets, run `npm run compile` before reloading the Extension Development Host.

## Manual Acceptance

1. Open the `ocr2md` Activity Bar entry.
2. Select a `.md` file.
3. Click `扫描注释引用` and `扫描注释正文`.
4. Click candidate rows and Pair table rows.
5. Confirm that the read-only preview reveals and highlights the expected source text.
6. Click `确认配对` and confirm the table status changes in memory.
7. Confirm the source Markdown file has not changed.

## 注释工作流程
发现不匹配的, 直接定位到原文位置修改.
再用正则搜索,加入到未分类再到注释.
匹配成功, 删除没有匹配的行.

## 修改应在同一行. 要调整行位置的话, 那么其后的行号都会不一样了.
