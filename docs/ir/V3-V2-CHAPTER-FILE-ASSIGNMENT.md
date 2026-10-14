# V3 章节定界：沿用 V2 分配章节文件

版本：2026-10-09。状态：已实现、自动化验收中；真实 OCR 标题仍待用户人工审核。

## 复用决策

此处不是“按标题打开弹窗逐个命名”的新流程，而是 **V2 `src/chapterFileAssign.ts` + `src/chapterReviewApplication.ts` 在章节定界时的核心业务语义**：

1. AG 表对 OCR 一级标题显示 `单独成章` checkbox、内联 `章节文件` 输入框。原始 OCR 中 `level=1` 为候选，原 V3 已标定为 IR 主章节的标题也显示在这里（包括 Appendix/References 等 OCR 非一级标题）。非一级标题仍可经次级「标定章节」判定，不让 V2 自动编号把所有小节变成独立文件。
2. 第一条参与 V2 定界的标题不可合并到上一个文件。其他标题勾选→独立文件；取消勾选→并入上一个独立章节文件；本标题仍作为子节保留，原 `blockId`/来源 OCR 元素/PDF bbox 永不丢失。
3. 单独成章的行可直接修改章节文件名（失焦 `change` 暂存），合并的行显示上一个章节文件名但禁用编辑，与 V2 一致。
4. `起始` + `顺序编号` 直接调用 V2 **同一个** `assignChapterFiles(mode:'sequence')` 命名算法，保持按标题自动清理非法文件名字符、数字前导零和顺序递增。合并/取消合并后按 V2 规则压缩后续编号；当独立文件改名，合并的后继小节自然继承新文件名。
5. 自动文件名归属于 IR 主章节的 `fileName`，不写回 OCR/历史 MD；只有 `保存章节定界` 才调用已验证的 WP7 不可变快照 + CAS，并由 IR→MD 生成各章节投影。
6. 原 V3 「标定章节」作为**按需高级操作**保留，供人工将 OCR 低级标题提升为独立章节、明确非章节、填写 PDF 审核证据；V2 的编号操作**不意味着已完成 OCR 人工审核**。`chapterStructure` 保留原 source-linked 候选与编辑操作日志。
7. 新增功能同样经过所有结构校验：目标文件必须是安全、不重复、无目录穿越的 `.md` basename；非法输入拒绝并恢复该 AG 单元格旧值。重复文件名不允许静默覆盖。已有编辑草稿不被自动持久化。

## Feature Contracts

- **FC-V2-BOUNDARY-01** 选择工作台第一个模块 `章节定界`。预期：每条 OCR `level=1`/已提为主章节的标题行提供单独成章勾选框及章节文件内联编辑框，非第一章的勾选可操作；状态不代表人工认可 OCR 正确性。
- **FC-V2-BOUNDARY-02** 取消第二个主章节的 `单独成章`。预期：该行自动显示上一独立章节的文件名且不可编辑；保留标题内容并入上章节 Markdown，后面章节编号压缩一位。再次勾选恢复独立章节与顺序编号。
- **FC-V2-BOUNDARY-03** 输入起始号 `05` 并点击顺序编号。预期：沿用 V2 清洗标题及序号算法，生成 `05 标题.md`、`06 标题.md`；已合并的标题不额外占编号。
- **FC-V2-BOUNDARY-04** 在独立章节的 `章节文件` 单元格编辑文件名。预期：失焦后立即更新 IR 投影与继承它的已合并小节，保留其他章节；修改只暂存，必须明确保存。
- **FC-V2-BOUNDARY-05** 保存时继续复用 WP7 CAS/来源 SHA/读回校验，冲突保留草稿，不覆盖真实 PDF、OCR JSON 和旧 MD。

## UI Interaction Contracts

- **UIC-V2-BOUNDARY-01 · browser-auto** 进入 IRFixture 章节定界。断言第一个一级标题选中独立、禁止取消首章，且章节文件名为内联输入；输入起始序号 05 → 顺序编号 → 输入框值 `05 A Real IR Main Title.md`；再次内联编辑成 `05 Manual Main Chapter.md`，生成 MD 的路径同步变更。零真实 Vault 写入。
- **UIC-V2-BOUNDARY-02 · unit** 3 页人工 fixture 具有 4 个独立章节。先从 09 顺序编号→`09/10/11/12`；第二独立标题取消成章→继承 `09`、后续编号压缩为 `10/11`；再勾选→重新成为 `10`，其他独立章节恢复 11/12。人工文件名更新生效，所有原 OCR 数据可语义重建。
- **UIC-V2-BOUNDARY-03 · unit** 第一标题取消成章、合并行修改文件名、输入非法章节序号或目录穿越文件名、跨章节重名 → 拒绝；操作前 IR 保留。
- **UIC-V2-BOUNDARY-04 · browser-auto** 切换旧逻辑块/关联审核模式、PDF 缩放、AG/源码标题同层级以及保存回归正常。
- **UIC-V2-BOUNDARY-05 · manual-external** 使用真实 `Bufett’s Alpha` 在 iPad 检查 AG 可操作性、每个章节的起始标题和文件名，人工点击确认后才允许原书保存；测试默认只读。

## 测试命令

```bash
npm --prefix ui-spikes/v3-directory run test:ir:chapters
npm --prefix ui-spikes/v3-directory run test:ir:markdown
npm --prefix ui-spikes/v3-directory run test:ir:ui
npm --prefix ui-spikes/v3-directory run test:ir:ui:real
npm --prefix ui-spikes/v3-directory run test:ir:persistence
npm --prefix ui-spikes/v3-directory run test:review
npm --prefix ui-spikes/v3-directory run test:bidirectional
```

## 最终自动化验收与发布（2026-10-09）

- `test:ir:chapters` → `IR_WP4_CHAPTER_UNIT_PASS`：V2 顺序分配 09/10/11/12、并入上一章节后压缩为 09/09/10/11、恢复独立、手动改名、首章不能合并、非法名/重名拒绝、OCR JSON 语义往返均通过。
- `test:ir:markdown` → `IR_WP6_MARKDOWN_UNIT_PASS`：逐章节文件生成、UTF-16 来源索引、PDF bbox 溯源保持。
- `test:ir:ui` → `IR_WP5_BROWSER_FIXTURE_PASS`：V2 AG 内联章节文件框、顺序编号、修改后 MD 路径、PDF ↔ MD 双向导航、iPad 布局及无 Vault 写入通过；高级标定弹窗成功后自动收起，不阻挡右侧工具栏。
- `test:ir:ui:real` → `IR_WP5_REAL_BROWSER_PASS`：真实 `Bufett’s Alpha` 224 IR 块、19 暂定章节及 PDF 来源全部正常，未自动写入真实书籍。
- `test:ir:persistence` → `IR_WP7_BROWSER_PERSISTENCE_PASS`：多浏览器 CAS 冲突拒绝、旧草稿保留和新会话读回通过。
- `test:review` → `WP7_REVIEW_CAS_UNIT_OK`；`test:bidirectional` → `WP6_BIDIRECTIONAL_INDEX_UNIT_OK`；`test:ui` → `V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS`，旧功能正常。
- 线上发布 `ocr2md-v3-v2-chapter-assign-20261009a`。本机和公网 `https://ocr2md.laity.bid/v3-directory/` HTTP 200，界面控件已验证存在。`Bufett’s Alpha` 的 `IR_STATE` 仍为 `{exists:false,generation:null}`，即未擅自替用户保存章节标定。
- 未 reset/clean/rebase/force push；保留原有 Git WIP，本轮未提交。
