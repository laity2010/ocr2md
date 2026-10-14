# V4 顶栏固定几何 · UIC TOPBAR-01

**初始状态**：V4 候选 `2015` 的工作目录/设置模块共用固定顶部标签行。工作台模式才出现 `#v4-workflow-controls` 导航区域，其下拉与刷新按钮比标签按钮高。

**操作**：iPad Safari 点击「工作目录 → 工作台（章节定界） → 设置 → 工作台」。

**需要**：仅 OCR2MD V4 框架顶栏 CSS 调整导航下拉框和刷新按钮的行高，不更改 WCP、Dockview、模块 AG、DIRjson、PDF 或数据访问。

**效果**：显示/隐藏工作台专属目录导航时，顶部 `.v3-top-row` 高度不变、`#v4-tabs` 与 `#v4-global-actions` 上边缘不变（自动化容差 0.65px），所有标签及导航按钮保持可点击。页面模块操作栏自行显示各模块的控件，不参与顶栏几何修复。

**数据副作用**：无。测试模拟 Vault HTTP 401，禁止真实书库读写；保留目录导航功能和已有模块切换状态。原版 `2015` 在 WebKit 810px 复现：顶栏高度 29.14→34.25px，标签顶部 35.25→37.80px，移动 2.55px；1024px 时移动 3.22px。起因是工作台导航 select/button 组合高度 33~35px，将 `align-items:center` 的原顶栏撑高。

**自动化**：`node ui-spikes/v4-directory/tests/topbarModuleSwitchGeometryBrowser.mjs`，WebKit/Chromium 各 810/1024 宽。测试真实 WCP + 工作台模块，仅屏蔽真实 Vault 并使用当前候选源码，检查从工作目录到工作台、设置时顶部稳定。

**自动回归**：原候选 `2015` 测试按预期红灯（810px：表格页顶栏高度 29.14→34.25，tab Y 35.25→37.8）；仅在 `assets/v4.css` 追加 TOPBAR-01 作用域约束导航区和其 select/button 为 28px 后，WebKit/Chromium 各 810/1024 共四组均通过；顶栏原始 y、高度、标签和全局撤销/重做/保存 y 全部一致。未更改工作台自身的功能按钮栏高度。

**发布规则**：仅使用 `release-wp3-candidate.mjs --upgrade --header-geometry-fix`；其门禁只接受 V4 CSS 一处附加和 build stamp 差异，拒绝所有业务模块代码改动；保留旧候选全量快照，正式版不动。

**结果（2026-10-14）**：候选 `v4-261014-2057` 使用严格 `--upgrade --header-geometry-fix` 成功发布。相较旧 `2015`，运行时仅追加 `assets/v4.css` 顶栏作用域修复及自动构建版本标识。升级/错误恢复 6/6、两浏览器 AG 真实 5 行与深色、导航出现前后 WebKit+Chromium×810/1024 四组坐标回归全部通过。公网 CDN 首次短暂返回旧版本，触发发布安全回滚；第二次有限收敛后验证 34 项资源哈希，公网、Mac 4176、局域网 HTTPS 4443 均匹配 `2057`；旧 `2015` 全量回退副本已保留，正式版 `0816` 未动。发布后公网 WebKit 390px smoke PASS；Chromium 一次冷启动超过原 35s 门禁，独立再测约 40.3s 后 WCP ready/mounted、AG 网格、版本与无异常资源均 PASS，说明公网 Chromium 冷启动存在时间波动（本次 CSS 不涉及加载链路）。实体 iPad Safari 顶栏视觉仍需 `manual-external` 人工确认。
