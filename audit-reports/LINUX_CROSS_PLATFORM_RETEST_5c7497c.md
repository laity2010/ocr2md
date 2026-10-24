# V6 冻结主线 · 跨平台回归证据与剩余分歧

- 受审业务代码固定 SHA：`5c7497cdf94ea35217e83effd9496a045625fef0`（主线保持冻结、干净）。
- 本轮测试包 SHA：`adbbd539e582a942c4003626a596ffbf4cbfcc15`；隔离 Debian 13 ARM64、Node 22.16.0、Playwright 1.64.1 Chromium + WebKit。
- 执行命令：`bash audit.sh`，已自动从包内 PDF 固定 SHA 创建新的 detached worktree，安装锁定依赖并执行 27 个原始脚本。
- **严格原始 AM 全量结论：FAIL；26/27 脚本、135/139 条契约 PASS；4 条失败来自 `tests/scroll-sync-browser.test.mjs` 同一脚本。没有任何跳过或把失败记为成功。**
- Machine evidence: `.v6/audit-reports/RUN_EVIDENCE.json`，27 个 `.v6/tests/am-full-*.log`，50 张 `.v6/evidence/*.png`；测试日志留在隔离 worktree。`git fsck --full --no-reflogs` 独立执行 PASS，git tracked worktree 干净。

## 本轮已经排除的环境失真（只修改审计包）

1. 冻结的 Vite 服务在 Linux 默认去 Mac iCloud 路径取 PDF，造成 `/api/pdf` 404；显式设置已校验 PDF 的 `V6_PDF_PATH` 后，同样的 Node22/Chromium 实测 21 行大纲、22 页 PDF 于约 1.7 秒 ready。
2. 两个媒体测试调用 macOS `sips`；审计专用 Linux ESM 适配器调用 Chromium 转换真实 PNG→JPEG，保留原始测试内容和断言；媒体下载与图片粘贴在 Linux Chromium、WebKit 均 PASS。
3. `pdfjs-dist` 等依赖不支持 Grok 首轮的 Node 20.19.2；入口现在明确要求 Node >=22.13。
4. 某些 Python-server 浏览器测试在 Linux WebKit 发生异步初始化/权限探测竞争，且 Secure cookie 不被本地 HTTP 持久保存；隔离测试中等待真实 UI 初始化，仅在 **127.0.0.1 HTTP** 且服务器验证解锁成功后，注入同一个有效 token 的非 Secure 测试 cookie。不会改变生产 HTTPS 服务、业务源码或断言。LaTeX 49 项与章节保存/导出/重开均 PASS；生产授权仍须由正式 HTTPS 验收。
5. 上一轮残留 Python 测试服务会占据固定端口并伪装健康检查；审计入口自动扫描原始测试使用的 loopback 端口，有冲突即 BLOCKED，不杀其他进程。

## 唯一仍然失败的原始测试：Linux WebKit 滚动几何假设

- 源码测试实际要求：`reverse.source.sourceLine > sourceResult.source.sourceLine + 30`。
- 相同脚本在 Chromium：source→preview 记录第 575 行，preview→source 落在 657 行，故 PASS。
- Linux WebKit：source→preview 记录第 681 行，preview→source 落在第 652 行。**此时 source 和 preview 都在 652 行，anchor 差 <1 行，驱动 `preview` 正确，无递归反馈**，但断言要求第二次位置 >711 行，因此 FAIL。
- 字体全部就绪/布局完成后仍可稳定复现，故不是简单等待时间问题。原脚本实际请求 source line 600，检查随后的预览 77% 滚动时是否进入较后段落，比与 renderer-dependent 的第 681 行相比更贴近业务意图。
- 推荐的**待评审**最小补丁：`scroll-sync-semantic-assertion-proposal.diff`，保留全部其余 assertions，只把几何敏感比较换为 `reverse.source.sourceLine>600+30`。该比较在 Chromium 更严格，在 WebKit 符合相同预期。
- 在单独 `.v6/audit-reports/scroll-sync-portable.test.mjs` 中仅替换这一断言，Linux Chromium 与 WebKit **均完成原测试的后续滚动禁用/恢复、编辑、Resize、防循环检查且 PASS**。这个结果是**补充语义验证，不计入 AM 139 条认证**。

## 下一步与发布条件

- 本轮没有动 GPT V6 主线，也没有把补丁应用到冻结测试或暗中更改 AM 结果。
- 需由主线负责人审核上述跨平台语义测试契约：若批准，待解冻时调整**测试断言**，再从新的主线 SHA 生成新审计快照；或者将新断言采纳为审计分支版本化的独立测试契约，明确与冻结 AM 证书不同。
- 这轮严格 AM 尚未全绿，**不得声明 Linux AM_FULL_TABLE_CERTIFIED，也不得将新审计分支的普通推送称为已验收通过**。
