# Main：AG「全部」checkbox 在母文档无法取消（2026-10-27）

## 真实复现

Main `main-261027-2023`、Chrome 与 iPad WebKit，在根 `/`（母 Markdown / 章节定界）实测：`input[aria-label="章节所有"]` 的 DOM 是 `checked=true`、`disabled=true`；Playwright `.uncheck()` 因 disabled 等待超时。进入 `?view=<virtual章>` 后 checkbox 变为 `disabled=false` 并可取消。根因是 `ui/wcp-ag-module-toolbar.js` 根据 `virtualMode` 无条件禁用母文档的复用 checkbox，而 `ui/wcp-ag-query.js` 将 AG 条目范围也与 CM6/MD 的章节视图是否存在绑定。

## 局部修复

- AG 与源码视图职责分开：**「全部」只控制 AG 当前元素行是否按 CMD 章节过滤**，不改变母 CM6 内容、Markdown 预览、PDF 定位、浏览器 URL 或已保存内容。
- 母文档：已勾选 = 当前元素全部章节；取消勾选 = CMD 导航索引中当前章节（根视图默认为 000）的 AG 行；重新勾选恢复全部。可见状态提示 `CMD · 000 · N 项`。
- 选定虚拟章节：保留原先的复用选择，checkbox 未勾选时 AG 仅当前章节；勾选后 AG 全部章节。实体章节模式保持旧路径。
- 代码仅 `ui/wcp-ag-module-toolbar.js` 与 `ui/wcp-ag-query.js`，没有新增其他状态容器、API、模块旁路或写路径。

## 实际回归

默认 Main（非 Lab）生产 Vite，独立 Python 服务、临时文件内的**真实用户母 Markdown 的只读副本**、无保存授权，在 Chrome + iPad WebKit 真实点击执行 `tests/main-promoted-lab-ui.browser.test.mjs`：

| 操作 | Chrome | iPad WebKit |
|---|---:|---:|
| 母 Markdown「标题」勾选全部 | 19 行 | 19 行 |
| 母 Markdown「标题」取消全部 | **1 行（000）** | **1 行（000）** |
| 再次勾选 | 19 行 | 19 行 |
| 母 Markdown「媒体」勾选全部 | 12 行 | 12 行 |
| 母 Markdown「媒体」取消全部 | **7 行（000）** | **7 行（000）** |
| 再次勾选 | 12 行 | 12 行 |

源文件仍为 `document`，URL 未增加 `?view=`；随后切换真实章节、媒体元素和全局设置均通过，两个 Settings/源码导航镜像选中 `settings`；`pageerrors=[]`、`API writes=[]`，临时母文档与设置前后字节一致。两份真实截图位于 `audit-reports/screenshots/main-ag-all-unchecked-Chrome.png` 和 `main-ag-all-unchecked-iPad-WebKit.png`。

- `python3 tests/am/audit_boundaries.py`: `AM_WP2_PASS`。
- `python3 tests/am/am.py check`: `AM_CHECK_PASS apis=122`，真实 WCP AM 边界不变。
- `npm run build`: 默认 Main（无 `V6_LAB_ID`）构建成功。
- 发布前还须核对 LAN/公网 release identity 和真实浏览器操作；本报告中的预发布测试不能代替上线验收。

冻结 Lab/外部 Grok-Muse 审计快照均未修改。该 Main 修复应进入下一轮差量审计。
