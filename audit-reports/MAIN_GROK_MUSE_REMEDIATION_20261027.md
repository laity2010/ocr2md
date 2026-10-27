# OCR2MD V6 · Grok × Muse 双独立审计收尾及下一轮基线

## 致谢

- 🌺 **Grok 小红花**：独立追出了旧 Lab 构建期替换共享 UI 源码、WCP 接口未登记、跨模块直接状态写入等 AM 静态门禁遗漏，并发现标题字号提交时序存在间歇性失败，阻止了只凭一次 155/155 就宣布稳定。
- 🌺 **Muse 小红花**：用慢速 Linux 环境重复复现标题字号重开未恢复的问题，定位 AG 尚未初始化即丢失已保存设置，交付两条可重放且未降低断言的独立修复提交，并客观记录 CM6 滚动偶发和系统环境阻塞。

两份原始报告分别保存于公开 GitHub `audit/grok-06bf498-report`、`audit/muse-06bf498-report`；冻结受审源码均为 `06bf498daab22ad175f5ae4727a2c1e66b38402c`。两份不同 verdict（Grok 首次 155/155 CERTIFIED，修复后 152/155 FAIL；Muse 149/155 FAIL）如实保留，**不得改写为新主线已经获外部认证**。

## 已吸收／当前修复

1. Grok 的 P1-1/P1-2/P1-3：前序 Main 提交 `08fb6f4` 已删除 Lab 编译时字符串修改共享源码、清理旧强制依赖、收口 WCP/AG/CMD 对象访问与直接 Zustand 写入，并完成 AM/WCP 登记、隔离浏览器回归。
2. Grok 的 P2-3：前序 `2365d51` 添加了独立 Chrome/WebKit 双端 HTTP 412、草稿与撤销保护、完整恢复夹具的真实浏览器测试。
3. Muse F1：原作者 Meta Muse 的 `git format-patch` 两项提交通过 `git am --3way` 原样吸收进开发 Main，保留 `Meta Muse (independent audit)` 作者署名。`ui/workspace.js` 缓存并在新建 AG 后补发已验证的标题字号倍率。
4. Muse F2 / Grok P2-1：同上第二项 Muse 提交将 `tests/media-adoption-syntax.test.mjs` 硬编码本机 Chrome/WebKit 路径替换为 Playwright 托管启动，不动断言；同时清除 `vite.config.mjs` 默认个人 iCloud PDF 路径，改用项目工作区只读 PDF（可由 `V6_PDF_PATH` 覆盖）。
5. Grok P1-4：修复 `ui/settings-module.js` 不必要的滑杆销毁/重建。普通标量值变化保留同一个滑杆 DOM；设置键/注释/分类/范围发生变化时才重建。标题字号回归额外验证滑杆身份不变；原有 2、0.2、1.7 倍与保存/重开断言保留。

## 原始失败与修复验收

- Muse 修复后的第一次 Chrome/WebKit 标题测试 PASS；但在未收口设置滑杆的 Main 上重跑出现 `0.2 !== 1.7`，证明不能以恢复补丁冒充完整修复，未隐藏此次失败。
- 通过保留滑杆 identity 的改动后：标题字号回归已连续 4 轮 × Chromium / WebKit PASS，原始数值及持久化断言仍在，新增 DOM 控件身份断言 PASS。
- `tests/media-adoption-syntax.test.mjs` Chrome/WebKit PASS。
- `tests/cm6-browser.test.mjs` 原有保存滚动绝对位置及光标、undo/redo、保存/reopen、样本不变断言 PASS；Muse 报告的 1/4 偶发仍保持待观察，不视为已彻底解决。
- 全量 AM/Git 需要以**本轮新冻结 Git SHA**重新运行；旧 `06bf498` 的认证不能转移到新提交。独立 Grok/Muse 可检验以上修复及任何新越界。

## 仍需后续追踪（未声称解决）

- 尚未验证的其它原生 Linux/macOS 差异及项目中其余测试写死的环境路径。
- 其它独立审计指出的 cookie/凭证结构、历史仓库大截图、跨模块组合层例外等：须分清真实风险与历史审计登记，不为取得绿色报告擅改生产授权。
- Muse 的 CM6 保存后偶发滚动跳变应记录高负载复现证据，并保持原有严格滚动断言。
- 新 Main 只有在新快照重新运行全量 AM/Git 才能取得新认证；开发版本发布仅供用户内外网人工验收，不代表认证。
