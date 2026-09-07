# ocr2md Integration UI Contract Library

这里不是普通的“测试脚本目录”，而是 **Agent 界面互动规格与样例库**。

Agent 开始任何 integration UI 工作前，阅读顺序固定为：

1. `UIC_PROTOCOL.md` —— 互动描述、自动化和调试规范；
2. `CATALOG.md` —— 当前所有已定义 UI 互动；
3. `scenarios/` —— 已固化的真实用户操作样例；
4. `uic/schema.ts` —— 机器可读契约结构；
5. `uic/runner.ts` —— 通用浏览器执行器。

## 常用命令

仓库根目录：

```bash
# 核心测试 + 所有 browser UIC
npm run test:all

# 只跑 UI 回归
npm run test:ui
```

integration 目录：

```bash
# 列出 Agent 当前能自动执行的 UIC
npm run test:ui:list

# 直接跑 browser UIC
npm run test:ui

# Safari/WebKit 运行时可用时额外跑
npm run test:ui:webkit
```

## 当前标准样例

`UIC-CLEAN-001`

将 Buffett’s Alpha 的 376–378 行移动到 359 行，验证：

- 章节标题重新识别；
- 标题在没有前置空行时仍有效；
- 变动行完整列出新增和删除；
- UI 与核心 diff 状态一致。

以后用户报告一个可复现的 UI 问题，优先把它转成一个新的 UIC 样例，而不是只修当下代码。
