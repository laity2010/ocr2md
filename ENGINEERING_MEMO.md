# ocr2md 工程备忘录

> **用途**：这是新对话 / 新开发会话的接手清单。先读本文件，再动代码。
> **更新原则**：只记录“忘了会走错路线、覆盖工作、重复踩坑”的稳定事实；README 负责产品/模块说明，Git 历史负责变更日志。
> **最近整理**：2026-09-04

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
