# Media · 最小公开契约样板（WP0–WP2）

**冻结源**：`main@9c47e44f1fc6b44b4f126030d68008854aced6ca`。
**工作范围**：仅 Media 公开接口归类及直接契约测试；不改 Media 实现、CMD、Main、AM Schema、正式流程，也不进入 WP3/4。

## WP0 · 来源及边界

Media 业务实现归属：`ui/media-module.js`、`scripts/v6_media.py`；`ui/media-module.css` 只影响媒体显示。HTTP 请求由应用服务转发给 `scripts/v6_media.py`，不是其他业务模块可以直接调用的稳定公共契约。原媒体源码哈希（SHA256）：

- `ui/media-module.js`：`6e79a99635ebad2026bb5cda6b45326694fc10126809c81b92fbc0d43899def2`
- `scripts/v6_media.py`：`bbebc0a493510d50f00202a4f420deb576a8ad2c48ad95d069f50776b39d4ca3`

本次不将 R11 尚未通过的全量审计冒充 Main 的合格基线。**已知既存阻断**：原 Main 的 `registry.sql` 至少有 P23 的 `callback`、P25 的 `constructor-callback`、L83 的 `module-port` 三种 Schema 不接受的 visibility，并有 `C63` 重复登记。正常 `python3 tests/am/am.py build` 返回 `AM_ERROR: CHECK constraint failed: visibility IN (...)`，故**不能声称全 AM 注册表验收 PASS**。此问题与 Media 无关，保留证据，不在本航点擅自修复。

## WP1 · 三个真实的 JavaScript 顶层公开入口

AM 唯一接口登记仍是 `tests/am/registry.sql`（A01～A13）。本文件仅解释其当前实际代码形态及服务边界，不建立第二份接口登记表。

| AM ID | JS 对外导出 | 入参 → 返回 | 责任及真实消费者 |
|---|---|---|---|
| A01 | `createMediaModule` | host、读文档函数、CMD port、状态回调 → Media façade | Layout 创建 Media AG；通过 façade 的 `scan/downloadAll/setActive/setVirtualQuery` 协作，下载与原文替换由 Media 统筹、CMD 原子提交 |
| A02 | `findMedia` | Markdown 原文 → 带 URL、来源范围的只读引用列表 | WCP 文档索引 + Media 自身读取媒体引用；不得读取原始 MinerU 证据内容 |
| A11 | `uploadPastedImage` | 剪贴板 Blob → Promise<本地路径> | Main 粘贴入口调用；此为既有兼容功能，不属于批量下载核心，暂不搬迁避免越界重构 |

**不要误计**：A03/A04/A05/A13 是 **A01 返回对象上的方法**，实际通过 Layout 使用，其行为仍包含在 A01 façade 契约中；A06～A10/A12 是 Media Python 服务实现和读取操作，依旧保留原有测试，并非六个新增的 JS 跨业务模块公共入口。

所以现阶段是「**3 个顶层导出契约、13 个历史 AM 实现登记项**」，**不是已删除或重构成恰好 3 个所有跨层方法**。若以后要迁移粘贴或合并 façade 方法，属于另一轮产品行为/模块变更，不在 WP0～WP2 范围。

## WP2 · 三个公开入口的直接测试

直接测试：`tests/media-public-contract.browser.test.mjs`，HTML fixture 为 `tests/media-public-contract.fixture.html`，在隔离 Vite 页面直接 `import` 并调用 A01/A02/A11；Chromium 与 WebKit 均使用虚拟网络响应，不接触真实文档或媒体磁盘。

- **A01**：断点续传（先 partial 再 complete）、中途授权失败、重复远程引用仅生成一次 CMD 事务、不替换失败项、不自动保存。
- **A02**：Sized Markdown 图片、重复 URL、本地文件、精确源码区间、MinerU 原始证据排除。
- **A11**：不支持格式、空文件、403、非法服务端路径、合法本地路径返回。

登记的直接契约用例：`TC-A01-PUBLIC-DIRECT`、`TC-A02-PUBLIC-DIRECT`、`TC-A11-PUBLIC-DIRECT`。这些只是公开入口的**隔离直接验证**；完整服务端字节校验、断点重启及真实 UI 下载链路仍由历史 `media-browser.test.mjs`、`media-paste-browser.test.mjs` 等集成测试承担，不能用 mock PASS 冒充全部端到端 PASS。

**既有功能保持不变**：没有修改 `ui/media-module.js` 或 `scripts/v6_media.py`；没有修改运行时服务或正式审计脚本。WP3 Git 增量复用机制未实施。

## 本轮真实验证（隔离工作树）

```text
$ npm run build
✓ built in 31.39s

$ node tests/media-public-contract.browser.test.mjs
MEDIA_PUBLIC_CONTRACT_PASS Chromium {"exports":["createMediaModule","findMedia","uploadPastedImage"],"references":4,"resumeRequests":3,"cmdTransactions":1}
MEDIA_PUBLIC_CONTRACT_PASS WebKit {"exports":["createMediaModule","findMedia","uploadPastedImage"],"references":4,"resumeRequests":3,"cmdTransactions":1}

$ python3 tests/am/am.py build
AM_ERROR: CHECK constraint failed: visibility IN ('export','returned','internal','raw')
```

以上 PASS 仅指三个实际导出入口的**直接契约测试**和 Vite 构建，不指全 AM、全部 Media 服务端测试或正式生产验收。源码无变动；不执行 WP3/4，不部署、不合并 Main。

## WP3 · 不修改旧标准的 Git 增量入口

**入口**：`python3 tests/am/am.py incremental <已真实验收的基线 Git SHA> [--head <Git 提交>] [--run-changed]`。

- 仅分析 **Git 提交对象**：模块归属取现有 `ownership.json`，服务端源码路径取现有 `registry.sql`，CSS 视为所属模块的实现文件。**不新建第二份接口登记库**。
- **Media 没改、3 个入口契约测试与归属没改、已有基线 PASS 记录对应原始源码哈希**：`INHERITED_PASS`，`--run-changed` 明确打印 `TEST_SKIPPED`，不重复执行 Media 测试。
- **Media 自身改动**：`RETEST_REQUIRED`。在对应提交的干净工作树中执行 `--run-changed`，运行三个公开入口的直接测试。若修改了 Media Python 服务，额外运行现有真实服务器分块下载与粘贴集成测试，不能仅靠浏览器 mock 证明服务端正确。
- **CMD 的媒体替换端口 / Media 调用方 / Media 使用的共享 UI 文件改变**：保留原 Media 直接测试 PASS，同时返回 `MEDIA_INTERACTION REVIEW_REQUIRED`，由变更模块负责验证联动。不自动把 CMD 变动解释为 Media 自身失败。
- **未有经过确认的 PASS 基线**：输出 `NO_VERIFIED_BASELINE`；其他尚未建立独立基线的模块只列 `UNBASELINED_MODULES`，不虚报已合格。
- **本轮已知限制**：正式全量 AM 数据库仍被原 Main 的登记不一致阻断；本入口只处理 Media 的公开入口样板，不是 12 模块全量认证或正式生产发布门禁。`--head` 指向别的提交时只做判定，不能在当前错误源码上执行测试；执行器要求 HEAD 对齐且工作区干净。

## WP4 · 真实 Git 增量场景

`python3 -m unittest discover -s tests/am -p 'test_incremental_git.py' -v`

用 **真实 Git commit-tree 对象**做三个互不干扰的改动（不移动工作区的 HEAD，不创建新的永久业务分支）：

1. 只修改 `ui/latex-module.js`：LaTeX 标记变更，Media 继承 PASS、不重测。
2. 只修改 `ui/media-module.js`：Media 标记为必须执行它的契约测试。
3. 只修改 `ui/wcp-cmd-element-transactions.js`：CMD 标记变更，Media 自身继承 PASS，CMD→Media 联动单独要求核查。

附加断言：修改公开契约测试自身必须重测；未通过基线不得继承；没有业务变动必须跳过测试。测试选择的 PASS 不等于改动模块获得了独立 PASS（例如 LaTeX、CMD 尚未建立本套新增基线）。
