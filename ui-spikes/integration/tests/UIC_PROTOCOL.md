# UIC：Agent 界面互动调试规范

UIC = **UI Interaction Contract（界面互动契约）**。

它不是单纯的测试代码，而是 ocr2md 对每一个用户交互的可读、可执行规格。目标是让未来任何 Agent 不需要重新猜产品意图，就能知道：

> 用户在哪里、看到什么、做什么、界面必须发生什么、数据必须发生什么、哪些事情绝不能发生，以及如何验证。

## 一、一个交互为什么需要 UIC

UI bug 常见的根因不是“按钮坏了”，而是不同层之间的约定失联：

```text
用户动作
→ DOM / CodeMirror / AG Grid
→ 应用状态
→ 扫描 / 标定逻辑
→ working / sidecar / Drive
→ 页面重新渲染
```

UIC 必须覆盖这条链，而不是只验证某个函数返回值。

## 二、每个 UIC 的标准字段

可执行类型定义在：

`tests/uic/schema.ts`

每个交互至少包含：

| 字段 | 含义 |
| --- | --- |
| `id` | 永久稳定编号，例如 `UIC-CLEAN-001` |
| `title` | 人类可读名称 |
| `area` | 所属界面区域 |
| `intent` | 为什么存在这个交互 |
| `automation` | `browser` / `core` / `manual-external` |
| `fixture` | 使用哪份稳定测试数据 |
| `preconditions` | 操作前必须成立的状态 |
| `steps` | 用户动作的规范化描述 |
| `expectations` | 用户应看到的结果 |
| `invariants` | 无论怎么实现都不能破坏的规则 |
| `evidence` | 对应核心测试、浏览器测试位置 |
| `tags` | Agent 检索标签 |

## 三、自动化等级

### browser

交互可以在本地固定环境中完整复现，例如：

- CodeMirror 编辑；
- 数据表模块切换；
- 标题标定；
- 变动行；
- 自定义 CSS；
- splitter；
- 本地保存状态。

必须进入 Playwright UIC runner。

### core

交互的关键结果主要属于算法/状态层，浏览器 UI 没有额外风险时，可以有核心测试；但一旦该功能有过“逻辑正确但界面没刷新”的 bug，应升级为 `browser`。

### manual-external

依赖真实外部系统，不能让日常测试阻塞，例如：

- Google OAuth；
- Google Drive 实际写入；
- Cloudflare Access；
- iPad Safari 浏览器级边缘手势；
- 系统文件选择器。

仍然必须写 UIC，明确人工验证步骤和可自动验证的内部部分。未来有 mock/测试账户后可升级为 `browser`。

## 四、Agent 新增 UI 功能的固定流程

### 1. 先写契约

不要先写页面代码。

先确定：

```text
初始状态
用户动作
预期结果
数据副作用
不变量
```

并给出 UIC id。

### 2. 选择稳定测试夹具

优先使用已经固定的 `source.md` / `working.md`。

不要让普通 UI 回归依赖实时 Google Drive 内容。

### 3. 用语义动作描述交互

推荐：

```text
moveLines
replaceInLine
selectModule
clickControl
setControlValue
dragSplitter
```

不推荐：

```text
点击坐标 (327, 81)
向右拖 143px
寻找第三个 div
```

后者对字体、iPad 尺寸、DOM 调整非常脆弱。

### 4. 用用户可见结果做断言

优先断言：

- 控件可见/启用；
- 模块是否激活；
- 表格是否有指定行；
- 行号、行类型、预览、变动、归属模块；
- 状态栏；
- working 文本；
- localStorage/sessionStorage；
- 保存后的 mock storage 内容。

不要只断言内部变量。

### 5. Bug 必须变成样例

如果用户报告：

> “378 行改了，但变动行没显示。”

Agent 应把复现步骤变成一个 UIC 场景。修复后该场景永久保留。

这样 UI 样例库会随着真实使用逐渐增长，而不是靠 Agent 自己想象测试案例。

## 五、当前通用 UIC runner

位置：

`tests/uic/runner.ts`

当前已经支持：

- `moveLines`
- `replaceInLine`
- `selectModule`
- `gridRow` 断言
- `workspaceVisible` 断言

新增一种通用交互时，应优先扩展 runner 的 DSL，而不是每个场景各写一套 Playwright 脚本。

例如以后做 splitter，应新增：

```ts
{ action: "dragSplitter", splitter: "horizontal", ratio: 0.62 }
```

而不是在某个测试里硬编码 mouse.move 坐标。

## 六、标准样例：UIC-CLEAN-001

文件：

`tests/scenarios/move-editor-note-376-378-to-359.ts`

场景：

```text
把 source.md 的 376–378 行
移动到 359 行之前
```

预期：

```text
章节标题
359  ## Editor’s Note       changed

变动行
359  新增  ## Editor’s Note
361  新增  Submited...
379  删除  ## Editor’s Note
380  删除  Submited...
```

这条样例首次运行时实际发现了一个产品 bug：

> 标题前没有空行时，章节标题扫描器漏掉 Markdown 标题。

因此它既是测试，也是 Agent 理解“标题移动”业务规则的参考样例。

## 七、运行方式

仓库根目录：

```bash
# 核心 + UI 全回归
npm run test:all

# 只跑 UI 契约
npm run test:ui
```

查看 Playwright 将执行哪些 browser UIC：

```bash
cd ui-spikes/integration
npx playwright test -c playwright.config.ts --list
```

Safari/WebKit 额外验证（运行时已安装时）：

```bash
npm run test:ui:webkit
```

## 八、功能调试节点的特殊规则

顶栏“界面调试”已更名为“功能调试”。历史 UIC-DEBUG 编号保留不变。

对于“功能调试”中的可执行样例：

- 每个项目必须先有 Feature Contract，至少写清“操作 / 需要 / 效果”。
- 若节点契约写的是“点击后执行样例”，一次点击必须产生完整最终状态，而不是只建立前置条件。
- 这类 UIC 的 runner 在点击功能样例后，不得补做本应由该节点完成的业务动作来让断言通过。
- 允许的后续动作仅限验收动作，例如重新打开下拉、切换到结果模块、读取状态。
- 每个功能样例必须有独立 completion 状态；执行 A 只能禁用 A，不能因为共享 working 状态而误禁用 B。
- “初始化”必须清除所有 completion 状态并恢复 fixture。
- 功能调试只能准备固定 fixture 并调用真实产品路径；不得用 debug-only flag 才启用产品功能。
- 自动 UIC 只做预检，最终是否通过以用户手动运行审核为准。

完整规则见 `FEATURE_PROTOCOL.md`。
- 关键一键样例应增加直接页面验收：仅点击节点一次，然后读取 DOM / CodeMirror / AG Grid 最终状态。

## 九、完成定义（Definition of Done）

一个新的 UI 互动功能只有同时满足以下条件才算完成：

- 产品行为已经用 UIC 描述；
- 有稳定 id / role / data-* 等可验证入口；
- 可自动化部分已经进入测试；
- 真实 UI 断言覆盖用户看到的结果；
- 核心业务不变量有测试；
- `npm run test:all` 通过；
- UIC 已加入 `CATALOG.md`。

这套规范的目标是：**让 Agent 可以从 UIC 库恢复产品意图，而不是每次从源码反推界面应该怎么工作。**
