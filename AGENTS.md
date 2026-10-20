# OCR2MD V6 本地约定

V6 从零开始，不继承或引用 V5 及更早工程备忘、AEL、旧组件实现。只读取本仓库的工程规范。
编码构建必须经 `python3 scripts/v6_git.py build --change "..." --purpose "..." -- <构建命令>`，每次都留本地提交。
工程备忘只维护在 `ENGINEERING_MEMO.md`；添加时按编号计数，**超过 20 条主动提醒用户**。
日终只在用户审查批准后 squash；未经明确批准，不向 GitHub 推送。故障先恢复可用构建，不执行硬重置/清理/强推。
