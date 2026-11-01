# OCR2MD AM/Git 标准审计 · 75e055988df7
总体自动判定：**FAIL**（不代表外部 AI 独立签字）
源码 SHA：`75e055988df73d3d3899036f6a62ce1e851f2d15`；检出 SHA：`75e055988df73d3d3899036f6a62ce1e851f2d15`；工作树干净：`True`
快照清单 SHA256：`5b128f81aacb09c6755447335a578c772fe8fac460dc513e103ecef3779ae58b`
Runner 返回码：`1`；原始执行证据：`run.log`

## 接口和消息的实际测试
- AM 用例：未执行/未执行
- 接口数：未执行；有直接 PASS 测试的接口：未执行
- 测试关联：直接 未执行、集成 未执行
- 无直接测试接口：无 / 未执行

## 跨模块边界
- 检查 UI 文件：82；跨模块 import：42；静态违规：10
- 未登记的 DOM 事件调用点：0；其他运行时调用点需复审：62
- 自动检查无法对所有动态间接调用作穷举证明，不能由零静态违规推导零越界。

## 失败与发现
- STATIC_BOUNDARY_VIOLATIONS
- AUDIT_RUNNER_NONZERO
- AM_RESULTS_INCOMPLETE
- UNOWNED_UI_FILE cmd-block-continuations.js
- UNOWNED_UI_FILE cmd-block-joins.js
- UNOWNED_UI_FILE cmd-pdf-text-insert.js
- UNOWNED_UI_FILE cmd-text-blocks.js
- UNOWNED_UI_FILE pdf-block-text-extract.js
- UNOWNED_UI_FILE pdf-gutter-label-layout.js
- UNOWNED_UI_FILE pdf-region-hit.js
- UNOWNED_UI_FILE pdf-source-locations.js
- UNOWNED_UI_FILE text-block-module.js
- UNOWNED_UI_FILE text-block-preview-coverage.js

## 未登记事件调用点
- 无字面量未登记事件（不能证明没有动态事件）

## 必须由每名审计者独立核实
- [ ] Manually examine dynamic/DOM/shared-store callsites and trace caller -> registered API/message -> receiver; static ownership PASS alone does not prove all runtime boundaries.

## 动态调用点定位清单
- `ui/fontcheck.js:21` `const editor = document.querySelector('.cm-content');`
- `ui/html-elements-module.js:71` `const revision=viewStore.getState().documentRevision;`
- `ui/html-elements-module.js:108` `const unsubscribe=viewStore.subscribe((next,prev)=>{`
- `ui/html-elements-module.js:125` `if(lastRevision!==viewStore.getState().documentRevision)refresh();`
- `ui/latex-module.js:236` `const unsubscribe=viewStore.subscribe((current,prior)=>{`
- `ui/latex-module.js:275` `const state=viewStore.getState();`
- `ui/main.js:32` `const $ = (id) => document.getElementById(id);`
- `ui/main.js:80` `const store=viewStore.getState();`
- `ui/main.js:107` `if (document.querySelector('dialog[open]')) {`
- `ui/main.js:365` `const unsubscribeGlobalStatus=viewStore.subscribe((next,previous)=>{`
- `ui/main.js:788` `const unsubscribeOutlineFocus=viewStore.subscribe((next,previous)=>{`
- `ui/main.js:1008` `if (import.meta.env.DEV) window.__v6cm6 = {`
- `ui/main.js:1015` `get scrollState(){return viewStore.getState();},`
- `ui/media-module.js:433` `const unsubscribe=viewStore.subscribe((next,previous)=>{`
- `ui/media-module.js:467` `const state=viewStore.getState();`
- `ui/note-pair-module.js:249` `const unsubscribe=viewStore.subscribe((next,prev)=>{`
- `ui/note-pair-module.js:278` `if(active){refresh();followFocus(viewStore.getState().focusTarget,viewStore.getState());}`
- `ui/outline-grid.js:109` `indexedRevision=viewStore.getState().documentRevision;`
- `ui/outline-grid.js:133` `const state=viewStore.getState();`
- `ui/outline-grid.js:152` `if(indexedRevision!==viewStore.getState().documentRevision)refresh();`
- `ui/outline-grid.js:293` `const unsub=viewStore.subscribe((next,prev)=>{`
- `ui/pdf-preview.js:126` `this.unsubscribe=viewStore.subscribe((next,prev)=>{`
- `ui/scroll-sync.js:59` `measuredRevision=viewStore.getState().documentRevision;`
- `ui/scroll-sync.js:69` `if(viewStore.getState().scrollSyncEnabled && anchors.length) {`
- `ui/scroll-sync.js:143` `(!independent && !viewStore.getState().scrollSyncEnabled)) return;`
- `ui/scroll-sync.js:144` `if(measuredRevision!==viewStore.getState().documentRevision) return;`
- `ui/scroll-sync.js:158` `(!viewStore.getState().scrollSyncEnabled && !explicitNavigation)) return;`
- `ui/scroll-sync.js:175` `(!viewStore.getState().scrollSyncEnabled && !explicitNavigation) ||`
- `ui/scroll-sync.js:187` `(!viewStore.getState().scrollSyncEnabled && !force)) return;`
- `ui/scroll-sync.js:206` `if(disposed || !viewStore.getState().scrollSyncEnabled) return;`
- `ui/scroll-sync.js:216` `if(!scroller || disposed || !viewStore.getState().scrollSyncEnabled ||`
- `ui/scroll-sync.js:228` `if(disposed || !viewStore.getState().scrollSyncEnabled ||`
- `ui/scroll-sync.js:258` `if(viewStore.getState().scrollSyncEnabled) lastDriver='cm6';`
- `ui/scroll-sync.js:266` `if(viewStore.getState().scrollSyncEnabled) lastDriver='preview';`
- `ui/scroll-sync.js:285` `const unsubscribe=viewStore.subscribe((state,previous)=>{`
- `ui/scroll-sync.js:300` `const unsubscribeFocus=viewStore.subscribe((state,previous)=>{`
- `ui/scroll-sync.js:333` `if(measuredRevision!==viewStore.getState().documentRevision &&`
- `ui/scroll-sync.js:337` `if(!viewStore.getState().scrollSyncEnabled) return readPreview();`
- `ui/scroll-sync.js:343` `if(!viewStore.getState().scrollSyncEnabled) {`
- `ui/sentence-module.js:71` `const unsubscribeFocus=viewStore.subscribe((next,prior)=>{`
- `ui/sentence-module.js:131` `followFocus(viewStore.getState().focusTarget);`
- `ui/sentence-module.js:150` `setActive(next){active=Boolean(next);host.hidden=!active;if(active){refresh();followFocus(viewStore.getState().focusTarget);}emitCoverage();},`
- `ui/text-block-module.js:149` `const unsubscribe=viewStore.subscribe((next,previous)=>{`
- `ui/view-store.js:19` `viewStore.setState(s => ({documentRevision:s.documentRevision + 1}));`
- `ui/view-store.js:23` `if (viewStore.getState().sourceOffset !== offset)`
- `ui/view-store.js:24` `viewStore.setState({sourceOffset:offset});`
- `ui/view-store.js:31` `viewStore.setState(state => ({`
- `ui/view-store.js:40` `viewStore.setState({scrollSyncEnabled:Boolean(enabled)});`
- `ui/view-store.js:46` `viewStore.setState(state=>({`
- `ui/view-store.js:55` `if(viewStore.getState().outlineCount!==count)viewStore.setState({outlineCount:count});`
- `ui/view-store.js:59` `if(viewStore.getState().activePanel!==panelId)viewStore.setState({activePanel:panelId});`
- `ui/wcp-ag-query.js:124` `unsubscribe=viewStore.subscribe((current,prior)=>{`
- `ui/wcp-source-file-navigation.js:148` `viewStore.subscribe((now,before)=>{`
- `ui/workspace.js:350` `this.unsubscribe=viewStore.subscribe((next,prior)=>{`
- `ui/workspace.js:379` `revision:viewStore.getState().documentRevision};`
- `ui/workspace.js:394` `if(!saved || saved.revision!==viewStore.getState().documentRevision)return;`
- `ui/workspace.js:455` `this.highlight(viewStore.getState().focusTarget);`
- `ui/workspace.js:481` `this.highlight(viewStore.getState().focusTarget);`
- `ui/workspace.js:488` `const focus=viewStore.getState().focusTarget;`
- `ui/workspace.js:536` `this.highlight(viewStore.getState().focusTarget);`
- `ui/workspace.js:568` `this.highlight(viewStore.getState().focusTarget);`
- `ui/workspace.js:583` `focus.revision===viewStore.getState().documentRevision){`

## Git 处置与签字
- 已确认越界：Git blame/log 归因，保全原始证据，撤销违规提交（优先 git revert），新 SHA 复验。
- 审计者：**待独立填写**；动态审阅：**PENDING**；SOURCE_MERGE：**待判定**；PRODUCTION_CUTOVER：**待判定**。
- 本报告是审计自动底稿；审计者必须列出额外代码取证、实际测试、排除或确认每项 REVIEW 的理由。
