# OCR2MD · 联邦 Git 留痕与执法契约（GIT.md）

> 宪法第二层，与 BUILD.md、COMM.md 同级，对所有州、活动 worktree 和新构建生效。AGENTS.md 是上位法；BUILD.md 管施工、验收及回退，本法只管 Git 证据和门禁。联邦授权之外不得修改。

## 1. Git 是唯一构建历史

- 一构建一正常 Commit；成功、失败、回退、阻塞、违宪都留 Git 记录。不得另立 WP 历史文档或平行台账；README 只记现行架构、接口及执行细则。Git Notes（`refs/notes/commits`）追加发布后证据、历史纠偏及违宪事实，普通 push 同步；不得以补注洗白原违规或改写历史。
- 提交标题概括本轮工作；提交正文须有以下各一行（中文或 ASCII 冒号均可）。验收记录实际命令、通过/失败/跳过结果及未覆盖范围，不得虚构 PASS。基线为已知完整 Git SHA；回退注明失败 SHA、恢复点及复验，违宪注明事实及处理。字段允许附加说明，不以空洞占位代替证据。

```text
目标：本次构建的独立目标与原因
基线：40位完整 Git SHA
变更：变更边界及不变事项
验收：实际命令与结果；未执行项、失败证据或阻塞原因
结果：PASS / FAIL / BLOCKED（只填一个）
发布：REQUIRED / NONE / ISOLATED / FORBIDDEN（只填一个）
违宪：无，或事实、受影响 SHA 与处置
```

- REQUIRED 表示运行构建须经 BUILD 的发布、线上身份核验才能结束；NONE 表示无运行变更（例如纯立法/文档/工程执法设施），不制造产品发布；ISOLATED 表示按获准的隔离实验范围验收、不晋升；FORBIDDEN 表示失败/阻塞证据，禁止当作可发布构建。FAIL/BLOCKED 只能为 FORBIDDEN；失败证据可以提交、独立保存及普通 push，不可把失败 tip 推为正常活动分支。先保全现场再回退；正常回退提交同样具备上述字段。

## 2. 联邦唯一执法程序

- 联邦根 `.ops/git-gate.py` 与 `.ops/git-hooks/` 是统一运行入口；对应的 Git 跟踪位置为 `main/constitution/git_gate.py` 和 `main/constitution/git-hooks/`，仅为物理版本化位置，不归 Main 州管辖。所有活动工作树共享 Git common-dir 的 `core.hooksPath`。`commit-msg` 拒绝缺字段/占位/无效基线/矛盾状态；`pre-push` 再检查自立法生效后的提交，拒绝未合规的新提交及活动分支 FAIL/BLOCKED tip。历史证据分支不因失败而禁止保存。Notes 引用不作为业务源码提交检查。
- 正式发布候选由同一程序 `python3 .ops/git-gate.py check-release --tree <worktree> --commit <SHA>` 检查实际 Git 提交与祖先记录；新候选须 PASS 且 REQUIRED，工作树须干净（历史恢复按 BUILD 明确批准及已验收证据）。任一不符非零退出。发布器应在任何发布写操作前调用该入口；未接入的旧发布器不得宣称已具备自动门禁，调用者须先执行该程序。发布后的实际 SHA、入口、版本、哈希及失败/回退结果追加 Git Notes 并普通 push。
- 新法由不可改写的 annotated tag `federal-git-gate-v1` 固定生效点及旧历史边界，旧 SHA 不倒签；旧历史查已有 Notes，不凭旧提交缺字段推断验收失败。历史发布仅在符合 BUILD 的真实已验收恢复范围使用；程序不把豁免称为 PASS。
- 安装、同步或新工作区：先读取本法，运行 `python3 main/constitution/git_gate.py install`，再运行联邦布局检查及 `python3 .ops/git-gate.py status`。不允许擅自停用 hook、改 config、使用 --no-verify、commit-tree 等规避执法。Git 客户端权限可绕过本地 hook，程序不能强制聊天不中断或验证自然语言测试结果真实；不得把格式校验冒充业务验收。远端保护及所有发布器的实际接入状态以真实检查为准。
