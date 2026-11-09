# TR12 标题折叠实现违规记录（2026-11-09）

## 事件与证据

- **引入提交**：`827c88adf99c43d4874e13be75a405f2d7ed742f`，`feat(translation-lab): opt-in sentence IDs and heading-only preview outline`。
- **范围**：校译 Lab 左侧单语 Markdown HTML 预览。Main、CMD 原文、分句表和译文 JSON 未修改。
- **不合规点**：在没有先排查已存在的可复用折叠能力与模块公开 API 的情况下，在 `ui/translation-review-reader-pane.js` 新增 `buildHeadingOutline` / `applyHeadingOutline` / `setHeadingOutline` / `toggleHeadingSection`、`outlineOwners` / `expandedHeadings` 自行维护折叠状态，并以 `ui/translation-review.css` 的 `display:none!important` 和额外 pointer/click/keydown 逻辑模拟交互。此实现虽通过功能回归，却偏离 `AGENTS.md` §3 的简化和复用导向、§6 的模块接口边界审查要求。
- **既有能力**：项目 Main 的 `ui/obsidian-callouts.js` 已用 HTML 原生 `<details>/<summary>` 负责折叠；CM6 的 `foldGutter`、`foldService` 是**编辑器**折叠扩展，不适用于左侧使用 `renderMarkdown` 渲染的 HTML 预览，不能为了调用 CM6 折叠而改变左窗为源码编辑器。
- **发现机制**：用户质疑实现来源并明确要求记录违规、回退重做，属于审计确认项；此前的 Chrome/WebKit 功能 PASS 不等于架构合规。

## 处置

1. 保全 `827c88a` Git 历史，不 `reset --hard`、不删除已通过验收的「句子编号」checkbox、双语句 ID、注释及第 225 行回跳修复。
2. **单独提交定向回退**：撤除自制标题折叠状态机及样式，保留句 ID 开关；不将这个中间状态发布给用户。
3. **独立提交重做**：抽取可复用的 Markdown HTML 标题分节展示 API，折叠和键盘/触摸状态由浏览器原生 `<details>/<summary>` 管理；句 ID、源行号及 Main 媒体原 DOM 保持唯一，不复制正文、不修改 Clean MD。
4. 重验 402 句、19 标题、18 图片、41 公式、7 callout、句 ID、脚注、分句/译文互定位、225|p5b2 旧故障，并验证公开 API 的独立测试及 Chrome/iPad WebKit 内外网实测。失败则先修复，不把“已通过功能测试”写成架构审计 PASS。

## 预防重犯

今后的 UI 折叠需求，动工前先识别目标是 CM6 文本视图还是 Main HTML 阅读视图，再查已有折叠组件及其 API。优先复用；只有缺失不可替代的显示适配时才写最小可复用适配层，且必须先声明契约并写独立测试。此记录属于工程审计事实，不新增或替代 `AGENTS.md` 的正式规范。
