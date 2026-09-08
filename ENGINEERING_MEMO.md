# ocr2md 工程备忘录

> **用途**：这是新对话 / 新开发会话的接手清单。先读本文件，再动代码。
> **更新原则**：只记录“忘了会走错路线、覆盖工作、重复踩坑”的稳定事实；README 负责产品/模块说明，Git 历史负责变更日志。
> **最近整理**：2026-09-05

## 1. 新对话第一步

当前日常开发以 **Mac 本地 worktree + AgentDock** 为主。不要重新搭环境，也不要先 reset。

```bash
cd /Users/daisor/AgentDock/ocr2md-codespaces-spike
git branch --show-current
git status
git diff
```

当前正式 Web 开发分支：

```text
gpt/codespaces-spike
```

当前 Mac worktree：

```text
/Users/daisor/AgentDock/ocr2md-codespaces-spike
```

本地工作台：

```text
Mac:  http://127.0.0.1:4176/
iPad: http://192.168.1.10:4176/
```

Integration UI 的正确验证目录：

```bash
cd ui-spikes/integration
npm run typecheck
npm run build
```

根目录可再跑：

```bash
npm run compile
npm run typecheck:web
```

**不要误用根目录的 `npm run typecheck`**；根 package 没有这个脚本。

## 2. Git / 发布安全：绝不能忘

- `gpt/web` 是正式 Web 分支，**push 到它会触发 GitHub Pages 生产部署**。
- **没有用户明确批准，绝不 push `gpt/web`。**
- 日常实验只在 `gpt/codespaces-spike`。
- 禁止 rebase / force push。
- 当前开发节奏：**小改 → typecheck/build → 用户刷新验收 → 再决定 commit**。
- 用户验收前，不要为了“干净”擅自 commit。
- 看到 dirty worktree 时，**不要 reset、checkout 覆盖、stash 后忘记恢复**；先理解现有 diff。
- Codespaces 是备用链路，不是日常默认。当前主链路：
  ```text
  ChatGPT → AgentDock → Mac 本地 worktree
  ```

## 3. 当前未提交工作非常重要

截至 2026-09-04，`gpt/codespaces-spike` 上有一组尚未提交的 Web/GD/JSFE 工作。典型 dirty 文件包括：

```text
src/googleDriveApiGateway.ts
web/googleIdentityTokenSession.ts
ui-spikes/integration/app.ts
ui-spikes/integration/index.html
ui-spikes/integration/package.json
ui-spikes/integration/package-lock.json
ui-spikes/integration/googleDriveWorkspace.ts
ui-spikes/integration/googleDriveFileExplorerSpike.ts
```

新对话必须以实时 `git status` / `git diff` 为准；上面的列表只是提醒：**这一整组不是垃圾改动，不可清掉。**

最近已提交基线附近：

```text
0ae04ff docs: mark Mac as current dev runtime
3c9cd04 ui: restore annotation rows and number matching
275ea93 docs: record Codespaces AgentDock architecture
a2b2053 ui: compact iPad typography
cfa50a0 ui: add Mac and iPad font profiles
```

## 4. 产品的核心工作流：这是权威语义

ocr2md 不是“随便打开一个 Markdown 的编辑器”，而是一个 **OCR → 章节定界 → 章节清洗 → 翻译** 的项目工作流。

### 4.1 输入项目与 `ocr` 节点

用户选择的**输入目录本身**就是一批 OCR 后、尚未清洗的 Markdown 的来源目录。

UI 需要呈现一个固定工作流树 / 导航语义：

```text
指定的输入目录
├─ ocr
│  ├─ MinerU_00001.md
│  ├─ MinerU_00002.md
│  └─ ...
└─ chapters
   ├─ 00 目录
   │  └─ 00 目录.md
   ├─ 01 章节1
   │  └─ 01 章节1.md
   └─ ...
```

**关键点：`ocr` 首先是工作流节点/逻辑分组，不应默认理解成必须存在一个物理 `ocr/` 文件夹。**
原项目 README 的定义也是“按处理状态显示固定工作流树，而不是把 Markdown 平铺”。

Markdown 开头 YAML **没有**：

```yaml
ocr2md_chapter_split: true
```

则视为尚未完成章节定界，归入 `ocr`。

判断只能读**开头 YAML frontmatter**；正文里偶然出现同名字符串不能改变文件类别。

### 4.2 OCR 合并与章节定界

点击 `ocr` 节点时：

1. 找出该输入目录中所有未带 `ocr2md_chapter_split: true` 的 OCR Markdown。
2. 按文件名自然序合并，例如：
   ```text
   MinerU_00001.md
   MinerU_00002.md
   MinerU_00010.md
   ```
3. 合并逻辑复用核心 `mergeSequenceMarkdown()`。
4. 章节定界工作稿语义为：
   ```text
   .ocr2md-merged.working.md
   ```
5. 将该工作稿送入 **章节定界模块**。
6. 章节定界主要以一级标题为候选，通过 `章节文件` 标定决定章节归属/序号。
7. 导出后写入：
   ```text
   项目目录/chapters/全局序号 章节名/全局序号 章节名.md
   ```
8. 导出的章节原文件 YAML 写入：
   ```yaml
   ocr2md_chapter_split: true
   ```

核心层已经有章节定界相关能力，不要另造一套：
- `mergeSequenceMarkdown`
- `ChapterReviewApplication.refreshChapterBoundary`
- `setChapterFile / assignChapterFiles`
- `chapterBoundarySegments`
- `ChapterWorkspaceApplication` 的章节导出/frontmatter 逻辑

**当前 Web 章节定界 UI 只是在重新挂载这些核心能力；不要复制业务实现。**

### 4.3 章节清洗

点击：

```text
chapters/01 章节1
```

应进入该章的章节清洗工作区。章节目录的标准语义：

```text
chapters/01 章节1/
├─ 01 章节1.md              # 章节定界原文件 / 只读基线
├─ 01 章节1.working.md      # 工作稿，正文真源
├─ 01 章节1.ocr2md.json     # sidecar，只存标定身份/状态
├─ imgs/
├─ output/
└─ trans/
```

章节清洗模块至少包括：

```text
章节标题
注释
嵌入块
非法断行
```

**数据语义不能变：**

```text
source/original .md = 只读基线
working.md          = 当前正文真源
sidecar JSON         = 标定状态，不可单独还原正文
数据表               = working.md 的结构化视图
```

diff 颜色只表示 **当前 working 与 original 的差异**；恢复成原文后 diff 必须消失。

## 5. Web UI 架构与当前约定

主要 Web spike：

```text
ui-spikes/integration/app.ts
ui-spikes/integration/index.html
```

核心业务仍直接复用：

```text
src/
```

不要把 Web 做成第二套业务逻辑。

当前顶层工作区存在：

```text
清洗工作区
GD 工作区
GD · JSFE
```

其中 `GD · JSFE` 仍是 spike / 对比实验；**原 GD 工作区先保留，不要在用户正式接受 JSFE 前删除。**

### 清洗工作区 UI 已确定的约定

- 左窗顶部只保留：`数据表` + 模块标签。
- 数据表不要“筛选全部列”输入框。
- 右窗顶部只保留**正则搜索**。
- 源码/Preview 双向滚动联动默认常开，不再放开关。
- 物理换行符可视化默认常开，不再放开关。
- 左/右窗的状态信息全部放各自**底部状态栏**，不要占顶部。
- 右窗源码/Preview 水平分割条已有“拖动下坠”修复，不要退回旧算法。
- UI 方向：Obsidian + Everforest。
- Mac / iPad 有不同字体 profile；若 iPad 仍拥挤，优先做 compact layout（行高/内边距/工具栏），不要无限缩字体。

### 数据表统一规则

精确字符串：

```text
lineType === "已忽略"
```

意味着：
- 数据表隐藏；
- 内部标定与 sidecar 保留；
- 数据不丢失。

`已删除` 与 `已忽略` 不同：`已删除` 继续显示用于审计，但不参与后续业务。

注释模块里的旧状态字符串 `忽略` 不要误与统一的 `已忽略` 混为一谈。

### 注释

注释引用与注释正文是**两个独立数据表行**，通过 `注释号` 配对；不要再做成“一组一行”。

默认排序：

```text
注释号 → 行号
```

### 嵌入块

嵌入块每个元素仍是独立行，通过 `组号/embedNumber` 组织。

默认排序：

```text
组号 → 行号
```

### 非法断行

预览固定为：

```text
断点前 10 字 + 断点后 10 字
```

点击预览要跳到源码并选中对应前后内容。

## 6. Google Drive：边界、权限与性能

已验证架构：

```text
Mac Obsidian ↔ Google Drive
iPad Obsidian ↔ Google Drive
ocr2md Web ↔ Google Drive API
```

Drive API 基础设施已存在：
- `GoogleDriveApiGateway`
- `GoogleDriveWorkspaceStorage`
- `GoogleIdentityTokenSession`
- browser fetch transport

不要因为做 UI 再复制一套 Drive 客户端。

### OAuth 权限

当前 GD 工作区主要保持：

```text
https://www.googleapis.com/auth/drive.file
```

**不要未经明确讨论扩大到整盘 `drive` 权限。**

`drive.file` 的重要后果：应用只能稳定看到由本应用创建/获准访问的 Drive 文件；人工随便放进 Drive 的文件不一定自动可见。

### 登录状态

Google Identity Services 的 access token 是短期 token。

当前实现为了避免“每次刷新都登录”：
- token 在内存中使用；
- 同时镜像到 `sessionStorage`，用于**同一浏览器标签页刷新恢复**；
- 不长期写入 `localStorage`；
- 主动“断开”要清 token；
- token 过期或浏览器会话结束后，需要重新登录。

不要再依赖“页面刷新后无用户手势静默重新 requestAccessToken”作为主方案；GIS 浏览器 token flow 对用户手势有限制。

### GD 浏览性能

不要使用“每次操作从根目录按字符串路径逐层 resolve”的方式。

文件浏览应优先按 Drive ID：
- folderId → `listChildren`
- fileId → 下载/操作
- 访问过的目录用内存缓存
- 用户明确点“刷新”才强制读远端

目标行为：
- 切换 GD 工作区：尽量 0 次远端目录请求
- 返回已访问目录：缓存命中
- 首次进入新目录：通常 1 次 `listChildren`

## 7. JSFE（js-fileexplorer）当前状态

JSFE 是为了验证“成熟文件管理交互是否比自写 GD 列表更合适”，不是业务核心。

已接：
- Everforest/Obsidian 深色主题覆盖
- Drive folderId 浏览
- 目录缓存 / 文件缓存
- 新建文件夹
- 重命名
- 删除（移到 Drive 垃圾桶）
- 文件/文件夹复制粘贴
  - 文件用 Drive `files.copy`
  - 文件夹递归复制
  - 同目录冲突生成“副本”名称
- 文件夹图标单击进入
- 文件夹名称/空白仍可单击选中，以便复制/删除/改名
- 双击仍保持 JSFE 原行为

尚未视为完成：
- 剪切/移动
- 上传/下载完整工作流
- JSFE 与 ocr2md **虚拟工作流树** 的最终整合
- Drive 工作稿/sidecar 的完整持久化与安全保存

**非常重要：JSFE 本质上是物理文件浏览器，而 ocr2md 的 `ocr / chapters / 模块` 是带业务语义的工作流树。不要简单把 JSFE 物理目录结构等同于 ocr2md 导航结构。**

最近为了验证工作流，Spike 曾临时把“物理名为 `ocr` 的文件夹”作为特殊入口；这不是最终权威设计。最终应以本备忘录第 4 节为准：**选定输入目录中的未 split Markdown 归入逻辑 `ocr` 节点。**

## 8. Drive 文件打开/保存目前还不是生产完成态

当前 Web spike 可以：
- 浏览 Drive；
- 打开 Markdown；
- 把内容送入清洗工作区；
- 把打开时的远端版本作为当前 diff 基线。

但不要误以为完整生产链路已完成。

仍需明确接完：
- 章节 `.working.md` 的创建/恢复；
- sidecar 加载/保存；
- 工作稿安全原位保存回 Drive；
- 版本冲突保护在 UI 工作流中的完整入口；
- 章节定界导出到 Drive 的 `chapters/.../`；
- 导出后刷新 GD/JSFE 工作流树。

底层已有 Drive 原位写入/版本保护能力，优先复用，不要重新发明冲突机制。

## 9. 同步与存储方面的既有技术决策

项目曾比较过 rclone / Unison 等方案。

- 不要无视历史问题又“默认推荐 rclone”。
- 当前同步体系的重要原则是：**开源、CLI 友好、AI 能在后台验证**。
- Unison 是在 rclone 出现问题后采用的重要方案。
- Google Drive 是 Obsidian + Web 共同访问的文档存储链路。
- 代码仍以 Git/GitHub 管理；Google Drive 不是 Git 的替代品。

## 10. 开发交互习惯

用户不希望一次堆很多大改。

推荐节奏：

```text
确认现状
→ 做一个小逻辑组
→ typecheck/build
→ 用户刷新体验
→ 用户确认
→ 再继续
```

界面问题尤其要优先做**浏览器运行时 smoke test**，不能只看 TypeScript/build。

已有一次典型事故：增加“章节定界”第五个 module tag 后，旧代码仍检查 `moduleTags.length !== 4`，导致 app 初始化直接抛错，GD/JSFE 标签全部点不开。修复后改为按**模块名称集合**检查。以后增加模块时不要再写死 UI 元素数量。

## 11. 新对话接手时的最短检查清单

1. 读 `ENGINEERING_MEMO.md`。
2. `git branch --show-current`，必须确认当前分支。
3. `git status && git diff`，保护未提交工作。
4. 确认 4176 server / esbuild watch 是否仍在。
5. 先问“用户现在要改哪个小点”，不要擅自重构整组。
6. 修改后至少跑：
   ```bash
   cd ui-spikes/integration
   npm run typecheck
   npm run build
   ```
7. UI 初始化/导航改动要做真实浏览器 smoke。
8. 未获明确批准，不 push `gpt/web`。

## 12. 2026-09-04 最新接手快照

这是当前新对话最需要知道的“做到哪里了”。

### 12.1 当前运行环境正常

已实测：

```text
4176 Python HTTP server    running
esbuild --watch=forever    running
http://127.0.0.1:4176/     HTTP 200
```

最近一次完整验证通过：

```text
integration typecheck ✅
integration build     ✅
root compile          ✅
web typecheck         ✅
```

### 12.2 当前工作区顶部有三个入口

```text
清洗工作区
GD 工作区
GD · JSFE
```

最近发生过一次初始化事故：新增“章节定界”成为第五个 module tag 后，旧保护代码仍写死 `moduleTags.length !== 4`，导致整个 `app.js` 初始化中断，于是 GD 和 JSFE 都点不开。

现已修复为**按模块名称集合校验**，并用干净 Chrome 会话做过真实点击 smoke：

```text
GD 工作区    可切换 ✅
GD · JSFE    可切换 ✅
page error   0 ✅
```

### 12.3 JSFE 当前实际能力

JSFE 当前已不只是静态浏览 spike，已经真实接入 Google Drive：

- folderId / fileId 方式浏览；
- 目录缓存、文件缓存；
- Everforest 深色主题；
- 新建文件夹；
- 重命名；
- 删除到 Google Drive 垃圾桶；
- 复制 / 粘贴；
- 文件复制走 Drive `files.copy`；
- 文件夹复制走递归创建 + 递归复制；
- 同目录复制自动生成“副本”名称，避免路径语义出现同名冲突；
- 文件夹**图标**单击直接进入；
- 点击文件夹名称/其他区域仍可选中，方便复制、删除、重命名；
- Markdown 双击可送入清洗工作区。

还没有接：

```text
剪切 / 移动
上传 / 下载完整流程
完整 ocr2md 虚拟工作流树
```

### 12.4 Google 登录与性能目前的实现

为解决“刷新页面每次都重新登录”：

- 短期 access token 会镜像到 `sessionStorage`；
- 同一浏览器标签页刷新后直接恢复；
- 不把 token 长期放进 `localStorage`；
- 主动断开、token 过期、浏览器会话结束后才重新登录。

为解决“GD 每步都很慢”：

- JSFE/GD 浏览优先用 `folderId → listChildren`；
- 不再为每次浏览从根目录按字符串路径逐层 resolve；
- 已访问目录优先内存缓存；
- 用户明确“刷新”时才强制远端刷新。

### 12.5 章节定界已开始挂到 Web，但还没有闭环

当前 Web 清洗工作区已经增加了条件显示的：

```text
章节定界
```

进入 boundary mode 时，左侧只显示章节定界模块；当前表格已经有：

```text
行号
行类型
预览
章节文件
变更
```

一级标题的“章节文件”已经能调用核心 `setChapterFile()` 做手工标定。

当前代码也已经接入/复用：

- `mergeSequenceMarkdown()`
- `ChapterReviewApplication.refreshChapterBoundary()`
- `setChapterFile()`

**但是目前还没有把章节定界导出真正写回 Google Drive 的 `chapters/.../`，也没有完成 working/sidecar 持久化。**

### 12.6 当前最需要纠正的导航实现

为了快速验证“目录点击 → 工作模块”的闭环，JSFE spike 里目前有一段**临时实现**：

- 看到物理名称为 `ocr` 的文件夹时，将其作为章节定界入口；
- 看到 `chapters/<章节目录>` 时，尝试寻找同名章节 Markdown 并送入章节清洗。

这个实现只能算验证用，**不是最终设计**。

用户刚刚重新明确了原项目的权威逻辑：

> 用户指定的输入目录本身就是 OCR 项目目录。根据 Markdown 开头 YAML 是否有 `ocr2md_chapter_split: true` 来分组。未 split 的 Markdown 应显示在逻辑 `ocr` 节点下；已经导出的章节显示在逻辑 `chapters` 节点下。

所以新对话下一阶段应把：

```text
JSFE 的“物理目录浏览”
```

和：

```text
ocr2md 的“逻辑项目导航”
```

明确分层。

**不要继续假设 Drive 上一定存在真实 `ocr/` 文件夹。**

### 12.7 建议下一阶段的顺序

优先顺序建议：

1. 先定义“当前选中的 Drive 项目根目录”。
2. 基于该根目录生成 ocr2md 逻辑导航：
   ```text
   项目根
   ├─ ocr
   └─ chapters
   ```
3. `ocr` 节点读取根目录中未带 split YAML 的 Markdown，按文件名自然序合并。
4. 点击 `ocr` → 进入 Web 章节定界。
5. 点击 `chapters/<章节>` → 加载原文件 / working / sidecar，进入章节清洗。
6. 再接章节定界“导出章节”到 Drive。
7. 再接章节工作稿安全保存、sidecar、冲突处理。

不要在这一步先大规模重构 JSFE，也不要删除原 `GD 工作区`；先把项目导航语义跑通。

### 12.8 当前 Git 状态仍未提交

截至本次交接，分支仍是：

```text
gpt/codespaces-spike
```

当前 dirty / untracked 文件包括：

```text
M README.md
M src/googleDriveApiGateway.ts
M ui-spikes/integration/app.ts
M ui-spikes/integration/index.html
M ui-spikes/integration/package-lock.json
M ui-spikes/integration/package.json
M web/googleIdentityTokenSession.ts
?? ENGINEERING_MEMO.md
?? ui-spikes/integration/googleDriveFileExplorerSpike.ts
?? ui-spikes/integration/googleDriveWorkspace.ts
```

这批改动包含此前已验收的 UI、GD、JSFE、登录缓存、复制功能、章节定界挂载等工作。**新对话不得 reset / checkout 覆盖。**

当前相对已提交基线的 tracked diff 约为：

```text
773 insertions / 77 deletions
```

另有上述未跟踪的新文件，所以不能只看 `git diff --stat` 判断全部工作量。

### 12.9 iPad 远程调试链路：Cloudflare Tunnel + Access

2026-09-04 已验证一条可用于公司 iPad 的远程调试链路。前提是 iPad 与 Mac 都需要持续使用 Shadowrocket，因此**不要再用 Tailscale 作为远程调试主链路**；iPadOS 无法稳定同时运行两个 VPN/Packet Tunnel，Mac 上 Tailscale GUI 也曾与 Shadowrocket 发生冲突。

当前权威远程调试架构：

```text
公司 iPad
├─ ChatGPT → AgentDock → Mac 本地 worktree / 命令
└─ Safari
   → Shadowrocket 保持开启
   → https://ocr2md.laity.xx.kg
   → Cloudflare Access
   → AgentDock 现有 named Cloudflare Tunnel
   → http://127.0.0.1:4176
   → ocr2md integration UI
```

已实际验证：

```text
http://127.0.0.1:4176/          HTTP 200
https://agentdock.laity.xx.kg   HTTP 200
https://ocr2md.laity.xx.kg      未认证时由 Access 重定向；认证后可进入工作台
```

AgentDock 已有正式 Cloudflare Tunnel：

```text
agentdock-mac
├─ agentdock.laity.xx.kg → http://127.0.0.1:8765
└─ ocr2md.laity.xx.kg   → http://127.0.0.1:4176
```

因此：
- 不要为 ocr2md 再单独长期运行第二个 `cloudflared`；
- 不要长期使用临时 `trycloudflare.com` Quick Tunnel；
- ocr2md 应复用 AgentDock 的 named Tunnel，通过单独 hostname 路由到 4176；
- 当前 Quick Tunnel 已关闭；
- iPad 已在 Shadowrocket 开启的情况下，通过 Cloudflare Access 登录并成功看到 ocr2md 界面。

Cloudflare Access 当前设计：
- 应用：`ocr2md`
- 目标：`ocr2md.laity.xx.kg`
- Allow 策略：仅允许用户自己的登录身份；
- Identity Provider：已添加 Cloudflare，并限制为当前 Cloudflare 帐户成员；
- One-time PIN 曾出现邮件收不到的问题，因此不要把 OTP 作为首选登录方式；
- 推荐该应用只启用 Cloudflare 身份提供程序。

Tailscale 处置状态：
- Tailscale VPN network service 已从 macOS 网络服务移除；
- Homebrew `tailscale/tailscaled` 与 userspace 测试 state 已删除；
- Tailscale 不再参与默认路由，Shadowrocket 仍为当前默认 VPN；
- 仍可能存在需要 macOS 管理员权限/重启才能彻底删除的 GUI App、System Extension、`/Library/Tailscale` 或受保护 helper container；这些当前不再参与 VPN 路由，但后续若要做到磁盘层面彻底清理，需要在 Mac 本机用管理员权限完成。

### 12.10 UIC：Agent 界面互动规范与自动回归

2026-09-05 起，integration 工作台正式建立 **UIC（UI Interaction Contract）**。目标不只是“有浏览器测试”，而是形成供 Agent 读取、执行和扩展的界面互动规格库。

权威入口：

- 根目录 `AGENTS.md`：要求所有 integration UI 改动必须先读 UIC；
- `ui-spikes/integration/tests/FEATURE_PROTOCOL.md`：功能规范 / 功能调试强制协议；
- `ui-spikes/integration/tests/FEATURE_CATALOG.md`：产品功能、功能调试接入状态与人工审核索引；
- `ui-spikes/integration/tests/UIC_PROTOCOL.md`：完整互动契约规范；
- `ui-spikes/integration/tests/CATALOG.md`：现有互动索引；
- `ui-spikes/integration/tests/uic/schema.ts`：机器可读契约类型；
- `ui-spikes/integration/tests/uic/runner.ts`：通用浏览器 runner；
- `ui-spikes/integration/tests/scenarios/`：真实用户操作样例库。

目的不是录制脆弱的鼠标坐标，而是固定“用户操作 → CodeMirror → 扫描/标定 → AG Grid 显示”的真实链路。每个 UIC 必须说明初始状态、用户动作、预期界面、数据副作用、不变量与自动化等级。

#### 12.10.1 功能规范 + 功能调试 + UIC 规则（Agent 强制）

以后任何 Agent 修改 integration 产品功能或 UI 时，以下规则视为工程约束，而不是建议：

0. **先写功能规范。**
   - 每个产品功能必须登记 Feature Contract，至少写清“操作 / 需要 / 效果”；
   - 每个产品功能必须加入顶部“功能调试”，可用固定 fixture 独立运行；
   - 功能调试只能调用真实产品路径，禁止 debug-only flag 才启用产品功能；
   - 自动测试只做预检，最终通过与否由用户手动运行审核；
   - 一个产品功能原则上只占一个“功能调试”菜单入口；复杂功能可在单入口内部显示多步流程，自动 UIC 可以拆分但不得机械映射成多个菜单项；
   - 详见 `tests/FEATURE_PROTOCOL.md` 与 `tests/FEATURE_CATALOG.md`。

1. **先读契约，再改代码。**
   - 开始处理界面、交互、导航、编辑器、AG Grid、保存、窗格或设备适配前，先查 `tests/CATALOG.md`；
   - 若已有对应 UIC，先读现有 scenario 和不变量；
   - 若没有对应 UIC，先创建契约，再实现功能。

2. **每一个用户可见互动都必须有 UIC。**
   每个 UIC 至少要明确：
   - 稳定 ID；
   - 界面区域；
   - 设计意图；
   - 初始状态 / 前置条件；
   - 用户动作；
   - 预期界面结果；
   - 数据副作用；
   - 不变量；
   - 自动化等级；
   - 对应测试证据。

3. **真实 bug 必须进入样例库。**
   - 用户给出可复现的 UI 问题时，优先把复现步骤固化为新的 UIC scenario；
   - 然后再修 bug；
   - 修复后样例永久保留，避免同类问题回归；
   - 不允许只修当前现象而不留下回归样例。

4. **使用语义动作，不使用脆弱坐标脚本。**
   推荐把用户操作抽象为 DSL，例如：
   ```text
   moveLines
   replaceInLine
   selectModule
   clickControl
   setControlValue
   dragSplitter
   ```
   禁止把“点击某坐标、拖动固定像素、找第 N 个 div”作为主要测试方式。

5. **优先验证用户看得到的结果。**
   浏览器测试应优先检查：
   - 控件是否可见 / 启用 / 选中；
   - 当前工作区或模块；
   - AG Grid 中是否存在指定行；
   - 行号、行类型、预览、变动、归属模块；
   - 状态栏文本；
   - CodeMirror working 文本；
   - localStorage / sessionStorage；
   - mock storage 中的保存结果。
   不应只检查内部变量或函数返回值。

6. **使用稳定 UI 接口。**
   - 优先使用稳定 `id`、ARIA role、`data-*`、CodeMirror / AG Grid 的公开 API；
   - 不依赖 AG Grid 私有 DOM class；
   - 不把当前字体大小、像素位置、具体 iPad 屏幕尺寸作为业务逻辑。

7. **测试夹具必须可重复。**
   - 普通 UI 回归使用固定 `source.md` / 测试 working；
   - `?ui-test=1` 下跳过真实 Google Drive 登录；
   - 不允许日常 UI 回归依赖实时 Drive 内容、OAuth 状态或 Cloudflare 会话。

8. **自动化等级固定为三类。**
   - `browser`：可在本地完整浏览器执行，必须进入 Playwright runner；
   - `core`：主要验证算法 / 状态层；
   - `manual-external`：依赖 Google OAuth、真实 Drive、Cloudflare Access、iPad Safari 系统手势等外部系统。
   `manual-external` 也必须有完整契约，未来有 mock 后再升级为 browser。

9. **通用动作优先扩展 runner，不为每个场景各写一套脚本。**
   - 新出现的共性交互应扩展 `tests/uic/schema.ts` 和 `runner.ts`；
   - 场景文件只负责描述“做什么”和“预期什么”；
   - Playwright 细节集中在 runner。

10. **不得为让测试通过而降低产品预期。**
    - 若测试暴露真实产品 bug，应修产品；
    - 若产品规则确实改变，必须同步修改 UIC，并说明规则为何改变；
    - 不允许偷偷删除断言或放宽预期来“跑绿”。

11. **每次 integration UI 改动完成后至少运行：**
    ```bash
    npm run test:all
    ```
    它必须覆盖核心测试 + integration typecheck/build + browser UIC。

12. **Agent 可先枚举当前可执行契约：**
    ```bash
    cd ui-spikes/integration
    npm run test:ui:list
    ```

13. **完成定义（Definition of Done）。**
    一个 UI 互动功能只有同时满足以下条件才算完成：
    - UIC 已定义或更新；
    - 进入 `CATALOG.md`；
    - 有稳定可验证入口；
    - 可自动化部分已经自动化；
    - 用户可见结果已有断言；
    - 核心不变量已有测试；
    - `npm run test:all` 通过。

测试目录：

```text
ui-spikes/integration/tests/
├─ README.md
├─ UIC_PROTOCOL.md
├─ CATALOG.md
├─ ui.spec.ts
├─ uic/
│  ├─ schema.ts
│  ├─ runner.ts
│  └─ catalog.ts
└─ scenarios/
   ├─ move-editor-note-376-378-to-359.ts
   └─ edit-line-378-submitted.ts
```

测试入口：

```bash
# 只跑 integration UI 回归
npm run test:ui

# 核心全套测试 + integration UI 回归
npm run test:all
```

默认浏览器：
- Mac 本机 Google Chrome；
- Playwright 使用 iPad Pro 11 的视口/触摸设备参数；
- 页面使用 `?ui-test=1`，跳过 Google Drive 登录并以固定 `source.md` 作为干净基线。

可选 Safari/WebKit：
- `ui-spikes/integration/npm run test:ui:webkit`
- 当前 Playwright WebKit 运行时下载曾被 CDN 超时阻断，因此不要让 WebKit 成为日常回归的单点故障；
- WebKit 可用后再作为额外 Safari 引擎验证。

当前标准样例：

- 顶部工作区导航已经把 **“界面调试 ▾”** 正式更名为 **“功能调试 ▾”**：
  - `初始化`：切到固定测试夹具，把 working 恢复为 `source.md`，回到“清洗工作区 / 章节标题”，清除变动提示，并重新启用可执行样例；
  - `移动源文本块`：执行标准 `376–378 → 359` 场景；
  - `行号菜单`：进入“点击行号 → 加入当前数据表”调试样例；初始化后先把工作稿第 18 行 `Top Award` 移到第 14 行，再切到嵌入块数据表并定位第 14 行；
  - `修改文本行`：初始化固定 working 后，精确修正第 26 行指定 OCR 片段；只把正文修改反映到“变动行 / 修改 / 未归类”，行尾未触碰的 `<sup>1</sup>` 注释引用必须继续保留在注释模块；
  - `行类型：已忽略`：固定样例将第 26 行 `<sup>1</sup>` 注释引用设为“已忽略”；该行从当前表隐藏，但审核状态保留，working 不变；该行为所有可编辑模块的统一基础特性；
  - `撤销 / 重做`：菜单只占一个入口；一次点击在真实界面逐步运行 6 个步骤（基线 → 已忽略 → Undo → Redo → Undo 后新文本修改清空旧 Redo → Undo 文本修改），右上角步骤面板必须显示过程与最终 `6/6 通过`；
  - `保存标定 / 重入加载`：菜单只占一个入口；固定章节先修改第 26 行正文并把 `<sup>1</sup>` 注释设为“已忽略”，保存 working + sidecar，再模拟离开并把当前内存恢复为未修改基线，最后重入同章节；必须自动恢复保存后的正文与人工标定并显示 `5/5 通过`；功能调试只用内存持久化，禁止写真实 Drive；
  - 每个一键调试节点执行一次后只 disabled 自己；其他独立调试节点保持原完成状态；“初始化”统一清除全部完成状态；
  - 执行“移动源文本块”后必须触发 `变动行 +4` 提示；
  - 调试入口使用固定 integration fixture，**不得写真实 Google Drive**；初始化时清空 active Drive chapter 并禁用“保存标定”。
- `UIC-DEBUG-001`：验证顶栏“移动源文本块”真实执行、`+4` 提示以及一次性禁用；
- `UIC-DEBUG-002`：验证“初始化”恢复 working/source、章节标题模块、清除变动提示，并重新启用全部功能调试样例；
功能调试节点的额外强制规则：

- 一个调试节点如果定义为“点击后执行样例”，则**一次点击必须直接产生完整最终结果**；不能只进入准备态，再要求用户补做剩余步骤；
- 对这种“一键样例”，browser UIC 在点击该节点后不得继续执行样例所需的业务动作（例如再点击源码行号、再点击“加入当前数据表”）来制造通过；后续步骤只能用于验收，例如重新打开调试下拉检查 disabled 状态；
- 各调试节点使用独立的完成状态：点击哪个，只禁用哪个；其他独立样例不得因为 working 已变化而错误变灰；
- 另一个独立样例被点击时，可以内部恢复固定 fixture 再执行自己的契约；只有“初始化”会清除所有样例完成状态并统一恢复可执行；
- UI 自动测试通过之后，关键调试样例还应至少做一次“只点击调试节点 → 直接读取真实页面最终状态”的验收，防止 runner 在测试过程中替产品补操作。

- `UIC-EDIT-001`：**正常产品路径**验证源码行号菜单：
  - 不点击“功能调试”，直接在清洗工作区选择“嵌入块”；
  - 固定 fixture 只负责把第 18 行 `Top Award` 移到第 14 行；
  - 正常点击第 14 行行号必须弹出真实“加入当前数据表”菜单；
  - 点击后第 14 行必须进入嵌入块表；
  - 行号菜单不得依赖任何 debug-only flag；若功能调试样例能过但正常工作区不能操作，视为产品失败。
- `UIC-DEBUG-003`：验证功能调试中的行号菜单固定样例（`?ui-test=1` 固定夹具）：
  - 光标所在行的行号必须持续高亮；
  - 点击行号先把光标切到该行，再弹出行操作菜单；
  - 菜单只针对**当前数据表**，不再要求用户再次选择模块；
  - 固定样例先真实修改 working：把第 18 行 `Top Award` 移到第 14 行；
  - 当前数据表切到“嵌入块”，点击第 14 行号 → “加入当前数据表 · 嵌入块”；
  - `Top Award` 在移动后不能由扫描器自动收入，必须通过人工加入进入嵌入块表；
  - 加入成功后显示 `嵌入块 +1`，嵌入块表出现第 14 行，行类型为“嵌入文本”，并可点击返回源码；
  - 再次点击第 14 行号时显示“已在当前数据表 · 嵌入块”并 disabled，禁止重复标定；
  - 人工加入动作不得再修改 working；最终 working 只能保留 18→14 这一项样例预置移动；
  - “变动行”为系统派生审计表，不允许人工加入；
  - 旧的“右键 / iPad 长按”方案已退役，不作为当前 UIC 主交互。
- `UIC-DEBUG-005`：真实页面 smoke：
  - 直接加载真实 `/` 页面，不使用 `?ui-test=1`；
  - HTML 中“功能调试”按钮初始 disabled；只有 `app.ts` 完成事件接线后才设置 `data-app-ready=true` 并 enable，避免用户或自动化在事件监听器挂载前点到无效按钮；
  - 测试必须等待 `data-app-ready=true` 后才能操作真实页面；
  - 只点击一次“功能调试 → 行号菜单”，节点自身必须完成 18→14 + 第 14 行人工加入嵌入块；
  - 最终必须直接看到嵌入块表第 14 行 `Top Award`，行类型“嵌入文本”；
  - 执行后必须只灰掉“行号菜单”，而“移动源文本块”仍然可点击；
  - 真实页面与 ui-test 夹具的调试结果不一致时，browser UIC 必须失败。
- `UIC-DEBUG-006`：真实页面“修改文本行”样例：
  - 只点击一次“功能调试 → 修改文本行”，节点自身必须精确修改第 26 行并切到“变动行”；
  - 只允许把 `M<sup>uch</sup> <sup>has</sup> <sup>been</sup> <sup>said</sup> <sup>and</sup> <sup>writen</sup> <sup>about</sup> <sup>Warren</sup> <sup>Bufet</sup> <sup>and</sup> <sup>his</sup>` 替换为 `Much has been said and written about Warren Buffett and his `；
  - 第 26 行其余正文保持原样，行尾 `<sup>1</sup>` 必须保留；
  - “变动行”必须出现第 26 行，变动类型“修改”，归属模块“未归类”，并显示 `变动行 +1`；
  - 变动归属必须按实际修改字符范围判断；由于没有触碰 `<sup>1</sup>`，本次正文修改不得归属“注释”；
  - “注释”表仍必须保留第 26 行 `<sup>1</sup>` 的“注释引用”；
  - 单独的数字 `<sup>1</sup>` 注释引用不得让整行普通正文误判为“嵌入块”；
  - 执行后只灰掉“修改文本行”；“移动源文本块”和“行号菜单”仍保持可执行；
  - 初始化后三个调试节点全部恢复可执行；
  - 必须在真实 `/` 页面自动化验证，不允许只依赖 `?ui-test=1`。
- `UIC-GRID-001`：数据表统一“已忽略”规则：
  - 凡是可编辑“行类型”的人工审核模块，行类型下拉都必须固定包含“已忽略”；当前数据里有没有已忽略行都不能影响选项存在；
  - 当前覆盖：章节定界、章节标题、注释、嵌入块、非法断行；注释旧值“忽略”统一迁移为“已忽略”；
  - 选择“已忽略”后，该行从当前模块数据表隐藏，但仍保留在 reviewRows / sidecar 审核状态中；“已忽略”不等于“已删除”；
  - 选择“已忽略”不得修改 working；
  - 已忽略注释引用/正文不得继续参与 annotation pair；
  - `UIC-DEBUG-007` 用第 26 行 `<sup>1</sup>` 注释引用作为固定功能调试样例，验证“隐藏 + 状态保留 + working 不变”。
- **FC-CLEAN-002 · 保存标定 / 重入自动加载**：
  - 正式按钮仍为清洗工作区数据表顶栏的 `保存标定`；只有打开真实章节工作稿后可用；
  - 保存内容必须同时包含当前 `workingText + reviewRows + annotationPairs`；真实 Drive 路径通过 `googleDriveWorkspace.saveChapterReview()` 写 working 文件和章节 sidecar；
  - 保存成功状态必须明确显示 working 行数与 sidecar 标定行数；保存失败必须显示失败，不得伪装成功；
  - 再次进入同一章节时，`ensureChapterWorkingCopy()` 优先保留已有 working，`loadSidecar()` 自动读取章节 sidecar；`loadDriveChapter()` 再把二者装入工作台；
  - 重入后页面状态明确显示“已自动加载标定 N 行”；没有 sidecar 时显示“暂无已保存标定”；
  - 人工标定（尤其“已忽略”）不得在重入后的自动扫描阶段丢失或被覆盖；
  - 重入视为新章节会话，因此 Undo / Redo 历史清空；保存动作本身不创建 Undo 记录；
  - `UIC-CLEAN-002` 保留真实 Drive 的 manual-external 验收：修改正文 + 人工标定 → 保存 → 离开 → 再次点击同一章节 → 核对正文和标定自动恢复；
  - `UIC-DEBUG-009` 是自动化/人工调试入口：真实 `/` 页面只点击一次“功能调试 → 保存标定 / 重入加载”，内部 5 步自行完成，不写 Drive，最终必须 `5/5 通过`；
  - 核心 `chapterWorkspaceApplication.test.ts` 会重新创建 `ChapterWorkspaceApplication` 模拟新会话，验证已有 working 优先于 original，且 sidecar 人工 `已忽略` 标定被重新加载。
- **FC-EDIT-005 · 工作台级撤销 / 重做**：
  - 正式 UI 位于清洗工作区数据表顶栏：`撤销`、`重做`；无历史时 disabled；
  - 快捷键：Mac `⌘Z / ⌘⇧Z`，Windows/Linux `Ctrl+Z / Ctrl+Shift+Z`；`Ctrl+Y` 也支持 Redo；
  - 源码编辑器不再使用 CodeMirror 私有 history；源码文字和数据表标定统一进入 ocr2md 工作台历史；自定义 CSS 编辑器仍保留自己的 CodeMirror history；
  - 快照固定保存 `workingText + reviewRows + annotationPairs`；`liveDiffChanges`、AG Grid DOM、badge 等派生状态不进快照，恢复后重算；
  - 一次用户操作 = 一次历史记录；目前覆盖源码文本编辑、行类型、注释号、章节文件、行号菜单人工加入、非法断行人工标定以及标题层级（标题层级通过真实文本编辑进入历史）；
  - Undo：当前状态进入 Redo，恢复上一快照；Redo 反向处理；
  - Undo 后执行任何新操作，必须立即清空旧 Redo 分支；
  - 打开新文件 / 新章节 / 章节定界文档以及“功能调试 → 初始化”时，Undo / Redo 历史清空；`保存标定`本身不是一条 Undo 操作；
  - 历史栈核心在 `src/workbenchHistory.ts`，默认最多 100 个 Undo 快照；
  - `UIC-EDIT-002`：已忽略标定 → 正常产品 Undo → 注释引用恢复；
  - `UIC-EDIT-003`：已忽略 → Undo → 正常产品 Redo → 再次已忽略；
  - `UIC-EDIT-004`：Undo 后新文本修改必须清空旧 Redo；
  - `UIC-EDIT-005`：文本修改 → Undo → working、变动行、注释标定同步恢复；
  - `UIC-EDIT-006`：Ctrl/Command Undo/Redo 快捷键复用同一工作台历史；
  - `UIC-DEBUG-008`：真实 `/` 页面只点击一次“功能调试 → 撤销 / 重做”，内部自行运行 6 步；runner 不得补做业务步骤；最终进度面板必须 `6/6 通过`；
  - 功能调试最终状态恢复 working 与注释基线，Undo disabled，Redo enabled；这个最终 Redo 仅代表最后一次“文本 Undo”可重做。
- `UIC-CLEAN-001`：将 `source.md` 第 376–378 行移动到第 359 行之前；
  - 章节标题表必须出现第 359 行 `## Editor’s Note` 且标记为变动；
  - 变动行表必须出现 359/361 的新增和 379/380 的删除；
  - 新增行预览必须仍可点击跳转到 working 对应位置；
  - 删除行必须整行灰显并带删除线；
  - 删除行预览保留原内容用于审计，但点击后不得跳转，因为 working 中已不存在对应位置；
  - 点击删除行后状态栏提示：`该行已删除，无法定位到工作稿`。
- `UIC-CLEAN-004`：第 378 行 `Submited → Submitted`；
  - 变动行必须显示第 378 行“修改”；
  - 归属模块必须为“未归类”；
  - 自动非法断行候选不得吞掉正文 diff；
  - 修改行预览必须可以点击跳转到 working 对应位置。

`UIC-CLEAN-001` 首次运行时实际发现一个核心 bug：章节标题扫描此前按空行块判断标题，导致“标题前没有空行”时漏掉标题。已改为在空行块内部继续按物理 Markdown heading 行切分，因此 `#` 标题不再依赖前置空行。

**以后修改 integration UI、章节标题扫描、变动行投影、CodeMirror wiring、AG Grid wiring、保存交互或布局行为后，至少运行 `npm run test:all`。**

---

## 13. 2026-09-05 新对话接手快照（优先读）

这是截至 2026-09-05 晚间的最新开发状态。若与前文旧日期/旧列表有冲突，以本节 + 实时 `git status` / `git diff` 为准。

### 13.1 Git / worktree

当前：

```text
worktree: /Users/daisor/AgentDock/ocr2md-codespaces-spike
branch:   gpt/codespaces-spike
HEAD:     4e5ef7c
```

`4e5ef7c` 是最后一个已提交 checkpoint；其后存在一大批**有意保留、尚未提交**的产品/UI/测试改动。当前 dirty 包括但不限于：

```text
ENGINEERING_MEMO.md
package.json
src/annotation.ts
src/chapterReviewActions.ts
src/chapterReviewApplication.ts
src/chapterWorkspaceApplication.test.ts
src/reviewModuleDefinitions.ts
src/scanner.ts
src/sidecar.ts
src/workbenchHistory.ts
src/workbenchHistory.test.ts
ui-spikes/integration/app.ts
ui-spikes/integration/googleDriveWorkspace.ts
ui-spikes/integration/index.html
ui-spikes/integration/tests/
AGENTS.md
```

**绝对不要 reset / checkout 覆盖 / rebase / force push / 擅自 stash 清理这些改动。**
未经用户明确要求，不 commit，不 push。

### 13.2 当前远程开发链路

主链路：

```text
iPad ChatGPT
  → AgentDock
  → Mac worktree

iPad Safari + Shadowrocket
  → https://ocr2md.laity.xx.kg
  → Cloudflare Access
  → named tunnel
  → Mac 127.0.0.1:4176
```

Mac 本地入口：

```text
http://127.0.0.1:4176/
```

iPad 正式远程入口：

```text
https://ocr2md.laity.xx.kg
```

### 13.3 功能调试已经成为强制产品验收入口

顶部名称已经从“界面调试”正式改成：

```text
功能调试 ▾
```

规则：

- 一个产品功能原则上只占一个功能调试入口；
- 复杂功能在该入口内部跑多步并显示可见进度；
- 功能调试必须调用真实产品路径，不允许 debug-only 产品能力；
- 自动 UIC 只是预检，最终由用户手动运行审核；
- 新功能先读：
  - `ui-spikes/integration/tests/FEATURE_PROTOCOL.md`
  - `ui-spikes/integration/tests/FEATURE_CATALOG.md`
  - `ui-spikes/integration/tests/UIC_PROTOCOL.md`
  - `ui-spikes/integration/tests/CATALOG.md`

当前功能调试入口至少包括：

```text
初始化
移动源文本块
行号菜单
修改文本行
行类型：已忽略
撤销 / 重做
保存标定 / 重入加载
```

### 13.4 最近完成的关键产品能力

#### A. 正常产品行号菜单

已去掉原来的 debug-only gate。

现在正常章节清洗工作区里：
- 点击源码行号；
- 弹出“加入当前数据表”菜单；
- 可以人工加入当前模块；
- 不要求先运行功能调试。

对应正常产品回归：`UIC-EDIT-001`。

#### B. 数据表统一“已忽略”

所有可编辑行类型的人工审核模块都固定提供：

```text
已忽略
```

当前覆盖：
- 章节定界
- 章节标题
- 注释
- 嵌入块
- 非法断行

统一语义：
- 设为“已忽略”后从当前表隐藏；
- reviewRows / sidecar 状态保留；
- 不等于删除；
- 不修改 working；
- 已忽略注释不再参与 annotation pairing；
- legacy 注释值“忽略”加载时迁移为“已忽略”。

对应：`FC-GRID-001`、`UIC-GRID-001`、`UIC-DEBUG-007`。

#### C. 工作台级 Undo / Redo

不是 CodeMirror 私有文本 Undo，而是 ocr2md 工作台统一历史。

核心文件：

```text
src/workbenchHistory.ts
```

历史快照：

```text
workingText
reviewRows
annotationPairs
```

正式 UI：
- 数据表顶栏“撤销”
- 数据表顶栏“重做”

快捷键：
- Mac: `⌘Z`, `⌘⇧Z`
- Windows/Linux: `Ctrl+Z`, `Ctrl+Shift+Z`
- `Ctrl+Y` 也支持 Redo

规则：
- Undo 后新操作立即清空旧 Redo；
- 新章节/新文件/章节定界重入会清空历史；
- 保存标定本身不创建 Undo 项；
- 默认最多 100 个 Undo 快照。

功能调试只占一个入口“撤销 / 重做”，内部跑 6 步并显示：

```text
6/6 通过
```

正常产品 UIC：
- UIC-EDIT-002 Undo 已忽略
- UIC-EDIT-003 Redo 已忽略
- UIC-EDIT-004 Undo 后新操作清空 Redo
- UIC-EDIT-005 Undo 文本修改
- UIC-EDIT-006 快捷键

功能调试：
- UIC-DEBUG-008

#### D. 保存标定 / 重入自动加载

正式“保存标定”已经收拢为明确产品行为：

保存：

```text
workingText
+ reviewRows
+ annotationPairs
```

真实 Drive：
- working 写回工作稿文件；
- sidecar 写入章节 sidecar。

再次进入同一章节：
- `ensureChapterWorkingCopy()` 优先保留已有 working；
- `loadSidecar()` 自动读 sidecar；
- `loadDriveChapter()` 装入工作台；
- 页面明确显示“已自动加载标定 N 行”；
- 人工“已忽略”等标定不能被重扫覆盖；
- 重入视为新会话，Undo / Redo 清空。

功能调试只占一个入口：

```text
保存标定 / 重入加载
```

内部 5 步：
1. 打开固定章节；
2. 修改正文 + 注释设“已忽略”；
3. 保存 working + sidecar；
4. 模拟离开，并故意恢复未修改内存基线；
5. 重入同章节，验证保存后的正文 + 标定自动恢复。

最终必须显示：

```text
5/5 通过
```

功能调试使用内存持久化，**绝不写真实 Google Drive**。

对应：
- FC-CLEAN-002
- UIC-CLEAN-002（真实 Drive，manual-external）
- UIC-DEBUG-009（browser）
- `chapterWorkspaceApplication.test.ts`（新会话重入核心测试）

### 13.5 当前 UIC / 测试状态

当前 `npm run test:ui:list` 枚举 **17 条 browser UIC**。

最近验证：
- `npm test`：完整通过；
- `git diff --check`：通过；
- `UIC-DEBUG-007/008/009`：3/3 通过；
- `UIC-DEBUG-002 + UIC-DEBUG-009`：2/2 通过；
- 正常产品 Undo/Redo 单项 UIC（002~006）均曾单独通过。

2026-09-05 最后一次 `npm run test:all`：
- core 全部通过；
- browser UIC 运行到第 15/17 条时，因该次 AgentDock async 命令人为设置的 180 秒 timeout 被 kill；
- 前 15 条全部为 PASS；
- 尚未在该次 monolithic run 内执行完的正好是 UIC-DEBUG-008 / 009；
- 008 / 009 已在此前独立运行并通过；
- 因此不要把这次记录写成“test:all 完整通过”，也不要写成“测试失败”；准确描述是“完整 run 被 180 秒命令上限截断，已覆盖部分全部通过，尾部两条另行通过”。

### 13.6 当前开发效率问题与建议下一步

用户已经明确感觉“每实现一个功能都很慢”。

当前判断：
- 对话变长有影响，但不是主因；
- 更主要问题是 `ui-spikes/integration/app.ts` 已明显单体化；
- 编辑器、AG Grid、Drive、保存、Undo/Redo、功能调试、状态栏、章节加载等逻辑集中；
- 功能调试的 completed/running/progress/step/reset 模板有大量重复；
- browser UIC 已到 17 条，完整回归本身需要较长时间。

**建议下一步先暂停继续堆业务功能，做一轮“开发效率重构”，但不要大爆炸式重构。**

优先级建议：

1. 先抽通用“功能调试 runner / registry”：
   ```text
   completed
   running
   progress
   step
   delay
   pass/fail
   initialize reset
   ```
   统一管理。
   目标：以后注册复杂功能调试接近：
   ```ts
   registerFeatureDebug({ id, title, steps })
   ```
   而不是在 app.ts 四处加状态与事件。

2. 再逐步从 `app.ts` 拆成熟域，而不是一次性重写：
   ```text
   featureDebugRunner.ts
   reviewGridController.ts
   calibrationPersistence.ts
   sourceEditorController.ts
   driveChapterController.ts
   ```
   `src/workbenchHistory.ts` 已经是一个成功的先例。

3. 调整测试节奏：
   - 开发中：相关 core + 相关 1~3 条 UIC；
   - 功能完成/阶段 checkpoint：再完整 `npm run test:all`；
   - 不要每个小编辑都跑 17 条 browser UIC。

4. 文档更新节奏：
   - 实现过程中优先维护 Feature Contract / UIC；
   - 功能稳定后一次性同步 ENGINEERING_MEMO；
   - 避免一个小改反复改三份文档。

**2026-09-05 已完成第一刀：**

- 新增 `ui-spikes/integration/featureDebugRunner.ts`；
- 已统一接管功能调试的 completed / running、按钮 disabled + aria-disabled、progress / step、delay、pass / fail、initialize reset；
- 6 个现有功能调试动作已改为 registry 注册；“初始化”作为统一 reset 入口调用 runner.reset；
- Undo / Redo 与“保存标定 / 重入加载”已经改成多步骤 `steps` 工厂，每次运行使用独立闭包状态；
- 各步骤仍调用原来的真实产品路径，未增加 debug-only 产品能力；
- 未改变 Feature Contract / UIC / UI 文案与最终状态语义；
- integration typecheck / build 通过；
- 定向 UIC-DEBUG-002 / 008 / 009 为 3/3 通过；
- 随后完整 `npm run test:all` 通过，其中 browser UIC 为 17/17；
- 用户实测发现多步骤功能调试成功后步骤面板会持续遮挡后续操作，现已修正为：运行中显示，成功结果短暂显示后自动收起（失败保留用于诊断）；UIC-DEBUG-008 / 009 已同步为该契约，再次完整 `npm run test:all` 17/17 通过。

下一步如果继续做开发效率重构，仍按“小刀”原则，从 `app.ts` 中挑一个成熟、边界清楚的域再抽，不要一次拆多个控制器。

重构必须保持所有现有 Feature Contract / UIC 行为不变，不能趁重构改变产品语义。

### 13.7 2026-09-05 · UI v2 架构壳启动

用户确认现有 integration UI 的主要问题已经不是单个功能 bug，而是工作台身份、业务状态、控件状态和功能调试状态互相直接修改，形成“面条式”交互。决定停止继续在旧 UI 上做架构性加法，建立独立的 `ui-spikes/v2/`，旧 integration 继续作为可运行产品参照和 Feature Contract / UIC 行为基线。

v2 第一阶段只建立 WorkspaceMachine，不迁移旧业务：

- 使用稳定版 XState v5（当前安装 `xstate ^5.32.6`），不使用仍为 alpha 的 v6；
- v2 自己拥有独立 `package.json` / `package-lock.json` / TypeScript / build / test，不修改旧 integration 依赖；
- 当前状态：`idle`、`chapter.clean`、`chapter.dirty`、`chapter.saving`、`debug`；
- UI 控件只读取 `deriveWorkspaceView(snapshot)`，禁止各事件处理器自行决定业务权限；
- debug 与真实 chapter 互斥；debug 可演示 EDIT，但没有 SAVE 转换；
- 只有 dirty chapter 可以 SAVE；
- saving 期间不可编辑和重复保存；
- dirty chapter 当前禁止直接 CLOSE，未来必须显式实现“保存 / 放弃修改 / 取消”流程；
- 当前 demo 不接 Google Drive、CodeMirror、AG Grid、Undo/Redo、标定持久化和 Feature Debug Runner，也不会写真实文件。

新增：
- `ui-spikes/v2/src/workspaceMachine.ts`
- `ui-spikes/v2/src/app.ts`
- `ui-spikes/v2/tests/workspaceMachine.test.ts`
- `ui-spikes/v2/index.html`
- `ui-spikes/v2/README.md`

验证：
- `cd ui-spikes/v2 && npm test` 通过；
- `npm run build` 通过；
- npm audit 为 0 vulnerabilities；
- 本轮没有修改旧 integration 产品逻辑，因此没有重新跑旧 17 条 UIC；
- 用户明确要求：session / canEdit / canSave / 按钮 disabled 等可参数化界面状态不应由人工逐项检查，必须自动化。v2 已新增 Playwright 浏览器测试；人工仅负责判断交互是否自然、是否误导等主观体验。
- v2 已建立 iPad 实机联调状态通道：页面状态变化会上报 clientId、设备、lastAction、Workspace View 能力参数等，不上报 working 正文；服务端可按真实 iPad 实例读取。页面新增“刷新时间”，并上报固定 `pageLoadedAt`，用来确认当前读取的是用户最近一次刷新后的页面实例。
- v2 已补齐双向调试命令通道：仅允许白名单 `open-chapter / edit / save / save-success / save-failure / close / enter-debug / exit-debug`；iPad 轮询领取命令，走与人工按钮相同的产品动作入口，并把唯一 `commandId` 随状态回报。非白名单命令服务器直接拒绝。
- **v2 第三刀：CodeMirror working 编辑**：接入 CodeMirror 6；fixture working（当前 63,833 字符）加载到真实编辑器。程序化 setDocument 不制造 dirty；只有 CodeMirror `docChanged` 发送 `WORKING_CHANGED(text)`，由 WorkspaceMachine 更新 chapter.workingText 并转入 dirty。新增 `workingLength` 作为无正文泄露的实机验证指标。远程 `edit` 现在也通过 CodeMirror transaction 真正插入一个调试字符，自动化已验证 63,833 → 63,834、clean → dirty、canSave false → true；saving 时编辑器转为不可编辑。
- **v2-M1 真实章节持久化闭环已完成（2026-09-05）**：移除主路径中的“模拟保存成功/失败”，`chapter.saving` 现在 invoke repository.saveChapter；只有真实 Promise 成功才 clean，失败自动回 dirty+saveError。开发实机固定绑定 Mac Google Drive 同步目录中的 `01 Buffett’s Alpha 副本` working + sidecar，不碰正式章节；服务端不接受任意文件路径。working 以 SHA-256 revision 做 expectedRevision 冲突保护，stale 保存返回 409 并拒绝覆盖。
  - v2 自动化 6/6：真实文件落盘、刷新重入、远程 edit→save→close→open 持久化、stale revision 冲突、命令白名单、状态上报均通过。
  - 真实 iPad 实机验收：刷新后 pageLoadedAt `2026-09-05T15:42:55.984Z`；打开副本 63,833 字符 / revision `c98d7b5f…`；远程 CodeMirror edit 后 63,834 + dirty；真保存后 revision `40ef918c…` + clean；关闭重开仍为 63,834 且 revision 相同，服务端直接读取实际 Google Drive 同步文件也一致。验收字符随后安全清理，副本恢复 63,833 / `c98d7b5f…`。
  - 稳定检查点已运行根目录 `npm run test:all`：全部核心测试通过，旧 integration Playwright UIC 17/17 通过。
- **v2-M2 真实项目章节 catalog 已完成（2026-09-06）**：v2 不再绑定单一 Buffett 副本，而是绑定固定项目根 `Bufett’s Alpha`，扫描其 `chapters/` 生成 chapterId catalog。真实目录当前 7 个章节，其中 5 个 ready（01、01 副本、02、03、04），00 与 05 因缺 sidecar 标记 blocked。UI 只持有 chapterId；catalog、selectedChapterId、open/save 生命周期统一由 WorkspaceMachine 管理。服务端不接受任意路径，remote `open-chapter` 对缺 id / forged id / blocked id 分别 400 / 404 / 409。
  - M2 自动化 6/6：catalog、多章节选择、跨章节 open、持久化重入、remote 指定 chapterId、stale revision 与非法 remote open 全通过。
  - 真实 iPad 实机验收：pageLoadedAt `2026-09-05T16:07:04.783Z`；项目上报 7 chapters / 5 ready。副本章节 63,833 → remote CodeMirror edit 63,834 → 真保存 revision `c98d7b5f… → 40ef918c…` → 关闭重开保持；随后 remote 打开 02（3,254 字符）和 03（3,844 字符）均正确进入 clean；remote 打开 blocked 的 00 返回 409。验收字符最终安全清理，副本恢复 63,833 / `c98d7b5f…`。

- **v2-M3 真实标定持久化闭环已完成（2026-09-06）**：接入 AG Grid 36.1，Grid 仅投影 WorkspaceMachine rows；已忽略/已删除不显示。当前最小编辑只开放“现有行类型 → 已忽略”，事件进入 XState 后复用正式 `ChapterReviewApplication.setRowsLineType()`，不允许 Grid 直接维护第二份可编辑状态。
  - repository SAVE 使用 `serializeSidecar()`，同一次保存 working + sidecar；revision 升级为 working + canonical sidecar 的组合 SHA-256。working 或 sidecar 任一外部变化都会使 expectedRevision 失效并返回 409。
  - M3 自动化 8/8：AG Grid sidecar 持久化、remote 标定+working 同次保存、working stale 409、sidecar stale 409、M2 跨章节/debug 回归全部通过。
  - 稳定检查点再次运行根目录 `npm run test:all`：全部核心测试通过，旧 integration Playwright UIC 17/17 通过。
  - 真实 iPad 实机：pageLoadedAt `2026-09-05T23:06:39.237Z`；副本基线 working 63,833 / calibration 212 / visible 193 / ignored 15 / pairs 10 / revision `409011a8…`。remote 通过同一 Grid 业务路径忽略一条标定后 visible 193→192、ignored 15→16，working 不变；真保存 revision `409011a8… → bd8efefe…`；关闭重开仍 192/16。验收结束已恢复原 sidecar，最终 63,833 / 212 / 193 / 15 / `409011a8…`。

- **v2-M4 模块化标定工作台与源码定位已完成（2026-09-06）**：M3 总表拆为 `章节标题 / 注释 / 嵌入块 / 非法断行` 四个真实 Review 模块；activeReviewModule、activeModuleRows、focusedReviewRowId/focusedSourceLine 全部进入 WorkspaceMachine，UI 不保存第二份模块/定位状态。
  - sidecar reload 的旧 range 不可信；Grid 行号与点击跳转统一使用正式 `locateCandidate()` 对当前 working 重新定位，成功后由 CodeMirror `revealRange()` 居中选中。
  - 真实 fixture 模块基线：章节标题 10、注释 20、嵌入块 51、非法断行 6；注释有注释号列，嵌入块视觉列顺序与旧工作台一致为组号→行号→行类型→预览。
  - remote 白名单新增 `select-review-module / focus-first-calibration`；非法 module 400。M4 v2 自动化 10/10 通过，含模块切换不 dirty、真实源码定位、M1–M3 全回归。

后续迁移原则：一次只迁一个已验证能力；每个能力继续使用旧 Feature Contract / UIC 作为行为基线，直到 v2 达到等价后再考虑替换旧 integration 页面。

**v2 第二刀：章节加载边界**

- 新增 `ChapterRepository` / `FixtureChapterRepository`，不把旧 `ChapterWorkspaceApplication` 整块搬入 v2；
- WorkspaceMachine 新增 `opening` / `loadError`，`OPEN_CHAPTER` 只表达意图，异步加载成功后才进入 `chapter.clean`；
- 当前 fixture 是旧 integration Buffett 章节 source / working / sidecar 的冻结副本，只读、不写真实文件；
- v2 实际复用现有 `src/sidecar.ts` 的 `candidatesFromSidecar` 解析标定，而不是另造 sidecar 规则；
- 页面当前自动显示并验证：working 382 行、标定 212 条、annotation pairs 10 条；
- v2 `npm test` 全部通过，其中 WorkspaceMachine 单测通过、Playwright browser 2/2 通过；
- 旧 integration 产品代码未修改，本刀未重跑旧 17 条 UIC。

- **v2-M5 统一 Undo / Redo 已完成（2026-09-06）**：正文与标定统一进入 WorkspaceMachine 历史，快照为 workingText + rows + annotationPairs；revision 不进入历史，savedBaseline 明确代表最后一次真实保存状态。CodeMirror 私有 history 已移除，按钮、Cmd/Ctrl-Z、Cmd/Ctrl-Shift-Z、Ctrl-Y、remote undo/redo 全走同一 XState 产品路径。
  - Undo 回到 savedBaseline 会自动 clean / canSave=false；Redo 离开基线重新 dirty；保存成功后清空 undo/redo；Undo 后发生新操作会清空旧 redo 分支。
  - v2 Playwright 12/12 通过，包含按钮历史、CodeMirror 快捷键统一历史、remote undo/redo、M1–M4 全回归；WorkspaceMachine 混合历史与 redo-branch 契约通过。
  - 稳定检查点运行根目录 `npm run test:all`：全部核心测试通过，旧 integration Playwright UIC 17/17 通过。
  - 真实 iPad：pageLoadedAt `2026-09-05T23:48:51.219Z`。副本基线 63,833 / visible 193 / ignored 15 / revision `409011a8…`；正文 +1 → 标定忽略后为 63,834 / 192 / 16 / undoDepth 2；Undo 标定后 63,834 / 193 / 15；第二次 Undo 回 baseline 并自动 chapter-clean / canSave=false / undo=0 / redo=2；两次 Redo 再恢复 63,834 / 192 / 16；真保存 revision `f8ff51db…`，关闭重开保持，保存后 history=0/0。验收结束已恢复原 working + sidecar，最终 63,833 / 193 / 15 / `409011a8…`。

- **v2-M6 脏章节离开保护已完成（2026-09-06）**：dirty 关闭或 dirty 切章都会进入 WorkspaceMachine 正式 `chapter-leave-confirm` 状态；PendingLeaveIntent 区分 close / open(target chapterId)。取消保留草稿，放弃不写盘，保存并继续必须等待真实 repository SAVE 成功后才离开。remote 白名单新增 leave-cancel / leave-discard / leave-save，和真实 UI 共用同一产品事件路径。
  - WorkspaceMachine 覆盖 cancel、discard-close、save-close、dirty switch cancel/discard/save；v2 Playwright 14/14 通过，M1–M5 全回归。
  - 稳定检查点运行根目录 `npm run test:all`：全部核心测试通过，旧 integration Playwright UIC 17/17 通过。
  - 真实 iPad：pageLoadedAt `2026-09-06T00:11:04.996Z`。副本基线 63,833 / `409011a8…`；dirty close → leave-confirm → cancel 后保留 63,834；再次 close → discard 后 repository 不变且重开 63,833；dirty 后切换 02 → leave-confirm(target=02) → save-and-continue，副本先保存为 63,834 / `f2001240…` 再打开 02；随后重开副本确认已保存。验收结束已恢复原 working + sidecar，最终 63,833 / `409011a8…`。

- **v2-M7 非法断行完整迁移已完成（2026-09-06）**：章节加载时基于当前 working 调用正式 `ChapterReviewApplication.refreshIllegalLineBreak()` 重扫非法断行，并 reconcile sidecar 人工标定；不把 previousLineText / nextLineText / breakReason / mergedPreview 这类派生字段塞回 sidecar。非法断行专用列为断行处 / 行类型 / 前10+后10 / 合并预览 / 判断；点击行统一定位并选中断点前后各 10 字。
  - “合并”保持旧产品语义：只写标定，不即时改 working；真正合并仍在导出时发生。页面导出状态直接使用 `buildIllegalMergeSpans()`。fixture 基线 6 merge / 6 spans / 3 ignored；忽略一条后 5 / 5 / 4，working 不变；Undo/Redo 与保存重入均通过。
  - 实机 telemetry 顺序保护补齐：同一 pageLoadedAt 拒绝 sequence 倒退状态，旧页面实例不能覆盖新页面；新 pageLoadedAt 可从 sequence=1 重新开始。专项 state/remote 4/4 通过，v2 完整 Playwright 16/16 通过。
  - 稳定检查点重新运行根目录 `npm run test:all`，完整 monolithic run 成功退出：全部核心测试通过，旧 integration Playwright UIC 17/17 通过。
  - 真实 iPad：pageLoadedAt `2026-09-06T00:56:01.269Z`。副本基线 63,833 / illegal merge 6 / ignored 3 / revision `409011a8…`；非法断行模块 activeRows=6，第一条定位第 124 行。忽略一条后 63,833 / mergeDecision 5 / mergeSpan 5 / ignored 4；Undo 回 6/6/3 clean，Redo 回 5/5/4；保存 revision `35d8bf75…`，关闭重开仍 5/5/4。验收结束已恢复原 working + sidecar，最终 63,833 / 6 / 3 / `409011a8…`。

- **v2-M8 章节标题模块完整迁移已完成（2026-09-06）**：加载章节与普通 working 编辑都会使用正式 `ChapterReviewApplication.refreshChapterTitle()` 基于当前 working 重扫标题并 reconcile sidecar；嵌入块排除继续复用 `MODULE_REGEX_DEFAULTS["嵌入块"]`。标题 1–6 级跟随当前 Markdown，人工 `已忽略` 跨重扫保留。
  - 标题专用表为行号 / 行类型 / 标题预览；H1–H6 用真实标题 DOM 预览。行类型支持 1–6 级标题与已忽略；修改标题层级会调用正式 `applyHeadingLineTypeToText()` 同时修改 Markdown + rows，只产生一条统一 Undo/Redo history snapshot。CodeMirror 仍只是 WorkspaceMachine 投影。
  - `为标题编号` 是 workspace/export setting：默认 true，不 dirty、不进 Undo/Redo、不写章节 sidecar。预览编号按源码顺序生成；导出统计直接复用正式 `exportByCalibration(..., { numberHeadings })`。
  - 专项 Playwright `chapterTitleModule.spec.ts` 2/2 通过；v2 最终全量 18/18 通过；`git diff --check` PASS；根目录 `npm run test:all` 完整成功，全部 core tests 通过，旧 integration UIC 17/17 PASS。
  - 真实 iPad：client `client-mtoiisa8-qnai8ae9`，pageLoadedAt `2026-09-06T01:56:04.802Z`。安全副本基线 63,833 / 标题 10 / 导出标题 10 / 已编号 10 / revision `409011a8…`；remote 走真实 Grid/XState 产品路径将第一条 H1→H2，working 63,834 / undoDepth 1；Undo 回 63,833 clean，Redo 回 63,834 dirty；关闭编号后已编号 10→0 且 history 不增加，再开启回 10；真保存 revision `154c000d…`，关闭重开后 H2 与 63,834 保持，并直接读取持久化 working 确认 `# Buffett’s Alpha → ## Buffett’s Alpha`。验收结束通过 expectedRevision 恢复原 working + sidecar，最终精确回 63,833 / calibration 212 / visible 193 / ignored 15 / illegal 6+3 / revision `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`。
  - M8 完成后下一阶段先迁移 v2 运行/验收环境到已经搭好的 Mac 私有云与外网真实设备状态桥；不重做 WorkspaceMachine/application/core 架构。迁移完成后再决定下一业务模块（优先注释或嵌入块）。

- **v2 Mac 私有云迁移 5/5 已完成（2026-09-06）**：业务架构保持 `WorkspaceMachine / ChapterReviewApplication / core` 不变，只迁移运行、持久化与真实设备验收边界。正式 k3s release 为 `ocr2md-v2` / namespace `ocr2md`，当前镜像 `ocr2md/v2:mpc-final-20260906c`，Deployment 1/1 Ready；workspace 使用 PVC `ocr2md-workspace`，挂载 `/data`，项目子目录 `Bufett’s Alpha`。portable Helm chart 保持 host-neutral；Mac 专属适配放在 `deploy/private-cloud/`。
  - 稳定本机入口仍为 `127.0.0.1:4176`。launchd `com.daisor.ocr2md-preview` 运行 `preview_server.py`：静态前端来自当前 v2 build，`/__workspace/*` 转到 k3s NodePort `30418`，`/__debug/*` 转到 `127.0.0.1:4183`。launchd `com.daisor.ocr2md-control` 运行最新 `dev_server.py`，再把 workspace 请求转到 `30418`；外网继续复用既有 Cloudflare named tunnel / Access，不创建第二条长期 tunnel。
  - 真实设备控制协议完成可靠性收口：服务端命令在明确 ACK 前不从队列删除；浏览器按 `commandSequence` 去重，ACK 丢包后的重复投递只补 ACK、不重复执行产品动作；命令终态 XState 快照与 ACK 同请求原子写入；`open-chapter` / `save` 等异步动作必须离开 opening/saving 中间态后才 ACK；UI paint 最多等待 100ms，避免 Safari/后台帧节流锁死控制面。普通 state telemetry 只发一次普通 fetch，不再用 `Beacon + keepalive fetch` 双发挤占连接池。
  - 可靠性根因已实测定位：此前远程 Undo/Redo 偶发“业务已完成但 ACK 不回”并非 XState/history 错误，而是高频 `sendBeacon + keepalive` 调试流量导致浏览器连接池拥塞，ACK 请求停在客户端未送达服务端。修复后完整远程链路无临时埋点 3/3 连续通过。
  - 最终门禁：v2 `npm test` 18/18 PASS；状态/命令专项 4/4 PASS；根目录 `npm run test:all` 全部 core tests PASS + 旧 integration UIC 17/17 PASS；`helm lint` / `helm template` PASS；portable chart 禁止 `/Users/`、`colima`、`launchd`、loopback/macOS token 检查 PASS；Mac 私有云 `bin/health` → `MPC_HEALTH_OK`，`bin/portability-check` → `MPC_PORTABILITY_OK`；`git diff --check` PASS。
  - 最终真实安全基线通过正式 `4176 → workspace → k3s/PVC` 路径读取：`01 Buffett’s Alpha 副本` working 63,833；annotations 212；visible 193；ignored 15；deleted 4；非法断行 6 条合并 + 3 条已忽略；revision 精确为 `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`。本轮最终门禁未再修改该安全章节。
  - 最终外网真实 iPad smoke（2026-09-06 17:04 +08:00）：最新会话 client `04bb504a-7e75-43d8-8170-c5d76b46ed81`，pageLoadedAt `2026-09-06T09:04:09.167Z`；device bridge v2 installed，visibility=visible，focused=true，viewport 1032×642，VisualViewport/scroll/interactive rects 正常，lastFailure=null。Mac control sidecar 自动下发 `open-chapter(e86c4a84a866bfdb)`，ACK commandSequence=1 后进入 `chapter-clean`，workingLength 63,833，revision 精确为 `409011a8…751a`；再下发 `close`，ACK commandSequence=2 后回 `idle`。随后直接经正式 `4176 → k3s/PVC` 路径复核 annotations 212 / visible 193 / ignored 15 / deleted 4 / illegal 6 merge + 3 ignored / revision 精确不变，记为 `REAL_IPAD_FINAL_SMOKE_OK`。

- **M9 注释模块完整迁移完成（2026-09-06）**：v2 已把注释模块从“读取 sidecar 旧结果”升级为正式工作流。章节加载时会按当前 working 重扫注释；普通 working 编辑也会同步重扫注释，但人工注释号/忽略决定通过稳定 row identity reconcile 保留。AG Grid 注释模块新增可编辑“注释号”列与“配对状态”列，状态包括自动匹配 / 待补引用 / 待补正文 / 待补注释号；WorkspaceView/debug telemetry 同时提供 calibrated / paired / missingRef / missingBody / missingNumber 汇总。
  - 注释号修改走正式 `ANNOTATION_NUMBER_CHANGED → ChapterReviewApplication.setAnnotationNumber`，进入统一 Undo/Redo 历史；保存/关闭/重入后 sidecar 的 annotationPairs 与人工注释号保持一致。
  - 自动化验收：M9 专项（注释 UI + reviewModules + remote command）PASS；v2 全量升级为 21/21 PASS；根 `npm run test:all` 全部 core PASS + 旧 integration UIC 17/17 PASS。
  - 真实设备验收：通过当前外网 Safari bridge 在安全副本上执行 `open-chapter → 注释模块 → renumber-first-annotation(1→99) → undo → close`。基线 20 条注释 / 10 对完整匹配；改号后变为 annotationPairs=11、paired=9、missingRef=1、missingBody=1、undoDepth=1；Undo 后精确回 10 对完整匹配、missingRef/body=0、chapter-clean。全过程未 SAVE，PVC revision 始终为 `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`，212/193/15/4/非法断行 6+3 基线完全不变，记为 `REAL_DEVICE_M9_ANNOTATION_OK`。
  - M9 最终私有云镜像收口为 `ocr2md/v2:m9-annotation-20260906b`，Helm revision 4，Deployment 1/1 Ready。封箱时补齐 OCI 静态资产：`Dockerfile.private-cloud` 现在显式复制 `module-probe.js`，并通过容器内文件检查与 NodePort `/module-probe.js` 200 验证；该 b 版相对已通过真实设备功能验收的 a 版只包含 M9 页面标题/说明更新与 OCI 打包完整性修复，不改变 WorkspaceMachine/注释业务逻辑。

- **M10 嵌入块模块完整迁移完成（2026-09-06）**：v2 已把嵌入块从 sidecar 静态投影升级为正式 working 生命周期。章节加载时按当前 working 重扫嵌入块；普通 working 编辑也会同步重扫；组号为派生值，由每个 `>` 开启新组并延续到下一个 `>`，人工忽略/删除通过稳定 row identity reconcile 保留。WorkspaceView/debug telemetry 新增 embedTotalRows / embedVisibleRows / embedGroupCount / embedUnassignedRows；真实基线为 65 总行 / 51 可见 / 11 组 / 0 未分组。
  - 嵌入块人工行类型修改继续走统一 `CALIBRATION_LINE_TYPE_CHANGED`，进入统一 Undo/Redo 历史；保存/关闭/重入后人工忽略保持。M10 专项（embed UI + reviewModules + remote command）7/7 PASS；v2 全量升级为 23/23 PASS；根 `npm run test:all` 全部 core PASS + 旧 integration UIC 17/17 PASS。
  - 私有云部署镜像 `ocr2md/v2:m10-embed-20260906a`，Helm revision 6，Deployment 1/1 Ready；`/module-probe.js` 与 `/dist/app.js` NodePort 均 200。
  - 真实设备验收：外部 Safari bridge 前台可见、focused、无 failure；安全副本执行 `open-chapter → 嵌入块 → ignore-first-calibration → edit → undo → undo → close`。基线 65/51/11/0；忽略后 65/50/11/0、ignoredCalibrationRows +1；working +1 后重扫仍保持 65/50/11/0 与人工忽略；第一次 Undo 只撤 working，第二次 Undo 撤人工忽略并回 65/51/11/0、chapter-clean。全过程未 SAVE，PVC 最终仍为 working 63,833 / annotations 212 / visible 193 / ignored 15 / deleted 4 / illegal 6 merge + 3 ignored / revision `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`，记为 `REAL_DEVICE_M10_EMBED_OK`。

- **M11 章节定界完整迁移完成（2026-09-06）**：v2 已把 OCR 根 Markdown → 自然序合并 working → 章节定界候选 → `章节文件` 标定 → Undo/Redo → SAVE 重入 → 安全导出 chapters/... 的完整链路接入同一 `WorkspaceMachine / ChapterReviewApplication / ChapterRepository`。浏览器 core 负责 OCR 判断、自然序合并、一级标题定界、章节文件命名、segment/frontmatter；Python `dev_server.py` 只负责项目根 Markdown 列出、hidden boundary working/sidecar/baseline/manifest 的冲突安全原子持久化，以及把 core 已生成的章节文本写入 `chapters/<stem>/<stem>.md` / `<stem>.working.md`。
  - boundary special workspace id 为 `__boundary__`；正式 hidden 文件为 `.ocr2md-merged.working.md`、`.ocr2md/chapter-boundary/baseline.md`、`sidecar.json`、`manifest.json`。boundary revision 同时覆盖根 Markdown 输入 + hidden working + baseline + sidecar；外部输入变化会触发 stale revision 409，拒绝盲覆盖。
  - UI 已有“打开章节定界”、`章节定界` module、`章节文件`列、起始序号、“按一级标题依次编号”、“导出章节”；boundary workspace 只允许章节定界 module，普通章节不显示该 module。导出章节带 `ocr2md_chapter_split: true` frontmatter，并首次创建同内容 working；已有 working 不盲覆盖。
  - 自动化：M11 专项 Playwright 1/1 PASS（3 个 OCR 输入按 00001/00002/00010 自然序合并，忽略已 split 根文件；91/92/93 依次编号；Undo/Redo；SAVE 重入；导出 3 章）；v2 完整门最终 24/24 PASS；根 compile/typecheck/core unit 全 PASS；旧 integration 为减少长测试中断拆成 4 批，分别 4/4、4/4、4/4、5/5，合计 17/17 PASS。
  - 真实私有云 boundary 基线：1 个 OCR 输入，working **83,258** 字（此前口头误写过 82,358，正确值为 83,258），2 个一级标题，0 个章节文件分配，revision `9958f7ea5f055965c3ae6a857fd548d053523892a93de8445751050113f3645d`。真实设备 smoke：`open-boundary → assign-boundary-sequence(91/92) → undo → close`；分配后 headings=2 / assigned=2 / segments=2 / canExport=true / undoDepth=1；Undo 后精确回 assigned=0 / segments=0 / chapter-clean；全过程未 SAVE，最终 working 83,258、2 个一级标题、0 分配、revision 精确不变，记为 `REAL_DEVICE_M11_BOUNDARY_OK`。
  - 当前 M11 持久化/导出目标是私有云 PVC runtime。**自动 PVC↔Google Drive reconciliation 仍未实现**；以后接 GD connector 时必须作为 storage/distribution adapter，不把章节定界算法复制到 connector 中。

### 13.8 2026-09-06 · v2 产品壳迁移收口

迁移成功标准重新锁定：不是只完成业务 core 等价，而是同时满足正式工作台恢复、功能调试可一键跑真实产品路径并恢复基线、用户可手动逐步复现，以及连续局部改动证明模块边界清晰、不再牵一发动全身。冻结翻译等新/远期业务扩展，进入“保留新骨架、重建产品壳”的收口阶段。

- 保留：WorkspaceMachine / ChapterReviewApplication / core / Repository / unified history / private-cloud runtime。
- 不迁回旧面条控制逻辑；只恢复旧产品的信息架构、布局、入口和验收体验。
- 第一小刀完成：仅修改 `ui-spikes/v2/index.html`，把纵向 M11 工程验证页重组为旧工作台风格的顶栏 + 数据表/源码双窗 + 双状态栏；工程状态折叠为次级诊断面板；翻译入口从正式可见 UI 隐去。
- 本刀没有修改任何业务 TypeScript。验证：DOM contract 62 ids PASS；typecheck PASS；build PASS；`workspaceUi.spec.ts` 的真实 catalog/open/save/reload smoke PASS。
- 这是第一条“局部 UI 改动不需要联动业务层”的实证，但正式工作台外壳仍未完成：GD 工作区、真正“功能调试 ▾”、预览/正则搜索/分割条等仍待逐小刀恢复。

当前迁移成功度口径：**约 70%**（此前 68%；本刀只增加产品壳与解耦实证，不因测试数量虚增进度）。

- 第二小刀完成：恢复 v2 顶栏真正的“功能调试 ▾”菜单框架，并新增独立 `FeatureDebugMenu` / `FeatureDebugRunner`。功能调试工具与 WorkspaceMachine 的 legacy `debug` session 明确分离，避免验收工具污染产品业务状态机。当前菜单暂只显示“功能流程接入中”，具体功能下一刀逐项注册。
- Runner 保留注册式单步/多步、可见进度、失败保留、成功自动收起、reset 的能力；不迁旧 integration app.ts 的功能实现。
- 验证：DOM contract 67 ids PASS；typecheck PASS；build PASS；featureDebugShell Playwright 1/1 PASS；workspaceUi catalog/open/save/reload + legacy internal debug 回归 2/2 PASS。旧 internal debug 控件已从正式 UI 隐藏，其回归改为工程内部 DOM invocation。
- 当前迁移成功度：**约 72%**。下一小刀只接入第一个真实可回滚功能调试流程，用它验证 Runner 的产品路径边界。

- 第三小刀完成：v2 “功能调试 ▾”接入第一个真实流程“撤销 / 重做”。流程固定 8 步：clean 基线 → 正文修改 → 标题“已忽略” → Undo 标定 → Redo 标定 → 连续 Undo 回保存基线 → Undo 后新正文修改验证旧 Redo 分支失效 → 关闭重入清空历史并复核持久化 revision。
- 安全规则：功能调试只允许 idle 或 clean 且历史为空时启动；dirty/已有历史会拒绝；全过程不 SAVE。idle 启动时结束后返回 idle；已有 clean 普通章节时结束后恢复原章节与原模块。失败时也尽力 Undo 回基线并恢复原会话。
- 为避免 debug-only 产品路径，正文修改与行类型修改分别抽成 `applyWorkingTextChange()` / `applyCalibrationLineTypeChange()` 正式入口；正常 CodeMirror/AG Grid 与功能调试共用这些入口。WorkspaceMachine/core/Repository 均未修改。
- 验证：DOM contract 68 ids PASS；typecheck/build PASS；`featureDebugUndoRedo.spec.ts` 8/8 产品流程 PASS，并从服务端重读确认 working/revision 精确未变；原 `unifiedHistory.spec.ts` 2/2 PASS；菜单框架更新后 shell + undo/redo 2/2 PASS。
- 当前迁移成功度：**约 74%**。下一小刀只做私有云部署与真实设备 smoke，不增加第二个功能调试项目。

- 第四小刀（私有云部署）完成自动部分：构建镜像 `ocr2md/v2:product-shell-20260906a`，Helm release `ocr2md-v2` 升级到 revision 9，Deployment 1/1 Ready。NodePort 30418 与正式 4176 均返回新“产品壳重建”页面，包含 `功能调试 ▾` / `ui-debug-undo-redo`，workspace API 200。
- 正式 `4176 → k3s/PVC` 生产路径 smoke：在真实 PVC 安全副本 `01 Buffett’s Alpha 副本` 上执行功能调试 Undo/Redo 8/8；最终 state=idle，undoDepth=0，redoDepth=0；服务端前后重读 workingLength=63,833、revision `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a` 精确未变，记为 `PRIVATE_CLOUD_PRODUCT_SHELL_SMOKE_OK`。
- 物理 iPad 当前 bridge 最新快照仍是旧 M11 页面，visibility=hidden、focused=false，因此未强行执行真实设备 smoke。控制协议没有 reload 动作；必须等设备页面切前台并刷新后再做最终物理设备确认。
- 当前迁移成功度：**约 75%**。下一动作不是开发：用户只需把 ocr2md 页面切到前台并刷新；随后读取新 bridge 快照并跑一次真实设备 Undo/Redo 功能调试 smoke。

- 第四小刀物理 iPad smoke 完成：用户在真实 iPad 前台刷新新产品壳后，bridge client `04bb504a-7e75-43d8-8170-c5d76b46ed81`，pageLoadedAt `2026-09-06T15:29:56.653Z`，visibility=visible、focused=true、lastFailure=null；`功能调试 ▾` 与 `撤销 / 重做` 真实触摸可用。
- 用户真实点击“撤销 / 重做”后，状态桥完整记录正式产品序列：baseline clean 63,833 / visible 186 / ignored 15 / history 0/0；正文修改→63,834 / undo 1；标题已忽略→visible 185 / ignored 16 / undo 2；Undo→186/15 / 1/1；Redo→185/16 / 2/0；连续 Undo→63,833 / 186/15 / clean / 0/2；新正文修改→63,834 / 1/0，随后 Undo→63,833 / clean / 0/1；关闭重入后 history 0/0，最终 close→idle。全过程没有 SAVE action。
- 所有章节态中的 revision 始终精确为 `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`；正式 4176→k3s/PVC 重读安全副本仍 workingLength=63,833、revision 精确不变。记为 `REAL_IPAD_PRODUCT_SHELL_UNDO_REDO_OK`。
- 当前迁移成功度：**约 76%**。第四小刀封箱。下一小刀回到正式工作台壳，仅补一个旧工作台必要交互缺口，不增加第二个功能调试流程。

- 第五小刀完成：恢复正式工作台左右窗可拖动分割条。新增独立 UI 壳层 `WorkspaceSplitter`，只负责 `--left-pane-width`、pointer capture、键盘左右箭头与 localStorage 持久化；不进入 WorkspaceMachine、ChapterReviewApplication、FeatureDebugRunner 或 Repository。
- 分割范围保持 25%–70%，桌面/iPad 横屏可拖；窄屏 <=700px 保持单列布局，不启用横向拖动。分割条带 separator ARIA 与键盘支持。
- 专项 `workspaceSplitter.spec.ts` 验证：初始 43%，ArrowRight→45%，指针拖动后比例增加，workspace session 始终 idle；localStorage 写入；reload 后比例恢复。DOM contract 70 ids PASS；typecheck/build PASS；专项 1/1 PASS。
- 私有云镜像 `ocr2md/v2:product-shell-splitter-20260907a` 已部署，Helm revision 10，Deployment 1/1 Ready。
- 这是又一条解耦实证：新增并持久化完整 UI 交互只新增一个壳层类 + HTML/CSS 接点，没有修改任何业务状态机或业务 core。
- 当前迁移成功度：**约 77%**。下一步只做真实 iPad 手工拖动确认；通过后再选下一个旧工作台必要 UI 缺口。

- 第五小刀真实 iPad 人工验收通过：用户刷新后拖动 `workspace-splitter`。bridge client `04bb504a-7e75-43d8-8170-c5d76b46ed81`，pageLoadedAt `2026-09-06T23:12:46.469Z`，visibility=visible、focused=true、lastFailure=null。pointerdown 命中真实 separator，起始 rect.x=443.75；拖动后 bridge 最新 splitter rect.x=666，说明左右窗比例真实改变。Workspace state 始终 idle，Undo/Redo 0/0，无业务事件、无持久化写入。
- 记为 `REAL_IPAD_WORKSPACE_SPLITTER_OK`。第五小刀封箱。
- 当前迁移成功度：**约 78%**。下一小刀继续只补一个正式工作台必要 UI 缺口。

- 第六小刀完成自动部分：恢复右侧“源码 / 预览”上下双窗与水平分割条。新增独立 UI 投影 `BasicMarkdownPreview`，仅从当前 XState chapter.workingText 读取并通过 DOM API 安全构造基础 Markdown 预览（H1-H6、段落、引用、无序/有序列表、 fenced code）；不允许原始 HTML，不参与保存、不持有业务状态。复杂 markdown-it/DOMPurify/KaTeX 暂不迁入，避免本刀扩大。
- 新增 `EditorPreviewSplitter`，仅管理右窗上下比例、pointer/键盘与 localStorage；不进入 WorkspaceMachine/Application/core/Repository。
- 专项 `editorPreview.spec.ts`：打开真实测试章节后预览出现标题且文本 >100；正常 CodeMirror 输入使 preview 即时变化；正式 Undo 后 preview 精确恢复；水平 splitter 55→57，workspace session 保持 chapter-clean；localStorage 持久化并 reload 恢复。与竖向 splitter 回归合计 2/2 PASS；DOM contract 73 ids、typecheck、build 全 PASS。
- 私有云镜像 `ocr2md/v2:product-shell-preview-20260907a` 已部署，Helm revision 11，Deployment 1/1 Ready。
- 当前迁移成功度：**约 80%**。下一步只做真实 iPad 人工确认：刷新、打开普通章节、确认下方预览出现，并拖动右窗水平分割条。通过后再继续下一个 UI 缺口。

- 第六小刀真实 iPad 人工验收通过：用户刷新后打开普通章节 `01 Buffett’s Alpha`，Workspace state=chapter-clean，workingLength=67,160，revision `528e480bbebecf94ae4dd9df9345f570ccff6726344c1ae4e596d2b39251ff07`，Undo/Redo 0/0、canSave=false。bridge 实际捕获 `markdown-preview`，其中可见正文以及 H1 “Andrea Frazzini, David Kabiller, CFA, and Lasse Heje Pedersen”，证明真实设备下预览已渲染。
- 用户真实触摸 `editor-preview-splitter`，bridge 记录水平 separator rect.y 从 226.75 拖到 413，随后又回到 226.75；说明源码/预览高度比例真实可调。全过程没有业务 dirty、没有 SAVE、lastFailure=null。
- 记为 `REAL_IPAD_EDITOR_PREVIEW_SPLITTER_OK`。第六小刀封箱。
- 当前迁移成功度：**约 81%**。下一小刀继续只补一个旧工作台必要 UI 缺口。

- 第七小刀完成自动部分：恢复正式源码窗顶部正则搜索，仅搜索源码，不搜索预览；支持实时匹配、区分大小写、Enter/下一个、Shift+Enter/上一个、↑/↓按钮、匹配计数与非法正则错误提示。
- 新增独立 UI 工具层 `SourceRegexSearch`，只缓存匹配 offset，不持有正文；正文继续来自 XState workingText。命中时只调用 CodeMirror `WorkingEditor.revealOffsets()` 选择并居中，不发送 XState 业务事件，不进入 history，不触发 dirty/save。
- 专项 `sourceRegexSearch.spec.ts`：以真实测试章节动态计算 Buffett 匹配数，UI 计数一致；next/prev 索引正确；非法 `[` 设置 aria-invalid 与错误状态；清空恢复；全过程 state=chapter-clean、undo/redo=0/0、save disabled。与 editorPreview 回归合计 2/2 PASS；DOM contract 78 ids、typecheck、build 全 PASS。
- 私有云镜像 `ocr2md/v2:product-shell-regex-20260907a` 已部署，Helm revision 12，Deployment 1/1 Ready。
- 当前迁移成功度：**约 83%**。下一步只做真实 iPad 人工确认：刷新、打开普通章节，在源码顶部正则框输入 `Buffett`，确认出现匹配计数并点一次 ↓；搜索过程中不应出现“保存标定”可用。

- 第七小刀真实 iPad 人工验收通过：真实设备刷新后打开普通章节，bridge 显示 regex-search/search-prev/search-next/search-case 均可见；输入搜索词后 prev/next 从 disabled 变为 enabled；用户真实点击 search-next，bridge 记录 device_click 命中 `#search-next`，随后紧接 device_scroll，证明 CodeMirror 已跳到下一匹配。
- 搜索期间 Workspace state 始终 `chapter-clean`，undoDepth=0、redoDepth=0、canSave=false，revision 仍为 `528e480bbebecf94ae4dd9df9345f570ccff6726344c1ae4e596d2b39251ff07`，lastFailure=null。状态桥按隐私规则不回传 input value，因此不以桥侧复述搜索词或输入内容作为验收依据；以用户输入动作 + 按钮启用 + next click + editor scroll + business state不变为验收证据。
- 记为 `REAL_IPAD_SOURCE_REGEX_SEARCH_OK`。第七小刀封箱。
- 当前迁移成功度：**约 84%**。下一小刀继续只补一个旧工作台必要 UI 缺口。

### 13.9 2026-09-07 · 功能调试收口规则升级

用户明确要求：
> **迁移成功、并通过人工验收的功能，必须成为一个独立的功能调试项。**

因此从现在开始，迁移完成标准升级为：
1. 功能代码已迁移并通过自动测试；
2. 功能已部署到真实私有云页面；
3. 用户在真实设备上人工验收通过；
4. **该功能在 `功能调试 ▾` 中有独立入口**；
5. 调试入口必须走与正常产品相同的真实路径；
6. 调试流程完成后必须恢复/可恢复基线；
7. 用户可在调试 reset 后，通过普通产品界面手工重复同一功能。

已人工验收、因此必须补成功能调试项的当前功能至少包括：
- 撤销 / 重做（已完成调试项）
- 左右工作窗分割条
- 源码 / 预览水平分割条
- Markdown 预览
- 源码正则搜索

以后不再把“人工验收通过”与“功能调试项存在”分开处理；两者共同构成功能迁移收口。

- 功能调试首项“初始化工作稿”已在 v2 完成并部署。语义沿用旧版但适配当前 Repository：初始化不是回滚到历史 OCR source，而是打开固定安全副本的“已保存 working”作为本轮未操作基线；普通章节当前 load 时 originalText 即已保存 working，因此该定义可避免误伤用户数据。
- 初始化规则：菜单第一项永远可点；其它功能调试项初始化前禁用；只允许 idle/chapter-clean 启动，dirty 直接拒绝；固定选择名称含“副本”的 ready 普通章节；关闭 clean 会话后重开副本；默认模块=章节标题、标题编号=true、Undo/Redo=0/0、canSave=false；正则搜索清空、区分大小写关闭、竖 splitter=43%、横 splitter=55%；成功后标记 data-feature-debug-ready=true，并 reset FeatureDebugRunner 让已完成项目重新可运行。
- Runner 新增 registration.enabled predicate；“撤销 / 重做”现在必须先初始化，且要求当前仍是初始化安全副本、clean、history 0/0、revision 与初始化基线一致。
- 测试：featureDebugInitialize 2/2（基线 + dirty 防误丢稿）、featureDebugShell 1/1、featureDebugUndoRedo 1/1，合计 4/4 PASS；DOM contract 79 ids、typecheck、build PASS。测试 fixture 不放宽产品规则，而由专项测试临时复制正式 fixture 成“副本”。
- 私有云镜像 `ocr2md/v2:feature-debug-init-20260907a` 已部署，Helm revision 13，Deployment 1/1 Ready。
- 正式 `4176 → k3s/PVC` smoke：初始化打开 `01 Buffett’s Alpha 副本`，state=chapter-clean、Undo/Redo=0/0、save disabled、撤销/重做调试项 enabled；PVC 前后 workingLength=63,833、revision `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a` 精确不变，记为 `PRIVATE_CLOUD_FEATURE_DEBUG_INIT_OK`。
- 当前迁移成功度：**约 85%**。下一步只做真实 iPad 人工验收“初始化工作稿”；通过后，再按“一项一刀”把已验收功能补成功能调试项。

- “初始化工作稿”真实 iPad 人工验收通过。真实设备 pageLoadedAt `2026-09-07T02:06:47.938Z`，visibility=visible、focused=true、lastFailure=null。初始化后 Workspace state=`chapter-clean`，chapterPath=`project://Bufett’s Alpha/chapters/01 Buffett’s Alpha 副本/01 Buffett’s Alpha.working.md`，workingLength=63,833，activeReviewModule=`章节标题`，headingNumberingEnabled=true，Undo/Redo=0/0，canSave=false。
- 功能调试依赖关系也验证成功：初始化后 `ui-debug-undo-redo` 已从禁用变为可运行；initialize 本身仍可再次点击，符合“首项负责重建基线并重置后续调试项”的规则。
- 正式 PVC 重读安全副本仍 workingLength=63,833、revision `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`，与初始化前基线精确一致，无持久化写入。
- 记为 `REAL_IPAD_FEATURE_DEBUG_INIT_OK`。当前迁移成功度：**约 86%**。
- 下一小刀：只把已人工验收的“左右工作窗分割条”补成第二个独立功能调试项；仍然要求先经过“初始化工作稿”。

- 功能调试第二项“左右工作窗分割条”完成自动部分。菜单顺序：1 初始化工作稿；2 左右工作窗分割条；3 撤销 / 重做。第二项必须先完成初始化才启用。
- 调试流程 4 步，直接向真实 `#workspace-splitter` 发送正常产品键盘路径相同的 `ArrowRight/ArrowLeft` 事件，不新增 debug-only resize 逻辑：43% 基线 → ArrowRight×4 到 51% → ArrowRight×4 到 59% → ArrowLeft×8 回 43%。Runner 每步可见，失败也强制 reset 回 43%。
- 自动专项使用 MutationObserver 真实记录 `aria-valuenow` 变化，确认出现 51、59、最终 43；同时 chapter-clean、Undo/Redo 0/0、save disabled，PVC working/revision 未改变。初始化 2/2 + Undo/Redo 1/1 + splitter 1/1，合计 4/4 PASS；DOM contract 80 ids、typecheck、build PASS。
- 私有云镜像 `ocr2md/v2:feature-debug-splitter-20260907a` 已部署，Helm revision 14，Deployment 1/1 Ready。
- 正式 `4176 → k3s/PVC` smoke：初始化后运行分割条调试，真实 DOM values=[51,59,43]；最终 chapter-clean、split=43、Undo/Redo=0/0、save disabled；PVC workingLength=63,833、revision `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a` 精确不变，记为 `PRIVATE_CLOUD_FEATURE_DEBUG_SPLITTER_OK`。
- 当前迁移成功度：**约 87%**。下一步只做真实 iPad 人工验收第二调试项。

- “左右工作窗分割条”功能调试真实 iPad 人工验收通过。本次页面 pageLoadedAt `2026-09-07T02:15:44.383Z`；用户于 `02:19:07.003Z` pointerdown、`02:19:07.068Z` click 命中 `#ui-debug-workspace-splitter`，随后该调试项 disabled=true，证明 Runner 已进入/完成执行。
- bridge 连续记录真实 resize：splitter rect.x `443.75 → 526.31 → 608.88 → 443.75`，精确对应 43% → 51% → 59% → 43%。不是仅最终状态自报。
- 最终 Workspace 仍 `chapter-clean`，Undo/Redo 0/0，canSave=false，workingLength=63,833，revision `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`；PVC 重读同值，lastFailure=null。
- 记为 `REAL_IPAD_FEATURE_DEBUG_WORKSPACE_SPLITTER_OK`。该功能现同时满足“迁移成功 + 产品人工验收 + 独立功能调试项 + 调试项人工验收”完整收口条件。
- 当前迁移成功度：**约 88%**。下一小刀按同一规则，只把已验收的“源码 / 预览水平分割条”补成独立功能调试项。

- 功能调试第三个壳层交互项“源码 / 预览水平分割条”完成自动部分。菜单顺序当前：1 初始化工作稿；2 左右工作窗分割条；3 源码 / 预览水平分割条；4 撤销 / 重做。该项同样必须先初始化才启用。
- 调试流程 4 步，直接向真实 `#editor-preview-splitter` 发送与正常产品一致的键盘事件，不新增 debug-only resize 逻辑：55% 基线 → ArrowDown×4 到 63% → ArrowDown×4 到 71% → ArrowUp×8 回 55%。失败强制 reset 回 55%。
- 自动专项通过：MutationObserver 真实记录 `aria-valuenow` 出现 63、71、最终 55；全过程 chapter-clean、Undo/Redo 0/0、save disabled，PVC working/revision 未改变。
- 因执行层长调用时限，本轮门禁拆小运行：新专项 1/1 PASS；初始化+上一分割条 3/3 PASS；Undo/Redo 1/1 PASS；DOM contract 81 ids、typecheck、build 全 PASS。
- 私有云镜像 `ocr2md/v2:feature-debug-editor-preview-splitter-20260907a` 已部署，Helm revision 15，Deployment 1/1 Ready。
- 正式 `4176 → k3s/PVC` smoke：初始化后运行水平分割条调试，真实 DOM values=[63,71,55]；最终 chapter-clean、split=55、Undo/Redo=0/0、save disabled；PVC workingLength=63,833、revision `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a` 精确不变，记为 `PRIVATE_CLOUD_FEATURE_DEBUG_EDITOR_PREVIEW_SPLITTER_OK`。
- 当前迁移成功度：**约 89%**。下一步只做真实 iPad 人工验收该调试项。

- “源码 / 预览水平分割条”第一次真实 iPad 人工运行未判通过：旧调试轨迹 55→63→71→55 在 1032×642 真实设备上受 editor-pane 两侧 min-height=150px 约束，bridge 记录 63% 与 71% 都落到同一可见 y≈462；逻辑虽完整执行，但人工视觉只能看到一次下移，不满足“调试每一步可见”标准。
- 因此仅修正调试轨迹，不改产品分割条本体：改为 55% → 47% → 39% → 55%，走同一正式 ArrowUp/ArrowDown 键盘路径。专项重新 PASS，typecheck/build PASS。
- 修正版镜像 `ocr2md/v2:feature-debug-editor-preview-splitter-20260907b` 已部署，Helm revision 16，Deployment 1/1 Ready。
- 正式 `4176 → k3s/PVC` 可见性 smoke 同时记录 aria 值与真实 getBoundingClientRect().y：47%→y=704.28125，39%→y=615.71875，55%→y=792.84375，三位置 distinct；最终 chapter-clean、split=55、Undo/Redo=0/0、save disabled；PVC workingLength=63,833、revision `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a` 不变。记为 `PRIVATE_CLOUD_FEATURE_DEBUG_EDITOR_PREVIEW_SPLITTER_VISUAL_OK`。
- 当前迁移成功度暂维持 **约 89%**，等待真实 iPad 对修正版重新人工运行后再封箱。

- “源码 / 预览水平分割条”修正版真实 iPad 人工验收通过。本次页面 pageLoadedAt `2026-09-07T02:35:04.814Z`；初始化后该调试项从 disabled=true 变为 enabled=false?（实际 bridge 记录菜单打开时该项可运行，执行后 disabled=true），Runner 完成后保持 disabled，符合“本轮已执行”语义。
- 关键可见性证据：bridge 连续记录 `editor-preview-splitter` rect.y `441.84 → 393.28 → 344.72 → 441.84`，对应修正后的 55% → 47% → 39% → 55%。三个中间/最终位置均肉眼可区分，已消除首次版本受 min-height 夹紧导致 63/71 同位的问题。
- 最终 Workspace=`chapter-clean`，Undo/Redo=0/0，canSave=false，workingLength=63,833，revision `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`；PVC 重读完全一致，lastFailure=null。
- 记为 `REAL_IPAD_FEATURE_DEBUG_EDITOR_PREVIEW_SPLITTER_OK`。该功能现满足完整收口条件：迁移成功 + 普通产品人工验收 + 独立功能调试项 + 功能调试人工验收。
- 当前迁移成功度：**约 90%**。下一小刀按同一规则，只把已验收的“Markdown 预览”补成独立功能调试项。

- 功能调试“Markdown 预览”完成自动部分。菜单新增独立项，必须先运行“初始化工作稿”。
- 调试流程 5 步：1) 验证初始化工作稿已有真实 Markdown 标题/正文预览；2) 通过正式共享正文修改入口 applyWorkingTextChange 临时在 working 顶部插入 H2、blockquote、UL 两项；3) 直接验证 #markdown-preview DOM 同步出现 H2“功能调试预览标题”、引用“功能调试预览引用”、两条列表；4) 走正式 Undo 恢复原 working 与原预览；5) 关闭重入同一安全副本，清空 Redo/history，并确认 persisted revision 未改变。
- 初始化现在同时将 markdownPreviewHost.scrollTop=0，作为统一 UI 调试基线；不属于业务状态。
- 失败保护：若预览调试失败，先尽可能 Undo 临时业务修改，再将 featureDebugEnvironmentReady=false，强制用户重新“初始化工作稿”，不允许半残基线继续跑其它调试项。
- 自动专项 featureDebugMarkdownPreview.spec.ts 1/1 PASS；MutationObserver 确实捕获临时结构化预览出现，最终原预览精确恢复；typecheck/build PASS。初始化 + 水平分割条回归 3/3 PASS；DOM contract 82 ids PASS。
- 私有云镜像 ocr2md/v2:feature-debug-markdown-preview-20260907a 已部署，Helm revision 17，Deployment 1/1 Ready。
- 正式 4176 → k3s/PVC smoke：MutationObserver sawStructured=true，sampleCount=4；最终 chapter-clean、Undo/Redo=0/0、save disabled、临时预览 marker=false；PVC workingLength=63,833、revision 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a 精确不变。
- 记为 PRIVATE_CLOUD_FEATURE_DEBUG_MARKDOWN_PREVIEW_OK。当前迁移成功度：约 91%。下一步只做真实 iPad 人工验收该调试项。

- “Markdown 预览”功能调试真实 iPad 人工验收通过。本次页面 pageLoadedAt 2026-09-07T02:42:50.804Z；初始化后该项由 disabled=true 变为可运行，用户点击其内部子元素后 bridge 记录该项立即 disabled=true，说明 Runner 已实际启动并完成本轮。
- 更关键的是真实 /__debug/state/history 明确记录本轮产品路径：sequence 10 lastAction=working-change，session=chapter-dirty，workingLength 63,833→63,883，Undo/Redo=1/0，canSave=true；sequence 11 lastAction=undo，workingLength 恢复 63,833，session=chapter-clean，Undo/Redo=0/1，canSave=false；随后 sequence 12 close，再 reopen 安全副本，最终当前状态 chapter-clean、Undo/Redo=0/0、canSave=false。
- 这证明功能调试确实使用共享正式 working 修改、正式 Undo、正式 close/open 路径，而不是仅操作预览 DOM。自动/私有云门禁此前已捕获临时 H2“功能调试预览标题”、blockquote“功能调试预览引用”和两条 UL 实际出现在预览 DOM 中；人工本轮与同一 Runner 路径一致。
- 最终真实 iPad workingLength=63,833，revision 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a，Undo/Redo=0/0，canSave=false，lastFailure=null；PVC 重读 workingLength/revision 精确一致，无持久化写入。
- 记为 REAL_IPAD_FEATURE_DEBUG_MARKDOWN_PREVIEW_OK。该功能现满足完整收口条件：迁移成功 + 普通产品人工验收 + 独立功能调试项 + 功能调试人工验收。
- 当前迁移成功度：约 92%。下一小刀按同一规则，只把已验收的“源码正则搜索”补成独立功能调试项。

- 功能调试“源码正则搜索”完成自动部分。菜单新增独立项，必须先运行“初始化工作稿”。
- 调试流程 6 步，完全驱动真实搜索 UI 事件路径，不改 SourceRegexSearch 业务/实现类：1) 空搜索基线；2) 对真实 #regex-search 设置 Buffett 并派发 input 事件，验证 N 个匹配 · 1/N；3) 真实 #search-next.click() 到 2/N；4) 真实 #search-prev.click() 回 1/N；5) 输入非法正则 [，验证 aria-invalid=true、正则错误、导航禁用；6) 清空搜索，恢复空状态并确认业务 history/revision 零变化。
- 该刀没有修改 WorkspaceMachine、ChapterReviewApplication、Repository、WorkingEditor、SourceRegexSearch；仅新增菜单项、Runner 流程和专项测试，是新的局部解耦证据。
- 自动专项 featureDebugSourceRegexSearch.spec.ts 1/1 PASS；MutationObserver 捕获 1/N、2/N、正则错误与最终清空；typecheck/build PASS。初始化 + Markdown 预览回归 3/3 PASS；DOM contract 83 ids PASS。
- 私有云镜像 ocr2md/v2:feature-debug-source-regex-20260907a 已部署，Helm revision 18，Deployment 1/1 Ready。
- 正式 4176 → k3s/PVC smoke：安全副本 Buffett 匹配数=12；采样 saw1=true、saw2=true、sawError=true；最终 chapter-clean、Undo/Redo=0/0、save disabled、searchValue/status 为空、aria-invalid 清除、调试项 disabled；PVC workingLength=63,833、revision 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a 精确不变。
- 记为 PRIVATE_CLOUD_FEATURE_DEBUG_SOURCE_REGEX_OK。当前迁移成功度：约 93%。下一步只做真实 iPad 人工验收该调试项。

- “源码正则搜索”功能调试真实 iPad 人工验收通过。本次页面 pageLoadedAt 2026-09-07T02:49:45.948Z；用户先运行“初始化工作稿”，bridge 记录 #ui-debug-initialize pointerdown/click；随后再次打开功能调试，正则搜索项从 disabled=true 变为可运行。
- 运行过程中 bridge 明确记录：搜索激活后 #search-prev/#search-next 从 disabled=true 变为 false；随后真实 #search-next click、#search-prev click；之后非法正则/清空阶段导航重新 disabled=true。调试项最终 disabled=true，说明 Runner 本轮完成。
- 由于真实设备桥按隐私规则不回传 input 值，人工侧不读取 Buffett 或 [ 的输入内容；具体 1/12、2/12、正则错误序列已由同一 Runner 的自动专项与正式 4176 smoke 捕获。真实设备侧则验证了同一正式 UI 控件启用→next→prev→禁用的完整交互链。
- 最终真实 iPad Workspace=chapter-clean，Undo/Redo=0/0，canSave=false，workingLength=63,833，revision 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a，lastFailure=null；PVC 重读 workingLength/revision 精确一致，无持久化写入。
- 记为 REAL_IPAD_FEATURE_DEBUG_SOURCE_REGEX_OK。该功能现满足完整收口条件：迁移成功 + 普通产品人工验收 + 独立功能调试项 + 功能调试人工验收。
- 当前迁移成功度：约 94%。下一步继续清点“已迁移且人工验收过、但尚未补成功能调试项”的剩余功能，不盲目增加新功能。

### 13.10 2026-09-07 · 已验收功能调试债务清点

按用户新规则“迁移成功、通过真实人工验收的功能 = 必须有独立功能调试项”，对 v2 已验收记录与当前菜单重新清点。

当前已经完整收口（产品验收 + 独立调试项 + 调试项人工验收）：
- 初始化工作稿
- 左右工作窗分割条
- 源码 / 预览水平分割条
- Markdown 预览
- 源码正则搜索
- 撤销 / 重做（调试项已存在；此前真实产品/调试均已验证）

已迁移且有真实 iPad / 外部 Safari 人工验收，但当前 v2 功能调试菜单仍缺独立入口，按产品功能粒度归并为：
1. 章节选择 / 打开章节（M2 catalog、ready/blocked、多章节打开）
2. 修改工作稿文本（M1 CodeMirror working edit；独立于 Markdown 预览）
3. 行类型：已忽略（M3，统一数据表基础行为）
4. 保存标定 / 重入加载（M1+M3，working + sidecar 真保存与新会话恢复）
5. 数据表模块切换（M4：章节标题 / 注释 / 嵌入块 / 非法断行）
6. 数据表行定位源码（M4：locateCandidate → CodeMirror reveal）
7. 脏章节离开保护（M6：取消 / 放弃 / 保存并继续）
8. 非法断行模块（M7：重扫、上下文、合并/忽略决定、Undo/Redo）
9. 章节标题模块（M8：标题层级修改 + 标题编号设置）
10. 注释模块（M9：注释号修改 + 配对状态 + Undo）
11. 嵌入块模块（M10：组号派生 + 忽略/删除跨重扫保持）
12. 章节定界（M11：OCR 合并 → H1 候选 → 章节文件编号 → Undo；持久化/导出继续由专项自动门禁覆盖）

暂不列入“已验收调试债务”的项目：
- 行号菜单
- 移动源文本块
- 自定义 CSS
- GD 工作区 / Google Drive 连接、工作目录、GD 打开章节
这些属于旧产品/历史 Feature Contract，但当前 v2 尚未完成对应产品迁移或当前正式产品人工验收，后续应先迁移产品，再按同一规则同时建立功能调试项。

优先顺序：先补旧 Feature Contract 中已有成熟语义、且会被多个后续模块复用的基础能力：
A. 修改工作稿文本
B. 行类型：已忽略
C. 保存标定 / 重入加载
D. 数据表模块切换
E. 数据表行定位源码
然后 M6–M11 各业务模块。
当前总体迁移成功度仍约 94%；清点本身不增加进度。

### 13.11 2026-09-07 · 导航模型调整：取消双工作区

用户明确调整产品信息架构：
- 不再存在“清洗工作区 / GD 工作区”两个顶层工作区概念。
- 项目初始入口改为单一“项目导航”，其根为当前接入的工作目录。
- 工作目录下固定展示三个产品节点：ocr、chapters、trans。
- 当前只落实 chapters：选择 chapters 下列出的章节目录后，直接走正式 OPEN_CHAPTER 产品路径并进入章节清洗，不再“先选择章节，再点击打开”。
- ocr 与 trans 目前只展示节点和“待规划”状态，不在本刀定义业务；现有 boundary/translation 底层能力保留但旧顶栏按钮降为隐藏兼容控件，不作为正式产品入口。

实现边界：
- 未修改 WorkspaceMachine / ChapterReviewApplication / Repository 的 catalog 或章节打开契约。
- 复用现有 chapterId catalog；chapter-select 改为“项目导航”的视图投影。
- 顶栏删除可见 workspace-tab；旧 #open-chapter / #open-boundary 仅留隐藏兼容入口供工程回归。
- chapter-select change 对 ready chapter 直接调用共享 executeProductAction("open-chapter", ..., chapterId)。
- 功能调试菜单在新顶栏布局下改为 fixed 右上浮层，避免跨 grid 行时被 CodeMirror 抢占 pointer events。

验证：
- workspaceUi 2/2 PASS：无 workspace-tab；项目导航含工作目录、ocr、chapters、trans；选择章节自动进入 chapter-clean。
- 初始化工作稿专项 PASS；源码正则搜索专项 PASS；DOM contract 83 ids PASS；typecheck/build PASS。
- 私有云镜像 ocr2md/v2:single-project-nav-20260907a，Helm revision 19，Deployment 1/1 Ready。
- 正式 4176 smoke：tabs=0，aria-label=项目导航；旧打开章节/章节定界按钮均不可见；选 01 Buffett’s Alpha 后自动 chapter-clean，path=project://Bufett’s Alpha/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.working.md，active module=章节标题。记为 PRIVATE_CLOUD_SINGLE_PROJECT_NAV_OK。
- 当前总体迁移成功度暂维持约 94%，等待真实 iPad 视觉/交互验收后再计入收口进度。

### 13.11 2026-09-07 · 项目导航取代双工作区

用户确认产品不再需要“清洗工作区 / GD 工作区”两个顶层工作区概念。正式信息架构调整为单一项目导航：
- 顶栏只保留 ocr2md 品牌、项目导航下拉、刷新、功能调试。
- 项目导航根为当前工作目录（当前私有云项目 Bufett’s Alpha）。
- 根下固定三个节点：ocr、chapters、trans。
- 当前只实现 chapters：其下列出 catalog 中的章节目录；ready 章节可选，blocked 章节保留原因并禁用。
- 选择 chapters 下的章节目录后直接走正式 OPEN_CHAPTER 产品事件并自动进入章节清洗，不再要求“选择章节 → 再点打开”。
- dirty 状态选择另一个章节仍由 WorkspaceMachine 正式 leave-confirm 接管，不绕过取消 / 放弃 / 保存并继续。
- close 后项目导航显示重新回到工作目录根，方便再次选择同一章节。
- ocr / trans 节点目前仅作为禁用占位，具体行为稍后规划。
- 旧 #open-chapter / #open-boundary 保留在隐藏 compat-controls，仅用于旧工程回归/底层能力，不再是用户可见产品入口；章节定界/翻译底层能力没有删除。

实现保持解耦：
- 没有修改 WorkspaceMachine / ChapterReviewApplication / Repository。
- 只修改正式壳层 HTML、project navigation projection/change handler，以及测试交互契约。
- 现有 chapter-select 内部 id 暂保留以降低无关重构，但 aria-label 与用户语义已改为“项目导航”。

验证：
- DOM contract PASS，typecheck PASS，build PASS。
- workspaceUi 新导航测试 2/2 PASS：无 workspace-tab；工作目录树含 ocr / chapters / trans；blocked 章节禁用；选择 ready 章节自动进入 chapter-clean。
- 正式私有云镜像 ocr2md/v2:project-nav-20260907a，Helm revision 20，Deployment 1/1 Ready。
- 4176 正式浏览器 smoke：workspaceTabs=0；ocr/chapters/trans 节点存在且占位节点禁用；旧 openChapter/openBoundary 均不可见；选择章节自动打开；close 后 nav 回根；dirty 切另章进入 chapter-leave-confirm，放弃后按原产品路径继续。
- 记为 PRIVATE_CLOUD_PROJECT_NAV_OK。总体迁移/收口进度暂维持约 94%，等待真实 iPad 人工确认这一界面调整。

### 13.12 2026-09-07 · 功能调试移入预览窗右下角 + 步骤可回看

用户明确调整：
- 功能调试不再占顶部项目导航；预览窗操作很少，因此把“功能调试 ▾”放到预览窗右下状态栏。
- 一次调试执行中的步骤列表也放在这里。
- 调试结束后步骤历史不能消失；应可点击再次展开回看。

实现：
- #ui-debug-toggle / #ui-debug-menu 从 nav 移到 #editor-pane > .pane-status 右侧；顶栏不再出现功能调试入口。
- 菜单从 fixed 顶部浮层改为右下按钮向上弹出的 absolute 浮层。
- #feature-debug-progress 改成 details；summary 文案“调试步骤”，panel 向上展开。
- Runner prepareProgress 时自动 open；通过后不再 hidden，而是在 completion delay 后仅收起 details；用户可再次点击 summary 展开完整最近一次步骤。
- Runner reset 时才真正清除/隐藏步骤历史。
- 失败状态保留展开，方便立即查看失败步骤。
- editor-pane 状态栏允许 overflow visible，以便菜单与步骤面板向上弹出，不被 preview/status 裁剪。

验证：
- featureDebugShell + featureDebugSourceRegexSearch 2/2 PASS；精确验证顶栏无入口、右下有唯一入口、调试运行时步骤自动展开、结束后仍保留、自动收起后可再次展开并看到 6/6 与“非法正则”步骤。
- typecheck/build/DOM contract PASS。
- 项目导航单独 fresh-fixture 回归 PASS；初始化功能调试专项此前 2/2 PASS。一次合跑导航失败仅因 featureDebugInitialize 在共享测试目录先创建“副本”使章节数发生变化，确认是测试 fixture 污染，不是产品回归。
- 私有云镜像 ocr2md/v2:preview-debug-dock-20260907a，Helm revision 21，Deployment 1/1 Ready。
- 正式 4176 iPad 尺寸 smoke：nav #ui-debug-toggle count=0；右下 dock count=1，rect=(749.8,1163,76.2,28) / viewport 834x1194。正则调试完成后 progress hidden=false、open=null、summary visible；点击“调试步骤”后 open=true，完整显示 6 步与 6/6 通过。最终 chapter-clean、Undo/Redo=0/0、save disabled。记为 PRIVATE_CLOUD_PREVIEW_DEBUG_DOCK_OK。
- 当前总体迁移成功度暂维持约 94%，等待真实 iPad 视觉/交互验收后再收口。

### 13.13 2026-09-07 · 右下悬浮调试栈

用户进一步明确：功能调试不应放在预览状态栏，而应像“工程状态”一样悬浮在预览区域右下角；同时“调试步骤”也应始终悬浮，可展开回看之前执行的步骤。

最终 UI 语义：
- 右下悬浮调试栈，从上到下固定为：
  1) 调试步骤 ▾
  2) 功能调试 ▾
  3) 工程状态 ▾
- 三者由统一 #floating-debug-dock 承载，fixed 于 viewport 右下角，视觉上位于预览区域。
- 工程状态展开时，dock 总高度增加，上方“功能调试/调试步骤”整体向上避让，顺序保持，不互相覆盖。
- 功能调试彻底脱离 editor pane status bar；status bar 恢复只放产品状态信息。
- “调试步骤”从页面初始就始终可见；无历史时显示“尚无调试记录”。
- 运行调试时自动展开步骤；通过后自动收起但不删除。
- 点击“调试步骤”可随时回看最近一次完整步骤与通过/失败状态。
- 重新执行“初始化工作稿”只重置调试项可运行状态，不再清空上一轮步骤历史；下一次真正开始另一项调试时才替换步骤内容。

验证：
- featureDebugShell + featureDebugSourceRegexSearch 2/2 PASS；typecheck/build/DOM contract PASS。
- 自动专项验证三层 y 顺序：steps < featureDebug < engineering；重新初始化后上一轮 6/6 正则调试历史仍存在。
- 私有云镜像 ocr2md/v2:floating-debug-stack-20260907a，Helm revision 22，Deployment 1/1 Ready。
- 正式 4176 iPad Pro 11 smoke：
  - 折叠：steps y=1062，featureDebug y=1096，engineering y=1131。
  - 展开工程状态后：steps y=379.6，featureDebug y=413.6，engineering summary y=448.6；整体向上避让且顺序不变。
  - 初始“调试步骤” visible=true，标题“尚无调试记录”。
  - 正则调试后自动收起，title 保留 6/6 通过；手动展开可见完整 6 步。
  - 再执行“初始化工作稿”后，上一轮 6/6 步骤与“非法正则”步骤仍保留。
  - 最终 chapter-clean、Undo/Redo=0/0、save disabled。
- 记为 PRIVATE_CLOUD_FLOATING_DEBUG_STACK_OK。当前总体迁移成功度暂维持约 94%，等待真实 iPad 人工视觉/交互验收。

### 13.14 2026-09-07 · Undo / Redo / 保存标定移至顶栏

用户明确：撤销、重做、保存标定属于整个工作目录级操作，不应挂在“数据表”局部工具栏。

产品语义：
- 顶部项目导航右侧新增统一“工作目录操作”区域：
  - 撤销
  - 重做
  - 保存标定
- 左侧数据表工具栏彻底移除这三个按钮，不保留第二套入口。
- 当前 v2 仍只有一个 active working chapter，因此底层继续复用现有统一 WorkspaceMachine / XState history / save 入口；不新建 pane-local 或 debug-only 状态。
- 以后 ocr / trans 节点接入编辑能力时，仍应保持这一组顶栏全局入口，由 WorkspaceMachine 扩展“当前工作目录活动上下文”的统一 Undo/Redo/Save 语义，而不是各区域各放一套按钮。

解耦证据：
- 本刀 app.ts 业务代码 0 修改；仅移动现有 #undo/#redo/#save DOM 位置并增加顶栏布局。
- 原事件监听 executeProductAction("undo" / "redo" / "save")、canUndo/canRedo/canSave 派生逻辑完全复用。
- workspaceUi 专项验证顶栏唯一存在三按钮、左侧数据表无同名按钮，并真实点击顶栏保存后持久化/重入成功。
- unifiedHistory 2/2 PASS，正文与标定统一历史及 CodeMirror 快捷键无回归。
- typecheck/build/DOM contract PASS。

私有云：
- 镜像 ocr2md/v2:project-actions-topbar-20260907a
- Helm revision 23，Deployment 1/1 Ready。
- 正式 4176、viewport 1032x642 smoke：
  - nav height=35；
  - project-actions rect=(854,3,170,28)，完整位于 viewport；
  - undo/redo/save rect 分别 (854,3,44,28)、(904,3,44,28)、(954,3,70,28)；
  - grid pane 中三按钮 count 全为 0；
  - clean 时 Undo/Redo/Save 全 disabled；
  - 正文临时修改后 chapter-dirty、Undo enabled、Save enabled；
  - 顶栏 Undo 后 chapter-clean、Redo enabled、Save disabled；
  - 顶栏 Redo 后重新 dirty；再 Undo 恢复 clean；
  - 全程未保存 smoke 临时修改，PVC 未改变。
- 记为 PRIVATE_CLOUD_PROJECT_ACTIONS_TOPBAR_OK。
- 当前总体迁移成功度仍约 94%，等待真实 iPad 人工视觉/交互验收。

### 13.15 2026-09-07 · 顶栏当前位置 breadcrumb + 数据表状态统一下沉

用户明确：
- 导航栏应始终显示当前所在节点，章节清洗场景使用 chapters/章节名称。
- 数据表状态信息必须输出到数据表所属状态栏，不占用数据表顶栏/上方区域。

实现：
- 顶栏项目导航新增 #project-location 常驻 breadcrumb。
- idle 时显示“工作目录”；打开普通章节后显示 chapters/<章节目录名>。
- breadcrumb 采用单行 ellipsis，可压缩，不挤占右侧全局 Undo/Redo/Save。
- 数据表上方彻底移除 #review-grid-status pane-message。
- 标题工具条只保留“为标题编号”操作；title-export-status 移至左侧 pane-status。
- 章节定界工具条只保留起始序号/编号/导出操作；boundary-export-status 移至左侧 pane-status。
- illegal-export-status 从右侧源码状态栏迁至左侧数据表 pane-status。
- review-grid-status 本身迁至左侧 pane-status，成为当前模块/行数的主状态。
- boundary-selection-status 也只在章节定界模块需要时显示。
- chapter-selection-status 在打开章节后隐藏，因为当前位置已经由顶栏 breadcrumb 承担；idle 时仍用于工作目录 catalog 摘要。
- 状态元素只迁 DOM/显示条件，业务统计与计算逻辑未复制。

验证：
- typecheck/build/DOM contract PASS，DOM ids=84。
- workspaceUi fresh fixture PASS：idle breadcrumb=工作目录；打开章节后 breadcrumb=chapters/01 Buffett’s Alpha；标题状态位于 grid pane status bar；切到非法断行后 review-grid-status 与 illegal-export-status 同步切换，再切回标题正常；后续真实编辑/保存/重入继续 PASS。
- 重型 chapterTitle/illegalLineBreak 合跑一次因执行层超时未完成，随后用轻量真实模块切换回归覆盖本刀 UI 风险，不将超时误判为产品失败。
- 私有云镜像 ocr2md/v2:breadcrumb-grid-status-20260907a，Helm revision 24，Deployment 1/1 Ready。
- 正式 4176、viewport 1032x642 smoke：
  - project-location=chapters/01 Buffett’s Alpha；
  - breadcrumb rect=(590.5,9.5,211.3,15)，project-actions 起点 x=854，无重叠；
  - 数据表上方 review/title/boundary status count 全为 0，pane-message count=0；
  - 左侧 pane-status 中 review/title/illegal status 均存在；
  - 标题模块：review=“章节标题 · 11 行”，title export status 可见；
  - 非法断行模块：review=“非法断行 · 12 行”，illegal export status 可见，title status hidden；
  - 最终 chapter-clean、Undo/Redo=0/0、save disabled。
- 记为 PRIVATE_CLOUD_BREADCRUMB_GRID_STATUS_OK。
- 当前总体迁移成功度仍约 94%，等待真实 iPad 人工视觉/交互验收。

### 13.16 2026-09-07 · 导航下拉即当前位置 + 数据表标签按节点上下文投影

用户进一步明确并覆盖 13.15 中“额外 breadcrumb”的方案：
- 不需要导航下拉旁边再显示独立 project-location。
- 导航下拉本身就是当前位置显示器。
- 当前章节清洗时，收起后的下拉直接显示 chapters/<章节名称>。
- 当前位于 ocr 节点时，下拉直接显示 ocr。
- 数据表标签严格按导航节点上下文投影：
  - chapters/<章节>：只显示章节清洗标签——章节标题、注释、嵌入块、非法断行。
  - ocr：只显示章节定界。
  - trans：仍仅保留待规划节点，本刀不定义标签/业务。

实现：
- 删除 #project-location 独立 breadcrumb DOM/CSS/app 引用。
- chapter option 显示文本统一为 chapters/<chapter.name>；原生 select 收起后自然显示完整当前位置。
- ocr option 从 disabled“待规划”改为真实可选节点，直接复用正式 OPEN_BOUNDARY 产品路径。
- 进入 boundary workspace 后 select value 投影为 __node_ocr__，因此 UI 当前值显示 ocr。
- WorkspaceMachine chapter.clean 增加 OPEN_BOUNDARY → 现有 requestBoundary/opening 路径；不新增章节定界实现。
- deriveWorkspaceView.canSelectChapter 放宽为 idle/loadError/chapterClean/chapterDirty，使 boundary workspace 也能通过同一导航切回 chapters。
- 现有 moduleAllowed 规则被复用：
  - boundary kind → 仅章节定界；
  - normal chapter → 隐藏章节定界与翻译，只显示章节清洗模块。
- 为避免未保存修改绕过 M6，普通 chapter-dirty 下选择 ocr 时当前刀采取安全拒绝：select 恢复当前 chapters/<章节>，源码状态栏提示“请先保存、撤销或关闭后再切换到 ocr”。完整“保存并跨节点切换 ocr”留给 M6 跨节点 leave-intent 扩展单独处理。
- 为适配完整路径 UI 文案，旧测试中按裸章节名 selectOption 的 10 处改为完整 chapters/<章节名>；不改 chapterId/catalog 契约。

验证：
- 新增 navigationContext.spec.ts：ocr → chapters/<章节> → dirty 下误切 ocr，1/1 PASS。
- ocr 阶段：selected=ocr；章节定界 visible=true；章节标题/注释/嵌入块/非法断行全部 hidden。
- chapters 阶段：selected=chapters/01 Buffett’s Alpha；章节定界 hidden；章节标题/注释/嵌入块/非法断行全部 visible。
- dirty 阶段：保持 chapter-dirty；selected 自动恢复 chapters/01 Buffett’s Alpha；明确提示未保存修改；Undo 恢复 clean。
- typecheck/build/DOM contract PASS，DOM ids=83；git diff --check PASS。
- reviewModules 老专项另发现与本刀无关的既有断言债务：测试仍期望非法断行表有“判断”列，而当前实际表头无该列；未在本刀混入修复。
- 私有云镜像 ocr2md/v2:navigation-context-tabs-20260907a，Helm revision 25，Deployment 1/1 Ready。
- 正式 4176 @ 1032x642 smoke：
  - ocr selected=ocr，active module=章节定界，且仅该 tag 可见；
  - chapters selected=chapters/01 Buffett’s Alpha，四个章节清洗 tag 可见且章节定界 hidden；
  - dirty 误切 ocr 后仍 chapter-dirty、selected 保持当前章节、提示未保存修改；
  - Undo cleanup 后 chapter-clean、Undo=0、Redo=1、save disabled。
- 记为 PRIVATE_CLOUD_NAVIGATION_CONTEXT_TABS_OK。
- 当前总体迁移成功度仍约 94%，等待真实 iPad 人工视觉/交互验收。


### 13.17 2026-09-07 · 修复导航切换后数据表未刷新

真实 iPad 用户反馈：导航下拉显示节点正确，但对应数据表没有刷新。

定位过程：
- 真实设备 bridge 证明普通章节之间切换时 XState/数据表内容可更新。
- 进一步按“章节 → ocr”路径验证发现：select 视觉值可先变成 ocr，XState 实际仍停留在原 chapter。
- 根因不是 AG Grid。OPEN_BOUNDARY 的 guard 仍保留旧约束：boundary ready 且 context.chapter 必须为空。因此有当前 clean chapter 时，导航 change 虽发出 OPEN_BOUNDARY，但 guard 拒绝；原生 select 视觉已改变，而数据表仍来自当前 chapter，形成“导航对了、表没刷”的假象。
- 曾短暂探索 AG Grid rowId/recreate 假设；生产 sidecar 检查证明跨章 rowId 本身不同，故撤回所有 contextKey/Grid recreate 防御性改动，不把错误方向留进架构。

正式修复：
- boundaryReady guard 去掉过时的“当前 chapter 必须为空”限制。
- 现有 requestBoundary 本来就会清理 selectedChapterId、chapter、Undo/Redo、savedBaseline 等，因此 clean chapter → ocr 直接复用正式 opening/requestBoundary 路径。
- chapter-dirty → ocr 仍安全拒绝，避免绕过 M6 dirty leave 保护。

专项：
- navigationContext.spec.ts 1/1 PASS。
- idle → ocr：state=chapter-clean，selected=ocr，只有章节定界 tag，AG Grid 表头为 行号/行类型/章节文件/预览。
- ocr → chapters/<章节>：selected 正确，章节清洗 tags 正确，AG Grid 表头恢复 行号/行类型/标题预览。
- dirty 下误切 ocr 仍保持 chapter-dirty + 当前章节选择 + 未保存提示；Undo cleanup 回 clean。
- typecheck/build/DOM/diff PASS。

私有云：
- 镜像 ocr2md/v2:fix-nav-boundary-transition-20260907a
- Helm revision 27。
- 正式 4176 @1032x642 smoke：
  - chapters/01 Buffett’s Alpha：首行 Buffett’s Alpha，标题表头；
  - ocr：selected=ocr，state=chapter-clean，active module=章节定界，表头含章节文件；
  - chapters/02 Appendix A...：selected 正确，标题表头，首行变为 Appendix A。
- 记为 PRIVATE_CLOUD_NAV_TABLE_REFRESH_FIXED_OK。
- 当前总体迁移成功度仍约 94%，等待真实 iPad 刷新并人工验证该修复。

### 13.18 2026-09-07 · REAL_IPAD 导航与数据表刷新验收通过

真实 iPad 对 13.17 修复完成最终人工验收。

实机会话：
- client `04bb504a-7e75-43d8-8170-c5d76b46ed81`
- pageLoadedAt `2026-09-07T07:31:24.554Z`（+08:00 为 15:31:24）
- device=ipad，viewport=1032×642，visibility=visible，focused=true，lastFailure=null。

状态机证据（同一页面实例）：
- sequence 3→4：`open-boundary`，最终 `session=chapter-clean`、`workspaceKind=boundary`、`selectedChapterId=null`、`activeReviewModule=章节定界`、`activeModuleRows=2`。
- sequence 5→6：`open-chapter`，最终 `workspaceKind=chapter`、`selectedChapterId=7b3289edae315769`、`chapterName=01 Buffett’s Alpha.md`、`activeReviewModule=章节标题`、`activeModuleRows=11`。
- sequence 7→8：再次 `open-boundary`，再次稳定到 boundary / 章节定界 / 2 rows。
- sequence 9→10：再次 `open-chapter`，再次稳定到 chapter / 01 Buffett’s Alpha / 章节标题 / 11 rows。
- 全过程 Undo/Redo=0/0、canSave=false，无 dirty、无持久化写入。

真实 DOM / AG Grid 同步证据：
- OCR 稳态：仅 `章节定界` tag 可见；AG Grid 表头为 `行号 / 行类型 / 章节文件 / 预览`；首两条候选来自合并 OCR working（含 `# Buffett’s Alpha`、`# Andrea Frazzini...`）。
- Chapter 稳态：仅 `章节标题 / 注释 / 嵌入块 / 非法断行` 四个 tag 可见；AG Grid 表头恢复 `行号 / 行类型 / 标题预览`；首行恢复 `(001) Buffett’s Alpha`，后续标题行同步出现。
- 第二轮 OCR 与第二轮 Chapter 的 DOM 投影再次重复上述结果，证明不是偶发一次刷新。
- 真实设备桥按隐私规则不回传 `select.value`；导航选中语义以同一交互触发的 `open-boundary/open-chapter`、`workspaceKind`、`selectedChapterId` 与同步 DOM 投影联合确认。

记为：
`REAL_IPAD_NAV_TABLE_REFRESH_FIXED_OK`

13.17 “导航下拉已变但数据表未刷新”问题正式关单。确认根因仍是旧 `boundaryReady` guard，不是 AG Grid；不得重新引入已撤回的 contextKey / destroy+recreate 假设。

当前总体迁移成功度上调为：**约 95%**。


### 13.19 2026-09-07 · “修改工作稿文本”独立功能调试

按 13.10 功能调试债务优先级 A，本刀只为已经迁移并人工验收过的“修改工作稿文本”补独立功能调试入口；不新增产品业务逻辑。

实现：
- 功能调试菜单新增 `修改工作稿文本`，继续采用统一“操作 / 需要 / 效果”规范。
- 必须先运行“初始化工作稿”，复用固定安全副本与现有 FeatureDebugRunner。
- 不修改 WorkspaceMachine / ChapterReviewApplication / Repository / WorkingEditor；正文修改直接复用正式 `applyWorkingTextChange → WORKING_CHANGED`，恢复直接复用正式 Undo。
- 调试共 5 步：
  1. 记录 clean working 与磁盘 revision 基线；
  2. 正式正文修改路径在 working 顶部临时插入“功能调试临时正文”，要求进入 chapter-dirty、Undo=1、Redo=0、保存标定可用；
  3. 验证 CodeMirror 源码窗同步出现临时正文，working 长度同步增加；
  4. 正式 Undo，要求 working 精确恢复、回 chapter-clean、Undo=0/Redo=1、保存标定禁用、临时正文消失；
  5. 关闭重入同一安全副本，要求历史清空 0/0、working 与 revision 均与磁盘基线精确一致。
- 失败保护只尽可能 Undo 临时修改并强制重新初始化；绝不自动保存半残状态。

专项与轻量门禁：
- 新增 `featureDebugWorkingText.spec.ts`，MutationObserver 明确捕获中间态 `chapter-dirty + Undo=1 + Redo=0 + Save enabled + CodeMirror marker`，不是只验证最终状态。
- 第一次专项因修改源码后尚未重新 build，测试服务器仍读取旧 `dist/app.js`，因此新按钮保持 disabled；补 build 后原样重跑即通过，确认属于 stale bundle 测试前置问题，不是产品业务失败。
- 新专项 1/1 PASS。
- `typecheck` PASS。
- `build` PASS。
- DOM contract PASS，ids=84。
- 初始化功能调试回归 2/2 PASS。
- `git diff --check` PASS。
- 未运行不必要的大测试组。

私有云：
- 镜像 `ocr2md/v2:feature-debug-working-text-20260907a`。
- Helm revision 28。
- Deployment 1/1 Ready。
- 正式 `4176 → k3s/PVC`、viewport 1032×642 smoke：
  - 安全副本 `01 Buffett’s Alpha 副本` 基线 workingLength=63,833；
  - revision=`409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`；
  - smoke 明确捕获真实 dirty 中间态；
  - 调试最终显示 `修改工作稿文本功能调试 · 5/5 通过`；
  - 最终 chapter-clean、Undo/Redo=0/0、保存标定 disabled、临时 marker 不存在；
  - 服务端重读 sameWorking=true、sameRevision=true，PVC 无任何持久化变化。
- 记为 `PRIVATE_CLOUD_FEATURE_DEBUG_WORKING_TEXT_OK`。

当前总体迁移成功度维持 **约 95%**；等待真实 iPad 人工运行这一独立功能调试项后再封箱并决定是否上调。

### 13.20 2026-09-07 · REAL_IPAD “修改工作稿文本”功能调试封箱

真实 iPad 已完成 13.19 独立功能调试人工验收。

实机会话：
- client `04bb504a-7e75-43d8-8170-c5d76b46ed81`
- pageLoadedAt `2026-09-07T07:48:12.033Z`（+08:00 为 15:48:12）
- device=ipad，viewport=1032×642，visibility=visible，focused=true，lastFailure=null。

真实状态机轨迹：
- seq 4：初始化完成，`chapter-clean`，workingLength=63,833，Undo/Redo=0/0，canSave=false。
- seq 6：`working-change`，workingLength=63,843，`chapter-dirty`，Undo/Redo=1/0，canSave=true，revision 仍为原值。
- bridge 同期真实 DOM 捕获源码窗出现“功能调试临时正文”，证明临时正文实际进入 CodeMirror/working。
- seq 7：正式 Undo，workingLength 精确回 63,833，`chapter-clean`，Undo/Redo=0/1，canSave=false。
- seq 8→11：close → reopen → select-review-module；最终 `chapter-clean`、Undo/Redo=0/0、canSave=false，revision 精确回/保持原基线。
- 真实设备最终状态栏显示：`修改工作稿文本功能调试通过 · 正式修改→dirty/history→Undo→重入 · 未写盘`；该调试项进入本轮 completed/disabled 状态。
- lastFailure=null。

PVC 服务端最终重读：
- 安全副本：`01 Buffett’s Alpha 副本`
- workingLength=63,833
- revision=`409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`
- `功能调试临时正文` 不存在。
- 与调试前基线精确一致，无持久化写入。

记为：
`REAL_IPAD_FEATURE_DEBUG_WORKING_TEXT_OK`

“修改工作稿文本”现满足完整收口条件：产品迁移成功 + 真实人工验收 + 独立功能调试项 + 调试项自动专项 + 私有云 smoke + 真实 iPad 调试人工验收。

当前总体迁移成功度上调为：**约 96%**。


### 13.21 2026-09-07 · “行类型：已忽略”独立功能调试

按 13.10 功能调试债务优先级 B，本刀只为已经迁移并人工验收过的数据表统一行为“行类型：已忽略”补独立功能调试入口；不修改业务状态机或持久化逻辑。

实现：
- 功能调试菜单新增 `行类型：已忽略`，继续采用统一“操作 / 需要 / 效果”规范。
- 必须先运行“初始化工作稿”，固定使用安全副本与章节标题模块。
- 调试不使用 debug-only 标定 API；直接操作真实 AG Grid 第一条可见标题行的 `.calibration-line-type` 下拉，将值改为 `已忽略` 并派发正常 `change` 事件。
- 正式产品路径仍为：AG Grid select → `onLineTypeChanged` → `applyCalibrationLineTypeChange` → `CALIBRATION_LINE_TYPE_CHANGED` → XState/history。
- 调试共 5 步：
  1. 记录 clean 基线、目标标题行与 active/visible/ignored 计数；
  2. 真实下拉改为“已忽略”，要求进入 chapter-dirty、Undo=1、Redo=0、保存标定可用，active/visible -1、ignored +1；
  3. 验证目标标题行真实从 AG Grid 投影中消失；
  4. 正式 Undo，要求回 chapter-clean、Undo=0/Redo=1、保存标定禁用、计数精确恢复；
  5. 验证目标行重新出现，再 close/reopen 清空历史，并确认 revision/计数保持磁盘基线。
- 失败保护只尽可能 Undo 临时标定并强制重新初始化；绝不自动保存。

专项与轻量门禁：
- 新增 `featureDebugIgnoreLineType.spec.ts`。
- MutationObserver 明确捕获真实中间态：chapter-dirty、Undo=1、Save enabled、activeRows -1、visible -1、ignored +1、目标标题行不在 Grid。
- 新专项 1/1 PASS。
- typecheck PASS。
- build PASS。
- DOM contract PASS，ids=85。
- 初始化功能调试回归 2/2 PASS。
- 上一刀“修改工作稿文本”回归 1/1 PASS。
- `git diff --check` PASS。
- 未运行不必要的大测试组。

私有云：
- 镜像 `ocr2md/v2:feature-debug-ignore-line-type-20260907a`。
- Helm revision 29。
- Deployment 1/1 Ready。
- 正式 `4176 → k3s/PVC`、viewport 1032×642 smoke：
  - 安全副本 `01 Buffett’s Alpha 副本`；
  - 目标行 `(001) Buffett’s Alpha`；
  - 基线 activeRows=10、visible=186、ignored=15；
  - smoke 捕获真实已忽略中间态 activeRows=9、visible=185、ignored=16，目标行从 Grid 消失；
  - 最终 `行类型：已忽略功能调试 · 5/5 通过`；
  - 最终 chapter-clean、Undo/Redo=0/0、保存标定 disabled；
  - activeRows/visible/ignored 精确恢复 10/186/15；
  - 目标行重新出现；
  - 服务端重读 workingLength=63,833、revision=`409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`，sameWorking=true、sameRevision=true。
- 记为 `PRIVATE_CLOUD_FEATURE_DEBUG_IGNORE_LINE_TYPE_OK`。

git 状态复核：
- 仓库本身已有大量历史未提交改动及整套 `ui-spikes/v2/` 未跟踪内容，本刀未清理、覆盖或改写这些无关历史改动。
- 本刀仅在当前 v2 工作区内增补该功能调试及专项测试，并更新 ENGINEERING_MEMO；未触碰本刀无关 root/core/integration 文件。

当前总体迁移成功度维持：**约 96%**；等待真实 iPad 人工运行该独立功能调试项后再封箱并决定是否上调。

### 13.22 2026-09-07 · REAL_IPAD “行类型：已忽略”功能调试封箱

真实 iPad 已完成 13.21 独立功能调试人工验收。

实机会话：
- client `04bb504a-7e75-43d8-8170-c5d76b46ed81`
- pageLoadedAt `2026-09-07T07:58:11.127Z`（+08:00 为 15:58:11）
- device=ipad，viewport=1032×642，visibility=visible，focused=true，lastFailure=null。

真实状态机轨迹：
- seq 4/5：初始化基线 `chapter-clean`，activeRows=10、visibleCalibrationRows=186、ignoredCalibrationRows=15、Undo/Redo=0/0、canSave=false。
- seq 7：真实 AG Grid 行类型 change 进入正式 `calibration-line-type` 产品事件；状态变为 `chapter-dirty`，activeRows=9、visible=185、ignored=16、Undo/Redo=1/0、canSave=true，workingLength 仍 63,833，revision 未变。
- seq 8：正式 Undo；回 `chapter-clean`，activeRows=10、visible=186、ignored=15、Undo/Redo=0/1、canSave=false。
- seq 9→12：close → reopen → 章节标题；最终 `chapter-clean`、activeRows=10、visible=186、ignored=15、Undo/Redo=0/0、canSave=false，revision 与基线完全一致。
- 真实设备后续 DOM 中目标标题 `(001) Buffett’s Alpha` 可见，证明最终投影已恢复。
- 本轮 bridge 的中间 visual-viewport 采样间隔没有刚好落在约 1 秒的“行消失”窗口，因此不伪称取得中间 DOM 截图；中间消失由同一真实 iPad 上正式 `calibration-line-type` 状态变化（activeRows=9）以及专项/私有云对真实 AG Grid DOM 的直接观察共同覆盖。
- lastFailure=null。

PVC 最终重读：
- 安全副本 `01 Buffett’s Alpha 副本`
- workingLength=63,833
- revision=`409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`
- 与调试前基线精确一致，无持久化变化。

记为：
`REAL_IPAD_FEATURE_DEBUG_IGNORE_LINE_TYPE_OK`

“行类型：已忽略”现满足完整收口条件：产品迁移成功 + 真实人工验收 + 独立功能调试项 + 调试项自动专项 + 私有云 smoke + 真实 iPad 调试人工验收。

当前总体迁移成功度上调为：**约 97%**。


### 13.23 2026-09-07 · “保存标定 / 重入加载”独立功能调试

按 13.10 功能调试债务优先级 C，本刀只为已经迁移并人工验收过的“保存标定 / 重入加载”补独立功能调试入口。

产品路径与安全策略：
- 调试必须先运行“初始化工作稿”，只操作固定安全副本。
- 功能验证全部走真实产品路径：AG Grid 标题层级下拉 → XState dirty → 顶栏 SAVE → close/reopen。
- 调试目标使用第一条可见章节标题，通常从 `1 级标题` 临时改为 `2 级标题`；不使用“已忽略”，避免目标行消失后难以做恢复。
- 第一次真实 SAVE 后必须产生新 revision、清空 Undo/Redo，并在 close/reopen 后保持临时标题层级，证明 sidecar 真正持久化并被重入加载。
- 随后通过真实产品下拉把层级改回原值并再次 SAVE，验证产品路径能恢复原标定语义。
- 最后增加“调试安全清理”：prepare 阶段预先读取调试前原始 working + raw sidecar + revision；产品验证结束后，若 revision 仍非原值，则用 workspace API 原样回写这份调试前快照，再 close/reopen 确认安全副本精确回到原基线。
- 安全清理只承担测试回滚，不冒充产品 SAVE 行为；功能调试 UI 已明确说明二者区别。

本刀发现并澄清一个重要契约：
- 初版调试错误要求“把标题层级改回原值并第二次产品 SAVE 后，revision 必须等于调试前 revision”。
- 专项第一次在第 4 步失败，但两次产品 SAVE 均成功。
- 排查确认不是保存失败，而是产品 SAVE 会由当前 rows 重新 serialize sidecar；真实原 sidecar 可能包含当前 rows 不再承载的历史 annotations / metadata，且 savedAt 会更新。
- 例如测试基线原 sidecar annotations=212，而当前可序列化 rows=205；因此“业务标定语义恢复”不等于“原始 sidecar 字节/结构 hash 恢复”。
- 修正后把“产品持久化验证”和“调试安全原样清理”明确分层，不再把错误 hash 假设写成产品契约。

最终调试 5 步：
1. 记录目标标题层级、原始 working/raw sidecar/revision；
2. 真实 AG Grid 下拉临时改变标题层级，进入 dirty、Undo=1、Save enabled；
3. 真实 SAVE，生成新 revision，历史清空；
4. close/reopen 验证临时标定从磁盘加载；随后真实产品路径恢复原标定并 SAVE；无论验证结果如何，都优先执行 raw baseline 安全清理；
5. 再次 close/reopen，确认原层级、原 revision、clean 0/0 全部恢复。

专项与轻量门禁：
- 新增 `featureDebugSaveReload.spec.ts`。
- 专项监听真实 `POST /__workspace/chapter`，要求至少出现：
  - 临时产品保存的新 revision；
  - 产品恢复保存 revision；
  - 安全清理恢复原 revision。
- 最终服务端重读要求 working、sidecar、revision 三者与调试前基线精确一致。
- 修正版专项 1/1 PASS。
- typecheck PASS。
- build PASS。
- DOM contract PASS，ids=86。
- 初始化功能调试 2/2 PASS。
- “行类型：已忽略”回归 1/1 PASS。
- “修改工作稿文本”回归 1/1 PASS。
- `git diff --check` PASS。
- 未运行不必要的大测试组。

私有云：
- 业务 smoke 镜像 `ocr2md/v2:feature-debug-save-reload-20260907a`，Helm revision 30。
- 正式 `4176 → k3s/PVC` smoke 通过，save revisions 顺序：
  1. `63e76ea13b287118f9caf8d8715e5e54e2e583d5dbba9759a722e371623932ea`（临时产品保存）
  2. `93cc4fd4d8e5560a127ef6abb8d3e95c7d7df6804e444695c42d4bfe0e7892ee`（产品恢复原标定）
  3. `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`（安全原样清理恢复原基线）
- smoke 最终 `保存标定 / 重入加载功能调试 · 5/5 通过`，chapter-clean、Undo/Redo=0/0、Save disabled、目标行恢复 `1 级标题`。
- 外层保险恢复 `restored=false`，说明功能调试自身已经完成安全清理；保险未实际改写 PVC。
- 最终服务端重读 workingLength=63,833、原 revision，working/sidecar/revision 与调试前精确一致。
- 记为 `PRIVATE_CLOUD_FEATURE_DEBUG_SAVE_RELOAD_OK`。
- 随后仅修正成功状态文案，明确显示“产品恢复原标定→安全清理还原原始 sidecar/revision”；业务逻辑未改。
- 最终部署镜像 `ocr2md/v2:feature-debug-save-reload-20260907b`，Helm revision 31，Deployment 1/1 Ready。
- 正式 4176 已确认存在 `#ui-debug-save-reload`、新版功能规范与安全清理说明。
- 当前安全副本仍为 workingLength=63,833、revision=`409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`。

当前总体迁移成功度维持：**约 97%**；等待真实 iPad 人工运行该独立功能调试项后再封箱并决定是否上调。

### 13.24 2026-09-07 · REAL_IPAD “保存标定 / 重入加载”功能调试封箱

真实 iPad 已完成 13.23 独立功能调试人工验收。

实机会话：
- client `04bb504a-7e75-43d8-8170-c5d76b46ed81`
- pageLoadedAt `2026-09-07T08:19:11.222Z`（+08:00 为 16:19:11）
- device=ipad，visibility=visible，focused=true，lastFailure=null。
- 真实设备最终状态栏直接显示：`保存标定 / 重入加载功能调试通过 · 真实保存→重入加载→产品恢复原标定→安全清理还原原始 sidecar/revision`。

真实状态机 / revision 轨迹：
- seq 4/5：初始化基线 `chapter-clean`，workingLength=63,833，Undo/Redo=0/0，canSave=false，revision=`409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`。
- seq 7：真实 `calibration-line-type` 改层级，进入 `chapter-dirty`，workingLength=63,834，Undo/Redo=1/0，canSave=true；revision 仍为原基线。
- seq 8→9：真实 SAVE，经历 `chapter-saving` 后回 `chapter-clean`；历史清空 0/0；首次保存 revision=`6fbcf01980b028b34dd7ee8007b85f5c898752540aeb0b1d98b8dea2397a492e`。
- seq 10→13：close/reopen；重入后 workingLength=63,834，revision 仍为 `6fbcf019...`，证明临时标定确实持久化并被新会话加载。
- seq 14：真实下拉恢复原标题层级，回 `chapter-dirty`，workingLength=63,833，Undo=1，canSave=true。
- seq 15→16：第二次真实 SAVE；产品恢复语义后 revision=`be7d2f1833dc37dca2b52871c8206171c63368398d1f04a19d0e25e3e4ebd7ed`。
- 随后调试安全清理原样写回调试前 raw working/sidecar；seq 17→20 重入后 revision 精确恢复 `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`。
- seq 21→24 再次 close/reopen；最终仍为 `chapter-clean`、workingLength=63,833、Undo/Redo=0/0、canSave=false、原 revision，证明不是单次 UI 假象。

PVC 最终重读：
- 安全副本 `01 Buffett’s Alpha 副本`
- workingLength=63,833
- revision=`409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`
- raw sidecar annotations=212、annotationPairs=10，与调试前原始 sidecar 结构恢复一致。
- lastFailure=null。

记为：
`REAL_IPAD_FEATURE_DEBUG_SAVE_RELOAD_OK`

“保存标定 / 重入加载”现满足完整收口条件：产品迁移成功 + 真实人工验收 + 独立功能调试项 + 自动专项 + 私有云 smoke + 真实 iPad 调试人工验收 + 原始 PVC 快照安全恢复。

当前总体迁移成功度上调为：**约 98%**。


### 13.25 2026-09-07 · “数据表模块切换”独立功能调试

按 13.10 功能调试债务优先级 D，本刀只为已经迁移并人工验收过的“数据表模块切换”补独立功能调试入口；不修改任何标定业务逻辑，不产生持久化写入。

实现：
- 功能调试菜单新增 `数据表模块切换`，继续采用统一“操作 / 需要 / 效果”规范。
- 必须先运行“初始化工作稿”，使用固定安全副本。
- 调试全部直接点击正式 `[data-review-module]` tag，不使用 debug-only 模块切换 API。
- 调试顺序：
  1. 章节标题：10 行，列头 `行号 / 行类型 / 标题预览`
  2. 注释：20 行，列头 `行号 / 行类型 / 注释号 / 配对状态 / 预览`
  3. 嵌入块：51 行，列头 `组号 / 行号 / 行类型 / 预览`
  4. 非法断行：6 行；AG Grid 总列数 5，iPad 当前横向 viewport 首屏可见前 4 列 `断行处 / 行类型 / 预览（前10 + 后10） / 合并预览`
  5. 回到章节标题：10 行
- 每一步都要求：
  - `chapter-clean`
  - activeReviewModule 与目标一致
  - activeModuleRows 正确
  - 正式 tag `aria-pressed=true`
  - Undo/Redo=0/0
  - canSave=false
  - revision 与初始化基线一致。
- 失败时只尝试切回章节标题并要求重新初始化；不会写盘。

专项：
- 新增 `featureDebugReviewModuleSwitch.spec.ts`。
- MutationObserver 记录整个模块序列，要求 章节标题/注释/嵌入块/非法断行 四种 clean 状态均真实出现，且任何快照都不得出现 `chapter-dirty`。
- 专项 1/1 PASS。

本刀顺手修正一个旧测试假设：
- 原 `reviewModules.spec.ts` 假设 iPad 1032px viewport 下非法断行 5 个 AG Grid 表头都会同时挂载在 DOM。
- 实际 AG Grid 启用了横向列虚拟化：首屏只挂载前 4 个可见表头，“判断”列在右侧离屏，但 `role=grid aria-colcount=5` 正确表示总列数。
- 旧测试已改为：
  - 首屏断言前 4 个可见表头；
  - 断言 `aria-colcount=5`；
  - 主动横向滚到最右后再验证“判断”列及判断文本。
- 修正后的旧“review module tabs filter real calibration rows without dirtying chapter”专项 1/1 PASS。
- 同文件另一条“点击数据表行定位源码”在现有 split-pane 布局下仍存在 Playwright pointer interception；该功能正好属于下一债务 E“数据表行定位源码”，本刀不混改，留到 E 单独处理。

轻量门禁：
- typecheck PASS。
- build PASS。
- DOM contract PASS，ids=87。
- 功能调试专项 1/1 PASS。
- 修正后的旧模块切换产品专项 1/1 PASS。
- `git diff --check` PASS。
- 未运行不必要的大测试组。

私有云：
- 镜像 `ocr2md/v2:feature-debug-review-module-switch-20260907a`。
- Helm revision 32。
- Deployment 1/1 Ready。
- 正式 `4176 → k3s/PVC`、viewport 1032×642 smoke：
  - `数据表模块切换功能调试 · 5/5 通过`；
  - 实际观察到 章节标题=10、注释=20、嵌入块=51、非法断行=6；
  - 最终回章节标题=10；
  - 全程 `chapter-clean`、Undo/Redo=0/0、Save disabled；
  - working/sidecar/revision 与 smoke 前基线精确一致；
  - baseline revision=`409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`。
- 记为 `PRIVATE_CLOUD_FEATURE_DEBUG_REVIEW_MODULE_SWITCH_OK`。

当前总体迁移成功度维持：**约 98%**；等待真实 iPad 人工运行该独立功能调试项后再封箱。


### 13.26 2026-09-07 · REAL_IPAD 暴露 AG Grid Safari 视觉重绘问题；D 刀暂未封箱

用户真实 iPad 运行 13.25 “数据表模块切换”后反馈：
> 数据表一直都没有刷新出来，切换倒是切换了。

该轮不能计为人工验收通过。

实机会话：
- client `04bb504a-7e75-43d8-8170-c5d76b46ed81`
- pageLoadedAt `2026-09-07T08:36:06.675Z`
- device=ipad
- lastFailure=null。

真实状态机轨迹证明业务状态切换正常：
- 章节标题：activeRows=10
- 注释：activeRows=20
- 嵌入块：activeRows=51
- 非法断行：activeRows=6
- 最终回章节标题：activeRows=10
- 全程 chapter-clean、Undo/Redo=0/0、canSave=false、revision 不变。

真实 device bridge DOM 快照同样证明 AG Grid DOM/model 已正确更新：
- 注释时表头真实变为 `行号 / 行类型 / 注释号 / 配对状态 / 预览`，行内容也变为注释候选；
- 嵌入块时表头/行内容真实变为嵌入块结构；
- 非法断行时首屏表头真实变为 `断行处 / 行类型 / 预览（前10 + 后10） / 合并预览`，行内容也变为断行上下文；
- 最终又回到章节标题。
因此问题不是 XState、activeModuleRows、rowData 或 DOM projection 没更新，而是“真实 iPad 肉眼未见刷新”与 bridge DOM 已更新之间存在明显分离，定位为 iPad Safari / AG Grid 的视觉 repaint / compositing 问题。

根因对应代码：
- `CalibrationGrid.setContext()` 在 moduleChanged 时原本只：
  - setGridOption(columnDefs)
  - applyColumnState
  - setGridOption(rowData)
  - refreshCells(force)
- 没有显式 `refreshHeader()`、`redrawRows()`，也没有下一 animation frame 的二次 repaint。
- Chrome 会正常绘制，但 Safari 可能只更新内部 DOM/model 而合成层未及时重绘。

修复：
- moduleChanged 后新增正式 `refreshModuleProjection()`：
  - immediate: `refreshHeader()` + `refreshCells({force:true})` + `redrawRows()`
  - next requestAnimationFrame: 再执行一次同样 repaint
- 不 destroy/recreate AG Grid。
- 不修改 WorkspaceMachine / Repository / 业务数据。
- numbering-only 更新保持轻量 redrawRows。

回归：
- typecheck PASS
- build PASS
- DOM contract PASS（ids=87）
- 数据表模块切换功能调试专项 1/1 PASS
- 修正后的旧模块切换产品专项 1/1 PASS
- `git diff --check` PASS

私有云：
- 镜像 `ocr2md/v2:fix-ipad-grid-repaint-20260907a`
- Helm revision 33
- Deployment 1/1 Ready
- 4176 smoke：功能调试 5/5 PASS；最终章节标题=10、chapter-clean、Undo/Redo=0/0；working/sidecar/revision 全部未变。

当前总体迁移成功度仍维持：**约 98%**。
“数据表模块切换”D 刀仍处于待真实 iPad 视觉复验状态，尚未封箱。


### 13.27 2026-09-07 · iPad Grid 首次数据投影也加入 Safari paint cycle

13.26 的 rev33 仍未通过真实 iPad 视觉验收。用户进一步确认：
> 初始化工作稿的时候数据表也没有刷新出来，运行数据表模块切换时数据表也没有刷新出来。

这说明问题不仅发生在 moduleChanged，而发生在 AG Grid 第一次从空状态获得真实 rowData 时。

关键漏点：
- CalibrationGrid 默认 module 本来就是“章节标题”。
- 初始化安全副本时 Grid 从 0 行 → 10 行，但 moduleChanged=false。
- rev33 只在 moduleChanged 时执行 repaint，因此首次有数据时根本不会进入 repaint 分支。
- Safari 可能在 Grid 仍为空时建立空白合成层；之后即使 DOM/model 已变化，单纯 redrawRows/refreshHeader 仍可能无法让肉眼画面更新。

rev34 修复：
- CalibrationGrid 新增 renderedRowCount。
- 以下三种情况都会执行完整 paint cycle：
  - moduleChanged
  - 0 行 → 有行（becamePopulated）
  - 有行 → 0 行（becameEmpty）
- Grid host 增加独立 Safari 合成层：
  - transform: translateZ(0)
  - -webkit-backface-visibility: hidden
  - backface-visibility: hidden
- forceHostPaintCycle：
  - 临时 visibility:hidden
  - 读取 offsetHeight 强制同步 layout
  - 恢复 visibility
  - 再读取 offsetHeight
  - paintEpoch +1
- 随后 immediate refreshHeader + refreshCells(force) + redrawRows
- 再经过两个 requestAnimationFrame 做二次/三次 header + row repaint。
- 不 destroy/recreate Grid，不修改 XState/Repository/标定数据。

可观测性：
- #calibration-grid 增加 data-paint-epoch。
- 初始化专项要求首次安全副本打开后 paintEpoch>=1。
- 模块切换专项要求最终 paintEpoch 至少比初始化值 +4。

回归：
- typecheck PASS
- build PASS
- DOM contract PASS（ids=87）
- 初始化专项 PASS
- 数据表模块切换功能调试专项 PASS
- 旧模块切换产品专项 PASS
- 合计 3/3 PASS
- git diff --check PASS

私有云：
- 镜像 ocr2md/v2:fix-ipad-grid-initial-paint-20260907a
- Helm revision 34
- Deployment 1/1 Ready
- 正式 4176 / 1032×642 smoke：
  - 初始化：章节标题 10 行、AG Grid 实际挂载 10 行、paintEpoch=1
  - 完整模块调试 5/5 PASS
  - 最终 paintEpoch=5
  - chapter-clean、Undo/Redo=0/0、Save disabled
  - working/sidecar/revision 与基线完全一致

当前总体迁移成功度仍维持：**约 98%**。
D 刀仍未封箱。下一步只做真实 iPad 的“初始化后数据表是否肉眼出现”单点视觉复验。


### 13.28 2026-09-07 · 加入真实 iPad Grid 遮挡 / computed-style 诊断探针

13.27 rev34 真实 iPad 仍反馈“只有章节标题十行文字，但没有数据表”。

真实 bridge 已确认：
- 章节标题表头与 10 条 AG Grid row DOM 全部存在；
- 第一行 rect 约 x=1,y=149,w=592,h=42；
- 10 行一直排到 y≈569；
- 因此“没有 rowData / 高度为 0 / DOM 未生成”均已排除。

为区分“被上层元素遮挡”与“Safari 布局存在但绘制透明/失效”，deviceDebugBridge 新增 layoutProbes：
- calibration-grid
- calibration-header
- calibration-first-row
- grid-pane

每个 probe 记录：
- element rect/visible；
- computed display / visibility / opacity / color / backgroundColor / zIndex / transform / filter / pointerEvents；
- probe 点的 document.elementsFromPoint() 前 8 层元素。

同时在每次 calibrationGrid 投影后增加 debug-only runtime 自动上报：
- grid_projection_after_render
- 120ms 后 grid_projection_after_render_settled
用于避免依赖用户额外触摸事件。

门禁：
- typecheck PASS
- build PASS
- DOM contract PASS
- 初始化专项 PASS
- git diff --check PASS

部署：
- 最终诊断镜像 ocr2md/v2:debug-ipad-grid-occlusion-20260907c
- Helm revision 37
- Deployment 1/1 Ready

该版本仅增加诊断可观测性；不改变业务状态、存储或功能调试语义。
D 刀仍未封箱，总体迁移成功度继续维持约 98%。


### 13.29 2026-09-07 · ROOT CAUSE FIX：左窗 CSS Grid 自动排布把 AG Grid 压成 2px

真实 iPad revision 37 遮挡/样式探针最终定位根因，不是 Safari repaint。

真实 iPad 证据：
- 状态机已是章节标题 10 行；
- #calibration-grid rect 却是 x=0,y=75,w≈443.75,h=2；
- calibration-header 自身高 39px，已经溢出 2px 容器；
- calibration-first-row=null；
- 左窗 pane-status 从 y≈77 开始，正好压在溢出的表头区域。
因此用户看到“大块空白 + 底部章节标题 10 行”完全由布局轨道错误解释。

根因：
- .grid-pane 原定义：
  `grid-template-rows: auto auto auto minmax(0, 1fr) auto`
- DOM 顺序：
  1. pane-menu
  2. heading-toolbar
  3. boundary-toolbar
  4. calibration-grid
  5. pane-status
- 但 heading-toolbar / boundary-toolbar 会按模块用 hidden 切换。
- hidden 元素退出 CSS Grid 自动排布后，后续元素会前移：
  - 当前章节标题模式中 boundary-toolbar 隐藏；
  - calibration-grid 被自动放进第三条 auto 轨道，只获得约 2px intrinsic 高度；
  - 本该属于 Grid 的 minmax(0,1fr) 轨道不再稳定对应 Grid。
- 这不是 AG Grid 数据、XState、DOM projection 或 Safari compositing 问题。

正式修复：
- .grid-pane 改为 4 个显式区域：
  - menu
  - toolbar
  - grid
  - status
- grid-template-rows：
  `auto auto minmax(0, 1fr) auto`
- 显式 grid-area：
  - .pane-menu → menu
  - #heading-toolbar 与 #boundary-toolbar → 同一个 toolbar
  - #calibration-grid → grid
  - .pane-status → status
- 无论哪个 toolbar hidden，Grid 都永久绑定到 1fr 主体轨道，状态栏永久在底部。

同时清理错误方向的临时 Safari repaint 补丁：
- 移除 Grid host translateZ/backface-visibility。
- 移除 renderedRowCount / paintEpoch。
- 移除 visibility hide/show 强制 paint。
- 移除双层 requestAnimationFrame repaint。
- 保留正常的 moduleChanged refreshHeader/redrawRows，仅作为 AG Grid 常规列/行刷新。
- layout probe 继续保留在 debug bridge，作为真实设备布局可观测能力。

新增真正针对根因的自动断言：
- 初始化后 iPad 1032×642：
  - Grid width >300
  - Grid height >300
  - 第一行高度 >30
  - 第一行必须位于 Grid rect 内
  - 左窗状态栏 top 必须 >= Grid bottom
- 初始化/模块切换/旧模块产品专项 3/3 PASS。
- typecheck/build/DOM contract/git diff --check PASS。

私有云：
- 镜像 `ocr2md/v2:fix-grid-pane-layout-20260907a`
- Helm revision 38
- Deployment 1/1 Ready
- 正式 4176 / viewport 1032×642 smoke：
  - Grid x=0,y=109,w=443.75,h=509,bottom=618
  - first row y=149,h=42
  - pane-status y=618,h=24
  - mountedRows=10
  - 章节标题列头正确
  - 数据表模块切换 5/5 PASS
  - working/sidecar/revision 全部与基线一致

当前总体迁移成功度仍维持：**约 98%**。
D 刀尚差真实 iPad 肉眼确认 revision 38 表格已经显示；确认后即可继续真实模块切换验收并封箱。


### 13.30 2026-09-07 · REAL_IPAD 初始化后数据表重新可见

用户在真实 iPad revision 38 刷新并运行“初始化工作稿”后人工确认：
> 久违的表格呀终于出来了。

真实设备桥同步确认：
- client `04bb504a-7e75-43d8-8170-c5d76b46ed81`
- pageLoadedAt `2026-09-07T09:03:37.964Z`
- visible=true / focused=true
- lastFailure=null
- calibration-grid rect：x=0,y=109,w=443.75,h=509
- first row rect：x=1,y=149,w=592,h=42
- Grid display=block / visibility=visible / opacity=1
- first row display=flex / visibility=visible / opacity=1

结论：
- 13.29 CSS Grid 显式区域修复在真实 iPad 上通过肉眼验收。
- “初始化工作稿后数据表可见”正式封箱。
- D 刀“数据表模块切换”仍只差最后一步：真实 iPad 肉眼确认章节标题 / 注释 / 嵌入块 / 非法断行之间切换时表内容同步变化。
- 总体迁移成功度仍约 98%，待 D 刀完整封箱后再小幅上调。


### 13.31 2026-09-07 · 数据表模块切换人工通过；AG Grid 深色主题对齐工作台

真实 iPad 用户确认：
> 表格已经可以跟着切换了，但是我发现表格的样式不对。

结论拆分：
- “数据表模块切换”行为本身已通过真实 iPad 人工验收：表内容会随章节标题 / 注释 / 嵌入块 / 非法断行真实切换。
- 新发现为独立视觉问题，不再混入状态机/数据投影问题。

视觉根因：
- CalibrationGrid 仍直接使用 AG Grid 默认 `themeQuartz`。
- 默认 Quartz 是浅色主题。
- 真实 iPad / bridge 先前可见第一行背景为白色、文字为深色，与 ocr2md 工作台深色外壳完全不一致。
- 工作台现有基色：
  - bg #2f383e
  - bg-alt #272f34
  - fg #d3c6aa
  - border #475258
  - accent #83c092

正式修复：
- AG Grid 36.1.0 使用官方 Theming API：
  - `themeQuartz.withPart(colorSchemeDark).withParams(...)`
- 参数统一对齐 ocr2md：
  - backgroundColor #2f383e
  - foregroundColor #d3c6aa
  - chromeBackgroundColor #272f34
  - borderColor #475258
  - accentColor #83c092
  - headerTextColor #d3c6aa
  - oddRowBackgroundColor #2c353a
  - rowHoverColor rgba(131,192,146,.12)
  - selectedRowBackgroundColor rgba(131,192,146,.18)
  - 与工作台相同的 monospace 字体族和 13px 字号
- 不通过大量 .ag-* CSS 强行覆盖，保留 AG Grid 官方主题系统，因此表头、行、下拉、hover、selected 等控件能保持统一。

新增专项：
- `tests/calibrationGridTheme.spec.ts`
- 初始化真实安全副本后检查：
  - row/header/select 均不得回退白底
  - row/header/cell/select 前景色均为 ocr2md fg
- 专项 1/1 PASS。
- typecheck/build/git diff --check PASS。

私有云：
- 镜像 `ocr2md/v2:fix-grid-dark-theme-20260907a`
- Helm revision 39
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - row bg = rgb(47,56,62)
  - row fg = rgb(211,198,170)
  - header/select 不再白底，fg 与工作台一致
  - Grid height=509
  - mountedRows=10
  - 数据表模块切换 5/5 PASS
  - chapter-clean / Undo/Redo=0/0 / Save disabled
  - working/sidecar/revision 与基线完全一致


当前总体迁移成功度可小幅上调至：**约 98.5%**。
“数据表模块切换”功能行为已封箱；深色主题真实 iPad 视觉验收也已通过。

### 13.32 2026-09-07 · 内容样式迁移债务暴露；第一刀恢复源码窗 Markdown 语义样式

用户在真实 iPad 确认 AG Grid 深色主题已与工作台一致后，继续指出：
> 三个窗口原来的层级标题，链接，latex，html 所有的css样式都没有了。

确认这是独立于 AG Grid 主题的“内容样式层迁移遗漏”。

旧实现调查：
- 旧 VS Code 插件保留分层标题颜色，VS Code Markdown 语言本身承担链接/HTML 等语法着色。
- 更接近当前 Web 产品的 ui-spikes/integration 已有完整三窗样式链：
  - CodeMirror HighlightStyle + syntaxHighlighting；
  - 标题整行 cm-obsidian-h1..h6；
  - LaTeX token decoration；
  - MarkdownIt + texmath + KaTeX + DOMPurify 预览；
  - 数据表标题预览 grid-preview-cell.is-h1..h6；
  - Everforest/Obsidian 内容色板。
- v2 重建时仅保留了极薄的标题字号 CSS / basic preview，未迁移完整内容样式层。

恢复计划按三把小刀执行：
1. 源码窗 CodeMirror 语义样式；
2. Markdown 预览真实渲染/样式（链接、HTML、表格、KaTeX/LaTeX、标题）；
3. 数据表标题预览层级样式。

第一刀“源码窗语义样式”：
- v2 显式依赖 @codemirror/language、@lezer/highlight。
- 从旧 integration 迁移：
  - obsidianSyntaxHighlight：comment、link/url、function、keyword、operator、property、string、HTML tag/type、number/bool/null、punctuation/bracket；
  - sourceHeadingField：Markdown H1..H6 整行 class cm-obsidian-h1..h6；
  - latexHighlightField：LaTeX delimiter/function/operator/value/punctuation。
- index.html 加回旧 Everforest/Obsidian 内容色板变量与 CodeMirror 标题/LaTeX CSS。
- 不修改业务状态机、Repository、工作稿或保存语义。

真实安全副本本身已确认同时包含 H1/H2、Markdown 图片链接 + https URL、inline LaTeX、block LaTeX、HTML <sup>...</sup>，因此专项直接使用真实工作稿。

新增专项：
- tests/sourceSemanticStyles.spec.ts
- 验证 H1/H2 分层、URL/link underline、LaTeX function、HTML tag，以及 chapter-clean / Undo/Redo 0/0 / Save disabled。
- 专项 1/1 PASS。
- typecheck/build/git diff --check PASS。

私有云：
- 镜像 ocr2md/v2:restore-source-semantic-styles-20260907a
- Helm revision 40
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - H1 color rgb(218,99,98), font-size 29.75px
  - linkStyled=true
  - LaTeX function rgb(127,187,179)
  - htmlTagStyled=true
  - chapter-clean / Undo/Redo 0/0 / Save disabled
  - working/sidecar/revision 全部与基线一致

当前总体迁移成功度暂维持约 98.5%；新增内容样式债务按三窗逐刀恢复，避免一次性大改。

### 13.33 2026-09-07 · 第二刀恢复右下 Markdown 预览完整语义渲染 / CSS

真实 iPad 已确认 13.32 第一刀：
> 源码样式回来了。

因此源码窗语义样式正式封箱。

第二刀目标仅为右下 Markdown 预览窗，不修改数据表与源码窗。

根因：
- v2 原 `BasicMarkdownPreview` 是手写的极简 line parser，只支持标题、引用、列表、代码块和普通段落。
- 它没有 Markdown link/HTML/table/LaTeX 的真实语义渲染。
- 旧 `ui-spikes/integration` 已有成熟方案：MarkdownIt + markdown-it-texmath + KaTeX + DOMPurify。

正式恢复：
- `BasicMarkdownPreview` 改为：
  - MarkdownIt({ html:true, linkify:true, typographer:true })
  - markdown-it-texmath / dollars delimiters
  - KaTeX throwOnError=false / strict=ignore
  - DOMPurify sanitize，允许 data-* 与 MathML profile
  - 保留 md-source-block / data-source-line 标记能力
- 新增依赖：
  - markdown-it
  - markdown-it-texmath
  - katex
  - dompurify
- KaTeX CSS 不走 CDN：
  - build 增加 woff/woff2/ttf file loader
  - esbuild 输出 dist/app.css + KaTeX font assets
  - index.html 加载 ./dist/app.css
  - Docker 原有 COPY dist 自动把 CSS/font 一起带入私有云。

右下预览样式恢复：
- H1..H6 使用 Everforest/Obsidian 分层色 + 字号
- link 使用 accent 绿 + underline
- blockquote / code block 延续工作台深色风格
- Markdown table 有真实 border/cell padding
- HTML block 可水平滚动
- image max-width:100%
- KaTeX display 可水平滚动

功能调试增强：
- “Markdown 预览”原 5 步临时 working 前缀增加：
  - Markdown 链接
  - inline HTML <sup>
  - inline LaTeX
  - display LaTeX
  - Markdown table
- 第 3 步现在同时验证 H2/引用/列表/link/HTML/inline KaTeX/display KaTeX/table。
- 标准 markdown-it blockquote 会包含内部 p 和换行，旧精确 textContent 断言改为 trim；这是测试适配，不是产品行为回退。

专项：
- Markdown 预览功能调试 1/1 PASS。
- 加入 computed-style 观察：
  - H2 color = rgb(215,127,72)
  - link color = rgb(131,192,146)
  - link underline
  - table border-style = solid
  - KaTeX CSS 实际产生非零 font size
- 源码语义样式 + Markdown 预览联合回归 2/2 PASS。
- typecheck/build/DOM contract/git diff --check PASS。

私有云：
- 镜像 ocr2md/v2:restore-markdown-preview-styles-20260907a
- Helm revision 42
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - baseline H1 = Buffett’s Alpha，color rgb(218,99,98)
  - baseline KaTeX count=26
  - baseline sup count=13
  - baseline img count=11
  - app.css loaded=true
  - 功能调试 5/5 PASS
  - temporary semantic smoke：
    - link green + underline
    - table border solid
    - katex font-size 15.73px
    - display math=true
    - HTML sup=true
  - chapter-clean / Undo/Redo=0/0 / Save disabled
  - working/sidecar/revision 全部与基线一致

当前总体迁移成功度暂维持约 98.5%。
第三刀待做：数据表中的章节标题预览恢复旧分层颜色/字号/视觉层级。

### 13.34 2026-09-07 · 恢复源码 / Markdown 预览双向滚动联动

真实 iPad 已确认 13.33 右下 Markdown 预览样式恢复，但继续发现：
> 源码和预览窗口的联动没有了。

调查结论：
- 旧 ui-spikes/integration 有完整双向联动：
  - CodeMirror scroll → 取 editor top source line → 找预览 data-source-line block → 调整 preview.scrollTop；
  - preview scroll → 取预览顶部 data-source-line → CodeMirror scrollIntoView 对应源码行；
  - syncOrigin 防止互相回弹循环；
  - requestAnimationFrame 合并高频 scroll。
- v2 中这整层逻辑完全未迁移：没有源码 scroll listener、没有预览 scroll listener、没有 source-line 双向映射。
- 13.33 恢复 MarkdownIt 后已经重新生成稳定 data-source-line，因此现在具备按源码行恢复联动的基础。

正式恢复：
- 新增 src/sourcePreviewScrollSync.ts。
- 按旧实现使用 source-line 锚点，不使用滚动百分比硬绑定，避免标题/HTML/表格/KaTeX 高度差导致长文档累积漂移。
- WorkingEditor 增加最小接口：
  - topVisibleLine()
  - scrollLineToTop(line)
  - onScroll(listener)
- SourcePreviewScrollSync：
  - editor scroll → preview source-line block
  - preview scroll → editor source line
  - syncOrigin=editor/preview 防循环
  - requestAnimationFrame 节流
  - 每次 working/preview 重投影后 syncFromEditor() 重新校准。
- #markdown-preview 暴露 debug-only 可观测 dataset：data-sync-origin / data-sync-source-line，便于真实设备桥与专项测试读取。

新增独立功能调试：
- 功能调试 → 源码 / 预览联动
- 操作：源码滚到中后段 → 验证预览跟随；预览滚到另一 source-line → 验证源码反向跟随；最后恢复原源码位置。
- 需要：初始化工作稿 + Markdown source-line 锚点。
- 效果：双向 source-line 同步，全程 clean / Undo-Redo 0/0 / 不写盘。
- DOM contract ids 87 → 88。

专项：
- tests/sourcePreviewScrollSync.spec.ts：真实 scroller 双向产品路径 1/1 PASS。
- tests/featureDebugSourcePreviewSync.spec.ts：一键功能调试 4/4 1/1 PASS。
- Markdown 预览回归 tests/featureDebugMarkdownPreview.spec.ts 1/1 PASS。
- typecheck / build / DOM contract / git diff --check PASS。

私有云：
- 镜像 ocr2md/v2:restore-source-preview-sync-20260907a
- Helm revision 43
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - 源码 / 预览联动功能调试 4/4 PASS
  - preview source-line anchors=164
  - final chapter-clean / Undo 0 / Redo 0 / Save disabled
  - working / sidecar / revision 与基线完全一致

当前总体迁移成功度仍约 98.5%。

### 13.35 2026-09-07 · REAL_IPAD 双向联动封箱；第三刀恢复数据表标题预览层级样式

真实 iPad 已人工确认：
> 双向联动回来了。

因此 13.34 “源码 / Markdown 预览双向滚动联动”正式封箱。

第三刀仅处理左侧数据表“章节标题”预览的视觉层级，不改源码窗、Markdown 预览或业务状态。

调查：
- v2 的 chapterHeadingPreviewRenderer 已经正确创建真实 h1..h6 元素，并带章节编号。
- 迁移遗漏只在 CSS：v2 仅保留字号，未迁移旧 integration 的 H1..H6 六级颜色体系和单行省略。
- 旧 integration 使用同一 Everforest/Obsidian 色板：
  - H1 #da6362
  - H2 #d77f48
  - H3 #bf983d
  - H4 #899c40
  - H5 #569d79
  - H6 #b87b9d
  - 对应字号 2.125em / 1.625em / 1.375em / 1.25em / 1.125em / 1.125em。

恢复：
- .chapter-heading-preview 统一：
  - margin:0
  - overflow:hidden
  - white-space:nowrap
  - text-overflow:ellipsis
  - line-height:1.2
  - font-weight:500
- h1..h6.chapter-heading-preview 使用与源码/右下预览完全相同的 obsidian-h1..h6 颜色和字号变量。
- 不修改 rowHeight=42；恢复后的 H1 仍可稳定容纳于一行。

真实安全副本可见标题分布：
- H1 1 条
- H2 9 条
因此真实专项直接验证 H1/H2；已有章节标题产品测试通过真实下拉把第二条 H2 临时改为 H3，再验证 H3 色，随后 Undo 恢复，不为测试构造假数据。

专项：
- tests/chapterTitleModule.spec.ts 指定章节标题编辑/编号专项 1/1 PASS。
- 新增 computed-style 断言：
  - H1 rgb(218,99,98)
  - H2 rgb(215,127,72)
  - H1 font-size > H2
  - H2 font-size > 13
  - H1/H2 font-weight=500
  - H1 white-space=nowrap
  - 临时 H3 rgb(191,152,61)
- typecheck / build / git diff --check PASS。

私有云：
- 镜像 ocr2md/v2:restore-grid-heading-styles-20260907a
- Helm revision 44
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - H1 `(001) Buffett’s Alpha`：rgb(218,99,98)，27.625px，500
  - H2 `(002) Data Sources`：rgb(215,127,72)，21.125px，500
  - nowrap / hidden / ellipsis 生效
  - 章节标题 10 行
  - chapter-clean
  - working / sidecar / revision 与基线完全一致

当前总体迁移成功度仍约 98.5%。第三刀只差真实 iPad 左侧数据表肉眼确认；通过后“三个窗口内容样式恢复”即可整体封箱。

### 13.36 2026-09-07 · REAL_IPAD 三窗内容样式与双向联动整体封箱

真实 iPad 用户最终人工确认：
> 三个窗口样式都回来了。

至此本轮因 v2 重建暴露的“内容样式层迁移遗漏”整体恢复完成，并连同源码/预览双向联动一起封箱。

真实 iPad 已逐项确认：
- 左侧数据表：
  - AG Grid 深色主题与工作台一致；
  - 章节标题 H1–H6 分层颜色/字号恢复；
  - 长标题单行省略，不撑乱 42px 行高。
- 右上源码窗：
  - H1–H6 分层颜色/字号恢复；
  - Markdown link / URL 语义着色与下划线恢复；
  - LaTeX token 样式恢复；
  - HTML tag 语义颜色恢复。
- 右下 Markdown 预览：
  - H1–H6 分层颜色/字号恢复；
  - Markdown link 样式恢复；
  - HTML 渲染恢复；
  - Markdown table 恢复；
  - inline / display LaTeX → KaTeX 恢复；
  - KaTeX CSS/字体随私有云镜像发布，不依赖 CDN。
- 源码 ↔ 预览：
  - 双向滚动联动恢复；
  - 按 data-source-line / source line 做行级同步；
  - 不使用滚动百分比硬绑定；
  - 真实 iPad 已确认两个方向都跟随。

本轮最终私有云版本：
- Helm revision 44
- 镜像 ocr2md/v2:restore-grid-heading-styles-20260907a
- Deployment 1/1 Ready

状态：
- “数据表模块切换”已封箱。
- “三窗内容样式恢复”已封箱。
- “源码 / 预览双向联动”已封箱。
- 安全副本 working / sidecar / revision 全程保持基线，相关功能调试均为 zero-write 或最终恢复基线。

总体迁移 / 验收进度上调至：**约 99%**。

下一优先刀回到既定功能调试债务：
E. **数据表行定位源码**
- 点击真实数据表行；
- CodeMirror 跳到对应源码并聚焦；
- 非法断行需定位并选中断点前后各 10 字；
- 必须解决当前旧测试中发现的 split-pane / pane-menu / regex-search overlay 对 row click 的 pointer interception；
- 需要独立“功能调试 → 数据表行定位源码”入口；
- 安全副本、zero-write、真实 iPad 验收后再封箱。

### 13.37 2026-09-07 · 源码窗重构为三个平级 tag：源码 / 自定义 CSS / 正则搜索

用户重新明确源码窗产品结构：
> 源码窗的tag，分别是源码，自定义的css样式， 正则搜索

因此右上源码窗不再把正则搜索组件常驻顶栏，而改为三个平级 tab：
1. 源码
2. 自定义 CSS
3. 正则搜索

右下 Markdown 预览始终固定存在，不随源码窗 tab 切换。

实现：
- editor-pane 顶栏改为 source-tabs：
  - #editor-tab-source
  - #editor-tab-css
  - #editor-tab-regex
- 三个 top-pane panel 共用 editor-pane 第 2 行：
  - #working-editor
  - #custom-css-wrap
  - #regex-search-panel
- splitter / preview / status 显式固定到第 3 / 4 / 5 行，避免 tab hidden 后 CSS Grid 自动重排。
- 切换任一 tab 时右下 Markdown 预览位置保持完全不变。
- 初始化功能调试时恢复到“源码”tab。
- “源码正则搜索”功能调试运行时自动切入“正则搜索”tab。

自定义 CSS：
- 从旧 integration 恢复受限安全模型，不允许任意 CSS 破坏工作台布局。
- 仅允许：
  - --ui-font-size
  - --grid-font-size
  - --right-font-size
- 新增独立 CodeMirror CSS 编辑器。
- 支持实时预览、保存到 localStorage、恢复默认。
- 页面设置 data-device-profile=ipad/mac。
- 为保持当前已验收视觉不变，默认值统一：
  - ui 13px
  - grid 13px
  - right 14px
- body / AG Grid / CodeMirror / Markdown preview 现在都由上述变量驱动。

专项与回归：
- 新增 tests/sourcePaneTabs.spec.ts。
- 验证：
  - 三个 tab 文案与顺序；
  - 默认源码 tab；
  - CSS / Regex / Source 三面板互斥；
  - CSS 编辑器包含三个允许变量；
  - Regex 控件只在 Regex 页显示；
  - Markdown preview 三次切换 y 坐标不变；
  - 默认字体变量保持 13/13/14。
- sourcePaneTabs PASS。
- featureDebugSourceRegexSearch PASS。
- sourcePreviewScrollSync PASS。
- typecheck / build / DOM contract / git diff --check PASS。
- DOM contract ids=97。

私有云：
- 镜像 ocr2md/v2:source-pane-tabs-20260907a
- Helm revision 45
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - tabs=[源码, 自定义 CSS, 正则搜索]
  - source/css/regex panel 切换正确
  - previewY 始终 414.84375
  - custom CSS 三变量存在
  - regex input visible
  - 默认变量 ui=13px / grid=13px / right=14px

当前总体迁移 / 验收进度仍约 99%。
本刀只差真实 iPad 对三个源码窗 tag 的肉眼/点击验收。

### 13.39 2026-09-07 · E 航点“数据表行定位源码”完成自动化 / 私有云门禁，待 REAL_IPAD 封箱

在 13.38 界面调整阶段收口后，项目回到既定功能调试航点 E：数据表行定位源码。

先重跑旧产品测试：
- tests/reviewModules.spec.ts
- clicking a review row relocates current working and focuses CodeMirror
- 当前已直接 PASS。
- 结论：过去所谓 split-pane / pane-menu / regex-search overlay pointer interception，主要是此前 AG Grid host 被压成 2px 的连带结果；13.29/13.30 布局根因修复后，真实 AG Grid row click 已恢复，不需要额外 overlay hack。

E 产品行为补正：
- 任何数据表行定位源码前，统一 setSourcePaneMode("source")。
- 因此即使用户当前停在“自定义 CSS”或“正则搜索”tag，点击数据表行也会自动切回“源码”再定位。
- 普通行继续走 WorkingEditor.revealRange。
- 非法断行继续走 WorkingEditor.revealIllegalBreakContext。
- WorkingEditor 新增 selectedText()，只用于功能调试验证真实 CodeMirror 选区。

新增独立功能调试：
- 功能调试 → 数据表行定位源码
- id: review-row-locate
- 3 步：
  1. 章节标题：先进入“正则搜索”tag，再点击真实章节标题 AG Grid 行；必须自动回“源码”、聚焦 CodeMirror、定位普通源码行。
  2. 非法断行：先进入“自定义 CSS”tag，再点击真实非法断行 AG Grid 行；必须自动回“源码”，并将 CodeMirror 选区对应到数据表“前10 ⏎ 后10”上下文。
  3. 收尾：回章节标题；chapter-clean / Undo-Redo 0/0 / revision 不变。
- 新 DOM id：ui-debug-review-row-locate；DOM contract ids=98。

非法断行调试细节：
- 安全副本第一条可见断行：source line 124。
- 数据表真实上下文：nstead, as ⏎ $(Equity_t，两侧各 10 个有效字符。
- CodeMirror 连续选区跨过双换行时会包含前一行原有尾随空格，因此 raw selection 前半可出现 11 个字符。
- 这不是定位错误：数据表预览本来就对 previousLineText.trimEnd()/nextLineText.trimStart() 后取 10 code points。
- 正式调试因此不机械统计连续选区 raw fragment，而是 trimEnd/trimStart 后与数据表实际“前10 / 后10”逐字比较。
- AG Grid 行虚拟化挂载有时略晚于 module/header 稳定，功能调试会等待真实 illegalBreakContext cell 出现并包含 ⏎，避免调试器自身 race。

新增专项：
- tests/featureDebugReviewRowLocate.spec.ts
- safe copy 初始化后运行真实功能调试。
- 结束必须：
  - 3/3 通过
  - source tab selected / working editor visible
  - active module 章节标题
  - chapter-clean
  - Undo 0 / Redo 0
  - Save disabled
  - working / sidecar / revision 与基线完全一致
- 专项 PASS。

相关门禁：
- typecheck PASS
- build PASS
- DOM contract PASS ids=98
- reviewModules 模块切换专项 PASS
- 旧真实 row-click 产品专项多次独立 PASS
- featureDebugReviewRowLocate PASS
- git diff --check PASS
- 一次完整 3-test 顺序回归中，第三用例 page.goto 前 4281 dev server 偶发退出（ERR_CONNECTION_REFUSED）；单独复跑同一旧产品用例 PASS，判定为测试服务器生命周期偶发，不是产品断言失败。

私有云：
- 镜像 ocr2md/v2:feature-debug-review-row-locate-20260907a
- Helm revision 46
- Deployment 1/1 Ready
- 4176 / 1032×642 正式 smoke：
  - 数据表行定位源码功能调试 · 3/3 通过
  - final module=章节标题
  - source tab selected=true / visible=true
  - chapter-clean
  - Undo=0 / Redo=0 / Save disabled
  - grid rows=10
  - safe copy working / sidecar / revision 全部与基线一致

当前总体迁移 / 验收进度仍约 **99%**。
E 只差真实 iPad 肉眼确认“普通行跳源码”和“非法断行上下文选区”；通过后封箱，并进入下一既定航点：脏章节离开保护。


### 13.39 2026-09-07 · E 数据表行定位源码：产品链恢复并完成私有云验收

在 13.38 用户确认界面调整告一段落后，回到原航点 E：数据表行定位源码。

先重跑旧产品测试：
- tests/reviewModules.spec.ts
- clicking a review row relocates current working and focuses CodeMirror：PASS。
- 旧记录中的 split-pane / pane-menu / regex-search overlay pointer interception 已不再出现。
- 结论：此前真正根因主要是 13.29 修复前 AG Grid host 只有 2px 高；Grid 布局恢复后真实 row click 链路自然恢复，不需要额外 overlay hack。

E 产品语义补正：
- 若当前源码窗停在“自定义 CSS”或“正则搜索”tag，点击任意数据表行时必须自动切回“源码”tag，再进行 CodeMirror 定位。
- 普通行：revealRange，聚焦 CodeMirror 并选中对应源码范围。
- 非法断行：revealIllegalBreakContext，聚焦 CodeMirror，并选中断点前文 10 字 + 真换行 + 后文 10 字。
- 定位行为不产生 dirty / Undo / Redo / 保存。

新增独立功能调试：
- 功能调试 → 数据表行定位源码
- 3 步：
  1. 章节标题：先停在“正则搜索”tag，点击真实第一行；确认自动切回源码、普通行定位、CodeMirror focus、选区存在。
  2. 非法断行：先停在“自定义 CSS”tag，点击真实第一条断行；确认自动切回源码、状态为“前后各10字”、选区跨真实换行且两侧各 10 字。
  3. 回到章节标题；确认全过程 chapter-clean / Undo-Redo 0/0 / revision 不变。
- 新增 tests/featureDebugReviewRowLocate.spec.ts。
- WorkingEditor 新增 selectedText() 仅用于可观测验证。

测试基础设施说明：
- 4281 曾有残留 test server 进程导致端口抢占 / ECONNRESET，与产品无关。
- E 最终专项改用独立 4282/4283 + 独立临时 project dir 验证，消除基础设施干扰。
- 最终门禁：typecheck PASS；build PASS；DOM contract PASS，ids=98；featureDebugReviewRowLocate PASS；旧 reviewModules row-click PASS；sourcePaneTabs PASS；git diff --check PASS；合计 3/3 focused tests PASS。

私有云：
- 镜像 ocr2md/v2:review-row-locate-20260907a
- Helm revision 47
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：数据表行定位源码功能调试 3/3 PASS；final module=章节标题；final source tab selected=true / source visible；final chapter-clean / Undo 0 / Redo 0 / Save disabled；working / sidecar / revision 与安全基线完全一致。

当前总体迁移 / 验收进度仍约 99%。E 已完成自动化与私有云验收，只差真实 iPad 人工验收；通过后封箱并进入下一既定航点“脏章节离开保护”。

### 13.40 2026-09-07 · REAL_IPAD E 数据表行定位源码封箱；脏章节离开保护完成私有云验收

真实 iPad 用户确认：
> 3/3 通过

因此 13.39 航点 E“数据表行定位源码”正式封箱。

下一既定航点“脏章节离开保护”调查结果：
- 现有产品逻辑已经完整存在，并有两条正式产品测试：
  - dirty close offers cancel, discard, and save-before-close
  - dirty chapter switch uses the same leave protection
- 两条现有产品测试 2/2 PASS。
- 不需要重写状态机，任务转为统一功能调试封装与私有云/真实设备验收。

新增功能调试：
- 功能调试 → 脏章节离开保护
- 5 步：
  1. 正式修改 working → dirty → 关闭章节 → 取消；确认修改仍保留。
  2. 再次关闭 → 放弃修改；重开后磁盘仍为原基线。
  3. 再次正式修改 → 切换另一章节 → 取消；确认仍留在当前脏章节且修改保留。
  4. 再次切换 → 保存并继续；确认先保存安全副本，再打开目标章节，产生临时 revision。
  5. 安全清理：原样恢复安全副本 working / sidecar / revision，并重回 chapter-clean / Undo-Redo 0/0。

安全模型：
- 使用安全副本作为唯一会被临时保存的章节。
- 保存并继续会真实写盘，因此调试记录原 working / sidecar / revision。
- 调试结束通过 /__workspace/chapter 的 expectedRevision 冲突保护原样写回基线。
- 最终再次重开安全副本，验证 working / sidecar / revision 三者全部等于调试前基线。
- 失败路径会优先尝试取消 leave-confirm、Undo 本地 dirty、写回原 raw baseline 并重开安全副本。

新增专项：
- tests/featureDebugDirtyLeaveProtection.spec.ts
- 与现有 tests/leaveProtection.spec.ts 一起运行：3/3 PASS。
- typecheck / build / DOM contract / git diff --check PASS。
- DOM contract ids=99。

私有云：
- 镜像 ocr2md/v2:dirty-leave-protection-20260907a
- Helm revision 48
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - 脏章节离开保护功能调试 5/5 PASS
  - final chapter-clean
  - Undo 0 / Redo 0 / Save disabled
  - leave-confirm overlay hidden
  - final selected chapter=安全副本
  - working / sidecar / revision 与基线完全一致
  - baseline revision = 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a

当前总体迁移 / 验收进度约 **99.2%**。
该航点只差真实 iPad 一键 5/5 人工验收；通过后进入下一既定航点“非法断行模块”。

### 13.41 2026-09-07 · REAL_IPAD 脏章节离开保护封箱

真实 iPad 用户确认：
> 5/5 通过

因此“脏章节离开保护”正式封箱：
- 关闭章节：取消 / 放弃修改 / 保存并继续
- 切换章节：取消 / 放弃修改 / 保存并继续
- 不允许静默丢失 dirty 修改
- 功能调试结束后安全副本 working / sidecar / revision 原样恢复
- REAL_IPAD_DIRTY_LEAVE_PROTECTION_OK

总体迁移 / 验收进度约 99.3%。
下一既定航点：非法断行模块。

### 13.42 2026-09-07 · 非法断行模块完成自动化 / 私有云验收

在 13.41 后进入下一既定航点“非法断行模块”。

现有产品测试首次回归暴露旧测试假设过时：
- iPad 宽度下非法断行共有 5 列，但第 5 列“判断 / breakReason”被 AG Grid 横向虚拟化。
- 旧 tests/illegalLineBreakModule.spec.ts 直接等待第一行 breakReason，导致超时。
- 修正为：先验证 aria-colcount=5；横向滚动到末端后再验证“判断”列。
- 第二个旧断言还假设 breakReason 文案长度 >5；历史 sidecar 允许短标签，因此改为真正产品语义：判断列存在且非空。
- 修正后原完整非法断行产品链 PASS：忽略 → Undo → Redo → 保存 → 重入 → 原样恢复。

新增独立功能调试：
- 功能调试 → 非法断行模块
- 5 步：
  1. 基线：6 条可见候选，5 列；第一行前10/后10、合并预览、判断非空；行类型仅“合并 / 已忽略”；导出基线 6 组合并、3 条已忽略。
  2. 真实下拉第一条“合并 → 已忽略”：可见候选 6→5；真实 merge decision / merge span 同步 6→5；working 长度不变；进入 dirty / Undo 1。
  3. Undo / Redo：6→5 完全可逆，working 始终不变。
  4. 保存 / 重入：5 条决策持久化，产生临时 revision；重入仍 5 条，working 不变。
  5. 安全清理：恢复原 6 条、原 working / sidecar / revision、chapter-clean / Undo-Redo 0/0。

新增专项：
- tests/featureDebugIllegalLineBreak.spec.ts
- 与修正后的 tests/illegalLineBreakModule.spec.ts 一起运行：2/2 PASS。
- typecheck / build / DOM contract / git diff --check PASS。
- DOM contract ids=100。

私有云：
- 镜像 ocr2md/v2:illegal-line-break-debug-20260907a
- Helm revision 49
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - 非法断行模块功能调试 5/5 PASS
  - final module=非法断行
  - final rows=6
  - 导出效果=6 条“合并”标定 → 6 组断行合并 · 已忽略 3 条
  - final chapter-clean / Undo 0 / Redo 0 / Save disabled
  - working / sidecar / revision 与安全基线完全一致
  - revision = 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a

当前总体迁移 / 验收进度约 **99.4%**。
该航点只差真实 iPad 一键 5/5 人工验收；通过后进入下一既定航点“章节标题模块”。

### 13.43 2026-09-07 · REAL_IPAD 非法断行模块封箱

真实 iPad 用户确认：
> 5/5 通过

因此“非法断行模块”正式封箱：
- 6 条候选 / 5 列表格结构
- 前10 / 后10 上下文
- 合并预览 / 判断列
- 合并 → 已忽略
- Undo / Redo
- 保存 / 重入
- 导出 merge 决策同步
- 最终 working / sidecar / revision 原样恢复
- REAL_IPAD_ILLEGAL_LINE_BREAK_MODULE_OK

总体迁移 / 验收进度约 99.5%。
下一既定航点：章节标题模块。

### 13.44 2026-09-07 · 章节标题模块完成自动化 / 私有云验收

13.43 后进入既定航点“章节标题模块”。

现有产品链回归：
- tests/chapterTitleModule.spec.ts 两条正式产品测试 2/2 PASS：
  1. 标题层级修改 / Undo-Redo / 编号导出 / 保存重入。
  2. “已忽略”标题在重扫与重入后仍保持。
- 结论：章节标题业务逻辑本体完整，不需要重写；本航点转为统一功能调试封装与真实设备验收。

新增独立功能调试：
- 功能调试 → 章节标题模块
- 5 步：
  1. 基线：10 条标题 / 3 列；真实 H1/H2 层级；(001)/(002) 编号；H1/H2 样式；导出 10 / 10 / 10。
  2. 第一条“已忽略”：10→9，working 不变；导出语义 9 个有效标题 / 10 个导出标题 / 9 个编号；Undo 回 10。
  3. 第二条 H2→H3：working 从 ## 真实变成 ###，working length +1；H3 预览 / 颜色；Undo / Redo 成组可逆。
  4. 编号开关：关闭后编号预览与 titleExportNumberedCount 变 0；重新开启恢复 10；整个过程不新增 Undo 历史。
  5. 保存 / 重入：H3 真实持久化；随后安全清理恢复原 H2 / working / sidecar / revision / clean 0/0。

AG Grid 调试可观测性修正：
- 初版功能调试用全局 querySelectorAll(.chapter-heading-preview)[1] 读取第二标题。
- AG Grid 重绘时旧/新 cell DOM 可能短暂共存，导致全局 DOM 顺序不稳定，而状态机已正确更新。
- 改为按 AG Grid 真实 row-index 定位：.ag-row[row-index="0/1"]，再从该行读取 select / preview。
- 对 H2→H3、Undo、Redo、编号切换、保存重入增加 DOM 投影等待；不修改产品业务逻辑。

功能调试器通用改进：
- FeatureDebugRunner 失败步骤现在会直接显示具体错误原因，并写入 data-error/title。
- 后续航点失败时不再只有“失败”二字，可直接在界面定位原因。

新增专项：
- tests/featureDebugChapterTitle.spec.ts
- 因包含真实保存 / 关闭 / 重入 / raw revision 恢复，专项超时设为 60s；正常运行约 18-23s。
- 最终门禁：
  - typecheck PASS
  - build PASS
  - DOM contract PASS，ids=101
  - chapterTitleModule 2/2 PASS
  - featureDebugChapterTitle 1/1 PASS
  - 合计 3/3 PASS
  - git diff --check PASS

私有云：
- 镜像 ocr2md/v2:chapter-title-debug-20260907a
- Helm revision 50
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - 章节标题模块功能调试 5/5 PASS
  - final module=章节标题
  - final rows=10
  - 第二条行类型=2 级标题
  - 编号开启
  - 导出效果=10 个标题 · 导出标题 10 个 · 已编号 10 个
  - final chapter-clean / Undo 0 / Redo 0 / Save disabled
  - working / sidecar / revision 与安全基线完全一致
  - revision = 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a

当前总体迁移 / 验收进度约 **99.6%**。
该航点只差真实 iPad 一键 5/5 人工验收；通过后进入下一既定航点“注释模块”。

### 13.45 2026-09-07 · REAL_IPAD 章节标题模块封箱

真实 iPad 用户确认：
> 5/5 通过

外网真实设备桥同步确认（2026-09-07 20:13 +08:00 左右）：
- clientId = 04bb504a-7e75-43d8-8170-c5d76b46ed81
- viewport = 1032×642, DPR=2
- pageLoadedAt = 2026-09-07T12:13:08.782Z
- session = chapter-clean
- activeReviewModule = 章节标题
- activeModuleRows = 10
- headingNumberingEnabled = true
- titleHeadingCount / titleExportHeadingCount / titleExportNumberedCount = 10 / 10 / 10
- workingLength = 63833
- Undo / Redo = 0 / 0
- canSave = false
- revision = 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a
- lastFailure = null

因此“章节标题模块”正式封箱：
- 10 条标题 / 3 列
- H1/H2/H3 层级预览与颜色
- 标题行类型 1–6 级 + 已忽略
- 已忽略 10→9 且 working 不变
- H2→H3 真实修改 working
- Undo / Redo
- 编号开关只影响预览 / 导出
- 保存 / 重入
- 最终 working / sidecar / revision 原样恢复
- REAL_IPAD_CHAPTER_TITLE_MODULE_OK

总体迁移 / 验收进度约 99.7%。
下一既定航点：注释模块。

### 13.46 2026-09-07 · 注释模块完成自动化 / 私有云验收

13.45 后进入既定航点“注释模块”。

现有产品链回归：
- tests/annotationModule.spec.ts 两条正式产品测试 2/2 PASS：
  1. 注释号修改会重建配对，并参与统一 Undo / Redo / Save / Reentry。
  2. “已忽略”注释在重扫 / 重入后保持，配对状态会正确反映缺引用。
- 结论：注释业务本体完整，不需要重写；本航点只补统一功能调试与真实设备验收。

新增独立功能调试：
- 功能调试 → 注释模块
- 5 步：
  1. 基线：20 行 / 5 列 / 10 对；首行 注释引用 #1 / 自动匹配。
  2. 改号：首个引用 #1→#99；20 行不变、working 不变；配对 10→11；缺引用 1 / 缺正文 1；首行变为待补正文。
  3. Undo / Redo：恢复 #1 / 10 对，再重现 #99 / 11 对，最后再次 Undo 回 clean 基线。
  4. 已忽略：首个引用 20→19；配对仍为 10；出现 1 个待补引用；Undo 回 20。
  5. 保存 / 重入：#99 / 11 对真实持久化；随后安全清理恢复原 #1 / 20 行 / 10 对 / working / sidecar / revision / clean 0/0。

实现约束：
- 只走真实注释号 input change 与真实行类型 select change；无 debug-only 业务 API。
- AG Grid 行读取按 row-index 定位，避免重绘时旧 / 新 cell DOM 共存导致全局 DOM 顺序漂移。
- 失败步骤会直接显示具体错误原因（沿用 13.44 FeatureDebugRunner 改进）。

新增专项：
- tests/featureDebugAnnotation.spec.ts
- 60s timeout（正常约 18–23s），因为包含真实保存 / 关闭 / 重入 / raw revision 恢复。
- 最终门禁：
  - typecheck PASS
  - build PASS
  - DOM contract PASS，ids=102
  - annotationModule 2/2 PASS
  - featureDebugAnnotation 1/1 PASS
  - 合计 3/3 PASS
  - git diff --check PASS

私有云：
- 镜像 ocr2md/v2:annotation-debug-20260907a
- Helm revision 51
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - 注释模块功能调试 5/5 PASS
  - final module=注释
  - final rows=20
  - annotationPairs=10
  - 标定 20 · 配对 10 · 缺引用 0 · 缺正文 0 · 缺号 0
  - 首行 注释引用 / #1 / 自动匹配
  - chapter-clean / Undo 0 / Redo 0 / Save disabled
  - working / sidecar / revision 与安全基线完全一致
  - revision = 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a

当前总体迁移 / 验收进度约 **99.8%**。
该航点只差真实 iPad 一键 5/5 人工验收；通过后进入下一既定航点“嵌入块模块”。

### 13.47 2026-09-07 · REAL_IPAD 注释模块封箱

真实 iPad 用户确认：
> 5/5 通过

因此“注释模块”正式封箱：
- 20 行 / 5 列 / 10 对
- 首行 注释引用 #1 / 自动匹配
- 注释号 #1→#99 重建配对 10→11
- Undo / Redo
- 已忽略 20→19 + 待补引用
- 保存 / 重入
- 最终 working / sidecar / revision 原样恢复
- REAL_IPAD_ANNOTATION_MODULE_OK

总体迁移 / 验收进度约 99.85%。
下一既定航点：嵌入块模块。

### 13.47 2026-09-07 · REAL_IPAD 注释模块封箱

真实 iPad 用户确认：
> 5/5 通过

外网真实设备桥同步确认：
- clientId = 04bb504a-7e75-43d8-8170-c5d76b46ed81
- viewport = 1032×642, DPR=2
- pageLoadedAt = 2026-09-07T12:26:03.809Z
- session = chapter-clean
- activeReviewModule = 注释
- activeModuleRows = 20
- annotationPairs = 10
- annotationPairedCount = 10
- annotationMissingRefCount / BodyCount / NumberCount = 0 / 0 / 0
- workingLength = 63833
- Undo / Redo = 0 / 0
- canSave = false
- revision = 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a
- lastFailure = null

因此“注释模块”正式封箱：
- REAL_IPAD_ANNOTATION_MODULE_OK

总体迁移 / 验收进度约 99.85%。
下一既定航点：嵌入块模块。

### 13.48 2026-09-07 · 嵌入块模块完成自动化 / 私有云验收

13.47 后进入既定航点“嵌入块模块”。

现有产品链回归：
- tests/embedModule.spec.ts 1/1 PASS：已忽略参与统一 Undo / Redo，并在保存重入后保持。
- 首次运行只遇到测试临时目录冲突；清理本次临时目录后重跑通过，与产品无关。
- 最终门禁曾遇 4303 端口已占用；换 4304 后通过，与产品无关。

新增独立功能调试：
- 功能调试 → 嵌入块模块
- 5 步：
  1. 基线：总计 65 / 可见 51 / 11 组 / 未分组 0；4 列；首行组 1 / 嵌入块首，行类型选项为 嵌入块首 / 已忽略。
  2. 第一行“嵌入块首 → 已忽略”：可见 51→50；总数 65、组 11、未分组 0、working 均不变；进入 dirty / Undo 1。
  3. Undo / Redo：51→50 完全可逆，组结构始终 11 / 未分组 0。
  4. 保存 / 重入：可见 50 持久化，组结构保持，产生临时 revision，working 不变。
  5. 安全清理：恢复可见 51 / 11 组 / 原 working / sidecar / revision / clean 0/0。

新增专项：
- tests/featureDebugEmbed.spec.ts
- typecheck PASS
- build PASS
- DOM contract PASS，ids=103
- embedModule 1/1 PASS
- featureDebugEmbed 1/1 PASS
- 合计 2/2 PASS
- git diff --check PASS

私有云：
- 镜像 ocr2md/v2:embed-debug-20260907a
- Helm revision 52
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - 嵌入块模块功能调试 5/5 PASS
  - final module=嵌入块
  - final rows=51
  - 总计 65 · 可见 51 · 组 11 · 未分组 0
  - 首行组号=1 / 行类型=嵌入块首
  - final chapter-clean / Undo 0 / Redo 0 / Save disabled
  - working / sidecar / revision 与安全基线完全一致
  - revision = 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a

当前总体迁移 / 验收进度约 **99.9%**。
该航点只差真实 iPad 一键 5/5 人工验收。

### 13.48 2026-09-07 · 嵌入块模块完成自动化 / 私有云验收

13.47 后进入既定航点“嵌入块模块”。

现有产品链回归：
- tests/embedModule.spec.ts 覆盖：嵌入块首设为已忽略 → Undo / Redo → 保存 / 重入。
- 首轮使用旧临时目录 .tmp/embed-baseline 时出现一次 POST /__workspace/chapter 500，保存后仍 chapter-dirty。
- 随后做了两层隔离复现：
  1. 全新临时工程手工精确跑 51→50→51→50→保存，POST 200，chapter-clean。
  2. 全新端口 4304 + 全新临时目录正式重跑 embedModule.spec.ts，PASS。
- 该 500 无法在干净环境复现，判定为测试目录 / 基础设施瞬态异常；没有为不可复现异常修改产品保存逻辑。

仓库中已存在但此前未完成本轮验收记录的嵌入块功能调试：
- 功能调试 → 嵌入块模块
- 5 步：
  1. 基线：总计 65 / 可见 51 / 11 组 / 未分组 0；首行组 1 / 嵌入块首；AG Grid 4 列。
  2. 组 1 嵌入块首 → 已忽略：可见 51→50；总计 / 组数 / 未分组 / working 不变。
  3. Undo / Redo：51→50 可逆；组结构保持 11 / 0。
  4. 保存 / 重入：可见 50 持久化；working 不变；产生临时 revision。
  5. 安全清理：恢复可见 51 / 11 组 / 原 working / sidecar / revision / clean 0/0。
- tests/featureDebugEmbed.spec.ts 已存在并纳入本轮正式验收。

最终专项：
- embedModule.spec.ts PASS
- featureDebugEmbed.spec.ts PASS
- 合计 2/2 PASS
- typecheck PASS
- build PASS
- DOM contract PASS，ids=103
- git diff --check PASS

私有云 4176 smoke：
- 当前部署仍为 Helm revision 51（现有 revision 已包含嵌入块功能调试入口，无需重复部署同一份产品代码）
- 嵌入块模块功能调试 5/5 PASS
- final module=嵌入块
- final active rows=51
- 总计 65 · 可见 51 · 组 11 · 未分组 0
- 首行组号=1，行类型=嵌入块首
- final chapter-clean / Undo 0 / Redo 0 / Save disabled
- working / sidecar / revision 与安全基线完全一致
- revision = 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a

当前总体迁移 / 验收进度约 **99.9%**。
该航点只差真实 iPad 一键 5/5 人工验收。

### 13.49 2026-09-07 · REAL_IPAD 嵌入块模块封箱

真实 iPad 用户确认：
> 5/5 通过

外网真实设备桥同步确认：
- clientId = 04bb504a-7e75-43d8-8170-c5d76b46ed81
- viewport = 1032×642, DPR=2
- pageLoadedAt = 2026-09-07T12:46:14.766Z
- session = chapter-clean
- activeReviewModule = 嵌入块
- activeModuleRows = 51
- embedTotalRows / embedVisibleRows / embedGroupCount / embedUnassignedRows = 65 / 51 / 11 / 0
- workingLength = 63833
- Undo / Redo = 0 / 0
- canSave = false
- revision = 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a
- lastFailure = null

因此“嵌入块模块”正式封箱：
- REAL_IPAD_EMBED_MODULE_OK

章节清洗侧四个模块现已全部通过真实 iPad：
- 章节标题
- 注释
- 嵌入块
- 非法断行

总体迁移 / 验收进度约 99.9%。
下一核心业务航点：OCR 节点“章节定界”。

### 13.49 2026-09-07 · REAL_IPAD 嵌入块模块封箱；原功能调试债务只剩最后一项

真实 iPad 用户确认：
> 5/5 通过

真实设备桥同步确认最终状态：
- session=chapter-clean
- activeReviewModule=嵌入块
- activeModuleRows=51
- embedTotalRows=65
- embedVisibleRows=51
- embedGroupCount=11
- embedUnassignedRows=0
- workingLength=63833
- Undo/Redo=0/0
- canSave=false
- revision=409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a
- lastFailure=null

因此“嵌入块模块”正式封箱：
- 65 / 51 / 11 / 0 分组基线
- 已忽略 51→50
- Undo / Redo
- 保存 / 重入
- 最终 working / sidecar / revision 原样恢复
- REAL_IPAD_EMBED_MODULE_OK

重新对照 13.10 原始功能调试债务：
1. 章节选择 / 打开章节 —— 尚缺独立功能调试入口
2. 修改工作稿文本 —— 已封箱
3. 行类型：已忽略 —— 已封箱
4. 保存标定 / 重入加载 —— 已封箱
5. 数据表模块切换 —— 已封箱
6. 数据表行定位源码 —— 已封箱
7. 脏章节离开保护 —— 已封箱
8. 非法断行模块 —— 已封箱
另外章节标题 / 注释 / 嵌入块模块也已补齐并封箱。

因此原航线现在只剩最后一站：章节选择 / 打开章节。

### 13.50 2026-09-07 · 最后原始债务“章节选择 / 打开章节”完成自动化 / 私有云验收

13.49 后对照 13.10 原始功能调试债务，确认唯一未补独立功能调试入口的是：
- 章节选择 / 打开章节（M2 catalog、ready/blocked、多章节打开）

现有产品链回归：
- navigationContext.spec.ts：导航节点拥有当前位置、review tags 随 node context 切换，PASS。
- workspaceUi.spec.ts：多真实章节选择 / 打开 / reload / persistence，PASS。
- 修正两处旧测试硬编码：
  - project-name 不再固定 persistent-project，而取 /__workspace/chapters 实际 projectName。
  - 导航 option 数量、ready/total 统计不再固定 7、2/3，而按实际 catalog 动态计算。
- 这些是测试契约修正，不修改产品业务逻辑。

新增独立功能调试：
- 功能调试 → 章节选择 / 打开章节
- 5 步，全部零写入：
  1. Catalog：核对项目名、章节总数、ready / blocked 数；ready option 可选；blocked option disabled 且显示不可用原因。
  2. 用真实 chapter-select change 从安全副本打开 ready 章节 A；要求 chapter-clean、章节标题上下文、路径 / select 同步、Undo/Redo 0/0、Save disabled。
  3. 连续真实导航 A→B；同样保持 clean 0/0，blocked 仍不可选。
  4. 用真实导航回安全副本；恢复章节标题 10 行、原 revision、clean 0/0。
  5. 重新读取安全副本 + A + B raw working / sidecar / revision，三者必须全部精确等于调试前基线。

新增专项：
- tests/featureDebugChapterOpen.spec.ts
- 最终门禁 3/3 PASS：
  - featureDebugChapterOpen
  - navigationContext
  - workspaceUi catalog multi-chapter
- typecheck PASS
- build PASS
- DOM contract PASS，ids=105
- git diff --check PASS

私有云：
- 镜像 ocr2md/v2:chapter-open-debug-20260907a
- Helm revision 53
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - 功能调试 5/5 PASS
  - 项目 Bufett’s Alpha：章节 total=7 / ready=5 / blocked=2
  - blocked：00 Bufett’s Alpha（缺少 sidecar）、05 References（缺少 sidecar），导航均 disabled
  - 实际访问 A=01 Buffett’s Alpha
  - 实际访问 B=02 Appendix A Data Sources and Methodology
  - final 回到 01 Buffett’s Alpha 副本
  - final chapter-clean / 章节标题 / 10 rows / Undo 0 / Redo 0 / Save disabled
  - 安全副本 working / sidecar / revision 全部不变
  - A working / sidecar / revision 全部不变
  - B working / sidecar / revision 全部不变
  - 安全副本 revision=409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a

至此 13.10 原始功能调试债务在自动化 + 私有云层面 8/8 全部清零；章节标题 / 注释 / 嵌入块等后补模块级调试也全部完成。

当前本轮 v2 迁移 / 验收进度约 **99.95%**。
只差真实 iPad 对“章节选择 / 打开章节”一键 5/5 最终人工验收；通过后，本轮 v2 迁移验收可记为 100% 完成。

### 13.50 2026-09-07 · 章节定界模块完成自动化 / 私有云非破坏性验收

在 13.49 后进入最后一个核心业务模块：OCR 节点“章节定界”。

旧产品测试入口修正：
- tests/chapterBoundary.spec.ts 原先仍点击已隐藏的 #open-boundary。
- 当前正式产品入口已经是顶部导航下拉 → ocr。
- 测试改为 chapter-select.selectOption(__node_ocr__)；保存重入后的再次打开同样走真实导航。
- 不修改章节定界状态机 / repository 业务逻辑。

隔离端到端产品验收：
- chapterBoundary.spec.ts PASS。
- 验证真实完整链：
  - 根 OCR Markdown 合并；
  - 一级标题扫描；
  - 起始序号自动分配章节文件；
  - Undo / Redo；
  - Save / Reentry；
  - 真实 Export Boundary；
  - 生成 chapter md / working / sidecar；
  - 新章节加入 catalog 并可正常打开。

真实设备安全策略：
- 私有云 Buffett 当前章节定界工作稿是真实业务数据，不允许功能调试直接导出临时章节。
- 当前基线：
  - OCR 输入 1 个；
  - working length 83258；
  - 一级标题 2；
  - 已分配 0；segments 0；
  - boundary revision = 9958f7ea5f055965c3ae6a857fd548d053523892a93de8445751050113f3645d。
- 因此新增“非破坏性真实设备功能调试”：验证编号 / Undo-Redo / 保存重入 / 导出能力，但不实际点击导出；导出真实落盘由隔离端到端测试负责。

新增功能调试：
- 功能调试 → 章节定界模块
- 5 步：
  1. 真实导航 ocr → 章节定界；核对 OCR / 一级标题 / 章节文件列 / clean 基线。
  2. 起始 9901 自动编号；已分配与 segments 同步；导出按钮变可用；working 不变。
  3. Undo / Redo：恢复原分配，再重现 9901 编号；working 始终不变。
  4. Save / Reentry：9901 编号真实持久化；导出能力仍可用；明确不执行真实导出；章节目录清单必须保持不变。
  5. 安全恢复：写回原 working / sidecar / revision，并重开 ocr；章节目录清单与调试前逐项一致。

安全验证：
- 新增 tests/featureDebugChapterBoundary.spec.ts。
- 记录运行前 boundary working / baseline / sidecar / revision 和 chapters catalog。
- 运行后全部逐项比较。
- 明确断言不存在 9901/9902... 调试章节目录。

最终门禁：
- typecheck PASS
- build PASS
- DOM contract PASS，ids=105
- chapterBoundary 真实导出端到端 PASS
- featureDebugChapterBoundary 非破坏性恢复 PASS
- navigationContext PASS
- 合计 3/3 PASS
- git diff --check PASS

私有云：
- 镜像 ocr2md/v2:chapter-boundary-debug-20260907a
- Helm revision 54
- Deployment 1/1 Ready
- 4176 / Buffett 实际数据 smoke：
  - 章节定界模块功能调试 5/5 PASS
  - final nav=ocr
  - final module=章节定界
  - final rows=2
  - OCR 1 · 一级标题 2 · 已分配 0 · segments 0
  - chapter-clean / Undo 0 / Redo 0 / Save disabled
  - before/after working 完全一致
  - before/after baseline 完全一致
  - before/after sidecar 完全一致
  - before/after revision 完全一致
  - before/after chapters catalog 完全一致
  - debugChapters=[]

当前总体迁移 / 验收进度约 **99.95%**。
只差真实 iPad 对“章节定界模块”一键 5/5 人工验收；通过后核心业务模块迁移验收可宣布完成，并进入最终总回归 / 生产封板。

### 13.50 2026-09-07 · 章节定界模块完成自动化 / 私有云验收

13.49 后进入最后一个核心业务模块航点：OCR 节点“章节定界”。

旧端到端测试首先暴露入口过时：
- tests/chapterBoundary.spec.ts 仍点击已被新导航体系隐藏的 #open-boundary。
- 产品真实入口已改为顶部导航下拉 #chapter-select → __node_ocr__ / “ocr”。
- 将测试两处旧入口统一改为真实导航路径，不修改章节定界业务逻辑。

修正后章节定界端到端产品测试 1/1 PASS：
- 合并 3 个 OCR 根 Markdown
- 识别 3 个一级标题
- 91 起依次编号为 91 One / 92 Two / 93 Three
- Undo / Redo
- 保存 / 重入
- 真实导出 3 章
- 每章生成原文 / working / sidecar
- 导出章节重新进入 chapters 节点后可正常打开
- 分段内容互不串章。

真实私有云项目的章节定界基线：
- 根 OCR 输入 1 个
- workingLength = 83258
- 一级标题 2 个
- 已分配 0
- segments 0
- revision = 9958f7ea5f055965c3ae6a857fd548d053523892a93de8445751050113f3645d

由于“导出章节”会真实创建章节目录，真实 iPad 功能调试采用非破坏性策略：
- 真正的导出能力由隔离 Playwright 端到端测试负责，已 1/1 PASS。
- 真实设备功能调试只做：导航 ocr → 临时编号 → Undo / Redo → 保存 / 重入 → 原样恢复。
- 不在真实 Buffett 项目执行 EXPORT_BOUNDARY。
- 运行前记录章节目录清单；结束后要求章节目录清单完全一致，并禁止出现 9901/9902... 临时章节。

新增 / 完成独立功能调试：
- 功能调试 → 章节定界模块
- 5 步：
  1. 真实导航进入 ocr / 章节定界；核对 OCR 数、一级标题数、4 列表格与章节文件输入框。
  2. 起始序号 9901 自动编号；已分配 / segments 同步到一级标题数；导出能力变为可用；working 不变。
  3. Undo / Redo：恢复原分配，再重现 9901 编号；working 始终不变。
  4. 保存 / 重入：9901 编号持久化，导出能力保持可用；真实设备仍不执行导出；章节目录清单不变。
  5. 安全恢复：写回原 working / baseline / sidecar / revision，重开 ocr；恢复原分配 / segments / clean 0/0；章节目录清单不变。

正式专项：
- tests/featureDebugChapterBoundary.spec.ts（已有草稿，本轮接续完成验证）
- 运行前先建立持久化 boundary 基线，再运行功能调试。
- 最终比较 working / baselineText / sidecar / revision / 章节目录清单。
- 明确断言不存在 /^990[1-9]/ 临时章节。

最终门禁：
- typecheck PASS
- build PASS
- DOM contract PASS，ids=105
- chapterBoundary.spec.ts 1/1 PASS
- featureDebugChapterBoundary.spec.ts 1/1 PASS
- 合计 2/2 PASS
- git diff --check PASS

私有云：
- 镜像 ocr2md/v2:chapter-boundary-debug-20260907a
- Helm revision 55
- Deployment 1/1 Ready
- 4176 / 1032×642 smoke：
  - 章节定界模块功能调试 5/5 PASS
  - final navigation=ocr
  - final module=章节定界
  - final rows=2
  - OCR 1 · 一级标题 2 · 已分配 0 · segments 0
  - export-boundary disabled
  - final chapter-clean / Undo 0 / Redo 0 / Save disabled
  - working / baseline / sidecar / revision 与运行前完全一致
  - revision = 9958f7ea5f055965c3ae6a857fd548d053523892a93de8445751050113f3645d
  - 章节目录清单前后一致
  - 无 9901/9902... 临时章节
  - lastFailure = null

当前总体迁移 / 验收进度约 **99.95%**。
这是最后一个核心业务模块航点；只差真实 iPad 一键 5/5 人工验收。通过后进入最终收尾盘点 / 里程碑封箱，而不是继续新增业务模块。

### 13.51 2026-09-07 · REAL_IPAD 章节定界模块封箱

真实 iPad 用户确认：
> 5/5 通过

外网真实设备桥同步确认：
- viewport = 1032×642, DPR=2
- workspaceKind = boundary
- activeReviewModule = 章节定界
- activeModuleRows = 2
- OCR 1 · 一级标题 2 · 已分配 0 · segments 0
- chapter-clean
- Undo / Redo = 0 / 0
- canSave = false
- canExportBoundary = false
- workingLength = 83258
- revision = 9958f7ea5f055965c3ae6a857fd548d053523892a93de8445751050113f3645d
- lastFailure = null
- 章节目录清单无 9901/9902... 临时章节

因此“章节定界模块”正式封箱：
- REAL_IPAD_CHAPTER_BOUNDARY_MODULE_OK

核心业务模块现已全部完成真实 iPad 验收：
- 章节定界
- 章节标题
- 注释
- 嵌入块
- 非法断行

本轮 v2 迁移 / 验收仍暂记 **99.95%**，因为此前已有一个自动化 / 私有云已完成但尚未拿到真实 iPad 人工票的尾项：
- 功能调试 → 章节选择 / 打开章节

该项 5/5 通过后，本轮 v2 迁移验收可正式记为 100%。

### 13.52 2026-09-07 · 最后一张人工票复核：章节选择 / 打开章节

在当前最终部署 Helm revision 55 上重新执行私有云 4176 smoke：
- 功能调试 → 章节选择 / 打开章节
- 5/5 PASS
- ready / blocked 章节导航正常
- 连续打开多个 ready 章节正常
- 最终回安全副本
- final chapter-clean
- active module = 章节标题
- rows = 10
- Undo / Redo = 0 / 0
- Save disabled
- 全程零写入

因此该功能自动化 / 私有云层面仍保持通过，无后续回归。
唯一剩余事项：真实 iPad 人工运行“章节选择 / 打开章节”并确认 5/5。
通过后本轮 v2 迁移 / 验收可正式记为 100%。

### 13.53 2026-09-07 · V2_MIGRATION_REAL_IPAD_ACCEPTANCE_100_PERCENT

真实 iPad 用户最终确认：
> 章节选择 / 打开章节 5/5 通过

这是本轮 v2 迁移 / 私有云 / 真实设备验收的最后一张人工票。

最终真实设备桥确认：
- clientId = 04bb504a-7e75-43d8-8170-c5d76b46ed81
- viewport = 1032×642, DPR=2
- pageLoadedAt = 2026-09-07T13:19:34.128Z
- session = chapter-clean
- project = Bufett’s Alpha
- 当前章节 = 01 Buffett’s Alpha 副本
- activeReviewModule = 章节标题
- activeModuleRows = 10
- heading numbering = on
- workingLength = 63833
- Undo / Redo = 0 / 0
- canSave = false
- revision = 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a
- lastFailure = null

最终私有云部署：
- Helm release = ocr2md-v2
- namespace = ocr2md
- Helm revision = 55
- image = ocr2md/v2:chapter-boundary-debug-20260907a
- Deployment = 1/1 Ready
- stable local entry = http://127.0.0.1:4176

本轮已完成并通过真实 iPad 人工验收的关键项：
- 初始化工作稿
- 左右工作窗分割条
- 源码 / 预览水平分割条
- Markdown 预览
- 源码正则搜索
- 源码 / 预览双向滚动联动
- 源码窗三个 tag：源码 / 自定义 CSS / 正则搜索
- Undo / Redo
- 修改 working 文本
- 行类型：已忽略
- 保存标定 / 重入加载
- 数据表深色主题
- 三窗内容样式（H1–H6、link、LaTeX、HTML、Markdown table / KaTeX）
- 数据表模块切换
- 数据表行定位源码
- 脏章节离开保护
- 非法断行模块
- 章节标题模块
- 注释模块
- 嵌入块模块
- OCR 节点章节定界模块
- 章节选择 / 打开章节

章节定界补充：
- 真正 EXPORT_BOUNDARY 已在隔离 Playwright 工程端到端 1/1 PASS。
- 真实 Buffett 项目只执行非破坏性编号 / Undo-Redo / 保存重入 / 原样恢复；没有生成 9901/9902... 临时章节。

结论：
**本轮 ocr2md v2 迁移 / 私有云 / 外网真实 iPad 验收正式记为 100% 完成。**

里程碑标记：
`OCR2MD_V2_MIGRATION_ACCEPTED_100_PERCENT`

注意：
- “100%”指本轮产品迁移与验收范围全部完成，不等于仓库工作区已经提交。
- 当前 Git branch = gpt/codespaces-spike。
- 工作区仍包含本轮及此前积累的大量 tracked / untracked 修改，尚未执行 checkpoint commit。
- 下一工程动作应优先做一次受控 Git checkpoint：先审阅 status / diff 范围，确认不纳入临时测试目录和无关文件，再提交并推送；不要 reset / clean / rebase / force push。

### 13.53 2026-09-07 · REAL_IPAD 最后一张人工票通过；v2 迁移 / 验收 100% 封箱

真实 iPad 用户确认：
> 章节选择 / 打开章节：5/5 通过

真实设备桥最终同步确认：
- clientId = 04bb504a-7e75-43d8-8170-c5d76b46ed81
- viewport = 1032×642, DPR=2
- session = chapter-clean
- selectedChapter = 01 Buffett’s Alpha 副本
- activeReviewModule = 章节标题
- activeModuleRows = 10
- headingNumberingEnabled = true
- titleHeadingCount / titleExportHeadingCount / titleExportNumberedCount = 10 / 10 / 10
- annotationPairs = 10
- embedTotalRows / embedVisibleRows / embedGroupCount / embedUnassignedRows = 65 / 51 / 11 / 0
- illegalMergeDecisionCount / illegalMergeSpanCount = 6 / 6
- Undo / Redo = 0 / 0
- canSave = false
- workingLength = 63833
- revision = 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a
- lastFailure = null

章节定界最终安全核对：
- revision = 9958f7ea5f055965c3ae6a857fd548d053523892a93de8445751050113f3645d
- workingLength = 83258
- 一级标题 chapterFile 均为空
- 无 9901/9902... 临时章节目录

当前私有云：
- Helm revision 55
- Deployment 1/1 Ready
- image = ocr2md/v2:chapter-boundary-debug-20260907a

本轮真实 iPad 已封箱的主要功能 / 航点包括：
- 导航与数据表刷新
- 数据表深色主题与标题层级样式
- 三窗 Markdown / CSS / LaTeX / HTML 内容样式
- 源码 ↔ Markdown 预览双向滚动联动
- 源码 / 自定义 CSS / 正则搜索三个 tag
- 初始化工作稿
- 左右工作窗分割条
- 源码 / 预览水平分割条
- Markdown 预览
- 源码正则搜索
- Undo / Redo
- 修改工作稿文本
- 行类型：已忽略
- 保存标定 / 重入加载
- 数据表模块切换
- 数据表行定位源码
- 脏章节离开保护
- 非法断行模块
- 章节标题模块
- 注释模块
- 嵌入块模块
- 章节定界模块
- 章节选择 / 打开章节

结论：
**ocr2md v2 本轮迁移 / 私有云部署 / 自动化验收 / 真实 iPad 验收 = 100% 完成。**

里程碑状态：
- 产品迁移与验收：完成
- 私有云运行基线：完成
- 外网真实设备调试桥：完成并用于本轮验收
- 核心业务模块：全部真实设备验收通过
- 安全副本与定界工作稿：均恢复原 working / sidecar / revision，无调试残留

Git 说明：
- 当前 branch = gpt/codespaces-spike
- 工作区仍包含大量本轮及此前累积的已修改 / 未跟踪文件。
- 本条只代表产品 / 迁移 / 验收里程碑 100% 完成，不代表 Git 已形成干净 checkpoint。
- 未执行 reset / clean / rebase / force push / 自动提交，避免覆盖既有未提交工作。

推荐下一工程动作：单独做一次“Git checkpoint / 变更盘点”航点，先分类当前改动，再决定如何提交；不要把它混入本轮产品验收结论。

标记：
REAL_IPAD_CHAPTER_OPEN_OK
OCR2MD_V2_MIGRATION_ACCEPTANCE_100_OK

### 13.54 2026-09-07 · 100% 验收后的受控 Git checkpoint 门禁

在 `OCR2MD_V2_MIGRATION_ACCEPTED_100_PERCENT` 后执行受控 checkpoint 审计。

提交前仓库状态：
- branch = gpt/codespaces-spike
- upstream = origin/gpt/codespaces-spike
- checkpoint 前 ahead / behind = 0 / 0
- 本轮包含此前积累的 core / integration / v2 / private-cloud deployment / tests / memo 修改。

提交卫生：
- ui-spikes/v2/.tmp、dist、node_modules 已忽略。
- 新增 ui-spikes/v2/__pycache__/ 与 *.pyc ignore，删除 Python cache。
- staged 无 node_modules / dist / .tmp / __pycache__ / test-results / playwright-report / *.pyc / *.log。
- staged 无 >1MB 文件。
- 候选文件敏感词扫描唯一命中为 web/googleIdentityTokenSession.ts 的 accessToken 代码字段名，不是凭据。

fixture 特别说明：
- ui-spikes/v2/fixtures/buffett-alpha/source.md / working.md 是带绝对 offset 的字节级测试基线。
- 曾尝试移除行尾空格时发现 working 从 63833 字符降到 63729，会破坏 sidecar offset，立即停止。
- 从首次 stage 写入的 Git blob 精确恢复原始 fixture：
  - source 原 blob = 4b6a1cd938b7c00a3a798326294779b78ecb3782
  - working 原 blob = 5a5e5c67c5ccc30500458c0cd5e90bfdf28c870f
- 机械验证：仅去掉候选原 blob 的 trailing spaces 后逐字节等于临时清理版，确认恢复对象无误。
- 恢复后 working = 63833 字符，与真实安全副本基线一致。
- 新增 .gitattributes：ui-spikes/v2/fixtures/buffett-alpha/*.md -whitespace，说明这组 fixture 的 trailing spaces 属于 offset 数据，不参与 git whitespace error。
- staged `git diff --check` PASS。

最终提交前测试：
- 根 `npm test`：PASS，核心 compile / web typecheck / 33 个逻辑测试链全部通过。
- ui-spikes/integration `npm run test:regression`：17/17 PASS。
- v2 最终专项、私有云 smoke、真实 iPad 人工验收已在 13.53 前全部通过。

当前产品部署保持：
- Helm revision 55
- image ocr2md/v2:chapter-boundary-debug-20260907a
- Deployment 1/1 Ready
- 真实 iPad final clean / 0/0 / canSave=false / lastFailure=null。

下一动作：创建并推送 100% v2 migration checkpoint commit；禁止 reset / clean / rebase / force push。

### 13.55 2026-09-07 · 迁移范围补漏：变动行模块；M1 数据契约完成

在 v2 迁移 100% checkpoint 之后重新对照旧 integration 产品，确认章节清洗模块遗漏了正式的“变动行”审计模块。

范围修正：
- 不推翻 `OCR2MD_V2_MIGRATION_ACCEPTED_100_PERCENT` 的历史事实；该标记表示当时列入迁移验收范围的项目全部通过。
- 新发现的遗漏属于 scope correction：旧产品已有“变动行”，但未被纳入 v2 迁移清单。
- 已封箱的章节定界 / 章节标题 / 注释 / 嵌入块 / 非法断行等模块不重新验收。
- 先补齐“变动行”六个航点，再进入“章节清洗 → trans → 翻译”新产品里程碑。

变动行六航点：
1. M1 数据契约
2. M2 正式模块入口与表格
3. M3 源码定位与删除语义
4. M4 归属模块联动
5. M5 实时刷新与未读提醒
6. M6 功能调试 / 私有云 / 真实 iPad 封箱

M1 已完成：
- 新增 `ui-spikes/v2/src/changedLineAudit.ts`。
- 直接复用核心 `scanChapterBoundaryLines(original, working)`；没有另写第二套行级 diff。
- 派生数据完全只读，不写 sidecar。
- 数据契约包含：
  - 0-based 变动位置；
  - 新增 / 修改 / 删除；
  - working 内容；
  - original 内容；
  - 归属模块；
  - 删除行不可定位 working 的语义。
- 当前归属候选：
  - 章节标题
  - 注释
  - 嵌入块
  - 非法断行
  - 未归类
- 继承旧 integration 的关键保护：
  - 同一物理行上的模块候选只有在实际修改字符与候选范围重叠时才认领“修改”；
  - 自动非法断行候选只是建议，不得吞掉真实正文 diff；
  - 只有人工 working correction 才可认领非法断行变动；
  - 已忽略候选不认领变动。
- `deriveWorkspaceView()` 已接入实时派生：
  - changedLineRows
  - changedLineCount
  - changedLineAddedCount
  - changedLineModifiedCount
  - changedLineDeletedCount
  - changedLineUnclassifiedCount
- Save 不清空变动行：比较基准始终是 immutable original，而不是上次保存。
- Undo 回到先前 working 时，变动行同步恢复。

M1 专项：
- 新增 `tests/changedLineAudit.test.ts`。
- `npm run test:changed-lines` PASS。
- `npm run test:machine` PASS。
- v2 typecheck PASS。
- v2 build PASS。
- `git diff --check` PASS。

M1 私有云 smoke：
- image = `ocr2md/v2:changed-lines-m1-20260907a`
- Helm revision = 56
- Deployment = 1/1 Ready
- stable local entry `http://127.0.0.1:4176/` → HTTP 200
- project = Bufett’s Alpha
- catalog = 7 chapters / 5 ready

M1 没有可见 UI 变化，因此不要求真实 iPad 人工验收。

变动行补迁航路进度：
- M1 = 完成
- 总进度 = 1/6 = 16.7%
- 下一航点 = M2 正式“变动行”模块入口 + 五列表格

### 13.56 2026-09-07 · 变动行 M2 自动化 / 私有云完成，真实 iPad 待前台验收

M2 目标：
- 章节清洗正式出现“变动行”模块；
- 五列表格：行号 / 变动 / 归属模块 / 变动内容 / 原稿内容；
- 只读审计，不允许通过表格修改 lineType；
- 普通章节显示，OCR 章节定界隐藏；
- 本航点不实现点击定位与删除行特殊交互（留给 M3）。

实现：
- src/types.ts 将“变动行”加入 ModuleName。
- workspaceMachine.ts 将“变动行”加入正式章节模块集合；activeModuleRows 对该模块使用完整 changedLine audit 数量。
- index.html 恢复正式“变动行”模块 tab。
- calibrationGrid.ts 增加变动行五列只读 projection。
- app.ts 在变动行模块使用 changedLineAuditCandidates() 派生 grid rows。
- changedLineAudit.ts 增加只读 grid candidate adapter，不写 sidecar。
- debug bridge ALLOWED_REVIEW_MODULES 增加“变动行”。

M2 期间发现并修正一个生产数据契约缺口：
- v2 PersistentChapterRepository 此前把 workingText 同时作为 originalText，真实产品中的 working-vs-original diff 因而会恒为 0。
- dev_server.py 现在返回 immutable original：
  1. 优先同目录 <章节>.md；
  2. 安全副本缺同目录 original 时，根据 sidecar sourceFile 在当前项目 chapters 内解析原章节；
  3. 都不可用时才兼容回退 working。
- 其它已封箱模块仍继续用 working 作为 refresh baseline；这次修正只为变动行提供 immutable original，不改变章节标题 / 注释 / 嵌入块 / 非法断行既有扫描行为。

自动门禁：
- changedLineModule Playwright：2/2 PASS。
- reviewModules + navigationContext + workspaceUi 相关回归：5/5 PASS。
- changedLineAudit、workspaceMachine、typecheck、build、DOM contract 均 PASS。
- git diff --check PASS。
- dev_server.py py_compile PASS。

私有云：
- image = ocr2md/v2:changed-lines-m2-20260907b
- Helm revision = 58
- Deployment = 1/1 Ready
- workspace = Bufett’s Alpha
- stable local entry = http://127.0.0.1:4176
- NodePort = 30418

真实 Buffett 非破坏性 4176 smoke：
- 01 Buffett’s Alpha
  - originalLength = 67154
  - workingLength = 67160
  - original != working
  - originalPath = /data/Bufett’s Alpha/chapters/01 Buffett’s Alpha/01 Buffett’s Alpha.md
- 01 Buffett’s Alpha 副本
  - originalPath 正确回落到原章节 01 Buffett’s Alpha.md
  - workingLength = 63833
  - original != working
- UI：
  - state = chapter-clean
  - module = 变动行
  - rows = 7
  - review status = 变动行 · 7 行
  - canSave = 否
  - AG Grid aria-colcount = 5
  - iPad 宽度下前四列表头直接可见；横向滚动后“原稿内容”可见。

稳定入口结构确认：
- 4176 = preview_server.py
- static = 当前工作树 ui-spikes/v2
- workspace target = http://127.0.0.1:30418
- debug target = http://127.0.0.1:4183
- 4183 debug bridge 已重启到当前代码；“变动行”远程模块命令白名单已生效。

当前仅剩真实 iPad 最终 UI 验收：
- debug bridge 重启后尚无真实 iPad 客户端重新报到，说明页面当前处于后台 / 已关闭。
- 不要求截图；只需真实 iPad 页面重新前台/刷新后，直接读取桥状态完成验收。

变动行补迁航路：
- M1 = 完成
- M2 = 自动化 + 私有云完成，真实 iPad 待验收
- 总进度仍按已到达航点计 = 1/6 = 16.7%

### 13.57 2026-09-08 · Cross-Conversation Goal Handoff / 低回显规则

当前变动行补迁不新建第二条同类航路，继续使用既有 Goal：
- Task ID = tsk_d0f171b506caec01
- Title = 迁移变动行模块
- 航路 = M1 数据契约 → M2 正式模块入口与表格 → M3 源码定位与删除语义 → M4 归属模块联动 → M5 实时刷新与未读提醒 → M6 功能调试 / 私有云 / 真实 iPad 封箱

跨对话执行规则与 agent-trading-lab 对齐：
- Goal checkpoint / completed steps / current step 是跨对话权威执行状态；ENGINEERING_MEMO.md 是工程证据与接手说明的权威文本状态。
- 不需要用户介入的航段默认采用静默 Goal 模式持续推进，不因对话回显本身暂停。
- 只在以下情况报告：
  1. 航点真正完成；
  2. 重大问题或新的产品缺陷；
  3. 安全停机；
  4. 必须人工决策；
  5. 真实 iPad / 视觉验收确实需要用户介入。
- 普通专项测试、构建、镜像、Helm、私有云 smoke、诊断与无风险修复不逐项回显。
- 不展开长篇推理过程。
- 航路进度只按已完成航点计，不按“代码做到哪里”提前计票。
- 固定进度格式：
  - 进行中：🟡 航路进行中｜当前进度：X / 6｜当前航点：...｜下一航点：...
  - 完成：🟢 航路已完成｜当前进度：6 / 6
  - 阻塞：🔴 航路阻塞｜当前进度：X / 6｜问题：...
  - 需人工：🟠 需要人工决策｜当前进度：X / 6｜事项：...
- 子任务 / smoke / 单项测试禁止单独显示裸 100%，避免与总航路混淆。

当前正式进度仍为 1 / 6；工程实现已推进至 M6 收口，但 M2–M6 尚未满足完整正式验收条件，因此不提前标记 completed。

### 13.58 2026-09-08 · 变动行 M2–M5 consolidated PASS；M6 私有云 5/5 PASS

在修正 stale 候选对新增正文的 owner 误认领后，重新执行变动行整条邻接门禁与私有云封箱。

关键缺陷修复：
- refresh 后若旧候选无法可靠重定位，可能暂时保留 `range line=0/start=0/end=0`；此前新增 diff 只按行范围认领 owner，导致第 0 行普通新增正文被旧注释候选误认领。
- `changedLineAudit.ts` 现规定：added change 除行范围外，候选 raw/preview 必须真实出现在新增文本中（或新增文本被候选真实包含）才允许认领。
- 同样保护章节标题 added owner，避免 stale 标题只靠行号吞普通正文。
- 反向验证：普通新增正文仍为 `新增 / 未归类`；真实新增注释仍归 `注释`；真实 `>` 新增嵌入行仍归 `嵌入块`。

本地 / Playwright consolidated gate：
- `npm run test:changed-lines` PASS。
- `npm run test:machine` PASS。
- v2 typecheck PASS。
- v2 build PASS。
- `changedLineLocate.spec.ts` PASS。
- `changedLineModule.spec.ts` 2/2 PASS。
- `changedLineNotice.spec.ts` PASS。
- `changedLineRealtime.spec.ts` PASS。
- `featureDebugChangedLine.spec.ts` PASS。
- 组合 Playwright = 6/6 PASS。
- `git diff --check` PASS。
- `dev_server.py` py_compile PASS。

当前私有云：
- Helm revision = 63
- image = `ocr2md/v2:changed-lines-m6-20260908b`
- Deployment = 1/1 Ready

4176 + 真实 Buffett PVC 功能调试：
- 安全副本 = `01 Buffett’s Alpha 副本`
- 功能调试 = `变动行模块功能调试 · 5/5 通过`
- 步骤：
  1. 基线 41 条完整 diff / 5 列 / clean 0/0；
  2. 正式 working 临时修改 → 新 diff + +N；
  3. 访问后清 +N，Undo 回 41，Redo 再产生 +N；
  4. Save / 重入后临时 diff 持久化，且 Save 不清 working↔original 审计；
  5. 安全清理恢复原 41 条 / 63833 / sidecar / revision / clean 0/0。
- 调试前后逐项核对：
  - workingLength = 63833 → 63833
  - revision = `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a` → 同值
  - working + sidecar + revision exact restored = true
  - final module = 变动行
  - final rows = 41
  - Undo / Redo = 0 / 0
  - canSave = 否
  - JS errors = 0
  - request failures = 0

航点结论：
- M2 正式模块入口与表格：PASS
- M3 源码定位与删除语义：PASS
- M4 归属模块联动：PASS
- M5 实时刷新与未读提醒：PASS
- M6 自动化 / 私有云：PASS；仅剩真实 iPad 最终封箱票

正式航路进度更新为 5 / 6；下一航点仅剩 M6 真实 iPad 封箱。

### 13.59 2026-09-08 · 变动行补迁航路 6/6 完成 · 真实 iPad 最终封箱

用户在真实 iPad Safari 刷新正式外网入口后，device bridge 识别到当前页面：
- client = `04bb504a-7e75-43d8-8170-c5d76b46ed81`
- pageLoadedAt = `2026-09-08T01:56:41.841Z`
- viewport = 1032 × 642
- devicePixelRatio = 2
- project = `Bufett’s Alpha`
- 初始 session = idle

正式私有云版本：
- Helm revision = 63
- image = `ocr2md/v2:changed-lines-m6-20260908b`
- Deployment = 1/1 Ready

真实 iPad 最终 smoke 全部通过，走正式产品命令/XState/Grid 路径，不使用 debug-only 业务捷径：
1. `open-chapter(01 Buffett’s Alpha 副本)`
   - chapter-clean
   - workingLength = 63833
   - revision = `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`
2. `select-review-module(变动行)`
   - activeReviewModule = 变动行
   - activeModuleRows = 41
   - canSave = false
3. `focus-first-calibration`
   - focused row = `change-audit-chapter-change-12772c5caf11-5`
   - focusedSourceLine = 6
4. `edit`
   - workingLength 63833 → 63834
   - changed rows 41 → 42
   - undoDepth = 1
   - canSave = true
   - 持久化 revision 未改变
5. `undo`
   - workingLength = 63833
   - changed rows = 41
   - undo/redo = 0/1
   - chapter-clean
6. `redo`
   - workingLength = 63834
   - changed rows = 42
   - undo/redo = 1/0
7. final `undo`
   - workingLength = 63833
   - changed rows = 41
   - canSave = false
   - revision 精确回原值
8. `close`
   - session = idle

最终正式 4176 → k3s/PVC 重读安全副本：
- workingLength = 63833
- sidecar 与验收前逐项相同
- revision = `409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a`
- working + sidecar + revision exact restored = true

结合此前已经通过的删除行专项、owner 契约、+N notice、保存重入与私有云功能调试 5/5，本次真实 iPad smoke 完成 M6 最终物理设备封箱。

变动行补迁航路最终状态：
- M1 数据契约 = PASS
- M2 正式模块入口与五列表格 = PASS
- M3 源码定位与删除语义 = PASS
- M4 归属模块联动 = PASS
- M5 实时刷新与未读提醒 = PASS
- M6 功能调试 / 私有云 / 真实 iPad 封箱 = PASS

固定进度：6/6。

章节清洗正式模块集合现为：
- 章节标题
- 注释
- 嵌入块
- 非法断行
- 变动行

下一产品里程碑恢复原规划：`章节清洗 → trans → 翻译`。翻译阶段优先复用现有 translation core / hidden compat bones，不重新发明翻译架构。

### 13.60 2026-09-08 · 数据表列顺序微调：注释号 / 组号移到预览左侧

用户要求把注释模块的“注释号”和嵌入块模块的“组号”放到预览列左边。

最终列顺序：
- 注释：行号 → 行类型 → 配对状态 → 注释号 → 预览
- 嵌入块：行号 → 行类型 → 组号 → 预览

实现：
- 仅修改 `CalibrationGrid.columnOrder()` 与嵌入块 `embedNumber` 的 pin 行为；业务状态、working、sidecar、Undo/Redo、保存语义均未改变。
- 模块切换时显式重置 AG Grid pin state，避免旧模块 pin 状态污染新模块视觉顺序。

验证：
- v2 build PASS
- typecheck PASS
- reviewModules / annotationModule / embedModule 合计 5/5 PASS
- git diff --check PASS
- 4176 私有云 smoke：注释与嵌入块视觉 header 顺序与上述目标完全一致；state=chapter-clean，canSave=否。
- image = `ocr2md/v2:grid-column-order-20260908a`
- Helm revision = 64
- Deployment = 1/1 Ready

当前仅剩真实 iPad 刷新后的视觉确认；此为 UI 微调，不影响已完成的“迁移变动行模块”6/6 Goal。

### 13.61 2026-09-08 · 数据表统一呈现：组号靠前 + 组号/行号默认顺序

按最新统一规则收敛注释 / 嵌入块数据表，仅修改 CalibrationGrid 呈现层，不改 XState、working、sidecar、Undo/Redo 或保存语义。

最终列序：
- 注释：行号 → 行类型 → 注释号 → 预览 → 配对状态
- 嵌入块：行号 → 行类型 → 组号 → 预览

统一排序：
- 只要表中存在组号语义列（注释的“注释号”、嵌入块的“组号”），默认展示顺序固定为：组号升序 → 行号升序。
- 组号在 UI 中编辑变化后立即重新投影排序；例如注释号 1 改成 99，该行实时离开第 1 组，不等保存/重入。
- 为避免 AG Grid 稳定 row-id 保留旧节点顺序，仅当 group/line 排序签名变化时清空并重建 grouped row projection；普通状态更新不重建。

验证：
- v2 build PASS
- typecheck PASS
- annotationModule / reviewModules / embedModule 合计 5/5 PASS
- git diff --check PASS
- 安全副本运行时探针：注释号 1→99 后第 1 行变为剩余 group=1 / line=363，实时排序正确；随后 Undo 恢复且未保存。
- 4176 私有云 smoke：
  - 注释首列可见：行号 / 行类型 / 注释号 / 预览；前 6 行 group = 1,1,2,2,3,3，组内行号升序。
  - 嵌入块：行号 / 行类型 / 组号 / 预览；前 7 行 group = 1,1,1,2,2,2,2，组内行号升序。
  - state = chapter-clean，canSave = 否。
- image = ocr2md/v2:grid-group-order-20260908a
- Helm revision = 65
- Deployment = 1/1 Ready

此项为已完成“迁移变动行模块”Goal 6/6 之后的表格呈现微调，不重开旧 Goal。

### 13.62 2026-09-08 · 新航路规划：表格呈现配置化

Goal：
- Task ID = tsk_81cea0ebbc8e6429
- Title = 表格呈现配置化
- 固定进度口径 = 当前/总量
- 初始进度 = 0/4
- 默认执行方式 = 静默 Goal；仅航点完成、重大问题、安全停机、必须人工决策或真实 iPad 验收时报告。

目标：
把章节清洗数据表的列序、默认排序、列宽、隐藏、pinned 等“怎么显示”从 CalibrationGrid 代码中剥离成项目级配置，并在源码窗新增“表格配置”标签，像自定义 CSS 一样可编辑、校验、保存和热更新。业务语义继续由程序负责。

边界：
- 配置只控制 presentation，不控制 semantics。
- 不允许配置改变行属于哪个模块、注释号/组号如何生成、删除/忽略语义、源码定位、XState、working、sidecar、Undo/Redo、章节保存。
- 配置编辑自身不得把章节置 dirty，也不得进入章节 Undo/Redo。
- 源码窗保留 4 个标签：源码 / 自定义 CSS / 表格配置 / 正则搜索。

航点：
M1 配置契约与持久化边界
- 定义项目级 Table Presentation Config schema。
- 至少支持 columns/order、defaultSort、width/minWidth/flex、hidden、pinned。
- 配置用人可读的列名/模块名，内部映射稳定 colId。
- 缺失配置回退内置默认；非法配置保留 last-known-good，并显示错误。
- 持久化优先复用自定义 CSS 的项目级配置链路，不另造第二套无必要存储系统。

M2 源码窗“表格配置”标签与热更新
- 增加第 4 个标签“表格配置”。
- CodeMirror 编辑 JSONC/等价人可读配置。
- 有效配置 debounce 后即时应用，无需 build/刷新。
- Save 单独落盘；Reset 恢复默认。
- 配置错误定位到行/列，不破坏当前已生效表格。

M3 CalibrationGrid 配置驱动与现有模块迁移
- CalibrationGrid 不再为各模块硬编码列序/默认排序。
- 章节标题 / 注释 / 嵌入块 / 非法断行 / 变动行迁移到同一 presentation contract。
- 注释默认：行号 → 行类型 → 注释号 → 预览 → 其他；sort = 注释号 → 行号。
- 嵌入块默认：行号 → 行类型 → 组号 → 预览 → 其他；sort = 组号 → 行号。
- “有组号列的，组号优先 + 行号次级”成为配置默认，而非业务代码特例。
- 保留用户手工点击表头排序能力；重新进入模块恢复配置默认。

M4 自动化 / 私有云 / 真实 iPad 封箱
- schema/fallback/last-known-good 单测。
- UI 热更新/保存/重入/Reset/非法配置测试。
- 现有模块表格回归。
- 功能调试新增“一键表格配置”任务，能改配置 → 验证即时变化 → 恢复 baseline。
- 私有云部署 smoke。
- 真实 iPad 验收源码窗 4 标签、热更新、重入持久化与无章节 dirty。
- 最终 Git checkpoint。

完成条件：
1. 源码窗 4 标签完整。
2. 表格配置只改呈现，不触碰业务语义。
3. 缺失/非法配置安全回退。
4. 修改配置无需重新构建即可看到效果。
5. 现有章节清洗模块统一迁移。
6. 配置编辑不污染章节 dirty/Undo。
7. 自动化、私有云、真实 iPad 全通过。

### 13.63 2026-09-08 · 表格呈现配置化 M1 完成

M1 配置契约与持久化边界完成：
- 新增 `ui-spikes/v2/src/tablePresentationConfig.ts`。
- 配置 version=1；模块使用人可读中文名，列使用人可读列名，内部解析到稳定 colId。
- 支持：columns/order、sort（asc/desc）、columnStyles.width/minWidth/flex/hidden/pinned。
- 缺失模块/缺失列自动补内置默认；未知模块/未知列/非法样式/非法 JSON 明确报错。
- 内置默认覆盖：章节标题 / 注释 / 嵌入块 / 非法断行 / 变动行 / 章节定界 / 翻译。
- 注释默认 sort = 注释号 → 行号；嵌入块默认 sort = 组号 → 行号。
- 配置契约不含任何业务动作或状态字段，presentation/semantics 边界已锁定。
- 新增 `test:table-config`，契约单测 PASS；typecheck PASS；git diff --check PASS。

下一航点 M2：源码窗“表格配置”标签 + 项目级持久化 + last-known-good 热更新。

### 13.64 2026-09-08 · 表格呈现配置化 M2 完成

M2 源码窗“表格配置”标签与热更新完成：
- 源码窗现有 4 个 tag：源码 / 自定义 CSS / 表格配置 / 正则搜索。
- 新增项目级配置 API：GET/POST `/__workspace/table-presentation`。
- 配置存储：项目根 `.ocr2md/table-presentation.json`；4176 代理链路复用 workspace upstream，不另造本地存储旁路。
- 有效配置 150ms debounce 后即时应用，无需 build/刷新；Save 单独保存项目配置；Reset 恢复默认并保存。
- 非法 JSON/非法 schema 不应用，继续保留 last-known-good；JSON 解析错误显示行/列位置。
- 配置编辑与保存不触发章节 dirty，不进入章节 Undo/Redo。
- `tablePresentationEditor.spec.ts`：热更新 → 非法配置保护 → 保存 → reload 重入保持 → Reset，全流程 PASS。
- build/typecheck/diff-check PASS。

下一航点 M3：清理 CalibrationGrid 内剩余的 presentation hard-code，并对全部章节清洗模块做统一契约回归。

### 13.65 2026-09-08 · 表格呈现配置化 M3 完成

M3 CalibrationGrid 配置驱动与现有模块迁移完成：
- CalibrationGrid 持有 resolved presentation config；模块列 order / width / minWidth / flex / hidden / pinned / default sort 均从配置投影。
- 业务 cell renderer、行类型修改、注释号语义、源码定位、删除/忽略等继续由代码负责，不进入配置。
- 默认排序由 presentation sort rules 统一执行，不再依赖 annotation/embed 的业务特例。
- 稳定 row-id 下仅当配置排序签名或排序键变化时重建 row projection，避免 AG Grid 保留旧节点顺序。
- 注释默认：行号 → 行类型 → 注释号 → 预览 → 配对状态；sort=注释号→行号。
- 嵌入块默认：行号 → 行类型 → 组号 → 预览；sort=组号→行号。
- 章节标题 / 非法断行 / 变动行 / 章节定界 / 翻译均进入同一 presentation contract，并保留默认 fallback。

验证：
- test:table-config PASS。
- typecheck / build / DOM contract PASS。
- annotation / changed-line / chapter-title / embed / illegal-break / review modules broad regression 均 PASS。
- sourcePaneTabs 的唯一失败是旧测试仍期待 3 个标签；更新为 4 标签契约后，与 tablePresentationEditor focused rerun 2/2 PASS。
- 表格配置变化不改变章节 dirty / Undo / Redo。

下一航点 M4：一键“表格配置”功能调试、私有云部署 smoke、真实 iPad 封箱。

### 13.65 2026-09-08 · 表格呈现配置化 M3 完成

M3 CalibrationGrid 配置驱动与现有模块迁移完成：
- CalibrationGrid 中列序、默认排序、width/minWidth/flex/hidden/pinned 已由 tablePresentationConfig.ts 统一驱动。
- 删除旧 columnOrder() 硬编码；列定义只保留字段语义、header/cell renderer/value getter/comparator 等业务展示能力。
- presentation 默认覆盖：章节标题 / 注释 / 嵌入块 / 非法断行 / 变动行 / 章节定界；翻译兼容骨架也已纳入契约。
- 注释默认 = 行号 → 行类型 → 注释号 → 预览 → 配对状态；sort = 注释号 → 行号。
- 嵌入块默认 = 行号 → 行类型 → 组号 → 预览；sort = 组号 → 行号。
- 自定义配置已实际验证列序、desc 排序、hidden、width、pinned；reload 后仍保持；Reset 回默认。
- 配置默认排序使用表格投影层，不改变 Candidate / XState / working / sidecar。
- 组号或行号排序键变化时只重建 presentation row projection，业务对象不变。
- 修复一次清理 columnOrder() 时误带 helper 的局部编辑，使用当前 HEAD 只取回 helper，无 reset/clean/rebase。

回归门禁：
- build PASS
- typecheck PASS
- chapterBoundary / chapterTitle / annotation / embed / reviewModules / changedLine / sourcePaneTabs / tablePresentationEditor 合计 12/12 PASS
- git diff --check PASS

下一航点 M4：一键功能调试 + 全量专项 + 私有云部署 + 真实 iPad 封箱。

### 13.66 2026-09-08 · 表格呈现配置化 M4 自动化 / 私有云通过，真实 iPad 待封箱

M4 自动化门禁：
- test:table-config PASS
- typecheck PASS
- build PASS
- DOM contract PASS（ids=112）
- dev_server.py py_compile PASS
- sourcePaneTabs / tablePresentationEditor / featureDebugTableConfig / reviewModules / annotationModule / embedModule / chapterTitleModule / changedLineModule / chapterBoundary 合计 13/13 PASS
- git diff --check PASS

私有云部署：
- image = ocr2md/v2:table-config-20260908a
- Helm revision = 66
- Deployment = 1/1 Ready

私有云第一次 4176 一键功能调试暴露一个代理层问题：
- 当项目基线不存在 table-presentation.json 时，安全恢复需要 DELETE `/__workspace/table-presentation`；
- k3s workspace API 已支持 DELETE，但 4176 preview_server 只代理 GET/HEAD/POST，导致最后一步恢复失败；
- 章节 working / sidecar / revision 全程未受影响且精确恢复；临时配置随后人工用新 DELETE 路径清除。

修复：
- preview_server.py 新增 do_DELETE，仅复用既有 `_proxy()`，不新增业务逻辑。
- 重启 4176 preview server；DELETE 代理 smoke PASS。

修复后 4176 + 真实 Buffett PVC 功能调试：
- 表格配置功能调试 = 5/5 通过
- source tabs = 源码 / 自定义 CSS / 表格配置 / 正则搜索
- active module = 注释
- chapter = clean，Undo/Redo = 0/0，Save disabled
- 热更新 / 非法配置 last-known-good / 保存重载 / 精确恢复全通过
- chapter working + sidecar + revision exact restored = true
- project table config baseline exists=false → 调试后仍 exists=false，exact restored = true
- JS errors = 0

当前 M4 只剩真实 iPad 最终封箱票。

### 13.66 2026-09-08 · 表格呈现配置化 M4 自动化 / 私有云门禁完成，真实 iPad 待封箱

自动化最终门禁：
- test:table-config PASS。
- typecheck PASS。
- build PASS。
- Playwright 14/14 PASS：
  - sourcePaneTabs
  - tablePresentationEditor
  - featureDebugTablePresentation
  - chapterTitleModule
  - annotationModule
  - embedModule
  - illegalLineBreakModule
  - changedLineModule
  - reviewModules
  - chapterBoundary
- git diff --check PASS。
- dev_server.py py_compile PASS。

一键“表格配置”功能调试：
- 5/5 PASS。
- 覆盖：基线 → 热更新列序 → 非法配置 last-known-good → 保存/重载 → 原项目配置恢复。
- 全程章节 chapter-clean、Undo/Redo=0/0、canSave=否。
- 调试入口新增“表格配置”。

私有云：
- Helm revision = 66。
- image = ocr2md/v2:table-config-20260908a。
- Deployment = 1/1 Ready。
- stable entry = http://127.0.0.1:4176。
- 4176 真实 PVC 一键调试 = 5/5 PASS。
- 源码窗 4 tab = 源码 / 自定义 CSS / 表格配置 / 正则搜索。
- JS page errors = 0；request failures = 0。
- 串行 smoke 调试前后 .ocr2md/table-presentation.json 的 exists/source 精确一致。

封箱期间曾观察到一次“调试 UI 报 5/5、但项目配置被删除”的异常：
- 根因不是单次产品流程，而是前一轮停止回显后仍有多个先后启动的 headless 封箱客户端，其清理阶段发生重叠，旧客户端按自己的 baseline 回写/删除配置。
- 立即用调试前独立快照恢复项目配置，恢复校验 true。
- 清理并确保单一客户端后重新跑完整 4176 smoke，exactRestored=true。
- 后续工程规则：共享真实 PVC 的 destructive/restore 类 Feature Debug 必须串行，不并发启动多个自动封箱客户端。

当前 M4 仅剩真实 iPad 前台刷新后的最终视觉/物理设备验收。

### 13.67 2026-09-08 · 表格呈现配置化 M4 真实 iPad 封箱完成

真实 iPad 最终验收：
- client = 04bb504a-7e75-43d8-8170-c5d76b46ed81
- pageLoadedAt = 2026-09-08T03:41:26.329Z
- viewport = 1032 × 642
- devicePixelRatio = 2
- visibility = visible
- bridgeVersion = 2
- focused = true

刷新后项目级测试配置已清理，/__workspace/table-presentation：
- exists = false
- source = null
- 因此页面回退内置默认配置。

真实 iPad 打开安全副本并进入“注释”后：
- session = chapter-clean
- activeModuleRows = 20
- undoDepth = 0
- redoDepth = 0
- canSave = false
- revision = 409011a882c808a17a4c6ffd9f31e62826036a86aa5f1fbe01a292b43aae751a
- 实际可见列序 = 行号 → 行类型 → 注释号 → 预览（配对状态在横向右侧）
- 与内置默认契约一致。

此前同一真实 iPad 已验证项目级配置重入后会实际改变列序：
- 注释号 → 行号 → 预览 → 行类型 → 配对状态
- 且章节仍保持 clean / Undo 0 / Redo 0 / canSave=false。
因此真实设备上的“项目配置持久化 → 刷新重入 → 表格投影变化”链路成立。

验收后通过远程正式命令 close，iPad 最终：
- session = idle
- undoDepth = 0
- redoDepth = 0
- canSave = false

设备桥记录到 image-5.png 资源失败；该资源是 Buffett Alpha fixture 正文既有 Markdown 图片引用，和表格配置功能无关，不作为本航路阻塞。

M4 完成条件已满足：
- 自动化门禁 14/14 PASS
- 一键“表格配置”功能调试 5/5 PASS
- 私有云 Helm revision 66 / image ocr2md/v2:table-config-20260908a / 1/1 Ready
- 4176 串行 smoke exactRestored=true
- 真实 iPad 热配置重入、默认回退、章节 clean 状态均通过

表格呈现配置化航路最终状态：4/4。

### 13.68 2026-09-08 · 表格配置 JSON 语法高亮补齐

问题：
- “表格配置”使用 CodeMirror 与现有 Obsidian HighlightStyle，但此前未挂 JSON language parser，因此只有编辑器外壳，没有 token 级着色。

修复：
- 新增 @codemirror/lang-json 依赖。
- TablePresentationEditor extensions 加入 json()。
- 继续复用 obsidianSyntaxHighlight，因此 property/string/number/punctuation 与源码/CSS 编辑器保持同一套色彩变量。

验证：
- typecheck PASS。
- build PASS。
- tablePresentationEditor Playwright PASS。
- 4176 运行时 DOM 颜色探针：
  - property "version" = rgb(167, 192, 128)
  - number 1 = rgb(219, 188, 127)
  - punctuation = rgb(154, 167, 157)
- 私有云 Helm revision = 67。
- image = ocr2md/v2:table-config-json-highlight-20260908a。
- Deployment = 1/1 Ready。

此项仅补编辑器 language/highlight 层，不改变表格配置 schema、热更新、保存或业务状态。
