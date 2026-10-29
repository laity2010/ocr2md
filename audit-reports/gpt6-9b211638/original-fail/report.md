# OCR2MD AM/Git 标准审计 · 9b211638b179
总体自动判定：**FAIL**（不代表外部 AI 独立签字）
源码 SHA：`9b211638b1791fc0ac4b084cc565230203507d9d`；检出 SHA：`9b211638b1791fc0ac4b084cc565230203507d9d`；工作树干净：`True`
快照清单 SHA256：`8ce865d97ddbe0368cb3523c80c50750a41b88580d6411ffa58861f286410d90`
Runner 返回码：`1`；原始执行证据：`run.log`

## 接口和消息的实际测试
- AM 用例：0/240
- 接口数：167；有直接 PASS 测试的接口：0
- 测试关联：直接 61、集成 179
- 无直接测试接口：A01, A02, A03, A04, A05, A06, A07, A08, A09, A10, A11, A12, A13, B01, B02, B03, B04, B05, B06, B07, B08, B09, C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14, C15, C16, C17, C18, C19, C20, C21, C22, C23, C24, C25, C27, C28, C29, C30, C31, C32, C33, C34, C35, G01, G02, G03, G04, G05, G06, G07, G08, G09, G10, G11, G12, G13, G14, G15, G16, G17, G18, H01, H02, H03, H04, H05, H06, L01, L02, L03, L04, L05, L06, L07, L08, L09, L10, L11, L12, L13, L14, L15, L16, L17, L18, L19, L20, L21, L29, L30, L31, L32, L33, M01, M02, M03, M04, M05, M06, M07, M08, M09, M10, M11, M12, M13, N01, N02, N03, N04, N05, N06, N07, P01, P02, P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, S01, S02, S03, S04, S05, S06, S07, T01, T02, T03, T04, T05, T06, T09, T10, T11, T12, T13, W01, W02, W03, W04, W05, W06, W07, W08, W09, W10

## 跨模块边界
- 检查 UI 文件：63；跨模块 import：38；静态违规：0
- 未登记的 DOM 事件调用点：0；其他运行时调用点需复审：53
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
- `ui/fontcheck.js:21` `const editor = document.querySelector('.cm-content');`
- `ui/html-elements-module.js:71` `const revision=viewStore.getState().documentRevision;`
- `ui/html-elements-module.js:108` `const unsubscribe=viewStore.subscribe((next,prev)=>{`
- `ui/html-elements-module.js:125` `if(lastRevision!==viewStore.getState().documentRevision)refresh();`
- `ui/latex-module.js:236` `const unsubscribe=viewStore.subscribe((current,prior)=>{`
- `ui/latex-module.js:275` `const state=viewStore.getState();`
- `ui/main.js:29` `const $ = (id) => document.getElementById(id);`
- `ui/main.js:59` `const store=viewStore.getState();`
- `ui/main.js:86` `if (document.querySelector('dialog[open]')) {`
- `ui/main.js:344` `const unsubscribeGlobalStatus=viewStore.subscribe((next,previous)=>{`
- `ui/main.js:489` `const unsubscribeOutlineFocus=viewStore.subscribe((next,previous)=>{`
- `ui/main.js:679` `if (import.meta.env.DEV) window.__v6cm6 = {`
- `ui/main.js:686` `get scrollState(){return viewStore.getState();},`
- `ui/media-module.js:373` `const unsubscribe=viewStore.subscribe((next,previous)=>{`
- `ui/media-module.js:407` `const state=viewStore.getState();`
- `ui/note-pair-module.js:249` `const unsubscribe=viewStore.subscribe((next,prev)=>{`
- `ui/note-pair-module.js:278` `if(active){refresh();followFocus(viewStore.getState().focusTarget,viewStore.getState());}`
- `ui/outline-grid.js:109` `indexedRevision=viewStore.getState().documentRevision;`
- `ui/outline-grid.js:133` `const state=viewStore.getState();`
- `ui/outline-grid.js:152` `if(indexedRevision!==viewStore.getState().documentRevision)refresh();`
- `ui/outline-grid.js:286` `const unsub=viewStore.subscribe((next,prev)=>{`
- `ui/pdf-preview.js:94` `this.unsubscribe=viewStore.subscribe((next,prev)=>{`
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
- `ui/view-store.js:19` `viewStore.setState(s => ({documentRevision:s.documentRevision + 1}));`
- `ui/view-store.js:23` `if (viewStore.getState().sourceOffset !== offset)`
- `ui/view-store.js:24` `viewStore.setState({sourceOffset:offset});`
- `ui/view-store.js:31` `viewStore.setState(state => ({`
- `ui/view-store.js:40` `viewStore.setState({scrollSyncEnabled:Boolean(enabled)});`
- `ui/view-store.js:45` `viewStore.setState(state=>({`
- `ui/view-store.js:54` `if(viewStore.getState().outlineCount!==count)viewStore.setState({outlineCount:count});`
- `ui/view-store.js:58` `if(viewStore.getState().activePanel!==panelId)viewStore.setState({activePanel:panelId});`
- `ui/wcp-ag-query.js:118` `unsubscribe=viewStore.subscribe((current,prior)=>{`
- `ui/wcp-source-file-navigation.js:147` `viewStore.subscribe((now,before)=>{`
- `ui/workspace.js:255` `this.unsubscribe=viewStore.subscribe((next,prior)=>{`
- `ui/workspace.js:284` `revision:viewStore.getState().documentRevision};`
- `ui/workspace.js:299` `if(!saved || saved.revision!==viewStore.getState().documentRevision)return;`
- `ui/workspace.js:384` `this.highlight(viewStore.getState().focusTarget);`

## Git 处置与签字
- 已确认越界：Git blame/log 归因，保全原始证据，撤销违规提交（优先 git revert），新 SHA 复验。
- 审计者：**待独立填写**；动态审阅：**PENDING**；SOURCE_MERGE：**待判定**；PRODUCTION_CUTOVER：**待判定**。
- 本报告是审计自动底稿；审计者必须列出额外代码取证、实际测试、排除或确认每项 REVIEW 的理由。
