-- Read-only source audit at V6 feature freeze 0733abb. Git tracks these rows.
-- visibility raw/internal means FOUND in code, NOT approved as stable public API.
INSERT INTO modules VALUES
 ('C','CMD','CodeMirror 6','ui/cm-document.js'),
 ('G','AG','AG Grid','ui/outline-grid.js'),
 ('M','MD Preview','markdown-it + DOMPurify','ui/markdown-preview.js'),
 ('P','PDF Preview','PDF.js','ui/pdf-preview.js'),
 ('L','Layout','Dockview','ui/workspace.js');

INSERT INTO apis VALUES
 ('C01','C','CMDocument.getMarkdown','ui/cm-document.js','export','none','Markdown string','read only',1),
 ('C02','C','CMDocument.loadMarkdown','ui/cm-document.js','export','markdown:string','CM6 Text','dispatches CM6 replacement',1),
 ('C03','C','CMDocument.loadMineruJson','ui/cm-document.js','export','MinerU JSON; injected converter','Promise<CM6 Text>','validates before edit',1),
 ('C04','C','CMDocument.readHtml','ui/cm-document.js','export','1-based line','HTML source + syntax or null','read only',1),
 ('C05','C','CMDocument.writeHtml','ui/cm-document.js','export','html,beforeLine,replaceLine?,quotePrefix?','line/sourceLine','one CM6 transaction',1),
 ('C06','C','CMDocument.writeComment','ui/cm-document.js','export','text + writeHtml position','line/sourceLine','delegates to writeHtml',0),
 ('C07','C','CMDocument.adjustQuoteIndent','ui/cm-document.js','export','direction +/-1','changed/lines','one CM6 transaction; protects original evidence',1),
 ('C08','C','CMDocument.destroy','ui/cm-document.js','export','none','void','destroys owned EditorView',0),
 ('C09','C','CMDocument.view','ui/cm-document.js','raw','none','EditorView instance','owned by composition root, not AG or Layout business APIs',0),
 ('C10','C','CMDocument.readLine','ui/cm-document.js','export','1-based line','immutable line number/text/range','read only, no EditorView exposure',1),
 ('C11','C','CMDocument.lineAtOffset','ui/cm-document.js','export','CM6 text offset','1-based line number','read only, no EditorView exposure',0),
 ('C12','C','CMDocument.matchesSnapshot','ui/cm-document.js','export','opaque immutable text snapshot','boolean','compare document identity without exposing current EditorView',1),
 ('C13','C','CMDocument.requestMeasure','ui/cm-document.js','export','none','void','requests CM6 layout pass through CMD boundary',0),
 ('G01','G','createOutlineGrid','ui/outline-grid.js','export','host,getMarkdown,getCMD','grid wrapper','mounts AG; subscribes viewStore',1),
 ('G02','G','returned.refresh','ui/outline-grid.js','returned','none','void','reindexes CM6; changes AG rows',1),
 ('G03','G','returned.schedule','ui/outline-grid.js','returned','none','void','debounced reindex',0),
 ('G04','G','returned.setStartNumber','ui/outline-grid.js','returned','string/number','void','recalculates filenames',1),
 ('G05','G','returned.setExported','ui/outline-grid.js','returned','document snapshot,names','void','controls published chapter links',1),
 ('G06','G','returned.dispose','ui/outline-grid.js','returned','none','void','unsubscribes; destroys AG',0),
 ('G07','G','returned.rows','ui/outline-grid.js','returned','none','heading rows','readable projection; mutable references exposed',0),
 ('G08','G','returned.api','ui/outline-grid.js','raw','none','AG Grid native API','third-party object exposed',0),
 ('G09','G','returned.filters','ui/outline-grid.js','returned','none','filter model','read only',0),
 ('G10','G','returned.startText','ui/outline-grid.js','returned','none','chapter sequence text','read only',0),
 ('M01','M','renderMarkdown','ui/markdown-preview.js','export','Markdown:string','sanitized HTML:string','maps source line attributes',1),
 ('M02','M','PreviewPanel.render','ui/workspace.js','internal','none','void','renders CM6 projection; preserves scroll',1),
 ('M03','M','PreviewPanel.schedule','ui/workspace.js','internal','immediate?:boolean','void','debounced preview render',0),
 ('M04','M','PreviewPanel.highlight','ui/workspace.js','internal','focusTarget','void','highlights matching source element',1),
 ('M05','M','PreviewPanel.setMode','ui/workspace.js','internal','md|pdf','void','switches visibility; retains PDF instance',1),
 ('M06','M','PreviewPanel.detachPdf','ui/workspace.js','internal','DetachedPdfPanel','void','reparents persistent viewer',0),
 ('M07','M','PreviewPanel.reattachPdf','ui/workspace.js','internal','none','void','reparents persistent viewer',0),
 ('P01','P','PdfPreview.open','ui/pdf-preview.js','export','none','Promise<void>','loads /api/pdf-map and /api/pdf',1),
 ('P02','P','PdfPreview.focusLine','ui/pdf-preview.js','export','1-based line,explicit:boolean','Promise<void>','locates OCR region; explicit reveal',1),
 ('P03','P','PdfPreview.refreshAnchors','ui/pdf-preview.js','export','none','void','rebuilds anchor source mapping',1),
 ('P04','P','PdfPreview.setZoom','ui/pdf-preview.js','export','mode:string','void','updates PDF.js scale',0),
 ('P05','P','PdfPreview.setActive','ui/pdf-preview.js','export','boolean','void','viewer visibility handling',1),
 ('P06','P','PdfPreview.onResize','ui/pdf-preview.js','export','none','void','reflows viewer width and overlay',0),
 ('P07','P','PdfPreview.moveToolbarTo','ui/pdf-preview.js','export','DOM container','void','reparents toolbar',0),
 ('P08','P','PdfPreview.dispose','ui/pdf-preview.js','export','none','void','unsubscribes + tears down PDF.js',0),
 ('P09','P','pdfOverlayRect','ui/pdf-preview.js','export','region,viewport','percentage rect','rejects invalid OCR/PDF mapping',1),
 ('P10','P','sourceBlocks','ui/pdf-preview.js','export','Markdown:string','OCR source anchors','parses stable MinerU IDs',1),
 ('P11','P','PdfPreview.revealCurrentLocation','ui/pdf-preview.js','export','none','void','reveals only pending explicit click',0),
 ('P12','P','PdfPreview.clearHighlight','ui/pdf-preview.js','export','none','void','removes OCR overlay',0),
 ('L01','L','createWorkspace','ui/workspace.js','export','host,getDocument,getCurrentEditor,getCommandDocument','workspace facade','builds Dockview panels and wiring',1),
 ('L02','L','returned.refreshPreview','ui/workspace.js','returned','none','void','requests Markdown re-render',1),
 ('L03','L','returned.refreshOutline','ui/workspace.js','returned','none','void','requests AG reindex',1),
 ('L04','L','returned.refreshPdf','ui/workspace.js','returned','none','void','requests PDF anchor refresh',0),
 ('L05','L','returned.setPreviewSplit','ui/workspace.js','returned','enabled:boolean','void','Dockview 3/4 panels; preserves PDF instance',1),
 ('L06','L','returned.setPreviewMode','ui/workspace.js','returned','md|pdf','void','switches preview',1),
 ('L07','L','returned.startScrollSync','ui/workspace.js','returned','none','scrollSync object|null','installs scroll coordinator once',1),
 ('L08','L','returned.editorHost','ui/workspace.js','returned','none','DOM element','CM6 mounting hook',0),
 ('L09','L','returned.debug.outline','ui/workspace.js','internal','DEV only','AG wrapper','test-only introspection; absent from production facade',0),
 ('L10','L','returned.debug.pdf','ui/workspace.js','internal','DEV only','PdfPreview instance','test-only introspection; absent from production facade',0),
 ('L11','L','returned.debug.dockview','ui/workspace.js','internal','DEV only','Dockview native instance','test-only introspection; absent from production facade',0),
 ('L12','L','returned.previewSplit','ui/workspace.js','returned','none','boolean','read only',0),
 ('L13','L','returned.debug.scrollSync','ui/workspace.js','internal','DEV only','scrollSync object','test-only introspection; absent from production facade',0),
 ('L14','L','returned.getChapterState','ui/workspace.js','returned','none','detached {rows,startText} projection','source shell reads snapshot without AG wrapper',1),
 ('L15','L','returned.setChapterStartNumber','ui/workspace.js','returned','number|string','void','sets AG filename projection via Layout',1),
 ('L16','L','returned.setChaptersExported','ui/workspace.js','returned','opaque doc snapshot,names','void','sets AG published files via Layout',1);

-- Store fields / DOM CustomEvent are the existing transport. Not a new event bus.
INSERT INTO messages VALUES
 ('E01','zustand','documentRevision','{"type":"integer","meaning":"monotone document edit revision"}',1),
 ('E02','zustand','sourceOffset','{"type":"integer","meaning":"CM6 cursor offset"}',0),
 ('E03','zustand','focusTarget','{"type":"object","fields":["sourceLine","sourceEnd","origin","elementId","intent","revision","sequence"]}',1),
 ('E04','zustand','scrollTarget','{"type":"object","fields":["sourceLine","fraction","origin","revision","sequence"]}',1),
 ('E05','zustand','outlineCount','{"type":"integer","meaning":"AG heading count"}',0),
 ('E06','zustand','scrollSyncEnabled','{"type":"boolean","meaning":"continuous CM6-MD scroll enabled"}',1),
 ('E07','zustand','activePanel','{"type":["string","null"],"meaning":"Dockview active panel ID"}',0),
 ('E08','dom','ocr2md:chapter-error','{"type":"string","meaning":"CustomEvent.detail error message"}',1);

INSERT INTO publishers VALUES
 ('PUB01','E01','C','ui/main.js','EditorView.updateListener -> documentChanged','docChanged'),
 ('PUB02','E02','C','ui/main.js','EditorView.updateListener -> selectionChanged','selectionSet'),
 ('PUB03','E03','C','ui/main.js','publishFocus','CM6 selection or deliberate click'),
 ('PUB04','E03','G','ui/outline-grid.js','publishFocus','row click or checkbox focus'),
 ('PUB05','E03','M','ui/workspace.js','PreviewPanel.onClick -> publishFocus','MD mapped element click'),
 ('PUB06','E03','P','ui/pdf-preview.js','PdfPreview.onClick/sendPdfNavigation','PDF OCR click / page input'),
 ('PUB07','E04',NULL,'ui/scroll-sync.js','publishScroll','CM6 user scroll'),
 ('PUB08','E04',NULL,'ui/scroll-sync.js','publishScroll','MD preview user scroll'),
 ('PUB09','E05','G','ui/outline-grid.js','viewStore.setState(outlineCount)','AG refresh detects count change'),
 ('PUB10','E06',NULL,'ui/view-store.js','setScrollSyncEnabled','explicit setter; caller is primarily test seam'),
 ('PUB11','E07','L','ui/workspace.js','onDidActivePanelChange','Dockview active panel change'),
 ('PUB12','E08','G','ui/outline-grid.js','document.dispatchEvent','AG chapter checkbox edit throws');

INSERT INTO subscriptions VALUES
 ('SUB01','E01','G','ui/outline-grid.js','viewStore.subscribe -> schedule','revision differs','rebuild AG heading projection'),
 ('SUB02','E01','M','ui/workspace.js','PreviewPanel.unsubscribe -> schedule','revision differs','re-render sanitized Markdown projection'),
 ('SUB03','E01','P','ui/pdf-preview.js','PdfPreview.unsubscribe -> sourceBlocks','revision differs','rebuild OCR source anchors'),
 ('SUB04','E02','G','ui/outline-grid.js','viewStore.subscribe -> chooseLine','offset differs AND no focusTarget','select matching heading'),
 ('SUB05','E03','G','ui/outline-grid.js','viewStore.subscribe -> chooseLine','focusTarget changed','highlight heading row'),
 ('SUB06','E03','M','ui/workspace.js','PreviewPanel.unsubscribe -> highlight','focusTarget changed','highlight mapped MD element'),
 ('SUB07','E03','P','ui/pdf-preview.js','PdfPreview.unsubscribe -> focusLine','not from PDF AND deliberate click/outline/preview intent','reveal exact OCR bbox; not from scroll'),
 ('SUB08','E03','C','ui/main.js','viewStore.subscribe -> markOutlineLine','focusTarget changed','source-line visual decoration only'),
 ('SUB09','E03',NULL,'ui/scroll-sync.js','unsubscribeFocus -> moveSource/movePreview','revision matches; origin controls destination','navigate followers without feedback loop'),
 ('SUB10','E04','G','ui/outline-grid.js','viewStore.subscribe -> chooseLine','scrollTarget changed AND no recent focus','select current heading'),
 ('SUB11','E04',NULL,'ui/scroll-sync.js','unsubscribe -> moveSource/movePreview','revision matches; scrollSyncEnabled=true','scroll follower without republishing'),
 ('SUB12','E05',NULL,'ui/main.js','unsubscribeGlobalStatus -> renderGlobalStatus','outlineCount differs','render heading count'),
 ('SUB13','E06',NULL,'ui/main.js','unsubscribeGlobalStatus -> renderGlobalStatus','scrollSyncEnabled differs','render scrolling mode'),
 ('SUB14','E06',NULL,'ui/scroll-sync.js','unsubscribe -> measureLater','enabled transition','measure and start continuous sync'),
 ('SUB15','E08',NULL,'ui/main.js','document.addEventListener -> status','chapter-error DOM event','show error in global status');

-- Existing test references. A link is NOT a certified API-level oracle.
-- Direct: test calls the interface; integration: user journey exercises it.
-- Gold-standard independent inputs/expected files remain a separate future step.
WITH mapped(id,script,fixture,expected,evidence) AS (VALUES
 ('C01','cmd-html-unified-browser.test.mjs','md','CMD source equals actual CM6 document','direct'),
 ('C02','cmd-html-unified-browser.test.mjs','md','loading source restores exact Markdown','direct'),
 ('C04','cmd-html-unified-browser.test.mjs','md','standard/custom/comment HTML read at source line','direct'),
 ('C05','cmd-html-unified-browser.test.mjs','md','HTML written and read unchanged; correct syntax','direct'),
 ('C06','cmd-html-unified-browser.test.mjs','md','comment helper emits valid HTML comment','direct'),
 ('C07','quote-indent-browser.test.mjs','md','selected lines indent/outdent with undo safety','direct'),
 ('C09','cm6-browser.test.mjs','md','EditorView state and title changes remain observable','integration'),
 ('G01','outline-browser.test.mjs','md','AG outline mounts and indexes expected headings','integration'),
 ('G02','outline-browser.test.mjs','md','AG headings rebuild after CM6 edits','integration'),
 ('G03','outline-browser.test.mjs','md','AG eventually reflects modified source','integration'),
 ('G04','promoted-chapters-browser.test.mjs','md','chapter numbering updates without corrupting source','integration'),
 ('G05','promoted-chapters-browser.test.mjs','md','published chapter links bound to source revision','integration'),
 ('G07','outline-browser.test.mjs','md','heading data reflects document source','integration'),
 ('G08','ag-header-browser.test.mjs','md','AG native grid column/filters usable','integration'),
 ('G09','ag-header-browser.test.mjs','md','column filter values are stable','integration'),
 ('G10','promoted-chapters-browser.test.mjs','md','chapter start text survives formatting','integration'),
 ('M01','dockview-preview-browser.test.mjs','md','rendered Markdown view follows source changes','integration'),
 ('M02','shared-preview-browser.test.mjs','md','re-render while preserving reading state','integration'),
 ('M03','dockview-preview-browser.test.mjs','md','document updates eventually render in preview','integration'),
 ('M04','outline-browser.test.mjs','md','source heading focus highlights preview element','integration'),
 ('M05','shared-preview-browser.test.mjs','md','preview dropdown preserves PDF viewer state','integration'),
 ('M06','preview-split-browser.test.mjs','md','splitting reparents same PDF.js viewer','integration'),
 ('M07','preview-split-browser.test.mjs','md','merging restores existing PDF viewer','integration'),
 ('P01','shared-preview-browser.test.mjs','pdf','PDF.js viewer loads original PDF+OCR map','integration'),
 ('P02','pdf-click-only-browser.test.mjs','pdf','explicit navigation reveals OCR bbox only','integration'),
 ('P03','mineru-start-only-ui-browser.test.mjs','md','start-only anchors remain locatable in PDF','integration'),
 ('P04','shared-preview-browser.test.mjs','pdf','PDF zoom remains usable across mode change','integration'),
 ('P05','preview-split-browser.test.mjs','pdf','active/split PDF instance remains persistent','integration'),
 ('P06','pdf-anchor-viewport-browser.test.mjs','pdf','PDF OCR overlay remains visible after resize','integration'),
 ('P07','preview-split-browser.test.mjs','pdf','viewer toolbar survives reparenting','integration'),
 ('P09','four-pane-pdf-browser.test.mjs','pdf','OCR bbox rect matches viewport and PDF page','integration'),
 ('P10','mineru-start-only-ui-browser.test.mjs','md','source anchors retain MinerU page/block IDs','integration'),
 ('P11','pdf-click-only-browser.test.mjs','pdf','mode switch does not trigger unsolicited PDF jumps','integration'),
 ('L01','compact-shell-browser.test.mjs','md','Dockview workspace has AG/source/preview','integration'),
 ('L02','dockview-preview-browser.test.mjs','md','workspace refresh renders latest document','integration'),
 ('L03','outline-browser.test.mjs','md','workspace refresh updates AG projection','integration'),
 ('L04','mineru-start-only-ui-browser.test.mjs','md','PDF anchors refresh for single-start source','integration'),
 ('L05','preview-split-browser.test.mjs','pdf','3 to 4 to 3 panes; same persistent PDF viewer','integration'),
 ('L06','shared-preview-browser.test.mjs','pdf','MD/PDF dropdown retains viewer state','integration'),
 ('L07','scroll-sync-browser.test.mjs','md','source and Markdown preview scroll anchors agree','integration'),
 ('L08','cm6-browser.test.mjs','md','CM6 editor mounts into workspace DOM host','integration'),
 ('L09','promoted-chapters-browser.test.mjs','md','AG module facade drives chapter export','integration'),
 ('L10','pdf-click-only-browser.test.mjs','pdf','PDF module facade maintains explicit navigation','integration'),
 ('L11','dockview-preview-browser.test.mjs','md','Dockview groups exist and resize correctly','integration'),
 ('L12','preview-split-browser.test.mjs','pdf','split state follows checkbox and group changes','integration'),
 ('L13','scroll-sync-leadership-browser.test.mjs','md','scroll coordinator preserves user gesture leadership','integration')
)
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence)
SELECT 'TC-'||id,id,'tests/'||script,
 CASE fixture WHEN 'pdf' THEN '.v6/workspace/buffetts-alpha.original.pdf' ELSE 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md' END,
 expected,evidence FROM mapped;

WITH mapped(id,script,fixture,expected) AS (VALUES
 ('E01','outline-browser.test.mjs','md','documentRevision triggers AG + MD projection refresh'),
 ('E02','outline-browser.test.mjs','md','sourceOffset selection and heading remain aligned'),
 ('E03','four-pane-pdf-browser.test.mjs','pdf','focusTarget maps one OCR identity to the correct panes'),
 ('E04','scroll-sync-leadership-browser.test.mjs','md','scrollTarget follows only the current user driver'),
 ('E05','compact-shell-browser.test.mjs','md','outlineCount shown in single global status'),
 ('E06','scroll-sync-browser.test.mjs','md','scroll enabled state controls following behavior')
)
INSERT INTO test_cases(id,message_id,script,fixture,expected,evidence)
SELECT 'TC-'||id,id,'tests/'||script,
 CASE fixture WHEN 'pdf' THEN '.v6/workspace/buffetts-alpha.original.pdf' ELSE 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md' END,
 expected,'integration' FROM mapped;

WITH mapped(id,script,fixture,expected) AS (VALUES
 ('SUB01','outline-browser.test.mjs','md','AG rebuild on doc revision'),
 ('SUB02','dockview-preview-browser.test.mjs','md','MD preview re-renders on doc revision'),
 ('SUB03','mineru-start-only-ui-browser.test.mjs','md','PDF anchor map retains IDs on doc edit'),
 ('SUB04','outline-browser.test.mjs','md','source selection chooses AG heading'),
 ('SUB05','outline-browser.test.mjs','md','AG selection follows explicit focus'),
 ('SUB06','four-pane-pdf-browser.test.mjs','pdf','MD highlight shows correct source element'),
 ('SUB07','pdf-click-only-browser.test.mjs','pdf','PDF focus only reacts to explicit click'),
 ('SUB08','outline-browser.test.mjs','md','CMD highlights chosen source line'),
 ('SUB09','scroll-sync-leadership-browser.test.mjs','md','focus navigates followers without feedback loop'),
 ('SUB10','scroll-sync-browser.test.mjs','md','AG row follows source scroll target'),
 ('SUB11','scroll-sync-leadership-browser.test.mjs','md','source or preview follows the active scroll leader'),
 ('SUB12','compact-shell-browser.test.mjs','md','global status reflects outline count'),
 ('SUB14','scroll-sync-browser.test.mjs','md','scroll sync measurement responds to enable state')
)
INSERT INTO test_cases(id,subscription_id,script,fixture,expected,evidence)
SELECT 'TC-'||id,id,'tests/'||script,
 CASE fixture WHEN 'pdf' THEN '.v6/workspace/buffetts-alpha.original.pdf' ELSE 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md' END,
 expected,'integration' FROM mapped;

-- Closing the first full-table gaps with a real isolated browser contract test.
WITH ids(id) AS (VALUES ('C03'),('C08'),('G06'),('P08'),('P12'))
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence)
SELECT 'TC-'||id,id,'tests/am/contracts-browser.test.mjs',
 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
 CASE id
  WHEN 'C03' THEN 'Converter reject leaves document unchanged; valid source loads exactly'
  WHEN 'C08' THEN 'CMDocument.destroy releases owned EditorView'
  WHEN 'G06' THEN 'AG dispose unsubscribes, destroys grid and clears host'
  WHEN 'P08' THEN 'PdfPreview.dispose tears down secondary viewer and observers'
  ELSE 'PdfPreview.clearHighlight removes selected state and OCR overlay' END,
 'direct' FROM ids;

WITH msg(id,expected) AS (VALUES
 ('E07','Dockview activation changes Zustand activePanel to outline'),
 ('E08','Real AG stale-checkbox failure publishes DOM CustomEvent and global error status'))
INSERT INTO test_cases(id,message_id,script,fixture,expected,evidence)
SELECT 'TC-'||id,id,'tests/am/contracts-browser.test.mjs',
 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',expected,'direct' FROM msg;

WITH subs(id,expected) AS (VALUES
 ('SUB13','scrollSyncEnabled event updates global status line'),
 ('SUB15','AG chapter-error DOM event is received and displayed in global status'))
INSERT INTO test_cases(id,subscription_id,script,fixture,expected,evidence)
SELECT 'TC-'||id,id,'tests/am/contracts-browser.test.mjs',
 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',expected,'direct' FROM subs;

-- Publisher rows are tested separately from message topics: one topic may have
-- multiple owners. No publisher may be approved merely because another works.
WITH pub(id,script,expected,evidence) AS (VALUES
 ('PUB01','tests/outline-browser.test.mjs','CMD edit increases documentRevision and AG updates','integration'),
 ('PUB02','tests/cm6-browser.test.mjs','CM6 selectionSet changes sourceOffset','integration'),
 ('PUB03','tests/outline-browser.test.mjs','CM6 deliberate navigation publishes focusTarget','integration'),
 ('PUB04','tests/outline-browser.test.mjs','AG heading click publishes focusTarget(origin=outline)','integration'),
 ('PUB05','tests/four-pane-pdf-browser.test.mjs','MD mapped-element click publishes focusTarget(origin=preview)','integration'),
 ('PUB06','tests/four-pane-pdf-browser.test.mjs','PDF OCR click publishes focusTarget(origin=pdf)','integration'),
 ('PUB07','tests/scroll-sync-leadership-browser.test.mjs','CM6 user scroll publishes scrollTarget(origin=cm6)','integration'),
 ('PUB08','tests/scroll-sync-leadership-browser.test.mjs','MD scroll publishes scrollTarget(origin=preview)','integration'),
 ('PUB09','tests/compact-shell-browser.test.mjs','AG recomputes outlineCount','integration'),
 ('PUB10','tests/am/contracts-browser.test.mjs','setScrollSyncEnabled publishes false/true updates','direct'),
 ('PUB11','tests/am/contracts-browser.test.mjs','Dockview active panel changed to outline','direct'),
 ('PUB12','tests/am/contracts-browser.test.mjs','Stale AG checkbox emits chapter-error from AG catch handler','direct'))
INSERT INTO test_cases(id,publisher_id,script,fixture,expected,evidence)
SELECT 'TC-'||id,id,script,
 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',expected,evidence FROM pub;

-- Selected source-confirmed inter-module access edges. Registration is an
-- inventory, NOT permission to depend on raw third-party objects. Audit the
-- source diff for NEW edges separately; this is not a complete static analyzer.
INSERT INTO access_edges VALUES
 ('X01','G','C','ui/outline-grid.js','putMarker(getCMD(),current,checked)','C05','registered','Chapter semantics uses CMD.writeHtml through CMDocument adapter'),
 ('X02','G','C','ui/outline-grid.js','markerForHeading(cmd,row)','C10','registered','Chapter marker read through CMD.readLine immutable line snapshot'),
 ('X03','L','C','ui/workspace.js','getCMD()?.requestMeasure()','C13','registered','Layout requests CM6 measurement through CMD API'),
 ('X04',NULL,'L','ui/main.js','workspace.getChapterState()','L14','registered','App shell reads detached chapter state via Workspace API'),
 ('X05',NULL,'L','ui/main.js','workspace?.debug?.dockview','L11','test_only','Only Vite DEV diagnostics see raw Dockview, never production facade'),
 ('X06','L','G','ui/workspace.js','createOutlineGrid(this.element','G01','registered','Layout invokes registered AG constructor to mount panel'),
 ('X07','L','M','ui/workspace.js','renderMarkdown(source)','M01','registered','Layout renders a read-only MD projection using public renderer'),
 ('X08','L','P','ui/workspace.js','this.pdf.moveToolbarTo(this.pdfTools)','P07','registered','Layout coordinates PDF toolbar through exposed method'),
 ('X09','L','P','ui/workspace.js','currentPdf?.pdf?.refreshAnchors()','P03','registered','Layout requests PDF anchor refresh through published method');

-- Added interface acceptance references for completed boundary isolation.
WITH mapped(id,script,expected,evidence) AS (VALUES
 ('C10','tests/am/contracts-browser.test.mjs','Read-only source line snapshot; no mutable CM6 EditorView','direct'),
 ('C11','tests/am/contracts-browser.test.mjs','Offset maps to correct 1-based line','direct'),
 ('C12','tests/am/contracts-browser.test.mjs','Snapshot equality remains valid across no-op layout and rejects different snapshot','direct'),
 ('C13','tests/am/contracts-browser.test.mjs','Request measurement without exposing native editor','direct'),
 ('L14','tests/promoted-chapters-browser.test.mjs','Chapter export consumes detached rows and startText','integration'),
 ('L15','tests/promoted-chapters-browser.test.mjs','Starting number changes AG file projections via Layout','integration'),
 ('L16','tests/promoted-chapters-browser.test.mjs','Published chapter links tracked via Layout facade','integration'))
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence)
SELECT 'TC-'||id,id,script,
 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',expected,evidence FROM mapped;
