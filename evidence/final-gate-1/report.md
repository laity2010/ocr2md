# OCR2MD AM/Git 标准审计 · a58efa90e2f2
总体自动判定：**FAIL**（不代表外部 AI 独立签字）
源码 SHA：`a58efa90e2f2ed0a785d6220c1a7d56a8cc7cd8c`；检出 SHA：`a58efa90e2f2ed0a785d6220c1a7d56a8cc7cd8c`；工作树干净：`True`
快照清单 SHA256：`68e86ef0a65c6f1bbd56ab13d7849539711ef2e0b8b85330fb8be0f4d7ab782b`
Runner 返回码：`1`；原始执行证据：`run.log`

## 接口和消息的实际测试
- AM 用例：364/448
- 接口数：309；有直接 PASS 测试的接口：101
- 测试关联：直接 131、集成 317
- 无直接测试接口：A01, A02, A03, A04, A05, A06, A07, A08, A09, A10, A11, A12, B01, B02, B03, B04, B05, B06, B07, B08, C03, C08, C09, C10, C11, C12, C121, C123, C13, C14, C15, C16, C24, C25, C28, C33, C34, C38, C41, C45, C46, C52, C53, C54, C55, C56, C57, C58, C59, C62, C65, C67, C68, C69, C70, C71, C72, C73, C75, C76, G01, G02, G03, G04, G05, G06, G07, G08, G09, G10, G11, G13, G14, G21, G22, G23, G24, G25, G26, G27, G29, G34, G35, G36, H01, H02, H03, H06, L01, L02, L03, L04, L05, L06, L07, L08, L09, L10, L11, L12, L13, L14, L15, L16, L17, L18, L19, L20, L29, L31, L32, L34, L35, L36, L37, L38, L39, L40, L41, L42, L43, L44, L45, L46, L47, L48, L49, L50, L51, L52, L53, L54, L55, L56, L57, L58, L59, L60, L61, L62, L65, L75, L80, L81, L83, L84, L85, L86, M01, M02, M03, M04, M05, M06, M07, M08, M10, M11, M14, N02, N03, N04, N05, N07, P01, P02, P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, P14, P16, P18, P22, P23, P24, P25, P26, P40, P41, S01, S02, S03, S04, S05, S06, T01, T02, T03, T04, T05, T06, T09, T10, T11, T12, W02, W03, W04, W06, W07

## 跨模块边界
- 检查 UI 文件：103；跨模块 import：62；静态违规：0
- 未登记的 DOM 事件调用点：0；其他运行时调用点需复审：66
- 自动检查无法对所有动态间接调用作穷举证明，不能由零静态违规推导零越界。

## 失败与发现
- AUDIT_RUNNER_NONZERO
- AM_RESULTS_INCOMPLETE

## 未登记事件调用点
- 无字面量未登记事件（不能证明没有动态事件）

## 必须由每名审计者独立核实
- [ ] Integration-only API evidence does not establish independent API invocation; review each listed API against its real interface and add direct test where needed.
- [ ] Manually examine dynamic/DOM/shared-store callsites and trace caller -> registered API/message -> receiver; static ownership PASS alone does not prove all runtime boundaries.

## 动态调用点定位清单
- `ui/cm6-source-visibility.js:77` `const unsubscribe=viewStore.subscribe((next,prev)=>{`
- `ui/fontcheck.js:21` `const editor = document.querySelector('.cm-content');`
- `ui/html-elements-module.js:71` `const revision=viewStore.getState().documentRevision;`
- `ui/html-elements-module.js:108` `const unsubscribe=viewStore.subscribe((next,prev)=>{`
- `ui/html-elements-module.js:125` `if(lastRevision!==viewStore.getState().documentRevision)refresh();`
- `ui/latex-module.js:211` `const unsubscribe=viewStore.subscribe((current,prior)=>{`
- `ui/latex-module.js:250` `const state=viewStore.getState();`
- `ui/main.js:36` `const $ = (id) => document.getElementById(id);`
- `ui/main.js:91` `const store=viewStore.getState();`
- `ui/main.js:129` `if (document.querySelector('dialog[open]')) {`
- `ui/main.js:387` `const unsubscribeGlobalStatus=viewStore.subscribe((next,previous)=>{`
- `ui/main.js:938` `const unsubscribeOutlineFocus=viewStore.subscribe((next,previous)=>{`
- `ui/main.js:1168` `if (import.meta.env.DEV) window.__v6cm6 = {`
- `ui/main.js:1175` `get scrollState(){return viewStore.getState();},`
- `ui/media-module.js:433` `const unsubscribe=viewStore.subscribe((next,previous)=>{`
- `ui/media-module.js:467` `const state=viewStore.getState();`
- `ui/note-pair-module.js:249` `const unsubscribe=viewStore.subscribe((next,prev)=>{`
- `ui/note-pair-module.js:278` `if(active){refresh();followFocus(viewStore.getState().focusTarget,viewStore.getState());}`
- `ui/outline-grid.js:109` `indexedRevision=viewStore.getState().documentRevision;`
- `ui/outline-grid.js:133` `const state=viewStore.getState();`
- `ui/outline-grid.js:152` `if(indexedRevision!==viewStore.getState().documentRevision)refresh();`
- `ui/outline-grid.js:293` `const unsub=viewStore.subscribe((next,prev)=>{`
- `ui/pdf-preview.js:181` `this.unsubscribe=viewStore.subscribe((next,prev)=>{`
- `ui/scroll-sync.js:59` `measuredRevision=viewStore.getState().documentRevision;`
- `ui/scroll-sync.js:69` `if(viewStore.getState().scrollSyncEnabled && anchors.length) {`
- `ui/scroll-sync.js:143` `(!independent && !viewStore.getState().scrollSyncEnabled)) return;`
- `ui/scroll-sync.js:144` `if(measuredRevision!==viewStore.getState().documentRevision) return;`
- `ui/scroll-sync.js:158` `(!viewStore.getState().scrollSyncEnabled && !explicitNavigation)) return;`
- `ui/scroll-sync.js:175` `(!viewStore.getState().scrollSyncEnabled && !explicitNavigation) ||`
- `ui/scroll-sync.js:187` `(!viewStore.getState().scrollSyncEnabled && !force)) return;`
- `ui/scroll-sync.js:214` `if(disposed || !viewStore.getState().scrollSyncEnabled) return;`
- `ui/scroll-sync.js:224` `if(!scroller || disposed || !viewStore.getState().scrollSyncEnabled ||`
- `ui/scroll-sync.js:236` `if(disposed || !viewStore.getState().scrollSyncEnabled ||`
- `ui/scroll-sync.js:266` `if(viewStore.getState().scrollSyncEnabled) lastDriver='cm6';`
- `ui/scroll-sync.js:274` `if(viewStore.getState().scrollSyncEnabled) lastDriver='preview';`
- `ui/scroll-sync.js:293` `const unsubscribe=viewStore.subscribe((state,previous)=>{`
- `ui/scroll-sync.js:308` `const unsubscribeFocus=viewStore.subscribe((state,previous)=>{`
- `ui/scroll-sync.js:341` `if(measuredRevision!==viewStore.getState().documentRevision &&`
- `ui/scroll-sync.js:345` `if(!viewStore.getState().scrollSyncEnabled) return readPreview();`
- `ui/scroll-sync.js:351` `if(!viewStore.getState().scrollSyncEnabled) {`
- `ui/sentence-module.js:71` `const unsubscribeFocus=viewStore.subscribe((next,prior)=>{`
- `ui/sentence-module.js:131` `followFocus(viewStore.getState().focusTarget);`
- `ui/sentence-module.js:150` `setActive(next){active=Boolean(next);host.hidden=!active;if(active){refresh();followFocus(viewStore.getState().focusTarget);}emitCoverage();},`
- `ui/text-block-module.js:290` `const unsubscribe=viewStore.subscribe((next,previous)=>{`
- `ui/view-store.js:19` `viewStore.setState(s => ({documentRevision:s.documentRevision + 1}));`
- `ui/view-store.js:23` `if (viewStore.getState().sourceOffset !== offset)`
- `ui/view-store.js:24` `viewStore.setState({sourceOffset:offset});`
- `ui/view-store.js:31` `viewStore.setState(state => ({`
- `ui/view-store.js:40` `viewStore.setState({scrollSyncEnabled:Boolean(enabled)});`
- `ui/view-store.js:47` `viewStore.setState(state=>({`
- `ui/view-store.js:56` `if(viewStore.getState().outlineCount!==count)viewStore.setState({outlineCount:count});`
- `ui/view-store.js:60` `if(viewStore.getState().activePanel!==panelId)viewStore.setState({activePanel:panelId});`
- `ui/wcp-ag-query.js:129` `unsubscribe=viewStore.subscribe((current,prior)=>{`
- `ui/wcp-source-file-navigation.js:148` `viewStore.subscribe((now,before)=>{`
- `ui/workspace.js:363` `this.unsubscribe=viewStore.subscribe((next,prior)=>{`
- `ui/workspace.js:392` `revision:viewStore.getState().documentRevision};`
- `ui/workspace.js:407` `if(!saved || saved.revision!==viewStore.getState().documentRevision)return;`
- `ui/workspace.js:468` `this.highlight(viewStore.getState().focusTarget);`
- `ui/workspace.js:494` `this.highlight(viewStore.getState().focusTarget);`
- `ui/workspace.js:501` `const focus=viewStore.getState().focusTarget;`
- `ui/workspace.js:549` `this.highlight(viewStore.getState().focusTarget);`
- `ui/workspace.js:581` `this.highlight(viewStore.getState().focusTarget);`
- `ui/workspace.js:598` `focus.revision===viewStore.getState().documentRevision){`
- `ui/workspace.js:604` `focus.revision===viewStore.getState().documentRevision){`
- `ui/workspace.js:804` `if(module!=='illegal-break'&&viewStore.getState().focusTarget?.origin==='illegal-break'){`
- `ui/workspace.js:807` `currentPreview?.highlight(viewStore.getState().focusTarget);`

## Git 处置与签字
- 已确认越界：Git blame/log 归因，保全原始证据，撤销违规提交（优先 git revert），新 SHA 复验。
- 审计者：**待独立填写**；动态审阅：**PENDING**；SOURCE_MERGE：**待判定**；PRODUCTION_CUTOVER：**待判定**。
- 本报告是审计自动底稿；审计者必须列出额外代码取证、实际测试、排除或确认每项 REVIEW 的理由。
