-- Read-only source audit at V6 feature freeze 0733abb. Git tracks these rows.
-- visibility raw/internal means FOUND in code, NOT approved as stable public API.
INSERT INTO modules VALUES
 ('C','CMD','CodeMirror 6','ui/cm-document.js'),
 ('G','AG','AG Grid','ui/outline-grid.js'),
 ('M','MD Preview','markdown-it + DOMPurify','ui/markdown-preview.js'),
 ('P','PDF Preview','PDF.js','ui/pdf-preview.js'),
 ('L','Layout','Dockview','ui/workspace.js'),
 ('A','Media','AG Grid + resumable download','ui/media-module.js'),
 ('T','LaTeX','AG Grid + KaTeX review plugin','ui/latex-module.js');

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
 ('C14','C','CMDocument.replaceRanges','ui/cm-document.js','export','array of from/to/expected/insert','changed count','one validated CM6 transaction; forbids original evidence edits',1),
 ('C15','C','CMDocument.capturePasteTarget','ui/cm-document.js','export','none','opaque snapshot + selected range','captures insertion position before async file upload',1),
 ('C16','C','CMDocument.pasteAt','ui/cm-document.js','export','captured target, local Markdown image reference','void','one CM6 undo step; rejects changed source and evidence',1),
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
 ('M05','M','PreviewPanel.setMode','ui/workspace.js','internal','md|pdf','void','gates unready PDF; hides mode toolbar; retains PDF instance',1),
 ('M06','M','PreviewPanel.detachPdf','ui/workspace.js','internal','DetachedPdfPanel','void','reparents persistent viewer',0),
 ('M07','M','PreviewPanel.reattachPdf','ui/workspace.js','internal','none','void','reparents persistent viewer',0),
 ('M08','M','installObsidianImages','ui/obsidian-images.js','export','markdown-it renderer instance','void','Obsidian wiki images and Markdown image dimensions; read-only rendering',1),
 ('P01','P','PdfPreview.open','ui/pdf-preview.js','export','none','Promise<void>','loads /api/pdf-map + /api/pdf; ready after first page paint',1),
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
 ('P13','P','PdfPreview.whenReady','ui/pdf-preview.js','export','none','Promise<boolean>','reports first-page warm-up result without exposing PDF.js internals',1),
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
 ('L16','L','returned.setChaptersExported','ui/workspace.js','returned','opaque doc snapshot,names','void','sets AG published files via Layout',1),
 ('L17','L','returned.setWorkModule','ui/workspace.js','returned','chapter-boundary|media','void','switches AG view projections',1),
 ('L18','L','returned.scanMedia','ui/workspace.js','returned','none','Promise<void>','requests Media scan through API',1),
 ('L19','L','returned.downloadMedia','ui/workspace.js','returned','none','Promise<void>','requests Media download through API',1),
 ('A01','A','createMediaModule','ui/media-module.js','export','host,readDocument,CMD port,status','module facade','mounts independent Media AG with lazy thumbnail preview and download workflow',1),
 ('A02','A','findMedia','ui/media-module.js','export','Markdown string','list with source ranges','reads normal/sized/wikilink image URL ranges outside evidence',1),
 ('A03','A','returned.scan','ui/media-module.js','returned','none','Promise<void>','refreshes Media rows and server resume status',1),
 ('A04','A','returned.downloadAll','ui/media-module.js','returned','none','Promise<void>','downloads each remote media without modifying other modules',1),
 ('A05','A','returned.setActive','ui/media-module.js','returned','boolean','void','toggles Media projection lifecycle',1),
 ('A06','A','download_chunk','scripts/v6_media.py','export','document,url','state/bytes/path','durable validated remote Range chunk, no Markdown edit',1),
 ('A07','A','status','scripts/v6_media.py','export','document,url','state/bytes/path','read persisted media status',1),
 ('A08','A','read_local','scripts/v6_media.py','export','document,filename','bytes,MIME','serves only validated local media names',1),
 ('A09','A','inventory','scripts/v6_media.py','export','document','completed local file list','read-only media inventory; no new directories',1),
 ('A10','A','store_pasted_image','scripts/v6_media.py','export','document,bytes,mime','local path+bytes','atomic deduplicated clipboard image; no document editing',1),
 ('A11','A','uploadPastedImage','ui/media-module.js','export','Blob image','Promise<local path>','authorized binary upload through Media endpoint',1),
 ('A12','A','chapter_media_references','scripts/v6_media.py','export','chapter Markdown','canonical referenced media paths','sized Markdown and Obsidian wiki chapter references',1),
 ('T01','T','findLatex','ui/latex-scan.js','export','Markdown source','source-positioned LaTeX spans','read-only scan with code and immutable comment exclusions',1),
 ('T02','T','checkLatex','ui/latex-module.js','export','LaTeX span','KaTeX output and validation status','strict KaTeX render with errors as review results',1),
 ('T03','T','createLatexModule','ui/latex-module.js','export','host,readDocument,onStatus','module facade','owns independent AG and subscribes document revisions',1),
 ('T04','T','returned.refresh','ui/latex-module.js','returned','none','void','re-scans live CMD and updates AG',1),
 ('T05','T','returned.setActive','ui/latex-module.js','returned','boolean','void','toggles separate LaTeX review projection',1),
 ('T06','T','findUndelimitedInline','ui/latex-inline-candidates.js','export','Markdown source and masked protected regions','read-only candidate source ranges','intra-plugin heuristic for MinerU undelimited inline equations; requires review',0),
 ('T09','T','planReviewEdit','ui/latex-review-markers.js','export','Markdown source,formula span,choice','optimistic CMD edits','inserts/replaces/removes paired HTML comments without I/O',1),
 ('T10','T','findReviewMarkers','ui/latex-review-markers.js','export','Markdown source and scanned formulas','review projection','reads paired HTML comments in CM6 original Markdown',1),
 ('T11','T','projectReviewedInlineLatex','ui/latex-inline-preview.js','export','Markdown source including CM6 review markers','Markdown projection and deferred KaTeX fragments','deferred sanitized inline rendering after markdown-it and DOMPurify; avoids paragraph truncation and CM6 changes',1);

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
 ('PUB12','E08','G','ui/outline-grid.js','document.dispatchEvent','AG chapter checkbox edit throws'),
 ('PUB13','E03','A','ui/media-module.js','publishFocus','Media AG image row click');

INSERT INTO subscriptions VALUES
 ('SUB01','E01','G','ui/outline-grid.js','viewStore.subscribe -> schedule','revision differs','rebuild AG heading projection'),
 ('SUB02','E01','M','ui/workspace.js','PreviewPanel.unsubscribe -> schedule','revision differs','re-render sanitized Markdown projection'),
 ('SUB03','E01','P','ui/pdf-preview.js','PdfPreview.unsubscribe -> sourceBlocks','revision differs','rebuild OCR source anchors'),
 ('SUB04','E02','G','ui/outline-grid.js','viewStore.subscribe -> chooseLine','offset differs AND no focusTarget','select matching heading'),
 ('SUB05','E03','G','ui/outline-grid.js','viewStore.subscribe -> chooseLine','focusTarget changed','highlight heading row'),
 ('SUB06','E03','M','ui/workspace.js','PreviewPanel.unsubscribe -> highlight','focusTarget changed','highlight mapped MD element'),
 ('SUB07','E03','P','ui/pdf-preview.js','PdfPreview.unsubscribe -> focusLine','not from PDF AND deliberate click/outline/preview intent','reveal exact OCR bbox; not from scroll'),
 ('SUB08','E03','C','ui/main.js','viewStore.subscribe -> markOutlineLine','focusTarget changed','source-line visual decoration only'),
 ('SUB09','E03',NULL,'ui/scroll-sync.js','unsubscribeFocus -> moveSource/movePreview','revision matches; origin controls destination','review module clicks navigate CMD/MD without feedback loop'),
 ('SUB10','E04','G','ui/outline-grid.js','viewStore.subscribe -> chooseLine','scrollTarget changed AND no recent focus','select current heading'),
 ('SUB11','E04',NULL,'ui/scroll-sync.js','unsubscribe -> moveSource/movePreview','revision matches; scrollSyncEnabled=true','scroll follower without republishing'),
 ('SUB12','E05',NULL,'ui/main.js','unsubscribeGlobalStatus -> renderGlobalStatus','outlineCount differs','render heading count'),
 ('SUB13','E06',NULL,'ui/main.js','unsubscribeGlobalStatus -> renderGlobalStatus','scrollSyncEnabled differs','render scrolling mode'),
 ('SUB16','E01','A','ui/media-module.js','viewStore.subscribe -> schedule','documentRevision changes','rebuild Media image list'),
 ('SUB17','E01','T','ui/latex-module.js','viewStore.subscribe -> schedule','documentRevision changes','refresh active LaTeX review list'),
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
 ('P13','shared-preview-browser.test.mjs','pdf','PDF option and split are gated until first page paint; ready/failed result passed via API','integration'),
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
 ('X09','L','P','ui/workspace.js','currentPdf?.pdf?.refreshAnchors()','P03','registered','Layout requests PDF anchor refresh through published method'),
 ('X10','L','P','ui/workspace.js','this.pdf.whenReady()','P13','registered','Layout gates PDF controls via semantic warm-up readiness API'),
 ('X11','L','A','ui/workspace.js','createMediaModule(this.mediaHost','A01','registered','Layout hosts Media panel without accessing its AG internals'),
 ('X12','A','C','ui/media-module.js','cmd().replaceRanges(','C14','registered','Media requests optimistic batch edit through public CMD port'),
 ('X13','L','C','ui/workspace.js','getCMD().replaceRanges(edits)','C14','registered','Layout implements Media write port with public CMD operation'),
 ('X14',NULL,'A','scripts/v6_serve.py','media_download_chunk(DOC, url)','A06','registered','HTTP adapter invokes Media-only downloader'),
 ('X15',NULL,'A','scripts/v6_serve.py','media_status(DOC, url)','A07','registered','HTTP adapter exposes Media status'),
 ('X16',NULL,'A','scripts/v6_serve.py','media_read_local(DOC, path[','A08','registered','HTTP adapter reads only whitelisted media paths'),
 ('X17','L','A','ui/workspace.js','this.media?.setActive(','A05','registered','Layout switches projection via Media API'),
 ('X18','L','A','ui/workspace.js','currentOutline?.media?.scan()','A03','registered','Shell scans Media through Layout API'),
 ('X19','L','A','ui/workspace.js','currentOutline?.media?.downloadAll()','A04','registered','Shell downloads Media through Layout API'),
 ('X20',NULL,'A','scripts/v6_serve.py','media_inventory(DOC)','A09','registered','HTTP transport combines Media inventory with chapter read API'),
 ('X21',NULL,'C','ui/main.js','cm.capturePasteTarget()','C15','registered','Shell asks CMD for opaque live paste position'),
 ('X22',NULL,'C','ui/main.js','cm.pasteAt(target','C16','registered','Shell asks CMD to insert local Markdown image atomically'),
 ('X23',NULL,'A','ui/main.js','uploadPastedImage(file)','A11','registered','Shell delegates clipboard binary upload to Media'),
 ('X24',NULL,'A','scripts/v6_serve.py','media_store_pasted_image(DOC, data, mime)','A10','registered','HTTP adapter invokes atomic Media storage'),
 ('X25',NULL,'A','scripts/v6_serve.py','chapter_media_references(markdown)','A12','registered','HTTP composition reads chapter references via Media public parser'),
 ('X26','L','T','ui/workspace.js','createLatexModule(this.latexHost','T03','registered','Layout mounts independently owned LaTeX AG'),
 ('X27','L','T','ui/workspace.js','this.latex?.setActive(','T05','registered','Layout switches LaTeX via registered module facade'),
 ('X28','L','T','ui/workspace.js','currentOutline?.latex?.refresh()','T04','registered','Shell scans LaTeX through Layout facade'),
 ('X32','T','C','ui/latex-module.js','getCMD().replaceRanges(edits)','C14','registered','LaTeX requests optimistic Markdown annotation transaction through CMD public API'),
 ('X33','L','C','ui/workspace.js','getCMD().replaceRanges(edits)','C14','registered','Layout injects a narrow CMD capability to the LaTeX plugin'),
 ('X34','M','T','ui/markdown-preview.js','projectReviewedInlineLatex(source)','T11','registered','MD preview projects LaTeX confirmed inline annotations using LaTeX public renderer; no CM6 writes');

-- X31 remains in Git commit cb524eb and in this historical finding row.
INSERT INTO architecture_findings VALUES
 ('X31','cb524eb','debt','ui/latex-module.js -> scripts/v6_serve.py -> scripts/v6_latex_review.py',
  'LaTeX independently persisted review JSON through its own HTTP read/write API, bypassing unified CMD document edits',
  'Replace with paired inline/block Markdown HTML comments via CMD.replaceRanges; migrate 8 actual user review decisions; delete active sidecar HTTP code',
  'resolved');

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


-- First Media module: independent API and CMD optimistic editing contract.
WITH mapped(id,script,fixture,expected) AS (VALUES
 ('A01','media-browser.test.mjs','md','media AG with lazy preview, adoption coloring and categorical filters'),
 ('A02','media-browser.test.mjs','md','scan of 11 image links excludes immutable MinerU evidence'),
 ('A03','media-browser.test.mjs','md','media scan lists orphan files and stable adopted/status filters'),
 ('A04','media-browser.test.mjs','md','download resumes from durable Range part then localizes CMD source'),
 ('A05','media-browser.test.mjs','md','module switching preserves outline and Media views'),
 ('A06','media-browser.test.mjs','md','download chunk persists partial and completes with signature check'),
 ('A07','media-browser.test.mjs','md','status reports partial and completed files'),
 ('A08','media-browser.test.mjs','md','only hashed completed media may be read'),
 ('A09','media-browser.test.mjs','md','inventory includes local unreferenced files and published chapter-only files'),
 ('C14','media-browser.test.mjs','md','CMD URL replacement is atomic undoable and excludes evidence'),
 ('L17','media-browser.test.mjs','md','module dropdown selects Media or chapter boundaries'),
 ('L18','media-browser.test.mjs','md','scan media through registered facade'),
 ('L19','media-browser.test.mjs','md','download media through registered facade')
)
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence)
SELECT 'TC-'||id,id,'tests/'||script,
 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',expected,'integration' FROM mapped;


WITH media_msgs(id,kind,expected) AS (VALUES
 ('PUB13','publisher','Media row focus uses existing focusTarget contract'),
 ('SUB16','subscription','Media rows update when CMD changes without a shadow document')
)
INSERT INTO test_cases(id,publisher_id,subscription_id,script,fixture,expected,evidence)
SELECT 'TC-'||id,
 CASE WHEN kind='publisher' THEN id ELSE NULL END,
 CASE WHEN kind='subscription' THEN id ELSE NULL END,
 'tests/media-browser.test.mjs',
 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',expected,'integration' FROM media_msgs;


-- Clipboard paste: CMD position/edit APIs and isolated Media upload transport.
WITH pasted(id,expected) AS (VALUES
 ('C15','captures exact CM6 range before async upload'),
 ('C16','inserts image link with one undo and preserved source'),
 ('A10','validates bytes, MIME and hash before atomic media store'),
 ('A11','clipboard image uploads via authorized Media transport')
)
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence)
SELECT 'TC-'||id,id,'tests/media-paste-browser.test.mjs',
 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',expected,'integration' FROM pasted;


-- MD Preview feature adapter: only maps Obsidian-sized image syntax at render time.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-M08','M08','tests/obsidian-image-preview-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Obsidian wiki/alt/link sizing renders real media; source and code unchanged','integration');


-- Adopted references must match the Obsidian sizing forms in MD Preview.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-A02-SIZED','A02','tests/media-adoption-syntax.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Media references resolve exact real line 103 and resized Markdown/wiki links','integration'),
 ('TC-A12','A12','tests/media-adoption-syntax.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Published chapter image dimensions count as adopted references','integration');


-- First read-only LaTeX audit plugin uses public review transport only.
WITH latex_cases(id,description) AS (VALUES
 ('T01','scans 20 real math fences, 22 inferred inline candidates and explicit delimiters; excludes evidence/code/currency'),
 ('T02','KaTeX strict render success/failure/unavailable independent of OCR-boundary review; line 855 fails while marked pending review'),
 ('T03','LaTeX mounts an independent AG panel without altering source or Media'),
 ('T04','scan reflects CMD changes without a Markdown shadow copy'),
 ('T05','module switch preserves chapter outline/Media and PDF viewer')
)
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence)
SELECT 'TC-'||id,id,'tests/latex-browser.test.mjs',
 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',description,'integration' FROM latex_cases;
INSERT INTO test_cases(id,subscription_id,script,fixture,expected,evidence)
VALUES ('TC-SUB17','SUB17','tests/latex-browser.test.mjs',
 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
 'source edit triggers automatic re-scan through documentRevision','integration');


-- AG review plugin source focus must navigate both MD and CMD with a visible PDF.
INSERT INTO test_cases(id,subscription_id,script,fixture,expected,evidence) VALUES
 ('TC-SUB09-LATEX','SUB09','tests/latex-four-view-browser.test.mjs',
 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
 'LaTeX AG click reaches selected source line, focused MD math and exact PDF OCR block in split four-window layout','integration');


-- Candidate detection never certifies guessed TeX boundaries as correct.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-T06','T06','tests/latex-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'MinerU mixed prose LaTeX is recovered as pending-review candidates without touching Markdown or evidence','integration');


-- Render success is a separate filter from review status, including line 855.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-T02-RENDER','T02','tests/latex-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'KaTeX render results 成功/失败/未检测 independently filterable; line 855 rendering failure with 待复核 review','integration');


-- LaTeX human triage is distinct from parser validation and stored as a sidecar.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-T09','T09','tests/latex-review-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'LaTeX selection inserts/replaces/removes exact paired review marker in one CMD undoable transaction','integration'),
 ('TC-T10','T10','tests/latex-review-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'CM6 Markdown re-scan restores marked choices after save/reload; original TeX unchanged','integration');


-- Confirmed formula is rendered in MD reading projection, not a metadata-only state.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-T11','T11','tests/latex-review-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Confirmed inline LaTeX renders KaTeX in surrounding MD paragraph; ignore remains plain text; source unchanged','integration');
