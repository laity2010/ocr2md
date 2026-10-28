-- Read-only source audit at V6 feature freeze 0733abb. Git tracks these rows.
-- visibility raw/internal means FOUND in code, NOT approved as stable public API.
INSERT INTO modules VALUES
 ('C','CMD','CodeMirror 6','ui/cm-document.js'),
 ('G','AG','AG Grid','ui/outline-grid.js'),
 ('M','MD Preview','markdown-it + DOMPurify','ui/markdown-preview.js'),
 ('P','PDF Preview','PDF.js','ui/pdf-preview.js'),
 ('L','Layout','Dockview','ui/workspace.js'),
 ('A','Media','AG Grid + resumable download','ui/media-module.js'),
 ('T','LaTeX','AG Grid + KaTeX review plugin','ui/latex-module.js'),
 ('W','WCP Runtime','bounded extension contract','ui/wcp-runtime.js');

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
 ('C17','C','CMDocument.readAnnotations','ui/cm-document.js','export','optional tag/attribute filters','source-positioned annotation records','generic HTML comment syntax in CM6 source; no nesting or business semantics',1),
 ('C18','C','CMDocument.writeAnnotation','ui/cm-document.js','export','tag,attributes,at or target','updated source annotation record','CM6 atomic insert/update with stale-target and immutable evidence safeguards',1),
 ('C19','C','CMDocument.removeAnnotation','ui/cm-document.js','export','annotation record from CMD','removed flag','CM6 atomic exact comment deletion; never deletes associated Markdown content',1),
 ('C20','C','CMDocument.editAnnotations','ui/cm-document.js','export','array of generic comment insert/update/remove and guarded text operations; optional source guard','single undoable CM6 transaction','atomic HTML annotations plus Markdown delimiters; checked target and evidence protection',1),
 ('C21','C','parseAnnotation','ui/cmd-annotations.js','export','single HTML comment text','tag and attributes or null','public read-only CMD annotation syntax parser, without business semantics',1),
 ('C22','C','formatAnnotation','ui/cmd-annotations.js','export','tag, attributes, spacing options','single-line HTML comment text','public CMD annotation syntax formatter, rejects invalid attribute names and multiline values',1),
 ('C23','C','scanAnnotations','ui/cmd-annotations.js','export','Markdown source','offset-positioned syntax records','public read-only CMD annotation scanner; no state or writes',1),
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
 ('G11','G','countMarkers','ui/chapter-markers.js','export','CM6 document or Markdown','chapter comment/tag counts','public detached chapter-marker summary for shell global status',1),
 ('G12','G','buildChapterFiles','ui/chapter-files.js','export','Markdown, heading rows, start number','detached chapter files','public chapter export projection; no source edit or disk write',1),
 ('G13','G','registerOutlineTitleScaleSetting','ui/outline-grid.js','export','settings port,onChange','unsubscribe','Chapter AG registers its own global title font multiplier',1),
 ('G14','G','returned.setTitleFontScale','ui/outline-grid.js','returned','number','void','updates only AG title font scale and recalculates row heights',1),
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
 ('L20','L','returned.normalizeLatex','ui/workspace.js','returned','none','void','routes explicit LaTeX normalization request to module facade; no direct source writes',1),
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
 ('T09','T','planReviewAnnotations','ui/latex-review-markers.js','export','Markdown source,formula span,choice','generic CMD annotation operations','maps review changes to CMD tag/attributes actions without serializing HTML',1),
 ('T10','T','findReviewMarkers','ui/latex-review-markers.js','export','Markdown source and scanned formulas','review projection','associates single HTML comment with adjacent Markdown math; reads legacy pairs for migration',1),
 ('T11','T','projectReviewedInlineLatex','ui/latex-inline-preview.js','export','Markdown source including CM6 review markers','Markdown projection and deferred KaTeX fragments','deferred sanitized inline rendering after markdown-it and DOMPurify; avoids paragraph truncation and CM6 changes',1),
 ('T12','T','returned.normalizeReviewed','ui/latex-module.js','returned','none','void','explicitly normalize previously confirmed annotations via generic CMD editAnnotations; no implicit Save',1);

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
 ('PUB09','E05','G','ui/outline-grid.js','publishOutlineCount','AG refresh detects count change'),
 ('PUB10','E06',NULL,'ui/view-store.js','setScrollSyncEnabled','explicit setter; caller is primarily test seam'),
 ('PUB11','E07','L','ui/workspace.js','publishActivePanel','Dockview active panel change'),
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
 ('X01','G','C','ui/outline-grid.js','putMarker(getCMD(),current,checked)','C05','registered','Chapter uses CMD.writeAnnotation for comments; writeHtml only for historical custom-tag conversion'),
 ('X02','G','C','ui/outline-grid.js','markerForHeading(cmd,row,markers)','C10','registered','Chapter binds CMD.readAnnotations tag/attributes to the heading line and uses readLine for legacy tags'),
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
 ('X13','L','C','ui/workspace.js','cmd.replaceRanges(edits)','C14','registered','Layout Media write adapter delegates to CMD replaceMediaReferences where available or replaceRanges compatibility port'),
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
 ('X32','T','C','ui/latex-module.js','getCMD().editAnnotations(operations','C20','registered','LaTeX applies single comment markers and math delimiters through one CMD annotation transaction'),
 ('X33','L','C','ui/workspace.js','getCMD().editAnnotations(operations','C20','registered','Layout injects a narrow CMD annotation editing capability to LaTeX'),
 ('X34','M','T','ui/markdown-preview.js','projectReviewedInlineLatex(source)','T11','registered','MD preview projects LaTeX confirmed inline annotations using LaTeX public renderer; no CM6 writes'),
 ('X38',NULL,'L','ui/main.js','workspace.normalizeLatex()','L20','registered','Shell requests normalization only through Layout facade'),
 ('X39','L','T','ui/workspace.js','currentOutline?.latex?.normalizeReviewed()','T12','registered','Layout routes normalization to LaTeX module public method'),
 ('X40','T','C','ui/latex-module.js','getCMD().editAnnotations(operations','C20','registered','Explicit LaTeX normalization uses the same generic CMD transaction, not direct file writes');

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
 'tests/fixtures/buffetts-alpha-four-view-reviewed.md.gz',
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


-- LaTeX human triage is distinct from parser validation and uses only CMD
-- inline comment annotations, not a second sidecar store.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-T09','T09','tests/latex-review-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'LaTeX selection plans generic CMD operations; confirmation writes one HTML review comment adjacent to native math delimiters','integration'),
 ('TC-T10','T10','tests/latex-review-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'CMD annotation scanner restores historical and canonical marker choices after save/reload; TeX unchanged','integration');


-- Confirmed formula is rendered in MD reading projection, not a metadata-only state.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-T11','T11','tests/latex-review-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Confirmed inline LaTeX renders KaTeX in surrounding MD paragraph; ignore remains plain text; source unchanged','integration');


-- CMD syntax-only annotations; no business semantics, quote nesting, or MD renderer changes.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-C17','C17','tests/cmd-annotations-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Read chapter and LaTeX annotations by tag/attribute with source offsets; skip provenance comment body','direct'),
 ('TC-C18','C18','tests/cmd-annotations-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Insert inline comment at exact offset and replace attributes in CM6, keeping ordinary Markdown unchanged','direct'),
 ('TC-C19','C19','tests/cmd-annotations-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Reject stale comment target and prohibited evidence modification; remove only annotation','direct');


-- Headings and LaTeX now consume the CMD annotation API instead of owning
-- parallel HTML parsing/serialization in business modules.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-C20','C20','tests/cmd-annotations-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Atomic generic annotation/text edits with exact attributes, stale-source rejection and full original-text round-trip','direct');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-L20','L20','tests/latex-normalize-browser.test.mjs',
  'tests/fixtures/latex-legacy-display.md',
  'Shell normalization action routes via Workspace facade; no write until global Save','integration'),
 ('TC-T12','T12','tests/latex-normalize-browser.test.mjs',
  'tests/fixtures/latex-legacy-display.md',
  'LaTeX module upgrades eight legacy reviews to single-comment native math, preserving IDs/contents and supporting global Save and reload','integration');
INSERT INTO access_edges VALUES
 ('X35','G','C','ui/chapter-markers.js','cm.writeAnnotation(','C18','registered','Chapter annotates a heading via CMD generic tag/attribute writer'),
 ('X36','G','C','ui/chapter-markers.js','reader.readAnnotations(','C17','registered','Chapter reads CMD tags and binds immediately preceding marker to heading'),
 ('X37','T','C','ui/latex-module.js','getCMD()?.readAnnotations()','C17','registered','LaTeX matches formula spans to CMD parsed comment records');

-- Public pure syntax ports and chapter business projections referenced across
-- modules. These are existing exports, not new services or editable stores.
INSERT INTO access_edges VALUES
 ('X41','G','C','ui/chapter-markers.js','import {parseAnnotation}','C21','registered','Chapter consumes CMD public syntax parser for historical marker decode'),
 ('X42','T','C','ui/latex-review-markers.js','import {scanAnnotations}','C23','registered','LaTeX review uses public read-only CMD scan fallback'),
 ('X43','T','C','ui/latex-inline-preview.js','import {scanAnnotations}','C23','registered','LaTeX preview projects public CMD syntax only; no editor access'),
 ('X44',NULL,'G','ui/main.js','countMarkers(view.state.doc)','G11','registered','Global status reads detached chapter marker count'),
 ('X45',NULL,'G','ui/main.js','buildChapterFiles(doc.toString()','G12','registered','Shell asks Chapter public projection for files before authorized export');

INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-C21','C21','tests/cmd-annotations-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Parse exact HTML comment attributes; reject prose, duplicates and invalid syntax','direct'),
 ('TC-C22','C22','tests/cmd-annotations-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Format safe single-line comments, encode entities, reject invalid attributes','direct'),
 ('TC-C23','C23','tests/cmd-annotations-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Scan source-offset annotation records without mistaking nested MinerU evidence for tags','direct'),
 ('TC-G11','G11','tests/compact-shell-browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Global shell status includes detached Chapter marker counts from one CMD document','integration'),
 ('TC-G12','G12','tests/chapter-numbering.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Pure Chapter export creates correctly numbered and merged MD files without mutating source','direct');

-- WCP Settings WP1: owner-defined CM source font-size registration.
-- CMD owns JSON source + compare-and-save; Settings owns only schema/projections.
INSERT INTO modules VALUES ('S','Global Settings','Dockview + AG + CodeMirror projections','ui/settings-module.js');
INSERT INTO apis VALUES
 ('C24','C','openCMDJsonSource','ui/cmd-json-source.js','export','host,onUpdate','CMD JSON source, grammar-aware key navigation and record transaction port','source edit/history/save + AST exact record path + migration transaction + fingerprint',1),
 ('C25','C','registerCMSourceFontSetting','ui/cm-font-setting.js','export','settings port','unsubscribe','CM source registers its font value and receives changed message',1),
 ('S01','S','createSettingsModule','ui/settings-module.js','export','container,status','settings API facade','creates an independent three-pane Settings instance',1),
 ('S02','S','register','ui/settings-module.js','internal','module/key/schema','void','registers module key, default metadata and hard bounds, stores one JSON record per key',1),
 ('S03','S','subscribe','ui/settings-module.js','internal','module,key,handler','unsubscribe','routes settings.changed only to registered owner',1),
 ('S04','S','get','ui/settings-module.js','internal','key','current effective value','read-only projection of CMD JSON',1),
 ('S05','S','set','ui/settings-module.js','internal','key,number','void','validates and delegates exact key-path scalar edit to CMD',1),
 ('S06','S','save','ui/settings-module.js','internal','none','Promise<boolean>','delegates durable write and stale-write defense to CMD',1);
INSERT INTO messages VALUES
 ('E09','dom','settings.changed','{"key":"string","value":"number","origin":"string"}',1);
INSERT INTO publishers VALUES
 ('PUB-S01','E09','S','ui/settings-module.js','container.dispatchEvent','Effective registered JSON value changes');
INSERT INTO subscriptions VALUES
 ('SUB-C01','E09','C','ui/cm-font-setting.js','settings.subscribe','Registered CM source key change','Set public CSS variable for source editor font size'),
 ('SUB-G01','E09','G','ui/outline-grid.js','settings.subscribe','Registered chapter title scale key change','Send title scale through Workspace semantic port into AG');
INSERT INTO access_edges VALUES
 ('X70','S','C','ui/settings-module.js','import {openCMDJsonSource,readCMDJsonSnapshot}','C24','registered','Settings requests JSON text transactions only via CMD port'),
 ('X71',NULL,'S','ui/main.js','createSettingsModule(','S01','registered','Shell mounts Settings facade into the WCP module selector'),
 ('X72',NULL,'C','ui/main.js','registerCMSourceFontSetting(settings)','C25','registered','CM module registers the first settings key at composition root'),
 ('X90',NULL,'G','ui/main.js','registerOutlineTitleScaleSetting(settings','G13','registered','Shell subscribes chapter title multiplier through G registration API'),
 ('X91','L','G','ui/workspace.js','grid?.setTitleFontScale(','G14','registered','Layout forwards settings multiplier to Chapter AG semantic method');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-C24','C24','tests/settings-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','JSON CM6 source read-write and compare-and-save', 'integration'),
 ('TC-C25','C25','tests/settings-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','CM source module explicitly registers defaultFontSize and receives changes','integration'),
 ('TC-G13','G13','tests/outline-title-scale-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chapter title multiplier range, decimal step and saved restore','integration'),
 ('TC-G14','G14','tests/outline-title-scale-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG title scales without clipping or changing other columns','integration'),

 ('TC-S01','S01','tests/settings-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Independent AG/CM/Preview panes mount and switch without destroying markdown','integration'),
 ('TC-S02','S02','tests/settings-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG fixed columns, actual record fields and reused chapter EnumCheckboxFilter','integration'),
 ('TC-S03','S03','tests/settings-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Registered subscriber receives effective settings.changed','integration'),
 ('TC-S04','S04','tests/settings-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG slider and CM6 report one effective setting value','integration'),
 ('TC-S05','S05','tests/settings-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG/source bidirectional AST location, slider changes record.value and undo reverts','integration'),
 ('TC-S06','S06','tests/settings-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Settings save/reload persists record metadata/range/value without touching markdown','integration');
INSERT INTO test_cases(id,message_id,script,fixture,expected,evidence) VALUES
 ('TC-E09','E09','tests/settings-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','DOM settings.changed is emitted on accepted CM source changes','integration');
INSERT INTO test_cases(id,publisher_id,script,fixture,expected,evidence) VALUES
 ('TC-PUB-S01','PUB-S01','tests/settings-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Publisher notifies CM owner only on effective value delta','integration');
INSERT INTO test_cases(id,subscription_id,script,fixture,expected,evidence) VALUES
 ('TC-SUB-C01','SUB-C01','tests/settings-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','CM source receives valid update and applies CSS immediately','integration');

INSERT INTO test_cases(id,subscription_id,script,fixture,expected,evidence) VALUES
 ('TC-SUB-G01','SUB-G01','tests/outline-title-scale-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Registered settings.changed title-scale subscriber updates AG title through public Layout and preserves rows/column heights','integration');

-- CMD JSON I/O server is not owned by Settings; enforce authorization and CAS.
INSERT INTO apis VALUES
 ('C27','C','save','scripts/v6_cmd_settings.py','export','path,bytes,expectedSha','saved:bool,newSha','atomic optimistic UTF-8 JSON settings persistence',1);
INSERT INTO access_edges VALUES
 ('X73',NULL,'C','scripts/v6_serve.py','cmd_settings_save(','C27','registered','Authorized HTTP endpoint delegates JSON storage to CMD transport');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-C27','C27','tests/settings-server.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Authenticated CMD JSON settings I/O preserves bytes, rejects stale, invalid and unauthorized writes','direct');

-- Lazy Settings preflight reads JSON through CMD without mounting CM6.
INSERT INTO apis VALUES
 ('C28','C','readCMDJsonSnapshot','ui/cmd-json-source.js','export','none','Promise<{text,etag}>','read-only authorized public JSON snapshot; no EditorView or Dockview created',1);
INSERT INTO access_edges VALUES
 ('X74','S','C','ui/settings-module.js','readCMDJsonSnapshot()','C28','registered','Settings startup loads effective values via CMD read-only JSON port');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-C28','C28','tests/settings-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Startup applies saved font without creating hidden secondary Dockview or CM6','integration');


-- WCP extension capabilities are versioned AM ports, not invisible hooks.
INSERT INTO apis VALUES
 ('W01','W','createWCPRuntime','ui/wcp-runtime.js','export','none','WCP facade','composition root creates explicit WCP adapter',1),
 ('W02','W','returned.editorExtensions','ui/wcp-runtime.js','returned','none','CM6 extension array','runtime may provide CM6 extensions only through composition root',1),
 ('W03','W','returned.wrapCMD','ui/wcp-runtime.js','returned','CMD composition object','CMD facade','WCP may extend CMD port; must not give raw CMD to AG consumers',1),
 ('W04','W','returned.onCMReady','ui/wcp-runtime.js','returned','CM6 mount/status port','void','WCP editor extension lifecycle; raw CM6 only at composition root (review pending)',1),
 ('W05','W','returned.onAGReady','ui/wcp-runtime.js','returned','getChapterIndex/getStartNumber/applyChapterQuery','void','read-only bounded chapter port; never AG/Grid/CMD raw objects',1),
 ('W06','W','returned.onPreviewInit','ui/wcp-runtime.js','returned','setScope/repaint/isDisposed','unsubscribe','semantic preview port without raw DOM',1),
 ('W07','W','returned.renderPreview','ui/wcp-runtime.js','returned','source,scope,render','sanitized HTML','WCP may project chapter scope via registered render delegate',1),
 ('W08','W','returned.onLayoutReady','ui/wcp-runtime.js','returned','getRatios/setRatios/onChange','unsubscribe','semantic layout ratio port; no Dockview raw object',1),
 ('W09','W','returned.preservePreviewNodes','ui/wcp-runtime.js','returned','none','boolean','PreviewPanel owns optional DOM reconciliation; WCP cannot mutate DOM directly',1);

INSERT INTO access_edges VALUES
 ('X-W01',NULL,'W','ui/main.js','createWCPRuntime()','W01','registered','Composition root obtains registered WCP runtime factory'),
 ('X-W02','L','W','ui/workspace.js','onAGReady(bridge)','W05','registered','Layout exposes only readonly chapter projections to WCP lifecycle');

INSERT INTO test_cases VALUES
 ('TC-W01','W01',NULL,NULL,NULL,'tests/wcp-runtime-contract.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','default WCP adapter and exported public contract are present','direct'),
 ('TC-W02','W05',NULL,NULL,NULL,'tests/wcp-runtime-contract.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','WCP AG bridge provides no AG Grid or CMD internals','direct'),
 ('TC-W03','W08',NULL,NULL,NULL,'tests/wcp-runtime-contract.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Layout hook consumes only semantic ratio port','direct'),
 ('TC-W04','W09',NULL,NULL,NULL,'tests/wcp-runtime-contract.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Preview DOM reconciliation remains Layout-owned','direct');

-- Virtual chapter filters stay inside their three AG owners.
INSERT INTO apis VALUES
 ('G15','G','returned.setVirtualQuery','ui/outline-grid.js','returned','chapter key-set + label','void','Heading AG owns its own virtual chapter column and filter',1),
 ('A13','A','returned.setVirtualQuery','ui/media-module.js','returned','chapter key-set + label','void','Media AG owns virtual chapter filter, WCP cannot mutate native Grid',1),
 ('T13','T','returned.setVirtualQuery','ui/latex-module.js','returned','chapter key-set + label','void','LaTeX AG owns virtual chapter filter, WCP cannot mutate native Grid',1);
INSERT INTO test_cases VALUES
 ('TC-G15','G15',NULL,NULL,NULL,'tests/wcp-runtime-contract.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Heading AG offers semantic chapter query port without raw Grid exposure','direct'),
 ('TC-A13','A13',NULL,NULL,NULL,'tests/wcp-runtime-contract.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Media AG offers semantic chapter query port without raw Grid exposure','direct'),
 ('TC-T13','T13',NULL,NULL,NULL,'tests/wcp-runtime-contract.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','LaTeX AG offers semantic chapter query port without raw Grid exposure','direct');
INSERT INTO test_cases VALUES
 ('TC-W05','W02',NULL,NULL,NULL,'tests/wcp-runtime-contract.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','CM6 extensions are exposed only via composition-root WCP facade','integration'),
 ('TC-W06','W03',NULL,NULL,NULL,'tests/wcp-runtime-contract.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','WCP default CMD wrapper preserves CMD facade','integration'),
 ('TC-W07','W04',NULL,NULL,NULL,'tests/wcp-runtime-contract.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','WCP CM6 lifecycle hook is explicitly declared and callable','integration'),
 ('TC-W08','W06',NULL,NULL,NULL,'tests/wcp-runtime-contract.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','WCP preview hook exposes a semantic port and unsubscribe','integration'),
 ('TC-W09','W07',NULL,NULL,NULL,'tests/wcp-runtime-contract.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','WCP render hook delegates text projection without raw preview DOM','integration');

-- Main production WCP source promotion: explicit immutable import evidence.
INSERT INTO access_edges VALUES ('PROMO01','W','L','ui/wcp-wcp-virtual-chapters.js','import {persistLabWorkspaceLayout} from ''./wcp-layout-persistence.js''',NULL,'registered','WCP Main promoted ui/wcp-wcp-virtual-chapters.js imports public L module entry (wcp-layout-persistence.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO02','W','C','ui/wcp-wcp-virtual-chapters.js','import {createCMDTransactionPort} from ''./wcp-cmd-element-transactions.js''',NULL,'registered','WCP Main promoted ui/wcp-wcp-virtual-chapters.js imports public C module entry (wcp-cmd-element-transactions.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO03','W','M','ui/wcp-wcp-virtual-chapters.js','import {renderVirtualMarkdown} from ''./wcp-md-virtual-preview.js''',NULL,'registered','WCP Main promoted ui/wcp-wcp-virtual-chapters.js imports public M module entry (wcp-md-virtual-preview.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO04','S','G','ui/wcp-settings-module.js','import {mountAgModuleToolbar} from ''./wcp-ag-module-toolbar.js''',NULL,'registered','WCP Main promoted ui/wcp-settings-module.js imports public G module entry (wcp-ag-module-toolbar.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO05','S','G','ui/wcp-source-file-navigation.js','import {chapterAssignments} from ''./wcp-chapter-files.js''',NULL,'registered','WCP Main promoted ui/wcp-source-file-navigation.js imports public G module entry (wcp-chapter-files.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO06','G','G','ui/wcp-document-index.js','import {buildOutline} from ''./outline-index.js''',NULL,'registered','WCP Main promoted ui/wcp-document-index.js imports public G module entry (outline-index.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO07','G','C','ui/wcp-document-index.js','import {scanAnnotations} from ''./cmd-annotations.js''','C23','registered','WCP Main promoted ui/wcp-document-index.js imports public C module entry (cmd-annotations.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO08','G','T','ui/wcp-document-index.js','import {findLatex} from ''./latex-scan.js''','T01','registered','WCP Main promoted ui/wcp-document-index.js imports public T module entry (latex-scan.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO09','G','A','ui/wcp-document-index.js','import {findMedia} from ''./media-module.js''','A02','registered','WCP Main promoted ui/wcp-document-index.js imports public A module entry (media-module.js); runtime behavior covered by main-promoted browser test and independent AM review');

INSERT INTO access_edges VALUES ('PROMO10','C','G','ui/wcp-cmd-element-transactions.js','import {createIndexProjector} from ''./wcp-document-index.js''',NULL,'registered','CMD wrapper reads chapter index via imported pure source projector; tracked public projection contract, no editor or AG instance imported');

-- Live, cross-component WCP virtual chapter DOM message contract (Main source).
-- Two removed/dormant legacy names `lab-switch-file` and `lab-file-activated`
-- are NOT invented as active publisher contracts. They remain audit debt.
INSERT INTO access_edges VALUES
 ('X-W-VIRTUAL','W','C','ui/wcp-wcp-virtual-chapters.js','import {virtualChapterExtensions,setVirtualChapter,currentVirtualChapter} from ''./wcp-cm-virtual-view.js''',NULL,'registered','WCP editor lifecycle consumes bounded chapter CM6 projection through its declared interface');
INSERT INTO messages VALUES
 ('E10','dom','ocr2md:lab-virtual-select','{"type":"object","fields":["id","preserveAll","accepted","error"],"meaning":"source chapter navigation request and accepted status"}',1),
 ('E11','dom','ocr2md:lab-virtual-open','{"type":"object","fields":["id","preserveAll","accepted"],"meaning":"focus-driven navigation across virtual chapters"}',1),
 ('E12','dom','ocr2md:wp3-ag-ready','{"type":"object","fields":["getChapterIndex","getStartNumber","applyChapterQuery"],"meaning":"bounded WCP semantic chapter query port, not AG raw grid"}',1),
 ('E13','dom','ocr2md:wp4-virtual-scope','{"type":"object","fields":["scope","reason"],"meaning":"CM6 and Markdown projection of bounded chapter or whole mother document"}',1);
INSERT INTO publishers VALUES
 ('PUB-W10','E10','S','ui/wcp-source-file-navigation.js','document.dispatchEvent','user selects virtual chapter from file navigator'),
 ('PUB-W11','E11','G','ui/wcp-ag-query.js','document.dispatchEvent','cross-chapter focus in AG/PDF while 全部 checked'),
 ('PUB-W12','E12','W','ui/wcp-wcp-virtual-chapters.js','document.dispatchEvent','WCP mounts bounded semantic AG query bridge'),
 ('PUB-W13','E13','W','ui/wcp-wcp-virtual-chapters.js','document.dispatchEvent','CM6 source transaction changes virtual chapter bounds'),
 ('PUB-W14','E13','G','ui/wcp-ag-query.js','document.dispatchEvent','AG chapter filter or navigation changes preview/CM6 source scope');
INSERT INTO subscriptions VALUES
 ('SUB-W10','E10','G','ui/wcp-ag-module-toolbar.js','document.addEventListener','virtual chapter selection or mother view change','Update AG all checkbox scope without source data rewrite'),
 ('SUB-W11','E11','S','ui/wcp-source-file-navigation.js','document.addEventListener','cross-chapter AG/PDF focus','Navigate source file select to owning virtual chapter'),
 ('SUB-W12','E12','G','ui/wcp-ag-query.js','onGridReady','WCP publishes bounded semantic bridge','Populate chapter index and apply external row membership filter'),
 ('SUB-W13','E12','S','ui/wcp-source-file-navigation.js','document.addEventListener','WCP publishes bounded semantic bridge','Populate file navigation and select requested view'),
 ('SUB-W14','E13','W','ui/wcp-wcp-virtual-chapters.js','onScope','virtual chapter changes','Update CM6 scope and Markdown preview from semantic event');
INSERT INTO test_cases(id,message_id,script,fixture,expected,evidence) VALUES
 ('TC-E10','E10','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Real Main/Lab Chrome/WebKit source navigator dispatches chapter selection','integration'),
 ('TC-E11','E11','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Real Main/Lab AG heading click in All moves to another chapter via WCP','integration'),
 ('TC-E12','E12','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Real Main/Lab WCP emits semantic AG ready message','integration'),
 ('TC-E13','E13','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Real Main/Lab WCP bounds CM6 and Markdown from chapter source selection','integration');
INSERT INTO test_cases(id,publisher_id,script,fixture,expected,evidence) VALUES
 ('TC-PUB-W10','PUB-W10','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','File nav WCP publisher emitted in real browser','integration'),
 ('TC-PUB-W11','PUB-W11','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG focus WCP publisher emitted in real browser','integration'),
 ('TC-PUB-W12','PUB-W12','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','WCP bridge ready publisher emitted in real browser','integration'),
 ('TC-PUB-W13','PUB-W13','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','WCP virtual scope bound for CM6 projection','integration'),
 ('TC-PUB-W14','PUB-W14','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG scope change publishes bounded projection','integration');
INSERT INTO test_cases(id,subscription_id,script,fixture,expected,evidence) VALUES
 ('TC-SUB-W10','SUB-W10','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG toolbar reacts to virtual select','integration'),
 ('TC-SUB-W11','SUB-W11','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','File navigation reacts to AG-driven virtual open','integration'),
 ('TC-SUB-W12','SUB-W12','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG scoped rows via WCP bridge','integration'),
 ('TC-SUB-W13','SUB-W13','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','File navigation populated from WCP index','integration'),
 ('TC-SUB-W14','SUB-W14','tests/v6-lab-mirror.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','CM6 scope follows semantic message','integration');
