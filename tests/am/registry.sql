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
 ('N','Note Pair','AG Grid + regex citation/body matching','ui/note-pair-module.js'),
 ('W','WCP Runtime','bounded extension contract','ui/wcp-runtime.js');

INSERT INTO apis VALUES
 ('C01','C','CMDocument.getMarkdown','ui/cm-document.js','export','none','Markdown string','read only',1),
 ('C02','C','CMDocument.loadMarkdown','ui/cm-document.js','export','markdown:string','CM6 Text','dispatches CM6 replacement',1),
 ('C03','C','CMDocument.loadMineruJson','ui/cm-document.js','export','MinerU JSON; injected converter','Promise<CM6 Text>','validates before edit',1),
 ('C04','C','CMDocument.readHtml','ui/cm-document.js','export','1-based line','HTML source + syntax or null','read only',1),
 ('C05','C','CMDocument.writeHtml','ui/cm-document.js','export','html,beforeLine,replaceLine?,quotePrefix?','line/sourceLine','one CM6 transaction',1),
 ('C06','C','CMDocument.writeComment','ui/cm-document.js','export','text + writeHtml position','line/sourceLine','delegates to writeHtml',0),
 ('C07','C','CMDocument.adjustQuoteIndent','ui/cm-document.js','export','direction +/-1','changed/lines','one CM6 transaction; preserves forward/reverse multi-line selection across repeated + and -; protects original evidence',1),
 ('C08','C','CMDocument.destroy','ui/cm-document.js','export','none','void','destroys owned EditorView',0),
 ('C09','C','CMDocument.view','ui/cm-document.js','raw','none','EditorView instance','owned by composition root, not AG or Layout business APIs',0),
 ('C10','C','CMDocument.readLine','ui/cm-document.js','export','1-based line','immutable line number/text/range','read only, no EditorView exposure',1),
 ('C11','C','CMDocument.lineAtOffset','ui/cm-document.js','export','CM6 text offset','1-based line number','read only, no EditorView exposure',0),
 ('C12','C','CMDocument.matchesSnapshot','ui/cm-document.js','export','opaque immutable text snapshot','boolean','compare document identity without exposing current EditorView',1),
 ('C13','C','CMDocument.requestMeasure','ui/cm-document.js','export','none','void','requests CM6 layout pass through CMD boundary',0),
 ('C14','C','CMDocument.replaceRanges','ui/cm-document.js','export','guarded from/to/expected/insert edits and internal CMD annotations','changed count','one validated CM6 transaction; forbids original evidence edits',1),
 ('C15','C','CMDocument.capturePasteTarget','ui/cm-document.js','export','none','opaque snapshot + selected range','captures insertion position before async file upload',1),
 ('C16','C','CMDocument.pasteAt','ui/cm-document.js','export','captured target, local Markdown image reference','void','one CM6 undo step; rejects changed source and evidence',1),
 ('C17','C','CMDocument.readAnnotations','ui/cm-document.js','export','optional tag/attribute filters','source-positioned annotation records','generic HTML comment syntax in CM6 source; no nesting or business semantics',1),
 ('C18','C','CMDocument.writeAnnotation','ui/cm-document.js','export','tag,attributes,at or target','updated source annotation record','CM6 atomic insert/update with stale-target and immutable evidence safeguards',1),
 ('C19','C','CMDocument.removeAnnotation','ui/cm-document.js','export','annotation record from CMD','removed flag','CM6 atomic exact comment deletion; never deletes associated Markdown content',1),
 ('C20','C','CMDocument.editAnnotations','ui/cm-document.js','export','array of generic comment insert/update/remove and guarded text operations; optional source guard and registered AG scope','single undoable CM6 transaction','atomic HTML annotations plus Markdown delimiters; checked target and evidence protection',1),
 ('C21','C','parseAnnotation','ui/cmd-annotations.js','export','single HTML comment text','tag and attributes or null','public read-only CMD annotation syntax parser, without business semantics',1),
 ('C22','C','formatAnnotation','ui/cmd-annotations.js','export','tag, attributes, spacing options','single-line HTML comment text','public CMD annotation syntax formatter, rejects invalid attribute names and multiline values',1),
 ('C23','C','scanAnnotations','ui/cmd-annotations.js','export','Markdown source','offset-positioned syntax records','public read-only CMD annotation scanner; no state or writes',1),
 ('C33','C','returned.replaceMediaReferences','ui/wcp-cmd-element-transactions.js','returned','validated media URL edits','changed/skipped counts','CMD validates indexed media references and enforces AG all-CMB versus selected-chapter scope; original evidence stays immutable',1),
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
 ('P01','P','PdfPreview.open','ui/pdf-preview.js','export','none','Promise<void>','awaits CMD sealed JSON queryLayout + streams /api/pdf; ready after first page paint',1),
 ('P02','P','PdfPreview.focusLine','ui/pdf-preview.js','export','1-based line,explicit:boolean','Promise<void>','locates OCR region; explicit reveal',1),
 ('P03','P','PdfPreview.refreshAnchors','ui/pdf-preview.js','export','none','void','rebuilds anchor source mapping',1),
 ('P04','P','PdfPreview.setZoom','ui/pdf-preview.js','export','mode:string','void','updates PDF.js scale while preserving current page-relative reading anchor',0),
 ('P05','P','PdfPreview.setActive','ui/pdf-preview.js','export','boolean','void','viewer visibility handling',1),
 ('P06','P','PdfPreview.onResize','ui/pdf-preview.js','export','none','void','reflows viewer width and overlay',0),
 ('P07','P','PdfPreview.moveToolbarTo','ui/pdf-preview.js','export','DOM container','void','reparents toolbar',0),
 ('P08','P','PdfPreview.dispose','ui/pdf-preview.js','export','none','void','unsubscribes + tears down PDF.js',0),
 ('P09','P','pdfOverlayRect','ui/pdf-preview.js','export','region,viewport','percentage rect','rejects invalid OCR/PDF mapping',1),
 ('P10','P','sourceBlocks','ui/pdf-preview.js','export','Markdown:string','OCR source anchors','parses stable MinerU IDs',1),
 ('P11','P','PdfPreview.revealCurrentLocation','ui/pdf-preview.js','export','none','void','reveals only pending explicit click',0),
 ('P12','P','PdfPreview.clearHighlight','ui/pdf-preview.js','export','none','void','removes OCR overlay',0),
 ('P13','P','PdfPreview.whenReady','ui/pdf-preview.js','export','none','Promise<boolean>','reports first-page warm-up result without exposing PDF.js internals',1),
 ('P14','P','PreviewPanel.setCoverageEnabled','ui/workspace.js','internal','boolean enabled','void','shared preview toolbar updates the visible MD/PDF lens, or both when split; read-only coverage and reversible PDF Block controls',1),
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
 ('L17','L','returned.setWorkModule','ui/workspace.js','returned','module name and optional activateTextBlocks flag','void','switches AG view without overwriting MD default on initial load; explicit text-block selection activates current preview lens',1),
 ('L18','L','returned.scanMedia','ui/workspace.js','returned','none','Promise<void>','requests Media scan through API',1),
 ('L19','L','returned.downloadMedia','ui/workspace.js','returned','none','Promise<void>','requests Media download through API',1),
 ('L20','L','returned.normalizeLatex','ui/workspace.js','returned','none','void','routes explicit LaTeX normalization request to module facade; no direct source writes',1),
 ('A01','A','createMediaModule','ui/media-module.js','export','host,readDocument,CMD port,status','module facade','mounts independent Media AG with lazy thumbnail preview and download workflow',1),
 ('A02','A','findMedia','ui/media-module.js','export','Markdown string','list with source ranges','reads normal/sized/wikilink image URL ranges outside evidence',1),
 ('A03','A','returned.scan','ui/media-module.js','returned','none','Promise<void>','refreshes Media origin (remote/local), adopted references, unreferenced local files and transfer status independently',1),
 ('A04','A','returned.downloadAll','ui/media-module.js','returned','none','Promise<void>','downloads all remote URLs in mother CMD, then uses one all-document validated CMD transaction for successfully downloaded references; never auto-saves',1),
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
 ('X12','A','C','ui/media-module.js','cmd().replaceMediaReferences(','C33','registered','Media requests indexed, scope-aware URL replacement through CMD public transaction port'),
 ('X13','L','C','ui/workspace.js','getCMD().replaceMediaReferences(edits,scope)','C33','registered','Layout exposes the narrow indexed CMD media replacement capability without fallback'),
 ('X14',NULL,'A','scripts/v6_serve.py','media_download_chunk(active_doc(), url)','A06','registered','HTTP adapter invokes Media-only downloader'),
 ('X15',NULL,'A','scripts/v6_serve.py','media_status(active_doc(), url)','A07','registered','HTTP adapter exposes Media status'),
 ('X16',NULL,'A','scripts/v6_serve.py','media_read_local(active_doc(), path[','A08','registered','HTTP adapter reads only whitelisted media paths'),
 ('X17','L','A','ui/workspace.js','this.media?.setActive(','A05','registered','Layout switches projection via Media API'),
 ('X18','L','A','ui/workspace.js','currentOutline?.media?.scan()','A03','registered','Shell scans Media through Layout API'),
 ('X19','L','A','ui/workspace.js','currentOutline?.media?.downloadAll()','A04','registered','Shell downloads Media through Layout API'),
 ('X20',NULL,'A','scripts/v6_serve.py','media_inventory(doc)','A09','registered','HTTP transport combines Media inventory with chapter read API'),
 ('X21',NULL,'C','ui/main.js','cm.capturePasteTarget()','C15','registered','Shell asks CMD for opaque live paste position'),
 ('X22',NULL,'C','ui/main.js','cm.pasteAt(target','C16','registered','Shell asks CMD to insert local Markdown image atomically'),
 ('X23',NULL,'A','ui/main.js','uploadPastedImage(file)','A11','registered','Shell delegates clipboard binary upload to Media'),
 ('X24',NULL,'A','scripts/v6_serve.py','media_store_pasted_image(active_doc(), data, mime)','A10','registered','HTTP adapter invokes atomic Media storage'),
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
 ('A01','media-browser.test.mjs','md','media AG origin column colors remote/local, referenced remote counts as adopted, with lazy preview and categorical filters'),
 ('A02','media-browser.test.mjs','md','scan of 11 image links excludes immutable MinerU evidence'),
 ('A03','media-browser.test.mjs','md','media scan lists orphan files and stable adopted/status filters'),
 ('A04','media-browser.test.mjs','md','download all remote URLs regardless of AG chapter scope; only changed preview URLs update in place, then one CMD transaction localizes successful downloads without auto-save'),
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


INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-A04-PREVIEW-STABLE','A04','tests/media-download-preview-stability.browser.test.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  'Chrome and iPad-WebKit simulated sequential downloads keep all 11 thumbnail nodes mounted (0 removed/added), only completed target src changes, and no CMD auto-save','integration');

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
 ('SUB-G01','E09','G','ui/outline-grid.js','settings.subscribe','Registered chapter title scale key change','Send title scale through Workspace semantic port into AG'),
 ('SUB-L01','E09','L','ui/wcp-navigation-select.js','settings.subscribe','Registered navigation dropdown font-size key change','Set public CSS variable --ocr-navigation-font-size for every navigation picker and popup');
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
 ('TC-SUB-G01','SUB-G01','tests/outline-title-scale-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Registered settings.changed title-scale subscriber updates AG title through public Layout and preserves rows/column heights','integration'),
 ('TC-SUB-L01','SUB-L01','tests/navigation-font-setting-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Registered navigation font subscriber applies slider value to CSS variable, picker and popup without writes','integration');

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
 ('W05','W','returned.onAGReady','ui/wcp-runtime.js','returned','getChapterIndex/getStartNumber/applyChapterQuery including operationScope','void','bounded chapter query and action-scope intent; never AG/Grid/CMD raw objects',1),
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
 ('A13','A','returned.setVirtualQuery','ui/media-module.js','returned','chapter key-set + operationScope + label','void','Media AG owns virtual chapter filter and action scope without exposing native Grid',1),
 ('T13','T','returned.setVirtualQuery','ui/latex-module.js','returned','chapter key-set + operationScope + label','void','LaTeX AG owns virtual chapter filter and scoped review/normalization without accessing raw Grid',1);
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
-- Main architecture remediation: the public contract is the source of truth,
-- not a cross-module import whitelist. These entrypoints were live exported
-- functions introduced during Lab promotion; direct Chrome/WebKit contract
-- tests now call them explicitly, including negative/error paths.
INSERT INTO apis VALUES
 ('L21','L','persistLabWorkspaceLayout','ui/wcp-layout-persistence.js','export','layout port: getRatios,setRatios,onChange','dispose function','owns same-session divider continuity without document mutation',1),
 ('C29','C','createCMDTransactionPort','ui/wcp-cmd-element-transactions.js','export','live CMDocument','immutable CMD transaction/index facade','preflights chapter/evidence source ranges and rejects invalid edits',1),
 ('C30','C','virtualChapterExtensions','ui/wcp-cm-virtual-view.js','export','none','CM6 extension array','defines bounded view without source duplication',1),
 ('C31','C','setVirtualChapter','ui/wcp-cm-virtual-view.js','export','EditorView,scope|null','boolean','applies one CMD-backed virtual chapter view; no document write',1),
 ('C32','C','currentVirtualChapter','ui/wcp-cm-virtual-view.js','export','EditorState','immutable scope|null','read-only view selection projection',1),
 ('M09','M','renderVirtualMarkdown','ui/wcp-md-virtual-preview.js','export','source,scope|null','rendered safe HTML','render CMD-bounded Markdown while retaining global source-line identifiers',1),
 ('G16','G','mountAgModuleToolbar','ui/wcp-ag-module-toolbar.js','export','Shell module port + workspace','boolean','AG-owned toolbar mounted only by Shell composition; idempotent',1),
 ('G17','G','chapterAssignments','ui/wcp-chapter-files.js','export','heading rows,start number','chapter projections','read-only chapter naming projection for source navigation',1),
 ('G18','G','createIndexProjector','ui/wcp-document-index.js','export','CMD source reader','read-only cached semantic index','public AG-owned projection of one mother source; no CM editor access',1),
 ('S07','S','createSourceFileNavigation','ui/wcp-source-file-navigation.js','export','Shell module/workspace ports + reportError','navigation facade','Shell-mounted virtual chapter and Settings source navigator',1),
 ('W10','W','createWCPRuntime','ui/wcp-wcp-virtual-chapters.js','export','none','bounded WCP composition hooks','creates immutable virtual chapter runtime for Main application shell',1);
INSERT INTO access_edges VALUES
 ('X92','L','C','ui/workspace.js','getCMD().queryElements(filter)','C29','registered','Media bulk obtains fresh authoritative CMD chapter element identities through Layout semantic port'),
 ('X93','L','C','ui/workspace.js','getCMD().queryElements(filter)','C29','registered','LaTeX normalization obtains fresh authoritative CMD chapter element identities through Layout semantic port');

INSERT INTO access_edges VALUES ('PROMO01','W','L','ui/wcp-wcp-virtual-chapters.js','import {persistLabWorkspaceLayout} from ''./wcp-layout-persistence.js''','L21','registered','WCP Main promoted ui/wcp-wcp-virtual-chapters.js imports public L module entry (wcp-layout-persistence.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO02','W','C','ui/wcp-wcp-virtual-chapters.js','import {createCMDTransactionPort} from ''./wcp-cmd-element-transactions.js''','C29','registered','WCP Main promoted ui/wcp-wcp-virtual-chapters.js imports public C module entry (wcp-cmd-element-transactions.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO03','W','M','ui/wcp-wcp-virtual-chapters.js','import {renderVirtualMarkdown} from ''./wcp-md-virtual-preview.js''','M09','registered','WCP Main promoted ui/wcp-wcp-virtual-chapters.js imports public M module entry (wcp-md-virtual-preview.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO05','S','G','ui/wcp-source-file-navigation.js','import {chapterAssignments} from ''./wcp-chapter-files.js''','G17','registered','WCP Main promoted ui/wcp-source-file-navigation.js imports public G module entry (wcp-chapter-files.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO06','G','G','ui/wcp-document-index.js','import {buildOutline} from ''./outline-index.js''',NULL,'registered','WCP Main promoted ui/wcp-document-index.js imports public G module entry (outline-index.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO07','G','C','ui/wcp-document-index.js','import {scanAnnotations} from ''./cmd-annotations.js''','C23','registered','WCP Main promoted ui/wcp-document-index.js imports public C module entry (cmd-annotations.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO08','G','T','ui/wcp-document-index.js','import {findLatex} from ''./latex-scan.js''','T01','registered','WCP Main promoted ui/wcp-document-index.js imports public T module entry (latex-scan.js); runtime behavior covered by main-promoted browser test and independent AM review');
INSERT INTO access_edges VALUES ('PROMO09','G','A','ui/wcp-document-index.js','import {findMedia} from ''./media-module.js''','A02','registered','WCP Main promoted ui/wcp-document-index.js imports public A module entry (media-module.js); runtime behavior covered by main-promoted browser test and independent AM review');

INSERT INTO access_edges VALUES ('PROMO10','C','G','ui/wcp-cmd-element-transactions.js','import {createIndexProjector} from ''./wcp-document-index.js''','G18','registered','CMD wrapper reads chapter index via imported pure source projector; tracked public projection contract, no editor or AG instance imported');

-- Inline footnote reader: official Floating UI positioning, existing
-- markdown-it-footnote/DOMPurify HTML and a bounded Layout focus callback.
-- Preview never owns or writes CMD notes; virtual notes are appended only to
-- a temporary read-only projection, preserving original source coordinates.
INSERT INTO apis VALUES
 ('M10','M','createFootnotePopover','ui/footnote-popover.js','export','Markdown root and bounded onLocate(line) callback','handleClick/close/dispose','official Floating UI card with no hash jump; only explicit command publishes navigation',1),
 ('M11','M','chapterFootnoteProjection','ui/wcp-md-virtual-preview.js','export','full CMD source and virtual excerpt','read-only excerpt plus sourced note definitions/line map','resolves cross-chapter notes without touching CM6 text or duplicating editor state',1);
INSERT INTO access_edges VALUES
 ('X-FOOTNOTE-01','L','M','ui/workspace.js','createFootnotePopover({','M10','registered','Layout installs MD-owned note reader via public factory and WCP focus callback');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-FOOTNOTE-M10','M10','tests/footnote-popover.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and iPad WebKit card opens without hash/scroll navigation, Floating UI stays in bounds; explicit locate alone navigates; ESC/close and no source write','integration'),
 ('TC-FOOTNOTE-M11','M11','tests/footnote-popover.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/WebKit first virtual chapter resolves definition in another chapter and maps note back to true CMD source line without modifying CMB','integration');

-- Live, cross-component WCP virtual chapter DOM message contract (Main source).
-- Retired physical file switch listeners and publishers are absent; only
-- the active virtual chapter message contracts are registered.
INSERT INTO access_edges VALUES
 ('X-W-VIRTUAL-EXT','W','C','ui/wcp-wcp-virtual-chapters.js','...virtualChapterExtensions','C30','registered','WCP injects the public CMD virtual chapter extensions into EditorState'),
 ('X-W-VIRTUAL-SET','W','C','ui/wcp-wcp-virtual-chapters.js','setVirtualChapter(activeView','C31','registered','WCP sends bounded chapter selection to the CMD port'),
 ('X-W-VIRTUAL-GET','W','C','ui/wcp-wcp-virtual-chapters.js','currentVirtualChapter(update.state)','C32','registered','WCP reads the active CMD chapter scope for edit message');
INSERT INTO messages VALUES
 ('E10','dom','ocr2md:lab-virtual-select','{"type":"object","fields":["id","preserveAll","accepted","error"],"meaning":"source chapter navigation request and accepted status"}',1),
 ('E11','dom','ocr2md:lab-virtual-open','{"type":"object","fields":["id","preserveAll","accepted"],"meaning":"focus-driven navigation across virtual chapters"}',1),
 ('E12','dom','ocr2md:wp3-ag-ready','{"type":"object","fields":["getChapterIndex","getStartNumber","applyChapterQuery"],"meaning":"bounded WCP semantic chapter query port, not AG raw grid"}',1),
 ('E13','dom','ocr2md:wp4-virtual-scope','{"type":"object","fields":["scope","reason"],"meaning":"CM6 and Markdown projection of bounded chapter or whole mother document"}',1),
 ('E14','dom','ocr2md:chapter-boundary-changed','{"type":"object","fields":["id","independent"],"meaning":"AG chapter checkbox successfully committed its CMD marker; immediately refresh source chapter file navigation"}',1);
INSERT INTO publishers VALUES
 ('PUB-W10','E10','S','ui/wcp-source-file-navigation.js','document.dispatchEvent','user selects virtual chapter from file navigator'),
 ('PUB-W11','E11','G','ui/wcp-ag-query.js','document.dispatchEvent','cross-chapter focus in AG/PDF while 全部 checked'),
 ('PUB-W12','E12','W','ui/wcp-wcp-virtual-chapters.js','document.dispatchEvent','WCP mounts bounded semantic AG query bridge'),
 ('PUB-W13','E13','W','ui/wcp-wcp-virtual-chapters.js','document.dispatchEvent','CM6 source transaction changes virtual chapter bounds'),
 ('PUB-W14','E13','G','ui/wcp-ag-query.js','document.dispatchEvent','AG chapter filter or navigation changes preview/CM6 source scope'),
 ('PUB-W15','E14','G','ui/outline-grid.js','document.dispatchEvent','AG chapter checkbox committed a marker and refreshed its live row');
INSERT INTO subscriptions VALUES
 ('SUB-W10','E10','G','ui/wcp-ag-module-toolbar.js','document.addEventListener','virtual chapter selection or mother view change','Update AG all checkbox scope without source data rewrite'),
 ('SUB-W11','E11','S','ui/wcp-source-file-navigation.js','document.addEventListener','cross-chapter AG/PDF focus','Navigate source file select to owning virtual chapter'),
 ('SUB-W12','E12','G','ui/wcp-ag-query.js','onGridReady','WCP publishes bounded semantic bridge','Populate chapter index and apply external row membership filter'),
 ('SUB-W13','E12','S','ui/wcp-source-file-navigation.js','document.addEventListener','WCP publishes bounded semantic bridge','Populate file navigation and select requested view'),
 ('SUB-W14','E13','W','ui/wcp-wcp-virtual-chapters.js','onScope','virtual chapter changes','Set CM6 scope using CMD public port'),
 ('SUB-W15','E13','W','ui/wcp-wcp-virtual-chapters.js','onScope','virtual chapter changes','Re-render Markdown virtual chapter preview using MD public port'),
 ('SUB-W19','E14','S','ui/wcp-source-file-navigation.js','document.addEventListener','AG chapter checkbox marker committed','Immediately rebuild source chapter options and visible Tom Select mirror'),
 ('SUB-W16','E03','G','ui/wcp-ag-query.js','viewStore.subscribe','AG/PDF focus changes within current document revision','Follow focused element into its owning virtual chapter via semantic focus event'),
 ('SUB-W17','E01','S','ui/wcp-source-file-navigation.js','viewStore.subscribe','CM6 document revision changes','Refresh chapter filename projections from CMD index'),
 ('SUB-W18','E10','G','ui/outline-grid.js','document.addEventListener','accepted WCP chapter file changes','Disable independent-chapter CMD marker edits in virtual chapter files; restore in mother chapter-boundary view');
INSERT INTO test_cases(id,message_id,script,fixture,expected,evidence) VALUES
 ('TC-E10','E10','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Real Main/Lab Chrome/WebKit source navigator dispatches chapter selection','integration'),
 ('TC-E11','E11','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Real Main/Lab AG heading click in All moves to another chapter via WCP','integration'),
 ('TC-E12','E12','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Real Main/Lab WCP emits semantic AG ready message','integration'),
 ('TC-E13','E13','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Real Main/Lab WCP bounds CM6 and Markdown from chapter source selection','integration'),
 ('TC-E14','E14','tests/chapter-live-navigation.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','grok 75e05598: chapter-boundary-changed payload carries independent flag per commit; CMD file bytes unchanged','direct');
INSERT INTO test_cases(id,publisher_id,script,fixture,expected,evidence) VALUES
 ('TC-PUB-W10','PUB-W10','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','File nav WCP publisher emitted in real browser','integration'),
 ('TC-PUB-W11','PUB-W11','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG focus WCP publisher emitted in real browser','integration'),
 ('TC-PUB-W12','PUB-W12','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','WCP bridge ready publisher emitted in real browser','integration'),
 ('TC-PUB-W13','PUB-W13','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','WCP virtual scope bound for CM6 projection','integration'),
 ('TC-PUB-W14','PUB-W14','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG scope change publishes bounded projection','integration'),
 ('TC-PUB-W15','PUB-W15','tests/chapter-live-navigation.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','grok 75e05598: AG chapter checkbox publishes detail.independent [false] then [false,true]','direct');
INSERT INTO test_cases(id,subscription_id,script,fixture,expected,evidence) VALUES
 ('TC-SUB-W10','SUB-W10','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG toolbar reacts to virtual select','integration'),
 ('TC-SUB-W11','SUB-W11','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','File navigation reacts to AG-driven virtual open','integration'),
 ('TC-SUB-W12','SUB-W12','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG scoped rows via WCP bridge','integration'),
 ('TC-SUB-W13','SUB-W13','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','File navigation populated from WCP index','integration'),
 ('TC-SUB-W14','SUB-W14','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','CM6 scope follows semantic message','integration'),
 ('TC-SUB-W15','SUB-W15','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Markdown preview follows same WCP virtual chapter scope','integration'),
 ('TC-SUB-W16','SUB-W16','tests/wcp-virtual-event-contract.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG/PDF focus to another chapter changes source view by semantic focusTarget','integration'),
 ('TC-SUB-W17','SUB-W17','tests/promoted-chapters-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','CM6 chapter marker edits immediately refresh virtual chapter file navigation','integration'),
 ('TC-SUB-W18','SUB-W18','tests/main-promoted-lab-ui.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chapter-boundary mother checkbox editable; chapter-file checkbox read-only; no direct CMD mutation allowed in chapter file','integration'),
 ('TC-SUB-W19','SUB-W19','tests/chapter-live-navigation.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','grok 75e05598: AG checkbox uncheck/check/undo/redo rebuilds native and visible source chapter options 21/20/21 without reload','direct');

INSERT INTO access_edges VALUES
 ('X-SHELL-AG',NULL,'G','ui/main.js','mountAgModuleToolbar({modulePort','G16','registered','Shell composes the AG toolbar; Settings cannot mount AG internals'),
 ('X-SHELL-NAV',NULL,'S','ui/main.js','createSourceFileNavigation({modulePort','S07','registered','Shell composes virtual source navigator instead of hiding it in Settings'),
 ('X-SHELL-WCP',NULL,'W','ui/main.js','createWCPRuntime()','W10','registered','Shell initializes promoted WCP main runtime through its public API');

-- Direct public API invocation and independent observed semantics, not an
-- association to a generic integrated browser session.
WITH direct(id,expected) AS (VALUES
 ('L21','layout port saves ratios and returns a working dispose function'),
 ('C29','CMD index reads correctly and rejects unsafe source mutation'),
 ('C30','CM6 extension array mounts single native document'),
 ('C31','explicit chapter selection activates and is idempotent'),
 ('C32','current chapter scope returns immutable selection or null'),
 ('M09','chapter HTML projection preserves semantic global source locations'),
 ('G16','AG toolbar entrypoint is idempotent and keeps one DOM toolbar'),
 ('G17','chapter file projections deterministically name 21 virtual chapters'),
 ('G18','semantic CMD projection builds and caches 21 chapter index'),
 ('S07','source navigation facade is idempotent and exposes Settings mount'),
 ('W10','promoted WCP facade has complete bounded lifecycle hooks'))
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence)
SELECT 'TC-DIRECT-'||id,id,'tests/wcp-promoted-api-direct.browser.test.mjs',
 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',expected,'direct'
FROM direct;

-- WCP Workspace component v1 (portable contract; no macOS path assumptions).
-- Public browser boundary is the Workspace capability, not Settings/Shell DOM.
-- Backend API is a facade over internal v6_workspace_roots.py; HTTP route
-- dispatch is the sole composition point. No second Settings persistence owner.
INSERT INTO modules VALUES
 ('B','Workspace Directory','WCP directory/book port + portable Python service','ui/wcp-workspace-directory-module.js');
INSERT INTO apis VALUES
 ('B01','B','createWorkspaceDirectoryModule','ui/wcp-workspace-directory-module.js','export','directoryPort with roots/browse/books','renderBookControl/renderDirectoryControl semantic UI port','Workspace-only DOM controls use injected Settings get/set API; no direct CMD or filesystem access',1),
 ('B02','B','workspaceDirectoryPort','ui/wcp-workspace-directory-port.js','export','none','roots,browse,books async HTTP capabilities','authorized read-only discovery, no direct persistence',1),
 ('B03','B','WorkspaceService.roots','scripts/v6_workspace_component.py','export','none','configured root,active book,allowed roots,document identity','read-only authorized root list',1),
 ('B04','B','WorkspaceService.browse','scripts/v6_workspace_component.py','export','authorized absolute path','directory list and candidate book states','reject traversal and unauthorized paths',1),
 ('B05','B','WorkspaceService.books','scripts/v6_workspace_component.py','export','catalogue path','first-level books and validation statuses','read-only book discovery',1),
 ('B06','B','WorkspaceService.active','scripts/v6_workspace_component.py','export','none','immutable ActiveBook with MD/PDF/JSON paths','single selected book resolved per request',1),
 ('B07','B','WorkspaceService.validate','scripts/v6_workspace_component.py','export','candidate settings JSON','validated book catalogue','pure validation before settings CAS commit',1),
 ('B08','B','WorkspaceService.prepare','scripts/v6_workspace_component.py','export','candidate settings JSON','existing or newly converted book Markdown','only missing Markdown may be created with hardlink no-overwrite',1),
 ('B09','B','WorkspaceService.convert','scripts/v6_workspace_component.py','export','source bytes,project root,timeout','MinerU Markdown bytes','Node resolved from V6_NODE_BIN or PATH, never fixed Homebrew pathname',1);
INSERT INTO access_edges VALUES
 ('X-B01','S','B','ui/settings-module.js','createWorkspaceDirectoryModule(directoryPort)','B01','registered','Settings delegates directory widget to Workspace through a semantic component API'),
 ('X-B02',NULL,'B','ui/main.js','workspaceDirectoryPort','B02','registered','Shell supplies HTTP capability at composition root, never touches Workspace internals'),
 ('X-B03',NULL,'B','scripts/v6_serve.py','WORKSPACE.roots()','B03','registered','Authorized HTTP route delegates to Workspace service'),
 ('X-B04',NULL,'B','scripts/v6_serve.py','WORKSPACE.browse(value)','B04','registered','Authorized HTTP route delegates to Workspace service'),
 ('X-B05',NULL,'B','scripts/v6_serve.py','WORKSPACE.books(value)','B05','registered','Authorized HTTP route delegates to Workspace service'),
 ('X-B06',NULL,'B','scripts/v6_serve.py','WORKSPACE.active()','B06','registered','HTTP composition resolves selected workspace only via facade'),
 ('X-B07',NULL,'B','scripts/v6_serve.py','WORKSPACE.validate(content)','B07','registered','Settings gate validates selection under same lock'),
 ('X-B08',NULL,'B','scripts/v6_serve.py','WORKSPACE.prepare(content)','B08','registered','Versioned Settings commit may prepare absent mother document'),
 ('X-B09',NULL,'B','scripts/v6_serve.py','WORKSPACE.convert(raw','B09','registered','Direct CMB HTTP endpoint reuses Workspace converter');
-- Settings E09 is the already-declared route for choosing catalogue/book values.
-- These string-valued Settings keys do not introduce a parallel state store.
UPDATE messages SET payload='{"key":"string","value":"number|string","origin":"string"}' WHERE id='E09';
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-B01','B01','tests/workspace-root-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/WebKit actual Settings book UI uses Workspace widget and CMD save','integration'),
 ('TC-B02','B02','tests/workspace-root-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Browser HTTP contract returns catalogue and book statuses','integration'),
 ('TC-B03','B03','tests/workspace-root-server.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Authorized roots and selected book use one service facade','integration'),
 ('TC-B04','B04','tests/workspace-root-server.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Reject forbidden directory and traversal','integration'),
 ('TC-B05','B05','tests/workspace-root-server.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','List first-level books and readiness','integration'),
 ('TC-B06','B06','tests/workspace-root-server.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Selected document/PDF/JSON have one identity','integration'),
 ('TC-B07','B07','tests/workspace-root-server.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','CAS checks before conversion and rejects invalid selection','integration'),
 ('TC-B08','B08','tests/workspace-root-server.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Never overwrite old or preexisting mother Markdown','integration'),
 ('TC-B09','B09','tests/workspace-portability.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Node path configuration works under environment without Homebrew','direct');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-C33-MEDIA-SCOPE','C33','tests/media-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG 全部 authorizes validated whole-CMB Media adoption while preserving the selected CM6 chapter projection','integration'),
 ('TC-A04-PREEXISTING','A04','tests/media-preexisting-adoption.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','11 predownloaded files + 11 already-adopted remote CMD links remain 11 AG rows, then localize all through one CMD transaction and reload in Chrome/WebKit','integration'),
 ('TC-A01-DOWNLOAD-PREVIEW','A01','tests/media-download-preview-stability.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and iPad WebKit simulated multi-URL download leaves all 11 thumbnail DOM nodes mounted through complete+pending progress; only the completed URL changes src and never forces refresh of the whole preview column','integration'),
 ('TC-C20-AG-SCOPE','C20','tests/wcp-promoted-api-direct.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG chapter scope rejects outside LaTeX edit; all-CMB scope permits controlled edit without changing the selected CM6 chapter','direct'),
 ('TC-C20-OBSIDIAN-LATEX','C20','tests/obsidian-latex-display.test.mjs','tests/fixtures/latex-legacy-display.md','Reviewed display formulas preserve TeX newlines and place opening/closing $$ at column zero; repeat normalization is no-op','direct'),
 ('TC-C30-OBSIDIAN-SOURCE','C30','tests/obsidian-cm6-theme.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','CMD CM6 source presents installed Obsidian Everforest code fences and math boundaries without changing document bytes','integration'),
 ('TC-C30-OBSIDIAN-SYNTAX','C30','tests/obsidian-source-syntax.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and WebKit verify HTML tag/attribute/value/comment and TeX math token source coloring while fenced HTML and CMD document bytes remain unchanged','integration'),
 ('TC-G16-AG-FUNCTIONS','G16','tests/ag-function-menu.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Unified AG module-owned actions dropdown in Chrome/WebKit, empty menu disabled, scope/count status in global toolbar, no source writes','integration');
INSERT INTO access_edges VALUES
 ('X94',NULL,'T','ui/obsidian-source-syntax.js',"import {findLatex} from './latex-scan.js'",'T01','registered','Shell source syntax decoration reads only the registered LaTeX public scanner; no state, edits, or private module access');
INSERT INTO apis VALUES
 ('N01','N','scanNotePairs','ui/note-pair-scan.js','export','CMD source + validated regex template','positioned citation/body rows','pure read-only match with missing/duplicate statuses',1),
 ('N02','N','createNotePairModule','ui/note-pair-module.js','export','host,CMD reader,transaction port,status callback','independent Notes AG module','module owns AG, focus actions, template UI and marker planning',1),
 ('N03','N','returned.setVirtualQuery','ui/note-pair-module.js','returned','chapter query intention','void','owner applies chapter AG filter to its rows',1),
 ('N04','N','returned.openTemplates','ui/note-pair-module.js','returned','none','dialog','editable browser-local pairing regex templates',1),
 ('N05','N','returned.count','ui/note-pair-module.js','returned','chapter scope','number','semantic AG note count for global status bar',1),
 ('N06','N','planConvertNotePairs','ui/note-pair-scan.js','export','source + selected confirmed pairs','deduplicated CMD ops + counts','pure atomic batch plan for only unambiguous note pairs, no implicit source write',1),
 ('N07','N','returned.convertAll','ui/note-pair-module.js','returned','current AG chapter/all scope','one CMD annotation transaction or status error','explicit bulk Obsidian conversion, only one Undo step; global Save remains separate',1);
INSERT INTO access_edges VALUES
 ('X-N01','N','C','ui/note-pair-scan.js',"import {scanAnnotations} from './cmd-annotations.js'",'C23','registered','Note scanner reads only CMD annotation syntax for reviewed reference/body markers'),
 ('X-N02','L','N','ui/workspace.js','createNotePairModule(this.noteHost','N02','registered','Layout mounts Notes AG through its public module factory'),
 ('X-N03','L','N','ui/workspace.js','owner.setVirtualQuery(intent)','N03','registered','WCP chapter query is routed through Layout semantic AG port'),
 ('X-N04','L','N','ui/workspace.js','currentOutline?.note?.openTemplates()','N04','registered','Shell invokes Notes template dialog through Layout facade'),
 ('X-N05','L','N','ui/workspace.js','this.note?.count(chapter)','N05','registered','Global status queries Notes count through bounded semantic count');
INSERT INTO access_edges VALUES
 ('X-N07','L','N','ui/workspace.js','currentOutline?.note?.convertAll()','N07','registered','AG global action invokes Notes semantic one-transaction batch method via Layout facade');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-N01','N01','tests/note-pairs.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Default template matches all 10 escaped-HTML superscript citations to the 10 numbered Notes bodies; excludes letter OCR superscript artifacts; synthetic pairs, missing IDs and conflicts','direct'),
 ('TC-N02','N02','tests/note-pair-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/WebKit adjacent ref/body rows with multiview navigation and status colors; explicit confirmed pair converts native Obsidian footnotes and inserts two CMD annotation labels in one Undo step, Save/reload idempotent','integration'),
 ('TC-N03','N03','tests/note-pair-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chapter scope filters AG Notes without changing original source','integration'),
 ('TC-N04','N04','tests/note-pair-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Regex validation, application and browser-local template storage','integration'),
 ('TC-N05','N05','tests/note-pair-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Global status displays current Notes count','integration'),
 ('TC-N06','N06','tests/note-pairs.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','10 real confirmed pairs yield one safe 40-operation batch plan; duplicate references share one definition and CMD label','direct'),
 ('TC-N07','N07','tests/note-pair-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/WebKit explicit AG bulk action shows pending vs converted states, saves once, restores Undo/Redo, skips missing notes, no automatic write','integration');

-- Read-only HTML source locator: CMD owns Lezer syntax; HTML AG only presents.
-- Reuses registered focusTarget message and WP3 chapter query intention.
INSERT INTO modules VALUES
 ('H','HTML Elements','AG Grid + CMD Lezer HTML syntax query','ui/html-elements-module.js');

-- Reverse audit of live viewStore.subscribe callsites (WCP26 WP2): these
-- existing consumers were not present in the formal subscriber inventory.
-- The transport and message IDs already exist; this records observed reads,
-- not a new authorization for cross-module object access.
INSERT INTO subscriptions VALUES
 ('SUB18','E01','H','ui/html-elements-module.js','viewStore.subscribe -> refresh','documentRevision differs AND HTML AG active','refresh HTML AG rows after CM6 source edits'),
 ('SUB19','E03','H','ui/html-elements-module.js','viewStore.subscribe -> grid.getRowNode','focusTarget changed; external origin, same revision','select and reveal corresponding HTML AG row'),
 ('SUB20','E01','N','ui/note-pair-module.js','viewStore.subscribe -> queueMicrotask','documentRevision differs','refresh note-pair AG after source edits'),
 ('SUB21','E03','N','ui/note-pair-module.js','viewStore.subscribe -> followFocus','focusTarget changes','synchronize note-pair selection with source/preview focus'),
 ('SUB22','E03','G','ui/sentence-module.js','viewStore.subscribe -> followFocus','focusTarget changes','select sentence AG row from source/preview focus'),
 ('SUB23','E03','G','ui/text-block-module.js','viewStore.subscribe -> grid.getRowNode','focusTarget changes AND text-block AG active','locate CMD text-block AG row without editing source');


-- Real existing browser paths demonstrate the registered shared-state
-- consumer journeys. Evidence is explicitly integration-level, not a direct
-- isolated API unit test, and never replaces separate runtime edge review.
INSERT INTO test_cases(id,subscription_id,script,fixture,expected,evidence) VALUES
 ('TC-SUB18','SUB18','tests/html-table-normalize.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','HTML AG re-indexes after CMD/CM6 table edit without shadow document','integration'),
 ('TC-SUB19','SUB19','tests/html-elements.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','HTML AG and CM6 source coordinate semantic focus and chapter-scoped row selection','integration'),
 ('TC-SUB20','SUB20','tests/note-pair-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Note-pair rows reflect CMD conversion and undo/redo across document revisions','integration'),
 ('TC-SUB21','SUB21','tests/note-pair-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Note-pair AG and source/preview preserve focus after paired-note actions','integration'),
 ('TC-SUB22','SUB22','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Sentence AG selection follows CM6 and preview semantic focus','integration'),
 ('TC-SUB23','SUB23','tests/text-block-coverage.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Text-block AG and source/PDF review share focused block location','integration');


INSERT INTO apis VALUES
 ('C34','C','CMDocument.readHtmlElements','ui/cm-document.js','export','none','source-positioned HTML tags and comments, 1-based lines','CMD read-only parse over the sole CM6 Markdown; skips fenced/inline code',1),
 ('C35','C','scanHtmlElements','ui/cmd-html-elements.js','export','Markdown source','immutable HTML source token list','Lezer Markdown syntax, including quoted attributes and block HTML; no DOM or writes',1),
 ('H01','H','createHtmlElementsModule','ui/html-elements-module.js','export','host,CMD read port,status','independent HTML AG view','owns tags/comments display, filtering and existing focus message',1),
 ('H02','H','returned.setVirtualQuery','ui/html-elements-module.js','returned','chapter/all intent and optional label','void','filters only this AG table; no CMD writes',1),
 ('H03','H','returned.count','ui/html-elements-module.js','returned','chapter/all','HTML token count','bounded semantic count for WCP status',1);
INSERT INTO access_edges VALUES
 ('X-H01','L','H','ui/workspace.js','createHtmlElementsModule(this.htmlHost','H01','registered','Layout mounts HTML AG by public factory without reading its private Grid'),
 ('X-H02','L','H','ui/workspace.js','this.html?.count(chapter)','H03','registered','WCP status reads bounded HTML count through a Layout bridge'),
 ('X-H03','H','C','ui/html-elements-module.js','getCMD()?.readHtmlElements()','C34','registered','HTML AG reads semantic CMD syntax via injected read-only CMD capability'),
 ('X-H04','C','C','ui/cm-document.js','scanHtmlElements(this.markdown)','C35','registered','CMD reads Lezer source tokens within its own ownership boundary');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-C34-HTML','C34','tests/html-elements.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and iPad WebKit CMD HTML query contains inline and block elements with exact source locations','integration'),
 ('TC-C35-HTML','C35','tests/html-elements.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Syntax-aware scanner locates quoted HTML tags and comments; excludes code fences, inline code, comment payload','direct'),
 ('TC-H01-HTML','H01','tests/html-elements.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and iPad WebKit AG HTML rows and WCP multi-pane navigation preserve CMD bytes','integration'),
 ('TC-H02-HTML','H02','tests/html-elements.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Virtual chapter HTML AG query uses chapter/all scope, never edits CM6','integration'),
 ('TC-H03-HTML','H03','tests/html-elements.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG HTML count is reported by semantic WCP port','integration');

-- HTML AG grouping: one row per open/close pair or standalone HTML token.
INSERT INTO apis VALUES
 ('H04','H','groupHtmlElements','ui/html-element-groups.js','export','CMD immutable HTML token records','immutable grouped rows with open/close lines','nested tag stack is AG presentation only; unmatched tags retained, no CMD writes',1);
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-H04-GROUP','H04','tests/html-element-groups.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Paired and nested tags collapse into one AG row; standalone comments/void tags remain; malformed pairs visibly retained','direct'),
 ('TC-H01-GROUP-BROWSER','H01','tests/html-elements.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit AG shows 单行/开合 grouping, separate opening/closing source-line clicks and chapter/all scope','integration');

-- HTML table three-part wrapper, approved provisional OCR2MD review format.
-- Only a user-clicked HTML AG action writes via one optimistic CMD transaction.
INSERT INTO apis VALUES
 ('H05','H','planNormalizeTables','ui/html-table-normalize.js','export','CMD source, read-only HTML groups, body-end and chapter scope','guarded CMD companion text operations + converted/skipped','wraps standalone table with empty editable title and notes/source placeholders; idempotent; skips evidence, existing figure and unsafe nesting',1),
 ('H06','H','returned.normalizeTables','ui/html-elements-module.js','returned','current AG all/chapter scope','CMD editAnnotations single transaction or reason summary','explicit review-only batch action, does not automatically Save',1),
 ('L29','L','returned.normalizeHtmlTables','ui/workspace.js','returned','none','void','Layout routes HTML AG table normalization from shell without exposing Grid or CM6 internals',1);
INSERT INTO access_edges VALUES
 ('X-HTML-TABLE-01','L','H','ui/workspace.js','currentOutline?.html?.normalizeTables()','H06','registered','Shell routes batch HTML table review via Layout bounded facade'),
 ('X-HTML-TABLE-02',NULL,'L','ui/main.js','workspace.normalizeHtmlTables()','L29','registered','Shell button invokes Layout API for explicit table normalization');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-H05-TABLE','H05','tests/html-table-normalize.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','All eight existing OCR HTML tables gain three semantic sections; table bytes and original evidence remain unchanged; nested and repeated conversion skip','direct'),
 ('TC-H06-TABLE','H06','tests/html-table-normalize.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and iPad WebKit action wraps current/all chapter tables with one CMD Undo, explicit CAS Save, reload and idempotence; no automatic source writes','integration'),
 ('TC-L29-TABLE','L29','tests/html-table-normalize.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','User-initiated HTML AG action travels through Layout to scoped CMD edit and global Save','integration');

-- Obsidian native callout rendering is wholly inside Markdown preview.
INSERT INTO apis VALUES
 ('M12','M','installObsidianCallouts','ui/obsidian-callouts.js','export','markdown-it renderer instance','register Markdown-it core callout tokenizer and HTML renderer','read-only title/body splitting; native details for +/-, aside for nonfoldable; nested quote preservation; DOMPurify sanitized',1);
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-M12-CALLOUT','M12','tests/obsidian-callouts.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Native note+/note-, nested, markdown bodies, title-only, plain quote, fenced-code and legacy spaced callouts','direct'),
 ('TC-M12-BROWSER','M12','tests/obsidian-callouts.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/WebKit details fold and restore after CM6 repaint without navigation, while original source stays unchanged','integration');

-- Layout-owned source line menu: only caret line has a native CM6 gutter button.
-- Shell hands the typed action to the registered CMD transaction port.
INSERT INTO apis VALUES
 ('L30','L','planCalloutAtCursor','ui/source-callout-plan.js','export','source snapshot,caret offset,mode','safe atomic insertion plan with cursor target','pure Markdown block plan; old bytes preserved, no source write',1),
 ('L31','L','createSourceLineCalloutMenu','ui/source-line-callout-menu.js','export','source pane, CM6 view, bounded action callback','four-item caret-line gutter popup with selected-line summary','caret-line popup avoids wrapped source line, offers fenced block insertion and retains selection and scroll leadership',1),
 ('L32','L','returned.mountSourceLineMenu','ui/workspace.js','returned','CM6 view,bounded CMD insertion callback','void','source Layout mounts a CM6 line-number action; no editor edits',1);
INSERT INTO access_edges VALUES
 ('X-SRC-L31','L','L','ui/workspace.js','createSourceLineCalloutMenu({host:','L31','registered','Layout mounts source line action owned by its own view'),
 ('X-SRC-L32',NULL,'L','ui/main.js','workspace.mountSourceLineMenu(view,{onInsert:(plan,kind','L32','registered','Shell supplies bounded source insertion action'),
 ('X-SRC-L30','L','L','ui/source-line-callout-menu.js','planCalloutAtCursor(view.state.doc.toString(),captured.offset)','L30','registered','Layout-owned pure planner never mutates CMD or editor state');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-L30-SRC','L30','tests/source-callout-plan.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Markdown block boundaries, cursor placement, bytes preservation in all three folding modes','direct'),
 ('TC-L31-SRC','L31','tests/source-line-callout.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit no overlapping wrapped source; fence action plus Callout and quote levels preserve selection','integration'),
 ('TC-L32-SRC','L32','tests/source-line-callout.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit Callout and quote +/- from gutter, Undo/Redo, explicit CAS Save, reload and evidence safety','integration');

-- Source Markdown code fence action is planned in Layout and committed only
-- through the existing guarded CMD replaceRanges port.
INSERT INTO apis VALUES
 ('L33','L','planFencedBlock','ui/source-fence-plan.js','export','source string,selected range [from,to),optional language','guarded atomic Markdown code-fence insertion plan','expands nonempty selection to whole lines; validates language; adapts embedded backticks; empty caret inserts blank fence',1);
INSERT INTO access_edges VALUES
 ('X-SRC-L33','L','L','ui/source-line-callout-menu.js','planFencedBlock(view.state.doc.toString(),range.from,range.to,fenceLanguage.value)','L33','registered','Layout plans fenced block while source writes remain CMD-owned');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-L33-FENCE','L33','tests/source-fence-plan.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','12 pure cases plus language validation, partial/full lines, backticks and unchanged source bytes','direct'),
 ('TC-L33-FENCE-BR','L33','tests/source-line-callout.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/WebKit gutter menu language form, blank/selection fence, one CMD transaction and Save/reload/evidence safety','integration');

-- Read-only Markdown preview syntax highlighting and language-aware source planner.
INSERT INTO apis VALUES
 ('M13','M','highlightCodeFence','ui/code-fence-highlight.js','export','source code,language tag','escaped, optional syntax-colored pre/code HTML','registered highlight.js languages only, unknown tags remain escaped; fenced math stays under KaTeX',1);
INSERT INTO access_edges VALUES
 ('X-M13-PREV','M','M','ui/markdown-preview.js','highlight:highlightCodeFence','M13','registered','Markdown-it preview renders registered code syntax only');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-M13-SYNTAX','M13','tests/code-fence-highlight.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Python/JSON/HTML/JS highlighted; unknown uncolored; HTML escaped; deterministic output','direct'),
 ('TC-M13-BROWSER','M13','tests/code-fence-highlight.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and iPad WebKit highlight theme styled, DOMPurify safety, source maps and KaTeX unchanged','integration');

-- Isolated offline spelling review. Layout only calls AG public factory/facade;
-- CMD remains sole text authority and Shell owns the CM6 Lint/Worker adapter.
INSERT INTO apis VALUES
 ('G19','G','createSpellcheckModule','ui/spellcheck-module.js','export','host,readOnlyChapterReader,status callback','bounded AG facade','AG only renders detached CMD spelling elements and emits existing focus, no source reads/writes',1),
 ('L34','L','returned.updateSpellcheck','ui/workspace.js','returned','detached issue rows,scan status','void','Shell sends only immutable diagnostic projections to Layout/AG; no source or AG internals exposed',1);
INSERT INTO access_edges VALUES
 ('X-SPELL-G19','L','G','ui/workspace.js','createSpellcheckModule(this.spellcheckHost','G19','registered','Layout mounts AG-owned independent spelling review through its public entry'),
 ('X-SPELL-L34',NULL,'L','ui/main.js','workspace.updateSpellcheck(rows,{error:','L34','registered','Shell sends projected findings to Layout, without letting AG inspect CM6');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-SPELL-G19','G19','tests/native-spellcheck.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/WebKit spelling AG rows, scoped chapter filter, source focus and lint markers; no source writes','integration'),
 ('TC-SPELL-L34','L34','tests/native-spellcheck.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Shell-owned Worker sends detached rows through Layout, marks on/off, undo and stale response safety','integration');

-- CMD-owned spelling element syntax/read/mark semantics, all derived from
-- CM6 live Markdown, no AG read of Markdown or business-owned write plan.
INSERT INTO apis VALUES
 ('C36','C','readSpellcheckMarks','ui/cmd-spellcheck.js','export','source, CMD annotations','word-matched source positioned elements/stale count','pure CMD comment syntax projection',1),
 ('C37','C','planSpellcheckMarks','ui/cmd-spellcheck.js','export','source, candidates, CMD annotations','guarded annotation operations','CMD pure planner; no AG writes',1),
 ('C38','C','returned.querySpellingElements','ui/wcp-cmd-element-transactions.js','returned','none','live CM6-derived spelling element projection','read-only authoritative CMD query',1),
 ('C39','C','returned.markSpellingCandidates','ui/wcp-cmd-element-transactions.js','returned','candidate positions, expectedSource, AG scope','atomic changed/skipped counts','CMD checks chapter and evidence, one CM6 annotation transaction, no auto-save',1),
 ('L35','L','returned.applySpellingCandidates','ui/workspace.js','returned','detached Worker candidates, source guard','CMD commit results','Layout forwards AG semantic scope to CMD and never plans writes',1),
 ('L36','L','returned.getSpellingElements','ui/workspace.js','returned','none','CMD position-projected rows','Shell displays CM6 Lint from CMD without duplicate spell analysis',1);
INSERT INTO access_edges VALUES
 ('X-SPELL-C36','C','C','ui/wcp-cmd-element-transactions.js','readSpellcheckMarks(source,cmd.readAnnotations','C36','registered','CMD reads live annotation bytes through its own parser'),
 ('X-SPELL-C37','C','C','ui/wcp-cmd-element-transactions.js','planSpellcheckMarks(expectedSource,eligible,','C37','registered','CMD plans verified comment insertions itself'),
 ('X-SPELL-L35',NULL,'L','ui/main.js','workspace.applySpellingCandidates(rows,source.toString())','L35','registered','Shell submits only candidate positions; Layout obtains semantic AG scope'),
 ('X-SPELL-L36',NULL,'L','ui/main.js','workspace.getSpellingElements()','L36','registered','Shell reads CMD-projected annotations to paint CM6 Lint');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-SPELL-C36','C36','tests/spellcheck-marks.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','CMD comments roundtrip without Markdown meaning change; invalid old word excluded','direct'),
 ('TC-SPELL-C37','C37','tests/spellcheck-marks.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Duplicate protection, optimistic offsets and source matching','direct'),
 ('TC-SPELL-C38','C38','tests/native-spellcheck.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Browser CMD live query drives AG rows and CM6 diagnostics, reload no Worker scan','integration'),
 ('TC-SPELL-C39','C39','tests/native-spellcheck.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Browser automatic batch mark, one undo/redo, scope and source evidence protection','integration'),
 ('TC-SPELL-L35','L35','tests/native-spellcheck.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Layout routes scan results to CMD without AG-owned planner, no auto-save','integration'),
 ('TC-SPELL-L36','L36','tests/native-spellcheck.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Show scoped CMD annotations with no duplicate state on re-entry/reload','integration');

-- Spellcheck AG regression guard: forbid business-owned source parsing or
-- accidental direct CM6 edit/access after CMD semantic port convergence.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-SPELL-BOUNDARY-AG','G19','tests/spellcheck-boundary.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG spelling owns rows/focus only, cannot parse or write source','direct'),
 ('TC-SPELL-BOUNDARY-CMD','C39','tests/spellcheck-boundary.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Spelling syntax and atomic writes belong to CMD and CM6','direct');

-- Single CM6-owned source read route shared by all AG business analyzers.
-- Recognition rules remain module-owned; no AG module accesses CM6 directly.
INSERT INTO apis VALUES
 ('C40','C','returned.readSource','ui/wcp-cmd-element-transactions.js','returned','none','current live CM6 Markdown string','one read-only CMD source port for headings/media/latex/notes/html element analyzers',1);
INSERT INTO access_edges VALUES
 ('X-ELEMENT-SOURCE','L','C','ui/workspace.js','getCMD()?.readSource?.()','C40','registered','All AG business sources are injected from CMD, never directly from a CM6 editor or parallel state');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-C40-AG','C40','tests/main-promoted-lab-ui.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG title/media/latex data continues to derive from one live CMD source','integration'),
 ('TC-C40-GUARD','C40','tests/spellcheck-boundary.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','All AG module source injections route through CMD.readSource','direct');

-- The base CMD surface and its WCP wrapper return the SAME CM6 state source.
INSERT INTO apis VALUES
 ('C41','C','CMDocument.readSource','ui/cm-document.js','export','none','live EditorState Markdown text','single read-only source accessor; never creates another editor state',1);
INSERT INTO access_edges VALUES
 ('X-ELEMENT-READSOURCE','C','C','ui/wcp-cmd-element-transactions.js','cmd.readSource()','C41','registered','WCP CMD adapter delegates to base CMDocument source reader');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-C41-UNIFIED','C41','tests/main-promoted-lab-ui.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Main/Lab read-only business sources remain bound to one CM6 EditorState','integration');

-- Conservative OCR line-break review: CMD owns semantic detection and annotations;
-- Shell owns only lazy offline Worker and CM6 Lint; AG owns read-only evidence UI.
INSERT INTO apis VALUES
 ('C42','C','detectIllegalBreaks','ui/cmd-linebreak.js','export','one CMD source string, dictionary, body boundary','dictionary word splits and same-page adjacent OCR block continuations','pure scan excludes plain soft wraps, fenced Markdown and immutable MinerU source; never edits',1),
 ('C43','C','planIllegalBreakMarks','ui/cmd-linebreak.js','export','source,review candidates,CMD annotations','guarded CMD comment insertion operations','tag before newline on preceding line preserves renderer, no duplicate markers',1),
 ('C44','C','readIllegalBreaks','ui/cmd-linebreak.js','export','one CMD source, current CMD annotations','anchored rows and stale count','read marker only if both word parts still match the source newline',1),
 ('C45','C','returned.queryIllegalBreakElements','ui/wcp-cmd-element-transactions.js','returned','none','source offset rows and stale count','CMD semantic read projection from CM6, excludes immutable MinerU tail',1),
 ('C46','C','returned.markIllegalBreakCandidates','ui/wcp-cmd-element-transactions.js','returned','candidate offsets,expectedSource,AG scope','one CM6 comment transaction','CMD validates current source, chapter and immutable evidence; no auto correction/save',1),
 ('G20','G','createIllegalBreakModule','ui/illegal-break-module.js','export','AG host,CMD chapter port, status callback','read-only AG row review and WCP focus','AG owns only display/filter, no direct source or CM6',1),
 ('L37','L','returned.getIllegalBreakElements','ui/workspace.js','returned','none','CMD projected break rows','Shell restores AG/CM6 lint from CMD without re-scanning',1),
 ('L38','L','returned.markIllegalBreakCandidates','ui/workspace.js','returned','detached candidates, source guard','CMD commit counts','Layout supplies AG operation scope, CMD owns insertion',1);
INSERT INTO access_edges VALUES
 ('X-BREAK-C42',NULL,'C','ui/spellcheck-worker.js','detectIllegalBreaks(source,spell,{bodyEnd})','C42','registered','offline worker requests CMD-owned conservative recognizer'),
 ('X-BREAK-C43','C','C','ui/wcp-cmd-element-transactions.js','planIllegalBreakMarks(expectedSource,eligible,','C43','registered','CMD creates all annotation operations'),
 ('X-BREAK-C44','C','C','ui/wcp-cmd-element-transactions.js','readIllegalBreaks(cmd.readSource(),cmd.readAnnotations','C44','registered','CMD consumes its own syntax projection'),
 ('X-BREAK-C45','L','C','ui/workspace.js','getCMD().queryIllegalBreakElements()','C45','registered','Layout receives only CMD-projected data'),
 ('X-BREAK-C46','L','C','ui/workspace.js','getCMD().markIllegalBreakCandidates(candidates,{expectedSource,agScope:scope})','C46','registered','AG scope forwards to CMD guarded single transaction'),
 ('X-BREAK-G20','L','G','ui/workspace.js','createIllegalBreakModule(this.illegalBreakHost','G20','registered','Layout mounts independent read-only AG module'),
 ('X-BREAK-L37',NULL,'L','ui/main.js','workspace.getIllegalBreakElements()','L37','registered','Shell restores marked Lint without rescanning'),
 ('X-BREAK-L38',NULL,'L','ui/main.js','workspace.markIllegalBreakCandidates(issues,source)','L38','registered','Shell passes only candidates to Layout semantic port');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-BREAK-C42','C42','tests/cmd-linebreak.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Detect dictionary word splits plus real Buffett about/3 adjacent MinerU block, exclude ordinary paragraph breaks','direct'),
 ('TC-BREAK-C43','C43','tests/cmd-linebreak.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Comments before newline preserve Markdown rendering; no double insert','direct'),
 ('TC-BREAK-C44','C44','tests/cmd-linebreak.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Anchored persisted read including block continuation, stale word positions rejected','direct'),
 ('TC-BREAK-C45','C45','tests/illegal-break.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','CMD marks restore through reload with zero worker scan','integration'),
 ('TC-BREAK-C46','C46','tests/illegal-break.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Automatic scoped single CMD batch, one undo/redo and explicit save','integration'),
 ('TC-BREAK-G20','G20','tests/illegal-break.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG row list and cross-pane focus in Chrome/WebKit','integration'),
 ('TC-BREAK-L37','L37','tests/illegal-break.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','On reload read CMD markers, preserve CM6 source authority','integration'),
 ('TC-BREAK-L38','L38','tests/illegal-break.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Shell/Layouter forward only scanner candidates, no AG writes','integration');

-- Regression from real Buffett 8:3→8:4: existing v1 CMD block-break mark
-- is retained and manual AG rescan appends only the newly recognized 13F.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-BREAK-REAL-RESCAN','C46','tests/illegal-break-rescan-real.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Real Buffett legacy about/3 CMD mark remains intact; rescan adds latest/13F once; explicit Save/reload restores both without dictionary Worker','integration');

-- WP1/3 sentence semantic layer: reversible CMD text-block projection plus
-- pluggable ICU sentence boundaries; AG only owns display/selection/focus.
INSERT INTO apis VALUES
 ('C47','C','extractTextBlocks','ui/cmd-sentences.js','export','CM6 live Markdown and bodyEnd','runs with source offsets + exact raw sourcePieces','no Markdown source mutation or extra editor state',1),
 ('C48','C','reconstructSource','ui/cmd-sentences.js','export','CMD sourcePieces','exact original Markdown string','hard character identity check before any NLP processing',1),
 ('C49','C','segmentSentences','ui/cmd-sentences.js','export','CMD projection + optional engine','sentences with stable IDs, block fragments, source offsets','uses Intl.Segmenter baseline; can swap engine without AG/CMD contract changes',1),
 ('C50','C','planSentenceMarks','ui/cmd-sentences.js','export','source, sentence candidates, current CMD annotations','protected CMD inline comment operations','avoid first-column Markdown HTML block hazard, no duplicates',1),
 ('C51','C','readSentenceMarks','ui/cmd-sentences.js','export','live source and sentence annotations','source-positioned sentence rows with stale detection','cross-block fragments retain shared sentence ID',1),
 ('C52','C','returned.segmentSentenceCandidates','ui/wcp-cmd-element-transactions.js','returned','none','detached candidates from live CM6 source','CMD owns engine invocation and reversible source validation',1),
 ('C53','C','returned.querySentences','ui/wcp-cmd-element-transactions.js','returned','none','read-only sentence rows','CMD reads only current live annotations',1),
 ('C54','C','returned.markSentences','ui/wcp-cmd-element-transactions.js','returned','sentence candidates, expectedSource, AG chapter operation scope','one undoable CM6 annotation batch','CMD verifies chapter/source/immutable evidence; no auto save or text normalization',1),
 ('G21','G','createSentenceModule','ui/sentence-module.js','export','AG host, read-only CMD chapter reader, status callback','AG sentence list and WCP focus intent','no direct source/CM6/editor state access',1),
 ('L39','L','returned.segmentSentenceCandidates','ui/workspace.js','returned','none','detached CMD sentence candidates','Layout forwards semantic read API from CMD only',1),
 ('L40','L','returned.getSentences','ui/workspace.js','returned','none','detached CMD sentence rows','Layout updates AG from CMD query after reload',1),
 ('L41','L','returned.markSentences','ui/workspace.js','returned','candidate list and optimistic source','CMD atomic mark result','AG provides chapter scope, CMD plans annotation operations',1);
INSERT INTO access_edges VALUES
 ('X-SENT-C47','C','C','ui/wcp-cmd-element-transactions.js','extractTextBlocks(source,{bodyEnd:projector.get().bodyEnd})','C47','registered','CMD projects source without replacing Markdown'),
 ('X-SENT-C48','C','C','ui/wcp-cmd-element-transactions.js','reconstructSource(projection)','C48','registered','CMD hard source identity guard'),
 ('X-SENT-C49','C','C','ui/wcp-cmd-element-transactions.js','segmentSentences(projection)','C49','registered','CMD controlled pluggable sentence boundary engine'),
 ('X-SENT-C50','C','C','ui/wcp-cmd-element-transactions.js','planSentenceMarks(expectedSource,eligible,','C50','registered','CMD plans all sentence edits'),
 ('X-SENT-C51','C','C','ui/wcp-cmd-element-transactions.js','readSentenceMarks(cmd.readSource(),cmd.readAnnotations','C51','registered','CMD projects persisted sentence tags'),
 ('X-SENT-C52','L','C','ui/workspace.js','getCMD().segmentSentenceCandidates()','C52','registered','layout reads detached candidates only'),
 ('X-SENT-C53','L','C','ui/workspace.js','getCMD().querySentences()','C53','registered','layout reads CMD source projection'),
 ('X-SENT-C54','L','C','ui/workspace.js','getCMD().markSentences(candidates,{expectedSource:source,agScope:scope})','C54','registered','layout submits scoped optimistic mark transaction'),
 ('X-SENT-G21','L','G','ui/workspace.js','createSentenceModule(this.sentenceHost','G21','registered','Layout mounts AG-owned sentence reviewer'),
 ('X-SENT-L39',NULL,'L','ui/main.js','workspace.segmentSentenceCandidates()','L39','registered','Shell only triggers semantic projection'),
 ('X-SENT-L40',NULL,'L','ui/main.js','workspace.getSentences()','L40','registered','Shell only reads CMD projection'),
 ('X-SENT-L41',NULL,'L','ui/main.js','workspace.markSentences(candidates,source)','L41','registered','Shell forwards semantic candidates');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-SENT-C47','C47','tests/cmd-sentences.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Reversible source partition protects provenance and code while combining sentence runs','direct'),
 ('TC-SENT-C48','C48','tests/cmd-sentences.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Byte-identical reconstruction of original Markdown including metadata','direct'),
 ('TC-SENT-C49','C49','tests/cmd-sentences.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','about/3 and latest/13F are single cross-MinerU sentences','direct'),
 ('TC-SENT-C50','C50','tests/cmd-sentences.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Safe inline comment positioning retains Markdown renderer, duplicate planning zero','direct'),
 ('TC-SENT-C51','C51','tests/cmd-sentences.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','CMD reads stable sentence fragments with shared IDs and validates stale positions','direct'),
 ('TC-SENT-C52','C52','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/WebKit live CMD sentence candidates from single CM6 source','integration'),
 ('TC-SENT-C53','C53','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG reload directly reads CMD tags, no second editor state','integration'),
 ('TC-SENT-C54','C54','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','One CM6 annotation batch, Undo/Redo, Save, no MinerU evidence mutation','integration'),
 ('TC-SENT-G21','G21','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG sentence list shows cross-block text and source row location','integration'),
 ('TC-SENT-L39','L39','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG gets only detached CMD projection','integration'),
 ('TC-SENT-L40','L40','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG restores sentence marks after reload','integration'),
 ('TC-SENT-L41','L41','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','No auto save or direct AG mutation','integration');

-- Sentence reader selection: WCP focus id -> CMD read-only projection ->
-- CSS Highlights DOM Range overlay. No Markdown rewrite or AG preview DOM access.
INSERT INTO apis VALUES
 ('L42','L','paintSentencePreviewHighlight','ui/sentence-preview-highlight.js','export','preview root,CMD sentence row,current source,lineAtOffset','one underlined CSS Highlight per source fragment, one sentence-ending punctuation highlight','read-only browser Range anchored by source block; excludes other sentences and decimal punctuation',1),
 ('L43','L','clearSentencePreviewHighlight','ui/sentence-preview-highlight.js','export','none','clears transient CSS Highlight registry','no source edit, DOM mutation or scroll reflow',1);
INSERT INTO access_edges VALUES
 ('X-SENT-SEL-L42','L','L','ui/workspace.js','paintSentencePreviewHighlight(this.body,row,getCMD().readSource(),','L42','registered','Layout-owned preview paints detached CMD sentence by id'),
 ('X-SENT-SEL-L43','L','L','ui/workspace.js','clearSentencePreviewHighlight()','L43','registered','Layout-owned preview clears on other focus, module change, render/dispose');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-SENT-SEL-42','L42','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/WebKit CSS Highlights underline exact selected sentence across source blocks, only terminal period emphasized, second sentence/inline math correctly localized','integration'),
 ('TC-SENT-SEL-43','L43','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Switch module/preview navigation clear highlights, selecting again and reloading redraws, CMD source/DOM remain unchanged','integration');

-- WCP sentence reverse focus: CM6 exact source offsets / Preview Range click
-- resolve AG-only selection by CMD fragment mapping, not paragraph line.
INSERT INTO apis VALUES
 ('L44','L','hitSentencePreview','ui/sentence-preview-highlight.js','export','preview reader root, clicked element, pointer coordinates, CMD sentence fragments, line-offset reader','one matching CMD sentence row or null','read-only precise rendered DOM range hit test for adjacent and cross-block sentences',1);
INSERT INTO access_edges VALUES
 ('X-SENT-REVERSE-L44','L','L','ui/workspace.js','hitSentencePreview(this.body,event.target,sourceLine,','L44','registered','Reader translates text click into CMD sentence ID, no AG import');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-SENT-REVERSE-L44','L44','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit clicking second sentence of one preview line selects exact AG row; cross-block fragments choose same logical sentence; reverse CM6 click resolves source character and AG scrolls into view','integration');

-- Whole sentence coverage review: AG Grid owns row filters and exposes only
-- current displayed sentence records; reader paints detached CMD ranges.
INSERT INTO apis VALUES
 ('G22','G','returned.setCoverage','ui/sentence-module.js','returned','sentence-toolbar checkbox on/off','boolean coverage preference and notify semantic view','no editor/raw AG API exposed, no persisted mutation',1),
 ('G23','G','returned.getCoverageRows','ui/sentence-module.js','returned','none','detached rows after AG column and virtual chapter filters','AG alone owns row filters, includes all filtered rows not viewport only',1),
 ('G24','G','returned.setCoverageResult','ui/sentence-module.js','returned','reader coverage mapping stats','AG status actual mapped vs unrenderable count','no feedback into Grid filtering, avoids re-entrant coverage updates',1),
 ('L45','L','paintSentenceCoverageHighlight','ui/sentence-preview-highlight.js','export','reader root, CMD sentence list, source, line mapper','multi-sentence readonly CSS Highlights/SAFARI geometry overlay and exact coverage stats','paint only safe mapped sentence ranges and terminal marks, never rewrite reader text',1),
 ('L46','L','clearSentenceCoverageHighlight','ui/sentence-preview-highlight.js','export','none','remove transient coverage marks','module switch and checkbox off leave CMD/preview text unchanged',1),
 ('L47','L','returned.setSentenceCoverage','ui/workspace.js','returned','boolean coverage preference','AG owner module overlay selection','only semantic callback, no raw AG grid API crossing WCP boundary',1);
INSERT INTO access_edges VALUES
 ('X-SENT-COVER-G22','L','G','ui/workspace.js','currentOutline?.sentence?.setCoverage(enabled)','G22','registered','Layout forwards toolbar semantic checkbox value'),
 ('X-SENT-COVER-G23','L','G','ui/workspace.js','currentOutline?.sentence?.getCoverageRows()','G23','registered','Layout reads filtered AG records without touching Grid API'),
 ('X-SENT-COVER-G24','L','G','ui/workspace.js','currentOutline?.sentence?.setCoverageResult(result)','G24','registered','Layout returns actual preview mapping diagnostics'),
 ('X-SENT-COVER-L45','L','L','ui/workspace.js','paintSentenceCoverageHighlight(this.body,rows,cmd.readSource()','L45','registered','Reader owns DOM and transient ranges, AG owns detached sentence IDs'),
 ('X-SENT-COVER-L46','L','L','ui/workspace.js','clearSentenceCoverageHighlight()','L46','registered','Reader clears coverage before selection changes or repaint'),
 ('X-SENT-COVER-L47',NULL,'L','ui/main.js','workspace.setSentenceCoverage(enabled)','L47','registered','Shell bridges WCP toolbar event to bounded sentence coverage port');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-SENT-COVER-G22','G22','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Sentence toolbar checkbox default off, on paints all AG rows, off clears, no source write','integration'),
 ('TC-SENT-COVER-G23','G23','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG real status column filter all unchecked yields no preview ranges; restoring filter restores preview ranges','integration'),
 ('TC-SENT-COVER-G24','G24','tests/sentence-coverage-buffett.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Large corpus status reports real rendered coverage separately from nonmapped OCR/HTML sentences','integration'),
 ('TC-SENT-COVER-L45','L45','tests/sentence-coverage-buffett.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Full Buffett Chrome/WebKit hundreds of rows mapped by source ranges, visual coverage no document writes','integration'),
 ('TC-SENT-COVER-L46','L46','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Turning off coverage or switching modules clears both native CSS and WebKit overlays','integration'),
 ('TC-SENT-COVER-L47','L47','tests/sentence.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Toolbar action takes semantic path WCP to AG to reader, keeping source and save state unchanged','integration');

-- Screenshot-backed footnote boundary + safe inline-island coverage regression.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-SENT-COVER-FOOTNOTE-L45','L45','tests/sentence-coverage-geometry.browser.test.mjs','tests/sentence-coverage-geometry.browser.test.mjs','Chrome/WebKit 9/9 mapped; following This finding visible and highlighted; image no overlap, source unchanged','integration');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-SENT-FOOTNOTE-REAL-L45','L45','tests/sentence-footnote-coverage.browser.test.mjs','tests/sentence-footnote-coverage.browser.test.mjs','Chrome/WebKit source-preserving CMD segmentation, idempotent marks, 7/7 including leading CMD LaTeX and trailing prose, screenshot and no source write','integration');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-SENT-COVER-CONVERTED-NOTE-L45','L45','tests/sentence-footnote-coverage.browser.test.mjs','tests/sentence-footnote-coverage.browser.test.mjs','Chrome/WebKit all marked text highlighted incl. This finding and Open Access; no extra CMD marks or saves','integration');

-- Text-block inventory: CMD sealed original JSON is the only evidence source;
-- AG owns a read-only grid, layout returns semantic DOM coverage, PDF paints bbox.
INSERT INTO apis VALUES
 ('L48','L','inspectCMDTextBlocks','ui/cmd-text-blocks.js','export','current CM6 CMD source string','detached parent inventory and native child OCR provenance (type, text, original bbox), SHA-validated layout, source anchor completeness','does not fetch /api/pdf-map, decompresses only CMD sealed original JSON',1),
 ('G25','G','createTextBlockModule','ui/text-block-module.js','export','AG host, CMD chapter lookup, bounded status and PDF location callbacks','AG full parent and child PBS inventory plus BC grouped view and semantic actions','module owns AG grid; mutation requests only through registered CMD action callback; no direct CM6 or PDF writes',1),
 ('G26','G','returned.setPreviewCoverage','ui/text-block-module.js','returned','detached reader-mapped block ID array','AG displays real MD coverage vs metadata-only blocks','reader owns DOM; AG receives IDs only',1),
 ('L49','L','returned.focusBlock','ui/pdf-preview.js','returned','page index and para block index','show original PDF bbox even if CMD source anchor is missing','PDF viewer alone owns overlay geometry and scroll',1);
INSERT INTO access_edges VALUES
 ('X-TEXTBLOCK-L48','C','L','ui/cm-document.js','inspectCMDTextBlocks(source)','L48','registered','CMD document inventories its own active source through L48; CMD transaction helpers call cmd.inspectTextBlocks (grok fix: call moved from main.js in f7c5fbc)'),
 ('X-TEXTBLOCK-G25','L','G','ui/workspace.js','createTextBlockModule(this.textBlockHost','G25','registered','Layout mounts AG business owner using bounded ports'),
 ('X-TEXTBLOCK-G26','L','G','ui/workspace.js','owner.setPreviewCoverage(rows.filter','G26','registered','Renderer supplies mapped IDs only, no direct Grid mutation'),
 ('X-TEXTBLOCK-L49','L','L','ui/workspace.js','this.pdf?.focusBlock(pageIndex,blockIndex)','L49','registered','Missing anchor can locate original PDF without fabricated source line');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-TEXTBLOCK-CMD-L48','L48','tests/cmd-text-blocks.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Reinitialized 224 anchors and bbox values; SHA corruption rejected; missing/duplicate source marker visible; no writes','integration'),
 ('TC-TEXTBLOCK-G25','G25','tests/text-block-coverage.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome/WebKit text block first dropdown choice, all 224 CMD original blocks visible in AG, orange PDF box follows click','integration'),
 ('TC-TEXTBLOCK-G26','G26','tests/text-block-coverage.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome/WebKit 215 real MD source mappings; eight empty text + one metadata-only table excluded; no source writes','integration'),
 ('TC-TEXTBLOCK-L49','L49','tests/text-block-coverage.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Read-only PDF.js orange geometry matches CMD sealed JSON for 224 of 224 blocks','integration');

-- WP2: CMD sealed geometry is the sole runtime PDF overlay source; the
-- existing /api/pdf-map may remain for legacy diagnostics but is NOT consumed.
INSERT INTO apis VALUES
 ('L50','L','queryCMDLayout','ui/cmd-text-blocks.js','export','current CMD source','immutable display union bbox of all valid native child rectangles plus unchanged originalBBox; line/span on demand','CMD owns geometry, ignores clearly conflicting child evidence, no OCR/PDF mutation or new Block identities',1),
 ('L51','L','queryCMDBlockGeometry','ui/cmd-text-blocks.js','export','source,page index,block index','unmodified original bbox, separate coverageBBox, page size and text line/span locations or null','read-only; no OCR/PDF/CM6 mutation',1),
 ('C55','C','returned.queryLayout','ui/wcp-cmd-element-transactions.js','returned','none','promise of CMD original page/Block geometry','WCP port exposes semantic CMD capability, no raw AG/source bypass',1);
INSERT INTO access_edges VALUES
 ('X-WP2-CMD-L50','C','L','ui/cm-document.js','queryCMDLayout(source)','L50','registered','CM6 CMD source is the sole owner of original layout'),
 ('X-WP2-CMD-L51','C','L','ui/cm-document.js','queryCMDBlockGeometry(this.readSource()','L51','registered','Per-block query shares CMD verified original JSON'),
 ('X-WP2-CMD-C55','L','C','ui/workspace.js','getCMD().queryLayout()','C55','registered','Layout-only geometry port supplied to PDF viewer after CMD readiness');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-WP2-L50','L50','tests/cmd-text-blocks.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','224 immutable original block bbox and page sizes; per-block line/span boxes on demand; SHA corruption rejected','integration'),
 ('TC-WP2-L51','L51','tests/cmd-text-blocks.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','p6b2 exact bbox [51,215,273,272] and first line bbox; invalid page returns null','integration'),
 ('TC-WP2-PDF-C55','C55','tests/text-block-coverage.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome/WebKit PDF orange boxes and AG navigation work even if /api/pdf-map returns 503 and no request is sent','integration');

-- Full original PDF.js WebKit pipeline with an un-intercepted binary stream.
-- Keep separate from the deliberate stalled-PDF warmup transport regression.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-WP2-PDF-WEBKIT-C55','C55','tests/pdf-normal-webkit.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','iPad WebKit normal PDF stream zoom 56→67%, MD/PDF return and page-8 navigation, screenshot, source/pdf hash unchanged','integration');

-- WP3: only text-block continuity hypotheses. No write/merge/confirmation port.
INSERT INTO apis VALUES
 ('L52','L','scanCMDContinuationCandidates','ui/cmd-block-continuations.js','export','detached CMD inventory and verified layout','read-only cross-column and next-page seam candidates with bbox, OCR excerpts, heuristic evidence and blockers','uses CMD-owned geometry/text, no PDF/DOM/CM6 writes; no probability claims',1),
 ('C56','C','returned.queryBlockAnalysis','ui/wcp-cmd-element-transactions.js','returned','none','promise with read-only CMD block inventory and continuation candidates','CMD reads the same CM6 document snapshot and WCP exposes only a bounded query',1),
 ('G27','G','returned.setContinuationCandidates','ui/text-block-module.js','returned','CMD candidate summary and row evidence','AG local candidate grid, source/target one-at-a-time focus, no merges','AG owns its schema/filter/selection; PDF owns orange overlay',1);
INSERT INTO access_edges VALUES
 ('X-WP3-CMD-L52','C','L','ui/cm-document.js','scanCMDContinuationCandidates(inventory,layout)','L52','registered','CMD derives candidate projections without editing anchors'),
 ('X-WP3-CMD-C56','L','C','ui/main.js','cmdPort.queryBlockAnalysis()','C56','registered','Shell obtains CMD read-only analysis through WCP port'),
 ('X-WP3-G27','L','G','ui/workspace.js','textBlock?.setContinuationCandidates(result)','G27','registered','Layout relays detached candidate rows to owning AG module');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-WP3-L52','L52','tests/cmd-block-continuations.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','22-page Buffett 4 cross-column + 1 cross-page candidate; five known seams, caption/figure/empty-column blockers and unchanged CMD','integration'),
 ('TC-WP3-C56','C56','tests/text-block-continuations.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/WebKit reads five candidates without mutations or legacy PDF-map fetch','integration'),
 ('TC-WP3-G27','G27','tests/text-block-continuations.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/WebKit AG switches block/candidate schema, buttons focus source and target with sequential PDF orange screenshots','integration');

-- WP4: human decisions are local review drafts keyed by the CMD original
-- evidence SHA; never a CMD paragraph-merge API or a second document editor.
INSERT INTO apis VALUES
 ('L53','L','returned.compareBlocks','ui/pdf-preview.js','returned','two validated page/Block semantic IDs, reveal side','two labelled A/B original PDF bbox overlays, same-page or cross-page','PDF owns viewport coordinates and renderer; no source/CMD writes',1),
 ('L54','L','returned.overviewComparison','ui/pdf-preview.js','returned','selected same-page Block pair','fit both orange rectangles into the visible PDF viewport','presentation-only zoom, PDF.js coordinates retained',1);
INSERT INTO access_edges VALUES
 ('X-WP4-L53','L','L','ui/workspace.js','currentPreview.compareOriginalBlocks(selection.from','L53','registered','Layout forwards semantic candidate IDs to PDF preview owner'),
 ('X-WP4-L54','L','L','ui/workspace.js','currentPreview?.overviewBlockComparison()','L54','registered','Optional viewport fit stays within PDF preview owner');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-WP4-L53','L53','tests/text-block-review.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and WebKit show simultaneous labelled A/B original PDF boxes for same page and different pages, without OCR fetch','integration'),
 ('TC-WP4-L54','L54','tests/text-block-review.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and WebKit overview renders both p6b6 and p6b7 boxes inside physical PDF viewport','integration'),
 ('TC-WP4-G28','G25','tests/text-block-review.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Confirm, reject, reset, reload restore and downloadable JSON; five candidate IDs and source unchanged','integration');

-- Text-block menu/status consolidation: keep the module's existing handlers,
-- but mount all seven controls in the shared Shell AG function dropdown.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-TEXTBLOCK-AG-FUNCTIONS-G28','G25','tests/text-block-review.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/WebKit text-block Function menu owns 3 base actions including original-child annotation and 5 candidate-review actions; global status owns inventory/review summary; no local toolbar/status row','integration');

-- Text-block coverage lens is a presentation-only CMD source-anchor overlay:
-- independent of both individual MD/PDF focus and PDF paired comparison.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-TEXTBLOCK-COVERAGE-OVERLAY-G28','G26','tests/text-block-coverage-lens.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and iPad WebKit default-checked PDF toolbar checkbox paints 224 PDF bbox and anchored Markdown Blocks; subtle overlays below focus/A-B comparison; module switch preserves preference; no source writes','integration');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PDF-TOOLBAR-P14','P14','tests/pdf-coverage-zoom-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit shared preview toolbar places 文本块 immediately right of navigation: MD single defaults off, PDF single on; split checkbox synchronizes both; supports PDF Block join/Undo and AG text-block selection','integration'),
 ('TC-PDF-ZOOM-ANCHOR-P04','P04','tests/pdf-coverage-zoom-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit repeated zoom in/out/fit keeps current page and fractional reading position stable without re-navigating; PDF checkbox and 224 overlays remain intact','integration');

-- CMD reversible logical joins are source annotations, not deletion or
-- mutation of the original MinerU block anchors, sealed JSON, or PDF bboxes.
INSERT INTO apis VALUES
 ('L55','L','planCMDBlockJoin','ui/cmd-block-joins.js','export','current source, verified CMD Block rows, target ID and desired join state','source-guarded reversible single-transaction block-join annotation before target anchor','all Block types may join immediate previous anchored Block including previous page tail; document first cannot join; prevents stale evidence',1),
 ('L56','L','projectCMDLogicalTextBlocks','ui/cmd-block-joins.js','export','current CMD source and verified Block inventory','page-local renumbered logical reading blocks with cross-page membership preserving immutable original Block IDs','never deletes original text/anchors and does not own an editor',1),
 ('C57','C','returned.setBlockJoin','ui/wcp-cmd-element-transactions.js','returned','target original Block ID and true/false join state','one CM6 transaction with undo, preserved original JSON and reloadable CMD mark','PDF sends semantic intent only; CMD validates identity, source and evidence',1),
 ('G29','G','returned.setBlockCoverage','ui/pdf-preview.js','returned','original CMD block inventory with logical join state','PDF coverage rectangles have Block ID labels and clickable join checkbox','PDF owns overlays; labels do not steal original PDF click-to-focus',1);
INSERT INTO access_edges VALUES
 ('X-JOIN-L55','C','L','ui/wcp-cmd-element-transactions.js','planCMDBlockJoin(source,rows,targetId,join)','L55','registered','CMD plans minimal change from current verified source'),
 ('X-JOIN-L56','C','L','ui/cm-document.js','projectCMDLogicalTextBlocks(source,inventory.rows)','L56','registered','CMD returns joined logical text without deleting OCR markers'),
 ('X-JOIN-C57','L','C','ui/main.js','cmdPort.setBlockJoin(targetId,join)','C57','registered','Shell forwards PDF semantic action through bounded WCP CMD transaction'),
 ('X-JOIN-G29','L','G','ui/workspace.js','this.pdf?.setBlockCoverage','G29','registered','PDF-only bbox inputs, no direct AG code or raw-source editing');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-JOIN-L55','L55','tests/cmd-block-joins.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','reversible joins for all types including page-first p9b0 into previous page last p8b8; document-first blocked; quoted anchor and exact byte restoration','integration'),
 ('TC-JOIN-L56','L56','tests/cmd-block-joins.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','224 original OCR blocks remain; after p9b0 cross-page join 223 logical blocks with per-page labels, page 8 unchanged, undo restores 224','integration'),
 ('TC-JOIN-C57','C57','tests/pdf-block-join-toggle.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit PDF checkbox merges/unmerges page-first p9b0 across boundary; page 9 other labels reindex, previous page untouched; CM6 Undo and unsaved draft','integration'),
 ('TC-JOIN-G29','G29','tests/pdf-block-join-toggle.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','all 224 PDF Block checkboxes checked by default; 223 selectable, only document-first disabled; page-only renumber after merging blank/text/image and cross-page, original IDs stable','integration');

-- PDF margin labels must remain outside the corresponding OCR text and inside
-- their physical page at every supported column, without changing CMD edits.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-JOIN-GUTTER-G29','G29','tests/pdf-block-join-toggle.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit all 224 checkbox+full Block-ID chips render side-by-side in one row in outer paper gutters; left 133, right 91; 0 text-bbox overlaps, 0 chip-to-chip collisions, 0 off-page chips; reversible CMD join still works','integration');

-- Page-local logical renumbering never overwrites stable original Block anchors.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-JOIN-PAGE-LOCAL-L56','L56','tests/cmd-block-joins.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Merge p2b8 into p2b7, p2b9 displays logical p2b8; pages 2 and 4 retain original indices; all OCR types supported with exact reversible source','integration');

-- Block join checkbox must not clear, reinsert, or restyle unrelated PDF
-- page overlays. Inline join metadata is not a geometry change.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-JOIN-PDF-LOCAL-REFRESH-G29','G29','tests/pdf-block-join-toggle.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit monitored all 212 other-page checkbox DOM nodes during p6b7 join: zero mutations, zero detachments, zero label or checked changes; current page renumbers and CMD Undo works','integration');

-- Figure/table caption and notes are MinerU children of one OCR Block.
-- Their rectangles can extend outside the parent chart/table body bbox.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-TEXTBLOCK-CHILD-RECT-L50','L50','tests/cmd-text-blocks.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','p13b1 chart title/Notes and p14b0 table caption/footnote retained; false p3b1 Notes bbox overlaps p3b0 96% and is excluded from PDF layout without rewriting sealed OCR data; 224 parent Blocks unchanged','integration'),
 ('TC-TEXTBLOCK-CHILD-COVER-G29','G29','tests/pdf-block-join-toggle.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome/iPad WebKit genuine chart/table child overlays remain, phantom p3b1 Notes horizontal rectangle absent from p3b0 table; no extra checkbox and 224 controls remain locally updated','integration');

-- Page-local PDF label drag changes real CMD source order, not a shadow
-- ordering model. Original OCR identity and geometry remain immutable.
INSERT INTO apis VALUES
 ('L57','L','planCMDBlockMove','ui/cmd-block-joins.js','export','current CMD source, verified Block inventory, source ID and same-page target plus before/after placement','one guarded page-local source replacement moving one logical root with its joined descendants; preserves markers and optional next-page boundary','never crosses immutable OCR page/evidence boundaries; preserves existing checkbox states and rebinds changed predecessors; original IDs preserved',1),
 ('C58','C','returned.moveBlockAfter','ui/wcp-cmd-element-transactions.js','returned','original source Block ID, same-page target ID','one CM6 source reorder transaction with Undo and a bounded interval-shift receipt for PDF status','CMD evidence preflight and source snapshot guard; no duplicate logical ordering state',1),
 ('C59','C','returned.moveBlockBefore','ui/wcp-cmd-element-transactions.js','returned','original source Block ID, same-page target ID','one CM6 source move before target with Undo; crossed interval shifts +1 on upward move','CMD original identity and immutable evidence preserved; no separate order database',1),
 ('L58','L','returned.setBlockMoveAction','ui/workspace.js','returned','semantic async CMD reorder callback','PDF supplies pointer source as insertion point and pointed logical root as the Block to pull before it','PDF does not mutate source or own reading order',1),
 ('L59','L','returned.setTextBlockInventoryRefreshAction','ui/workspace.js','returned','semantic no-argument refresh callback','PDF checkbox can request current CMD Block inventory without depending on active AG module','no AG internals or direct CM6 read crosses the component boundary',1),
 ('L60','L','returned.isTextBlockCoverageEnabled','ui/workspace.js','returned','none','boolean PDF Block lens preference','Shell uses this preference to refresh CMD Block projection across module switches',1);
INSERT INTO access_edges VALUES
 ('X-MOVE-L57','C','L','ui/wcp-cmd-element-transactions.js','planCMDBlockMove(source,rows,sourceId,targetId,placement)','L57','registered','CMD validates single Block move before or after a target'),
 ('X-MOVE-C58','L','C','ui/main.js','cmdPort.moveBlockAfter(sourceId,targetId)','C58','registered','Shell preserves exposed move-after API for internal CMD callers; PDF pointer gesture uses move-before only'),
 ('X-MOVE-C59','L','C','ui/main.js','cmdPort.moveBlockBefore(sourceId,targetId)','C59','registered','Shell forwards move-before operation with pointed logical root as source and drag origin as insertion target'),
 ('X-MOVE-L58','C','L','ui/main.js','workspace.setBlockMoveAction(async(sourceId,targetId,placement)','L58','registered','Shell injects source/target/placement operation through layout'),
 ('X-PDF-BLOCK-L59',NULL,'L','ui/main.js','workspace.setTextBlockInventoryRefreshAction(scanTextBlocks)','L59','registered','Shell supplies CMD inventory refresh callback while PDF checkbox is independent of AG selected module'),
 ('X-PDF-BLOCK-L60',NULL,'L','ui/main.js','workspace.isTextBlockCoverageEnabled()','L60','registered','Shell reindexes CMD Blocks when PDF lens is on even if AG is showing media/title/etc');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PDF-BLOCK-L59','L59','tests/pdf-coverage-zoom-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit CMD Block inventory is ready regardless of AG selected module; MD and PDF share one source inventory, not separate projections','integration'),
 ('TC-PDF-BLOCK-L60','L60','tests/pdf-coverage-zoom-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit single preview mode remembers independent MD/PDF lens preferences and split mode uses one common toggle; AG text-block selection turns on active lens without changing original Block evidence','integration');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-MOVE-L57','L57','tests/cmd-block-joins.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','p16b8 before p16b0: b8 becomes b0, b0..b7 +1, b9+ unchanged; already joined physical b11 travels with logical root b10, predecessor join marks stay byte-equivalent, before/after reversible, immutable OCR evidence untouched','integration'),
 ('TC-MOVE-C58','C58','tests/pdf-block-reorder.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit long-press CMD move both independent and already joined Blocks; checkbox merges to new predecessor, Undo restores state, 224 controls and unsaved document preserved','integration'),
 ('TC-MOVE-C59','C59','tests/pdf-block-drag-edge-scroll.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit long press b0 and point to b8 pulls b8 before b0; b0..b7 shift +1, b9+ unchanged; reverse pointer gesture and Undo restore all 224 checkbox states','integration'),
 ('TC-MOVE-L58','L58','tests/pdf-block-reorder.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit long press starts arrow at insertion point and pointing to another original Block pulls its logical group before origin; 17px cross-column hit tolerance, 224 checkbox identities, Undo retained','integration');

-- PDF original text layer is review material only. Inserting at the live
-- source caret never overwrites OCR; CMD enforces immutable evidence boundaries.
INSERT INTO apis VALUES
 ('P15','P','extractPDFBlockText','ui/pdf-block-text-extract.js','export','PDF.js text items, PDF viewport, original page size and CMD Block bbox','single Block native PDF text or empty','read-only text-layer read; midpoint clipping excludes neighboring columns',1),
 ('P16','P','PdfPreview.prepareSelectedPDFText','ui/pdf-preview.js','internal','selected original Block identity','Promise<void>','button enabled for any block type with nonempty PDF text; no Markdown replaceability gate',1),
 ('P17','P','hitPDFRegion','ui/pdf-region-hit.js','export','CMD page geometry and original PDF coordinate','Block index with body/caption/note subregion or null','selects smallest containing original OCR rectangle; does not create fake CMD anchors or capture whitespace',1),
 ('C60','C','planPDFTextInsertion','ui/cmd-pdf-text-insert.js','export','live CMD source, exact source caret and native PDF text','optimistic zero-width insertion range','non-destructive insertion; does not reinterpret or overwrite OCR text',1),
 ('C62','C','returned.insertPDFTextAtCaret','ui/wcp-cmd-element-transactions.js','returned','original page/index and PDF text','one undoable CM6 insertion at current caret','CMD checks live caret, current virtual chapter and immutable MinerU evidence, no auto-save',1),
 ('L61','L','returned.setPDFTextInsertAction','ui/workspace.js','returned','semantic CMD insertion callback','void','inject CMD action through layout without PDF acquiring CM6 editor',1);
INSERT INTO access_edges VALUES
 ('X-PDF-TEXT-L61','L','L','ui/main.js','workspace.setPDFTextInsertAction(','L61','registered','Shell injects CMD insertion callback through layout'),
 ('X-PDF-TEXT-C60','C','C','ui/wcp-cmd-element-transactions.js','planPDFTextInsertion(source,caret,text)','C60','registered','CMD prepares non-destructive caret edit from live source and text'),
 ('X-PDF-TEXT-C62','L','C','ui/main.js','cmdPort.insertPDFTextAtCaret(pageIndex,blockIndex,text)','C62','registered','Shell forwards user-triggered PDF text insertion to CMD');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PDF-TEXT-P15','P15','tests/pdf-text-insert.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','original PDF text-layer order retains initial oversized drop-cap M attached to uch in p1b9 while excluding neighboring columns','direct'),
 ('TC-PDF-TEXT-P17','P17','tests/pdf-region-hit.test.mjs','tests/pdf-region-hit.test.mjs','inline page 5 p4b0 OCR body, caption, footnote rectangles; exact child vs parent hit, real child precedence, no accidental whitespace selection','direct'),
 ('TC-PDF-TEXT-PARTS','P17','tests/pdf-child-region-select.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit page 5 p4b0 caption, body and note can be clicked and highlighted separately with individually extracted native text, one original Block and checkbox','integration'),
 ('TC-PDF-TEXT-C60','C60','tests/pdf-text-insert.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','pure planner inserts at arbitrary source cursor without deleting OCR and rejects invalid text and coordinates','direct'),
 ('TC-PDF-TEXT-C62','C62','tests/pdf-text-extract-insert.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit p16b0 and p1b9 extracted text inserts at deliberately different source caret, no auto-save; one Undo restores all original bytes','integration'),
 ('TC-PDF-TEXT-P16-INTEGRATION','P16','tests/pdf-text-extract-insert.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','grok 75e05598: PDF text button disabled without selection, enabled and inserts after real PDF.js selection (integration only; no direct P16 test exists)','integration'),
 ('TC-PDF-TEXT-L61-INTEGRATION','L61','tests/pdf-text-extract-insert.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','grok 75e05598: shell-injected CMD insertion callback reached by PDF button click inserts at live caret (integration only; no direct L61 test exists)','integration');

-- Native MinerU nested `blocks[]` paths, represented without inventing new
-- para_block identities or changing sealed original OCR source/content.
INSERT INTO apis VALUES
 ('C63','L','planCMDSubblockAnnotations','ui/cmd-text-blocks.js','export','current live CMD Markdown + its verified sealed MinerU JSON','ordered zero-width insertions and insert/existing counts','idempotent explicit tagging of original nested paths; no user prose rewritten',1),
 ('C64','C','returned.markOriginalSubblocks','ui/wcp-cmd-element-transactions.js','returned','no arguments; current CMD source','single optimistic undoable annotation transaction','virtual chapter and immutable evidence protected by CMD; no implicit save',1),
 ('L62','L','returned.setSubblockMarkAction','ui/workspace.js','returned','semantic async CMD annotation callback','registers text-block module function-menu action','AG receives no CM6 editor nor sealed JSON internals',1),
 ('P18','P','sourceSubblocks','ui/pdf-preview.js','export','live source Markdown','read-only original child path / source-line map','child PDF caption/body/note navigates exact CMD subblock line when marked',1);
INSERT INTO access_edges VALUES
 ('X-SUBBLOCK-C63','C','L','ui/wcp-cmd-element-transactions.js','planCMDSubblockAnnotations(source)','C63','registered','CMD plans marker edits from sealed source with exact path validation'),
 ('X-SUBBLOCK-C64','L','C','ui/main.js','cmdPort.markOriginalSubblocks()','C64','registered','Shell requests a single CMD subblock annotation operation'),
 ('X-SUBBLOCK-L62','L','L','ui/main.js','workspace.setSubblockMarkAction(','L62','registered','Shell injects semantic annotation callback to AG via Layout');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-SUBBLOCK-C63','C63','tests/cmd-subblock-annotations.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','43 native child markers in 20 parent Blocks; idempotent with byte-identical original Markdown after marker removal, tampering blocked, original MinerU JSON SHA unchanged','direct'),
 ('TC-SUBBLOCK-C64','C64','tests/pdf-subblock-annotation.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit explicit Text Block module marker button creates exactly 43 child paths, remains unsaved until Save, one Undo reverts all 43 in isolated CMD','integration'),
 ('TC-SUBBLOCK-L62','L62','tests/pdf-subblock-annotation.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG function menu invokes CMD semantic operation without accessing PDF or CM6 internal object','integration'),
 ('TC-SUBBLOCK-P18','P18','tests/pdf-subblock-annotation.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','PDF child source location uses new original path without increasing 224 parent blocks','integration');

-- Original MinerU subblocks have stable IDs: p<page>b<root>s<children path>.
-- Their bbox is read from that exact blocks[] node, never inferred or copied.
INSERT INTO apis VALUES
 ('L63','L','subblockId','ui/mineru-anchors.js','export','zero-based MinerU PDF page, para_block index, child path','pNbMsN[.N...] stable identifier','pure deterministic ID: PDF label, CMD annotation and source navigation agree',1);
INSERT INTO access_edges VALUES
 ('X-SUBID-PDF-L63','P','L','ui/pdf-preview.js','subblockId(row.pageIndex,row.blockIndex,part.path)','L63','registered','PDF chip uses the exact native indexed bbox identity');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-SUBID-L63','L63','tests/cmd-subblock-annotations.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','p3b0s0 caption and p3b0s1 body map exactly to original child indices; original JSON unchanged','direct');

-- Compute the parent *visual coverage* from the native children; original
-- parent OCR evidence is never rewritten and remains independently queryable.
INSERT INTO apis VALUES
 ('L64','L','enclosingChildBBox','ui/cmd-text-blocks.js','export','validated original child bboxes plus original parent bbox','minimum enclosing rectangle, fallback to original if no children','no sealed MinerU mutation; parent PDF coverage encloses caption/body/note',1);
INSERT INTO access_edges VALUES
 ('X-PARENTUNION-L64','L','L','ui/cmd-text-blocks.js','enclosingChildBBox(subRegions,box)','L64','registered','CMD read-only geometry projection, no new OCR representation');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PARENTUNION-L64','L64','tests/cmd-text-blocks.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','p3b0=[68,89,538,458]; p4b0=[50,89,521,339]; chart p13b1=[206,82,539,490], originalBBox unchanged, exclude foreign conflicting note','direct');

-- A legacy document has no child CMD anchors. Clicking a real PDF child
-- auto-adds one undoable/unsaved annotation transaction before navigation.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PDF-LEGACY-CHILD-FOCUS','P18','tests/pdf-child-region-select.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit p3b0s0/s1 and p4b0s0/s1/s2 navigate distinct exact CMD lines from an unannotated legacy doc; parent child picker choice triggers one unsaved annotation with Undo, no disk mutation','integration');

-- Parent PDF badge is an explicit navigation control; checkbox is an
-- indicator until a three-click sequence (including iPad touch clicks).
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PDF-PARENT-TRIPLE-TAP','P18','tests/pdf-block-join-toggle.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','one parent badge click emits exact parent CM6 focus, leaves checkbox unchanged; three rapid clicks alone toggle CMD join and Undo; 224 original Block chip IDs retained, no unrelated page relabeling','integration');

-- Parent and native child IDs are all permanently visible along the page's
-- two exterior gutters, placed at noncolliding Y positions inside each bbox
-- whenever physically feasible, with connector lines for provenance.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PDF-FULL-GUTTER-LABELS','P18','tests/pdf-child-region-select.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit 224 parent and all valid child tags always visible in page gutter; no child picker; p3b0 parent/caption/body in disjoint Y rows within original bboxes; original CMD child navigation remains exact','integration');

INSERT INTO apis VALUES
 ('P19','P','layoutPDFGutterLabels','ui/pdf-gutter-label-layout.js','export','native per-page parent/child label Y spans and scaled chip heights','pure deterministic nonoverlap per gutter with flexible bbox height and nearest free-row fallback','read-only geometry; exactly one placement per original OCR label',1);
INSERT INTO access_edges VALUES
 ('X-PDF-GUTTER-P19','P','P','ui/pdf-preview.js','layoutPDFGutterLabels(items,page.clientHeight)','P19','registered','page-wide parent and child gutter collision avoidance');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PDF-GUTTER-P19','P19','tests/pdf-gutter-label-layout.test.mjs','tests/pdf-gutter-label-layout.test.mjs','inline synthetic page 5 caption/body/note geometry; all labels fit own bbox range when possible, no collisions, deterministic, preserve IDs for crowded inputs','direct');

-- CMD structural comments are provenance, not a claim that MinerU recognized
-- any corresponding prose. PDF should distinguish actual content lines from
-- structural-only anchors for metadata-only source blocks.
INSERT INTO apis VALUES
 ('P20','P','sourceSubblocks','ui/pdf-source-locations.js','export','current Markdown with native CMD child tags','immutable-read-only location records with sourceLine and optional contentLine','empty OCR child has no contentLine; source tag never impersonates recognized prose',1);
INSERT INTO access_edges VALUES
 ('X-PDF-CONTENT-P20','P','P','ui/pdf-preview.js','sourceSubblocks(this.getMarkdown())','P20','registered','PDF child focus distinguishes real child Markdown content from empty OCR source');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PDF-CONTENT-P20','P20','tests/pdf-source-locations.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','224 original parent locations and 43 original child locations; p3b0s0 contentLine is actual caption prose and p3b0s1 actual HTML; all p4b0s0/s1/s2 have NULL contentLine','direct');

-- CMD source tags are lexical boundaries. Parent owns only text before its
-- first native child; each child owns content up to the next native tag.
INSERT INTO apis VALUES
 ('P21','L','sourceBlockScopes','ui/cmd-block-labels.js','export','live CMD Markdown string with original MinerU parent/child tags','ordered inclusive per-tag sourceLine to scopeEndLine plus optional contentLine/contentEndLine','live CM6 line insertions belong to the preceding tag, never overlap or rewrite any OCR/source',1);
INSERT INTO access_edges VALUES
 ('X-CMD-SCOPES-P21','L','L','ui/cmd-block-labels.js','sourceBlockScopes(source)','P21','registered','sourceBlocks and sourceSubblocks filter one unified lexical tag interval scan');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-CMD-TAG-SCOPES-P21','P21','tests/pdf-source-locations.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','p4b0 parent ends immediately before p4b0s0, each s-tag ends before next s-tag; inserting text between tags changes only owning content range; 224 legacy parents and 43 child tags respected, sealed source excluded','direct');

-- PDF label border is the live *own-scope* content indicator for BOTH
-- parent and child tags. Empty is a visual fact, never an OCR error verdict.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PDF-EMPTY-LABELS','P18','tests/pdf-child-region-select.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad WebKit empty parent p4b0 and p2b8 dashed while nonempty p13b0 solid; after child-tag annotation p3b0 empty parent becomes dashed while s0 retains solid text badge; empty p4b0 subblocks dashed; no OCR/CM mutation','integration');

-- Existing PDF-facing compatibility export is now a registered port from
-- PDF to the CMD/Layout owner's exact source scope implementation.
INSERT INTO access_edges VALUES
 ('X-PDF-SCOPE-PORT','P','L','ui/pdf-source-locations.js','sourceBlockScopes','P21','registered','PDF compatibility re-exports CMD source scope functions; never reparses labels');

-- WCP27: CMD is the only owner of source/PDF parent and child IDs, their
-- logical parent renumbering, and own-scope empty state. The CM6 gutter
-- renders a projection without editing Markdown or recreating PDF state.
INSERT INTO apis VALUES
 ('L65','L','projectCMDSourceBlockLabels','ui/cmd-block-labels.js','export','current CMD source containing original MinerU anchors and optional join markers','ordered original IDs, logical parent IDs, exact source lines and own-scope content status','readonly; no invented child anchor; no independent PDF/source identity cache',1);
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-CMD-SOURCE-LABELS-L65','L65','tests/cmd-source-block-labels.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','224 native roots, 43 native child tags only after explicit marking; original vs logical root ID, empty own-scope dashed state and exact unchanged source under joins','direct');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-CMD-SOURCE-GUTTER-L65','L65','tests/cmd-source-block-gutter.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome/iPad-WebKit CM6 retains native line numbers and has no duplicate PBS gutter on old or newly converted CMD documents; no source edits or disk writes','integration');

-- WP0 PBS/BC: a single, read-only CMD chain inventory and a guarded pure
-- planner; no PDF/AG persistence and no hidden second block state.
INSERT INTO apis VALUES
 ('L66','L','readCMDBlockChains','ui/cmd-block-chains.js','export','current CMD source, legacy or cmd:block:v1','all PBS atoms, implicit singleton chains, explicit BC members and validation errors','read-only; preserves existing MinerU evidence and old join tags',1),
 ('L67','L','planCMDBlockChainArrangement','ui/cmd-block-chains.js','export','current source plus complete PBS partition and BC member order','guarded exact-source edits for one CMD/CM6 undoable transaction','strict unique member/chain IDs and sequence validation; refuses legacy migration',1),
 ('L68','L','serializeCMDBlockTag','ui/cmd-block-chains.js','export','PBS ID plus optional BC type, seq, role and review','single canonical cmd:block:v1 HTML comment','stable original coordinates, no duplicate serialized state',1),
 ('L69','L','parseCMDBlockTag','ui/cmd-block-chains.js','export','one CMD block HTML comment line','structured p/b/s and optional BC attributes','validates canonical IDs, no injection or forged additional attributes',1),
 ('C65','C','CMDocument.queryBlockChains','ui/cm-document.js','export','current CM6 source','full CMD-owned read-only PBS/BC atom and chain inventory','AG and other readers use CMD port, never parse independent state',1);
INSERT INTO access_edges VALUES
 ('X-PBSBC-C-L66','C','L','ui/cm-document.js','readCMDBlockChains(source)','L66','registered','CMD analysis consumes one PBS/BC source projection'),
 ('X-PBSBC-C-C65','C','L','ui/cm-document.js','readCMDBlockChains(this.readSource())','L66','registered','CMD full PBS/BC query delegates to shared projection'),
 ('X-PBSBC-SERIAL-L68','L','L','ui/cmd-block-chains.js','serializeCMDBlockTag(wanted.get(atom.id))','L68','registered','planner uses canonical single-line CMD serializer'),
 ('X-PBSBC-PARSE-L69','L','L','ui/cmd-block-chains.js','parseCMDBlockTag(line)','L69','registered','one CMD parser handles optional BC attributes');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PBSBC-L66','L66','tests/cmd-block-chains.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','224 legacy parent atoms project to 224 implicit singleton chains; legacy join to 223; explicit nonadjacent and crosspage BC validates', 'direct'),
 ('TC-PBSBC-L67','L67','tests/cmd-block-chains.test.mjs','tests/cmd-block-chains.test.mjs','one undoable guarded edit set, complete partition, split, order, rejects duplicates and unsupported legacy writes','direct'),
 ('TC-PBSBC-L68','L68','tests/cmd-block-chains.test.mjs','tests/cmd-block-chains.test.mjs','deterministic canonical single line PBS identity and safe role/note metadata','direct'),
 ('TC-PBSBC-L69','L69','tests/cmd-block-chains.test.mjs','tests/cmd-block-chains.test.mjs','nested child path and p/b/s recovered; invalid or noncanonical tags refused','direct');

INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PBSBC-C65','C65','tests/cmd-block-chains.test.mjs','tests/cmd-block-chains.test.mjs','CMDocument exposes full PBS/BC read-only source projection; AG parent rows obtain chain membership through CMD analysis','integration');

INSERT INTO apis VALUES
 ('C66','C','returned.queryBlockChains','ui/wcp-cmd-element-transactions.js','returned','none','read-only complete CMD block and chain projection','same source used by CMD, exposed through bounded port',1),
 ('C67','C','returned.arrangeBlockChains','ui/wcp-cmd-element-transactions.js','returned','complete block chain partition','planned exact guarded CM6 edits in one Undo/Redo transaction','rejects legacy writes until migration; does not alter original OCR seal',1);
INSERT INTO access_edges VALUES
 ('X-PBSBC-TRANSACTION-L67','C','L','ui/wcp-cmd-element-transactions.js','planCMDBlockChainArrangement(cmd.readSource(),chains)','L67','registered','CMD only owner of BC edit planning, application via guarded port');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PBSBC-C66','C66','tests/cmd-block-chains.test.mjs','tests/cmd-block-chains.test.mjs','CMD port delegates read-only source-derived chain query', 'direct'),
 ('TC-PBSBC-C67','C67','tests/cmd-block-chains.test.mjs','tests/cmd-block-chains.test.mjs','CMD port applies only guarded PBS/BC edits via existing one-transaction CM6 boundary','integration');

-- WP1 new MinerU JSON->CMD PBS serialization is an opt-in format change of
-- the converter; old source remains supported. Source provenance is immutable.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PBS-WP1-C03','C03','tests/cmd-pbs-browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome and iPad WebKit read 224 parent+43 native children on newly converted CMD, unchanged disk source and correctly populated text-block BC columns','integration'),
 ('TC-PBS-WP1-L66','L66','tests/cmd-pbs-converter-integration.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','new converter generates exactly 267 PBS atoms, legacy 224 anchors still inspectable, direct BC split/merge plans stay source-only','direct'),
 ('TC-PBS-WP1-L65','L65','tests/cmd-pbs-converter-integration.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','new CMD PBS parent and child source labels line up with PDF source scope and exact geometry without annotation pass','integration');


-- WP2: CMD owns the BC semantic action planners and one guarded CM6
-- transaction port. Legacy joins migrate only by explicit user command;
-- new PBS documents must not get old adjacent block-join annotations.
INSERT INTO apis VALUES
 ('L70','L','planCMDMigrateLegacyBlockChains','ui/cmd-block-chains.js','export','legacy CMD source with verified join records','exact guarded text edits for canonical PBS/BC migration','one undoable source transaction, original OCR JSON tail and Markdown content untouched',1),
 ('L71','L','planCMDMergeBlockChains','ui/cmd-block-chains.js','export','two PBS members from distinct BC','one guarded BC member partition edit plan','stable destination chain ID; rejects conflicting object types and legacy source',1),
 ('L72','L','planCMDSplitBlockChain','ui/cmd-block-chains.js','export','PBS member C in BC','BC head and new tail partitions','C and later members become new chain; original head ID survives',1),
 ('L73','L','planCMDMoveBlockChainMember','ui/cmd-block-chains.js','export','one PBS ID, target PBS, before/after','one guarded logical member reordering plan','preserves original OCR and stable PBS IDs; refuses incompatible typed BC objects',1),
 ('C68','C','returned.migrateLegacyBlockChains','ui/wcp-cmd-element-transactions.js','returned','none','one explicit, undoable CMD PBS/BC format migration','no silent auto-migration or unregistered external storage',1),
 ('C69','C','returned.mergeBlockChains','ui/wcp-cmd-element-transactions.js','returned','destination/source member IDs','one CM6 edit transaction','CMD-only BC merge; no editor/AG/PDF independent state',1),
 ('C70','C','returned.splitBlockChainAt','ui/wcp-cmd-element-transactions.js','returned','member ID','one CM6 edit transaction','CMD-only BC split with one Undo/Redo',1),
 ('C71','C','returned.moveBlockChainMember','ui/wcp-cmd-element-transactions.js','returned','member, target, placement','one CM6 edit transaction','CMD-only logical member move preserving original PDF and Markdown body',1);
INSERT INTO access_edges VALUES
 ('X-WP2-MIGRATE-L70','C','L','ui/wcp-cmd-element-transactions.js','planCMDMigrateLegacyBlockChains(cmd.readSource())','L70','registered','CMD port uses only Layout-owned migration planner'),
 ('X-WP2-MERGE-L71','C','L','ui/wcp-cmd-element-transactions.js','planCMDMergeBlockChains(cmd.readSource(),destinationId,sourceId)','L71','registered','CMD BC merge through registered port'),
 ('X-WP2-SPLIT-L72','C','L','ui/wcp-cmd-element-transactions.js','planCMDSplitBlockChain(cmd.readSource(),memberId)','L72','registered','CMD BC split through registered port'),
 ('X-WP2-MOVE-L73','C','L','ui/wcp-cmd-element-transactions.js','planCMDMoveBlockChainMember(cmd.readSource(),memberId,targetId,placement)','L73','registered','CMD logical move through registered port'),
 ('X-WP2-READ-L66','C','L','ui/wcp-cmd-element-transactions.js','readCMDBlockChains(source)','L66','registered','CMD compatibility PDF join checks new/legacy source relationship exactly once');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-WP2-L70','L70','tests/cmd-block-chains-wp2.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','224 legacy atoms and 2 old joins migrate to the same BC partition without changing OCR bytes or unrelated source, idempotent and reject malformed tags','direct'),
 ('TC-WP2-L71','L71','tests/cmd-block-chains-wp2.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','merge exact PBS members into stable explicit chain, reject mismatched semantic types and preserve original OCR JSON','direct'),
 ('TC-WP2-L72','L72','tests/cmd-block-chains-wp2.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','split before member C into head/tail, no-op at chain head, stable original head identity','direct'),
 ('TC-WP2-L73','L73','tests/cmd-block-chains-wp2.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','single PBS moves before/after any member, reparent across pages, preserve all original OCR evidence','direct'),
 ('TC-WP2-C68','C68','tests/cmd-block-chains-wp2.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and iPad-WebKit explicit old join migration is one undoable CMD operation, no workspace save','integration'),
 ('TC-WP2-C69','C69','tests/cmd-block-chains-wp2.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome and iPad-WebKit BC merge edits in one CMD transaction and Undo/Redo restores exact source','integration'),
 ('TC-WP2-C70','C70','tests/cmd-block-chains-wp2.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome and iPad-WebKit BC split is one CMD transaction with one Undo','integration'),
 ('TC-WP2-C71','C71','tests/cmd-block-chains-wp2.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome and iPad-WebKit logical member reorder is one CMD transaction without source body movement','integration');


-- WP3 source-guarded BC transactions and chapter-safe history, with live
-- loopback HTTP CAS acceptance (no implicit save or data duplicate).
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-WP3-C67','C67','tests/cmd-block-chains-wp3.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome and WebKit CMD BC exact-source planned edits, stale source refusal, invalid BC refusal and preserved source identities across virtual chapter','integration'),
 ('TC-WP3-C69','C69','tests/cmd-block-chains-wp3.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome and iPad WebKit cross-chapter authorized BC merge, native Undo/Redo restores exact original and shared PDF predecessor','integration'),
 ('TC-WP3-C70','C70','tests/cmd-bc-save-reload.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','isolated actual authenticated HTTP save/load, merge and split BC, original OCR byte-exact and stale save HTTP 412/428, unauthenticated 403','integration'),
 ('TC-WP3-C68','C68','tests/cmd-bc-save-reload.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','real isolated HTTP legacy PBS migration persisted and reloaded, original OCR unchanged','integration');


-- WP4: CMD owns the full original-parent / native-child relationship read
-- model; the AG table owns presentation and sends semantic action intents
-- back through the Shell -> Layout registered callback to the guarded CMD port.
INSERT INTO apis VALUES
 ('L74','L','projectCMDBlockTable','ui/cmd-block-chains.js','export','live CMD source, verified original parent and native child rows, sealed layout and BC partition','detached full parent+native-child AG rows with IDs, member order, roles, review, source scopes and safe child bbox','no AG-owned parsing or persistence; no invented missing-child geometry',1),
 ('L75','L','returned.setBlockChainAction','ui/workspace.js','returned','semantic action callback merge/split/move/extract/migrate by PBS ID','AG action requests forwarded to current CMD transaction port','source revision checked by Shell; only CM6 transaction writes CMD',1);
INSERT INTO access_edges VALUES
 ('X-WP4-C-L74','C','L','ui/cm-document.js','projectCMDBlockTable(source,inventory.rows,layout,bc,inventory.children)','L74','registered','CMD joins source atoms with sealed verified layout for full AG view'),
 ('X-WP4-MAIN-L75',NULL,'L','ui/main.js','workspace.setBlockChainAction(async(action,request={})','L75','registered','Shell supplies semantic callback to AG without exposing CMD internals');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-WP4-L74','L74','tests/cmd-block-chains-wp4.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','267 unique PBS rows including 224 parents and 43 native children, validated geometry, source scope, member order and original OCR unchanged','direct'),
 ('TC-WP4-G25','G25','tests/cmd-block-chains-wp4.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome/iPad WebKit AG full PBS/BC columns and grouping; selecting target, merging and splitting only through guarded CMD; no disk writes','integration'),
 ('TC-WP4-L75','L75','tests/cmd-block-chains-wp4.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','AG delegated merge/split through Shell to guarded CMD, changed source rescanned; child-inclusive AG projection remains consistent','integration');


-- WCP27 WP5: the AG grid's pointer drag is a semantic request to the same
-- CMD source-guarded transaction. Moving ONE atomic PBS never swaps whole
-- blocks or moves Markdown prose; extracting a member leaves neighbors ordered.
INSERT INTO apis VALUES
 ('L76','L','planCMDExtractBlockChainMember','ui/cmd-block-chains.js','export','CMD source and one selected PBS ID in a multi-member chain','source-guarded single-member extraction plan, remaining BC member order untouched','preserves original MinerU evidence and individual PBS identity; rejects legacy editing',1),
 ('C72','C','returned.extractBlockChainMember','ui/wcp-cmd-element-transactions.js','returned','member PBS ID and expectedSource','one CM6 transaction extracting only selected atom','no silent source change, one native Undo/Redo step',1);
INSERT INTO access_edges VALUES
 ('X-WP5-EXTRACT-L76','C','L','ui/wcp-cmd-element-transactions.js','planCMDExtractBlockChainMember(cmd.readSource(),memberId)','L76','registered','only CMD port may commit a single-member BC extraction');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-WP5-L73','L73','tests/cmd-block-chains-wp5.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','move p0b1 after p0b3 without swap, put p0b4 first, move native child across page and chains, preserve unrelated member order','direct'),
 ('TC-WP5-L76','L76','tests/cmd-block-chains-wp5.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','extract one middle atom without moving its tail, preserve member role and OCR byte identity, reject legacy or damaged BC','direct'),
 ('TC-WP5-C72','C72','tests/cmd-block-chains-wp5.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome and simulated iPad WebKit AG drag handle and single PBS move/extract through CMD with one Undo/Redo and no auto-save','integration'),
 ('TC-WP5-G25','G25','tests/cmd-block-chains-wp5.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','AG drag A onto B appends only A after B, row order projects BC logical seq, first and extract actions work in same AG view','integration'),
 ('TC-WP5-L75','L75','tests/cmd-block-chains-wp5.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Shell source-revision checks all AG move/extract action intents before registered CMD mutation','integration');


-- WCP27 WP6: CMD footer holds bounded PBS -> user-corrected PDF bbox data.
-- No source archive, original OCR bbox or content block is rewritten.
INSERT INTO apis VALUES
 ('L77','L','readCMDPDFBBoxOverrides','ui/cmd-pdf-bbox.js','export','CMD source, verified original layout','validated, source-bound PDF bbox footer read model','reject duplicate, invalid or orphaned footer data; no AG/PDF independent persistence',1),
 ('L78','L','planCMDPDFBBoxEdit','ui/cmd-pdf-bbox.js','export','CMD source, original layout, real PBS ID, corrected four coordinates or null','one source-exact footer upsert/remove plan','footer is before sealed evidence; normalized, page-bounded bbox, no original OCR mutation',1),
 ('L79','L','applyCMDPDFBBoxOverrides','ui/cmd-pdf-bbox.js','export','verified immutable original layout and CMD source','immutable effective bbox projection retaining original OCR bbox','never mutate cached MinerU original layout, recover only proven native child',1),
 ('C73','C','returned.setPDFBBox','ui/wcp-cmd-element-transactions.js','returned','PBS ID, bbox/null, expectedSource','one CM6 history transaction for PDF overlay correction','stale snapshot, immutable archive and source range preflight, no automatic save',1),
 ('L80','L','returned.setPDFBBoxAction','ui/workspace.js','returned','semantic PDF bbox correction callback','forward PDF or AG user action to Shell CMD transaction port','no direct renderer data persistence or CM6 bypass',1);
INSERT INTO access_edges VALUES
 ('X-WP6-C-L77','L','L','ui/cmd-pdf-bbox.js','readCMDPDFBBoxOverrides(source,layout)','L77','registered','footer validation by one CMD read owner'),
 ('X-WP6-C-L78','C','L','ui/wcp-cmd-element-transactions.js','planCMDPDFBBoxEdit(source,layout,memberId,bbox)','L78','registered','CMD planned edit before sealed archive'),
 ('X-WP6-C-L79','C','L','ui/cm-document.js','applyCMDPDFBBoxOverrides(base,source)','L79','registered','shared AG and PDF effective geometry projection'),
 ('X-WP6-C-C73','L','C','ui/main.js','cmdPort.setPDFBBox(memberId,bbox','C73','registered','Shell owns source-guarded CMD bbox transaction'),
 ('X-WP6-C-L80',NULL,'L','ui/main.js','workspace.setPDFBBoxAction(async(memberId,bbox,snapshot)','L80','registered','registered Shell -> PDF callback');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-WP6-L77','L77','tests/cmd-pdf-bbox-wp6.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','read footer, exact restore, duplicate and invalid footer fail-closed','direct'),
 ('TC-WP6-L78','L78','tests/cmd-pdf-bbox-wp6.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','correct parent and original child bbox within page, reject invalid and unknown IDs, no-op idempotence','direct'),
 ('TC-WP6-L79','L79','tests/cmd-pdf-bbox-wp6.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','reloaded effective geometry reflects source footer, cached OCR data unchanged, byte-exact sealed original','direct'),
 ('TC-WP6-C73','C73','tests/cmd-pdf-bbox-wp6.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome/WebKit AG coordinate controls persist one undoable CMD footer transaction, reload semantics, no workspace auto-save','integration');
INSERT INTO access_edges VALUES
 ('X-WP6-C-L50','C','L','ui/wcp-cmd-element-transactions.js','queryCMDLayout(source)','L50','registered','CMD bbox port obtains original immutable OCR layout before planning edits');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-WP6-HTTP-C73','C73','tests/cmd-pdf-bbox-wp6-save-reload.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','actual isolated authenticated HTTP save/load, source revision gates 412/428, persisted PDF bbox correction and exact reset, unchanged original OCR JSON','integration');

-- WP6 PDF-owned transient pointer handles; no CM6 or OCR state access.
INSERT INTO apis VALUES
 ('P22','P','createPDFBBoxGesture','ui/pdf-bbox-gesture.js','export','PDF page DOM, verified PBS ID, effective bbox and page dimensions, semantic commit callback','five pointer handles for moving/resizing a transient PDF rectangle','no direct CMD/PDF archive mutation, cancel/no-op safe, one semantic callback on release',1);
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-WP6-P22','P22','tests/cmd-pdf-bbox-wp6.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome and WebKit center drag writes one coordinate correction; no direct source or PDF evidence access','integration');

-- WCP30: PDF current page is a scalar view event, AG alone owns its filter.
-- The toolbar's existing 「全部」 is a PDF-page lens ONLY in text-block mode.
INSERT INTO apis VALUES
 ('G30','G','filterTextBlockPageRows','ui/text-block-page-scope.js','export','CMD text-block atoms, one-based current PDF page and show-all boolean','read-only same-page atoms or the entire inventory','no source, CMD labels, bbox or PDF geometry mutation',1),
 ('P23','P','PdfPreview.onCurrentPageChange','ui/pdf-preview.js','callback','PDF.js pagechanging one-based page number','scalar navigation notice to Workspace text-block owner','PDF does not access AG Grid or module internals',1),
 ('L81','L','returned.setTextBlockShowAll','ui/workspace.js','returned','Shell-owned toolbar checkbox Boolean','semantic all-pages toggle to text-block AG owner','does not alter chapter or CMD query for unrelated modules',1);
INSERT INTO access_edges VALUES
 ('X-AG-PAGE-P23','P','P','ui/workspace.js','new PdfPreview(...,pageNumber=>currentOutline?.textBlock?.setCurrentPDFPage(pageNumber))','P23','registered','only page number crosses PDF to AG via workspace callback'),
 ('X-AG-PAGE-L81','L','L','ui/main.js','workspace.setTextBlockShowAll(enabled)','L81','registered','Shell toolbar user intent forwarded only through Workspace port');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-AG-PAGE-G30','G30','tests/text-block-page-scope.test.mjs','tests/text-block-page-scope.test.mjs','same page parent/child rows; all returns full unchanged inventory','direct'),
 ('TC-AG-PAGE-P23','P23','tests/text-block-ag-page-filter.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome and iPad WebKit pagechanging switches AG page with no data edit','integration'),
 ('TC-AG-PAGE-L81','L81','tests/text-block-ag-page-filter.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','checkbox defaults unchecked, check displays all, uncheck returns current PDF page, non-block chapter control unchanged','integration');

-- Text-block page-column filtering supersedes the former prefiltered AG rowData.
-- AG now retains the inventory, enabling the existing EnumCheckboxFilter to
-- enumerate other PDF pages while preserving the default PDF page-follow mode.
INSERT INTO apis VALUES
 ('G31','G','textBlockPageFilterModel','ui/text-block-page-scope.js','export','AG column filter model, current one-based PDF page, show-all state','model with only pdfPage set or cleared, retaining all unrelated field filters','never pre-truncate AG row data; preserves manual page choice until PDF navigation',1);
INSERT INTO access_edges VALUES
 ('X-AG-PAGE-G31','G','G','ui/text-block-module.js','textBlockPageFilterModel(grid.getFilterModel(),currentPDFPage,showAllPages)','G31','registered','AG owner composes only its page column filter, leaving other filters alone');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-AG-PAGE-G31','G31','tests/text-block-page-scope.test.mjs','tests/text-block-page-scope.test.mjs','page model overrides manual page on PDF navigation, clears on all, retains other filters and never mutates prior model','direct'),
 ('TC-AG-PAGE-MANUAL-G31','G31','tests/text-block-ag-page-filter.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome and iPad WebKit header filter exposes all 22 pages; manual selection of another page, PDF page update and All toggle work','integration');

-- PDF current-label navigation must be an exact CMD source-line lookup,
-- never a best-effort jump by immutable OCR p/b physical numbering.
INSERT INTO apis VALUES
 ('L82','L','mapCMDVisibleLabelSources','ui/cmd-block-labels.js','export','current CMD source with legal PBS atoms and source-tag lexical scopes','map of visible/current PBS IDs to exact same-tag sourceLine and optional contentLine','current tag/source-line identity wins over immutable OCR origin after renumbering, absorption or promotion',1),
 ('P24','P','sourceLabelLocations','ui/pdf-source-locations.js','export','live CMD source string','read-only PDF adapter to CMD visible-label source-line projection','never modify source or original bbox; do not invent old physical tag fallback',1);
INSERT INTO access_edges VALUES
 ('X-PDF-FOCUS-L82','P','L','ui/pdf-source-locations.js','mapCMDVisibleLabelSources(source)','L82','registered','PDF adapter consumes CMD-owned current PBS label/source-line mapping'),
 ('X-PDF-FOCUS-P24','P','P','ui/pdf-preview.js','sourceLabelLocations(this.getMarkdown())','P24','registered','PDF click uses current logical PBS ID while preserving native OCR rectangle for drawing');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PDF-FOCUS-L82','L82','tests/pdf-renumbered-cmd-location.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','current source-line map remains one-to-one across after insertion, absorbed child and promotion','direct'),
 ('TC-PDF-FOCUS-P24','P24','tests/pdf-renumbered-cmd-location.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome and iPad WebKit PDF badge and canvas select current PBS tag/source body, not physical origin; no user document writes','integration');

-- PDF extraction remains a text-only CMD capability while PBS structural
-- editing is locked. All user-facing module feedback converges at Shell status.
INSERT INTO apis VALUES
 ('P25','P','PdfPreview.onStatus','ui/pdf-preview.js','constructor-callback','PDF operation message and severity','reports through Workspace-owned status callback','no second visible PDF status bar; does not mutate CMD or bypass read-only PBS structure',1),
 ('L83','L','modulePort.setAgStatusSummary','ui/main.js','module-port','module CMD scope and count summary string','append summary inside Shell global #status','AG toolbar does not mount visible duplicate status line',1);
INSERT INTO access_edges VALUES
 ('X-PDF-TEXT-STATUS-P25','P','L','ui/workspace.js','new PdfPreview(...,onStatus=>reportMediaStatus)','P25','registered','PDF reports display-only event via Workspace status port'),
 ('X-AG-GLOBAL-L83','L','L','ui/wcp-ag-module-toolbar.js','modulePort.setAgStatusSummary(summary)','L83','registered','AG summary uses semantic Shell module port, not DOM status write');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-PDF-TEXT-RESTORE-P25','P25','tests/pdf-extract-global-status.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and WebKit: PDF text button restored, enable-on-select, single undoable insertion, Shell-only status, no auto-save','integration'),
 ('TC-AG-GLOBAL-L83','L83','tests/pdf-extract-global-status.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','AG summary rendered in #status, former separate AG and PDF status spans hidden','integration');

-- Ambient text-block AG inventory counts must not overwrite the user's
-- latest PDF/CM6 operation message within the unified Shell status line.
INSERT INTO apis VALUES
 ('L84','L','createWorkspace.onTextBlockSummary','ui/workspace.js','constructor-callback','text-block AG inventory and active page diagnostic summary','append a read-only Shell global-status segment without replacing operation message','no DOM status writes from AG and no duplicate visible status row',1);
INSERT INTO access_edges VALUES
 ('X-TEXTBLOCK-GLOBAL-L84','L','L','ui/main.js','createWorkspace(...,onTextBlockSummary)','L84','registered','Shell owns final status text, Workspace forwards only module summary string');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-TEXTBLOCK-STATUS-L84','L84','tests/pdf-extract-global-status.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','Chrome and WebKit AG scan summary appended to Shell status while latest PDF action stays primary','integration');

-- Native CMD parent/child identifiers have a numeric tree order that is
-- distinct from their physical OCR discovery order or current source line.
-- AG sorts its own read-only row view; CMD source edits stay in CM6 only.
INSERT INTO apis VALUES
 ('G32','G','sortTextBlockPBSRows','ui/text-block-page-scope.js','re-export','text-block AG rows with current visible PBS IDs','new array in page/parent/child numeric order, preserving original row references','no data write, OCR origin or sourceLine mutation',1);
INSERT INTO access_edges VALUES
 ('X-AG-PBS-NUMERIC-G32','G','G','ui/text-block-module.js','sortTextBlockPBSRows(scoped())','G32','registered','AG view projection sorts current PBS identity, not original OCR or CM6 source order');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-AG-PBS-NUMERIC-G32','G32','tests/cmd-pbs-row-order.test.mjs','tests/cmd-pbs-row-order.test.mjs','numeric page/parent/native child path sort, source row metadata unchanged','direct'),
 ('TC-AG-PBS-PAGE-G32','G32','tests/text-block-page-scope.test.mjs','tests/text-block-page-scope.test.mjs','sorting is independent of page filter and never changes source row order','direct');

-- WCP30 three-pane reconciliation: current CMD id, source tag range, original
-- OCR physical bbox are ONE canonical locator, never equal-by-number guesses.
INSERT INTO apis VALUES
 ('C63','C','projectCMDAtomLocations','ui/cmd-block-chains.js','export','live CM6 source, optional CMD chain model','lexical tag and content scopes keyed by current PBS id with immutable OCR origin, physical page/block/path','source id never substituted for OCR bbox; no user data writes',1),
 ('C64','C','resolveCMDBlockFocusRow','ui/cmd-block-chains.js','export','CMD table rows plus semantic focus event','one exact current PBS row by id, physical MinerU origin or numeric source-line scope','must refuse stale explicit ID rather than silently select different AG row',1),
 ('C65','C','returned.blockIdAtSourceLine','ui/wcp-cmd-element-transactions.js','returned','CM6 absolute source line number','current CMD PBS id or null','CMD owns mapping; Shell receives only scalar ID, no cross-module source parsing',1),
 ('P26','P','sourcePDFLocationAtLine','ui/pdf-source-locations.js','export','CMD-labelled physical source projection and source line','exact current PBS id, original physical page/block/child and text scope','PDF does not parse current p/b as physical coordinates',1);
INSERT INTO access_edges VALUES
 ('X-FOCUS-P26','P','P','ui/pdf-preview.js','sourcePDFLocationAtLine(this.labelSources,line)','P26','registered','PDF source-click focus resolves source range through CMD-origin adapter'),
 ('X-FOCUS-C63','P','C','ui/cmd-block-labels.js','projectCMDAtomLocations(source)','C63','registered','CMD canonical source-to-original-geometry projections'),
 ('X-FOCUS-C64','G','C','ui/text-block-module.js','resolveCMDBlockFocusRow(tableRows,focus)','C64','registered','AG selects by identity or actual CMD tag range, not displayed array order'),
 ('X-FOCUS-C65','L','C','ui/main.js','cmdPort.blockIdAtSourceLine(sourceLine)','C65','registered','CM6 explicit text click publishes current PBS ID across WCP event bus');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-FOCUS-C63','C63','tests/cmd-three-pane-focus.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','after move p1b10→p1b12, source tag and body map to physical p1b10, with one-to-one current IDs','direct'),
 ('TC-FOCUS-C64','C64','tests/cmd-three-pane-focus.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','AG selection correct under reverse/shuffled display order, stale explicit ids fail closed','direct'),
 ('TC-FOCUS-C65','C65','tests/cmd-three-pane-focus.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome/iPad WebKit actual CM6 click source p1b12→PDF physical p1b10→AG current p1b12','integration'),
 ('TC-FOCUS-P26','P26','tests/cmd-three-pane-focus.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome/iPad WebKit PDF chip/canvas and AG clicks select identical current CMD p1b12','integration');

-- WCP31 same-parent direct-child drag insertion is CMD-owned. PDF conveys
-- semantic A/B/placement only; AG and PDF render the current logical IDs with
-- unchanged original OCR bounding boxes from the CMD location sidecar.
INSERT INTO apis VALUES
 ('C120','C','planCMDReorderPBSChildren','ui/cmd-block-chains.js','export','same-parent direct child IDs, before/after, live CMD source','full-scoped reordered child Markdown plus original-origin footer edits','no direct PDF/AG writes, sealed original MinerU JSON unchanged',1),
 ('C121','C','returned.reorderPBSChildren','ui/wcp-cmd-element-transactions.js','returned','direct child IDs, before/after, expected source snapshot','one optimistic CM6 Undo/Redo transaction containing scope and footer','reject stale source, foreign parent and duplicate/mutated OCR origin',1),
 ('P40','P','pdfDropGuideZone','ui/pdf-pbs-drop-hit.js','export','pointer coordinate, temporary guide rectangle and same-parent child intent','semantic before or after drop selection','no pixel-based source mutation, no persistent PDF geometry change',1);
INSERT INTO access_edges VALUES
 ('X-CHILD-REORDER-C120','C','C','ui/wcp-cmd-element-transactions.js','planCMDReorderPBSChildren(source,sourceId,targetId,placement)','C120','registered','CMD pure transaction planner owns child identity and source-scope relocation'),
 ('X-CHILD-REORDER-C121','L','C','ui/main.js','cmdPort.reorderPBSChildren(sourceId,targetId,placement,options)','C121','registered','Shell forwards only semantic child IDs; CM6 is the sole source writer'),
 ('X-CHILD-REORDER-P40','P','P','ui/pdf-preview.js','pdfDropGuideZone(x,rail,child,this.readOnly,childDrag)','P40','registered','PDF maps transient rail pointer to semantic before/after without CMD internals');
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-CHILD-REORDER-C120','C120','tests/cmd-pbs-child-reorder.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','before/after insertion stable native physical origins, full scopes, PDF geometry, 0 sealed evidence edits','direct'),
 ('TC-CHILD-REORDER-C121','C121','tests/cmd-pbs-child-reorder.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','actual Chrome/WebKit child drag commits one undoable source plus footer edit with consistent AG/PDF label','integration'),
 ('TC-CHILD-REORDER-P40','P40','tests/cmd-pbs-child-reorder.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','same-parent two-position guide, foreign parent drop rejected, actual subblock chip pointer capture','integration');

-- Regression: an absorbed OCR parent is a current direct child with its own
-- original full-block PDF cover, not a native fragment (p13b1s3 <- p13b0).
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-CHILD-ABSORBED-C121','C121','tests/cmd-pbs-absorbed-child-cover.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','absorbed child cover can be drag source and target; current sN and physical source origin stay consistent through one Undo','integration'),
 ('TC-CHILD-ABSORBED-P40','P40','tests/cmd-pbs-absorbed-child-cover.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome and iPad-WebKit same-parent before/after rail for physical parent-backed child cover','integration');

-- CMD PBS-scoped illegal-break review: canonical logical child IDs define
-- scan ownership; adjacent sibling seams are review-only and never mutate
-- source. Legacy MinerU auto-mark behavior remains separately covered.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-BREAK-PBS-C42','C42','tests/cmd-linebreak-pbs-scope.test.mjs','tests/cmd-linebreak-pbs-scope.test.mjs','Current child scoped word splits, sibling boundary and intra-child hard paragraph review, invalid provenance fail-closed, structure and unrelated parent exclusion','direct'),
 ('TC-BREAK-PBS-G20','G20','tests/illegal-break-pbs.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Real Chrome/WebKit: one intra-child CMD auto-tag plus one sibling seam AG review row with current PBS IDs, global Shell status and no autosave','integration');

-- p6b6 real OCR regression. Synthetic body child s0 plus absorbed former
-- parent p6b7 -> s1: "about"/"3 percentage" was excluded by blanket body
-- role check; "lever- age" and "insur- ance" share one raw source line.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-BREAK-P6B6-C42','C42','tests/cmd-linebreak-p6b6.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Detect p6b6s0 body to p6b6s1 about/3 and two same-line OCR hyphen-space scars leverage/insurance; preserve distinct offsets and no auto-edit','direct'),
 ('TC-BREAK-P6B6-G20','G20','tests/illegal-break-p6b6.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Actual Chrome/iPad-WebKit AG filter to p6b6 children shows all 3 review-only, source line focus works, reload restores and no CMD annotation written','integration');

-- Child-opening continuity review: all text-bearing CMD children whose first
-- substantive glyph is not uppercase are high-recall review candidates. They
-- may be across columns/pages, with original PDF-page provenance; no CMD edit.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-BREAK-START-C42','C42','tests/cmd-linebreak-child-opening.test.mjs','tests/cmd-linebreak-child-opening.test.mjs','Enumerate lowercase/numeric/punctuation child starts independent of hyphens and parent sibling, classify physical PDF page, exclude media/table/formula/uppercase and never auto-mark','direct'),
 ('TC-BREAK-START-G20','G20','tests/illegal-break-child-opening.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome/iPad-WebKit actual p13b3s1 initially: AG review, physical PDF page, source visibly navigates, refresh recomputes and no autosave','integration');

-- A live CM6 edit while Illegal Breaks is active must invalidate old Worker
-- requests and re-scan the updated document. Never leave AG permanently
-- empty or strand an explicit source focus on a blank virtualized CM6 pane.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-BREAK-EDIT-C42','C42','tests/illegal-break-source-edit.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome/iPad-WebKit typing in visible CM6 after AG focus automatically refreshes candidate AG rows, location paints actual target text after second click and original source file stays unchanged','integration');

-- AG categorical filter must retain selected PBS ids while a live CMD scan
-- temporarily supplies zero rowData before its new Worker result arrives.
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-ENUM-EMPTY-G20','G20','tests/enum-checkbox-filter-transient-empty.test.mjs','ui/enum-checkbox-filter.js','Preserve selected text block IDs through a transient empty AG result and reconcile only against non-empty replacement rows','direct');

-- Layout/Shell CM6 viewport integrity: the sole EditorView remains the
-- writable source. AG and PDF are derived; blank virtual line rendering may
-- request CM6 measure but can never replace Markdown, history or editor DOM.
INSERT INTO apis VALUES
 ('L85','L','inspectCM6SourceVisibility','ui/cm6-source-visibility.js','export','read-only EditorView','visible|blank|hidden|detached + docLength','DOM viewport geometry inspection only; never reads a second Markdown copy',1),
 ('L86','L','createCM6SourceVisibilityGuard','ui/cm6-source-visibility.js','export','sole EditorView, bounded status reporter','schedule/inspect/dispose','viewStore focus/revision, resize and Safari visibility trigger only CM6 measure or scroll effect; no text writes',1);
INSERT INTO test_cases(id,api_id,script,fixture,expected,evidence) VALUES
 ('TC-CM6-ONE-L86','L86','tests/illegal-break-source-edit.browser.test.mjs','packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','Chrome/iPad-WebKit: one persistent CM6 DOM instance across AG module switch and one-character edit, AG rescan and PDF/source navigation; source text remains visibly painted without autosave','integration');
