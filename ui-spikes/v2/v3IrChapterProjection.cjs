"use strict";

// ../../src/v3IrChapterProjectionCli.ts
var import_node_fs = require("node:fs");

// ../../src/documentIrV1.ts
var DOCUMENT_IR_KIND = "ocr2md/document-ir";
var DOCUMENT_IR_VERSION = 1;
function validIrChapterFileName(value) {
  return typeof value === "string" && value.length >= 4 && value.length <= 120 && value.endsWith(".md") && !/[\x00-\x1f\/\\:*?"<>|]/u.test(value) && !value.startsWith(".") && !value.endsWith(" ") && !value.includes("..") && value.slice(0, -3).trim().length > 0;
}
var DocumentIrValidationError = class extends Error {
  constructor(pointer, message) {
    super(`Document IR ${pointer}: ${message}`);
    this.pointer = pointer;
    this.name = "DocumentIrValidationError";
  }
};
function fail(pointer, message) {
  throw new DocumentIrValidationError(pointer, message);
}
function obj(value, pointer) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(pointer, "must be an object");
  return value;
}
function isHash(hash3) {
  return typeof hash3 === "string" && /^[0-9a-f]{64}$/.test(hash3);
}
function validFile(r, p) {
  const ref = obj(r, p);
  if (typeof ref.path !== "string" || !ref.path.startsWith("/") || ref.path === "/" || ref.path.split("/").some((x) => x === ".." || x === ".") || !isHash(ref.sha256)) fail(p, "must have a canonical absolute logical file path and SHA-256");
}
function bbox(b, size, p) {
  if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== "number" || !Number.isFinite(v)) || b[0] < 0 || b[1] < 0 || b[2] < b[0] || b[3] < b[1] || b[2] > size[0] || b[3] > size[1])
    fail(p, "invalid visual-page bbox");
}
function pageSize(v, p) {
  if (!Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== "number" || !Number.isFinite(x) || x <= 0))
    fail(p, "invalid pageSize");
}
function validateDocumentIrV1(v) {
  const doc = obj(v, "/");
  if (doc.kind !== DOCUMENT_IR_KIND || doc.schemaVersion !== DOCUMENT_IR_VERSION || typeof doc.workspaceId !== "string" || !doc.workspaceId.trim() || !["page-import-provisional", "logical-review"].includes(String(doc.importState)))
    fail("/", "unsupported IR version or workspace");
  validFile(doc.pdf, "/pdf");
  validFile(doc.ocr, "/ocr");
  const source = obj(doc.sourceMetadata, "/sourceMetadata");
  if ("pdf_info" in source) fail("/sourceMetadata/pdf_info", "must be represented by pages/sourceElements");
  if (!Array.isArray(doc.pages) || doc.pages.length === 0 || !Array.isArray(doc.sourceElements) || !Array.isArray(doc.blocks) || !Array.isArray(doc.chapters) || !Array.isArray(doc.outputMarkdown))
    fail("/", "missing pages, elements, blocks, chapters or outputMarkdown");
  const pages = doc.pages;
  const pageIds = /* @__PURE__ */ new Set();
  pages.forEach((page, i) => {
    if (!page || page.pageIndex !== i || page.pdfPageNumber !== i + 1)
      fail(`/pages/${i}`, "page index must be consecutive, one-based PDF number must agree");
    pageSize(page.pageSize, `/pages/${i}/pageSize`);
    const meta = obj(page.pageMetadata, `/pages/${i}/pageMetadata`);
    for (const reserved of ["page_idx", "page_size", "para_blocks", "discarded_blocks", "preproc_blocks"])
      if (reserved in meta) fail(`/pages/${i}/pageMetadata`, "reserved MinerU key must not be duplicated");
    if (!Array.isArray(page.preprocBlocks) || !Array.isArray(page.bodyElementIds) || !Array.isArray(page.discardedElementIds)) fail(`/pages/${i}`, "missing original source arrays");
    for (const id of [...page.bodyElementIds, ...page.discardedElementIds]) {
      if (typeof id !== "string" || pageIds.has(id)) fail(`/pages/${i}`, "missing or repeated element ID");
      pageIds.add(id);
    }
  });
  const sourceElements = doc.sourceElements;
  const elements = /* @__PURE__ */ new Map();
  let body = 0, discarded = 0;
  for (let i = 0; i < sourceElements.length; i++) {
    const e = sourceElements[i], p = `/sourceElements/${i}`;
    if (!e || !Number.isSafeInteger(e.pageIndex) || e.pageIndex < 0 || e.pageIndex >= pages.length || e.pdfPageNumber !== e.pageIndex + 1 || !["para_blocks", "discarded_blocks"].includes(e.collection) || !Number.isSafeInteger(e.collectionPosition) || e.collectionPosition < 0 || e.sourceSha256 !== doc.ocr.sha256 || e.jsonPointer !== `/pdf_info/${e.pageIndex}/${e.collection}/${e.collectionPosition}` || e.id !== `mineru:${doc.ocr.sha256}:p${e.pageIndex}:${e.collection}:${e.collectionPosition}` || elements.has(e.id) || !pageIds.has(e.id)) fail(p, "invalid/duplicate provenance identity");
    const pg = pages[e.pageIndex], ids = e.collection === "para_blocks" ? pg.bodyElementIds : pg.discardedElementIds;
    if (ids[e.collectionPosition] !== e.id || e.pageSize[0] !== pg.pageSize[0] || e.pageSize[1] !== pg.pageSize[1])
      fail(p, "physical page collection or page size mismatch");
    bbox(e.bbox, pg.pageSize, p + "/bbox");
    if (!Array.isArray(e.normalizedBBox) || e.normalizedBBox.length !== 4 || e.normalizedBBox.some((v2, j) => Math.abs(v2 - e.bbox[j] / pg.pageSize[j % 2]) > 1e-12))
      fail(p + "/normalizedBBox", "invalid normalized visual coordinates");
    if (!Array.isArray(e.segments) || !isHash(e.normalizedContentSha256))
      fail(p, "invalid OCR segment index or fingerprint");
    const raw = obj(e.rawBlock, p + "/rawBlock");
    if (raw.type !== e.type || JSON.stringify(raw.bbox) !== JSON.stringify(e.bbox))
      fail(p, "raw OCR evidence must agree with indexed type and bbox");
    for (const [j, segment] of e.segments.entries()) {
      if (!segment || typeof segment.jsonPointer !== "string" || !segment.jsonPointer.startsWith(e.jsonPointer + "/") || ![segment.content, segment.html, segment.imagePath].some((v2) => typeof v2 === "string"))
        fail(`${p}/segments/${j}`, "invalid segment provenance");
    }
    elements.set(e.id, e);
    if (e.collection === "para_blocks") body++;
    else discarded++;
  }
  if (elements.size !== pageIds.size) fail("/sourceElements", "some source element not indexed");
  const chapters = /* @__PURE__ */ new Map();
  for (const [i, ch] of doc.chapters.entries()) {
    if (!ch || !ch.chapterId || typeof ch.name !== "string" || !Number.isSafeInteger(ch.order) || chapters.has(ch.chapterId)) fail(`/chapters/${i}`, "invalid chapter");
    chapters.set(ch.chapterId, ch);
  }
  for (const ch of chapters.values()) {
    if (ch.parentChapterId !== null && !chapters.has(ch.parentChapterId))
      fail("/chapters", "unknown parent chapter");
  }
  const manualHeadings = doc.manualHeadings === void 0 ? [] : doc.manualHeadings;
  if (!Array.isArray(manualHeadings)) fail("/manualHeadings", "must be an array");
  const manual = /* @__PURE__ */ new Map();
  for (const [i, m] of manualHeadings.entries()) {
    if (!m || typeof m.blockId !== "string" || !/^blk_[0-9a-f]{24}$/.test(m.blockId) || manual.has(m.blockId) || m.method !== "manual-pdf-page" || typeof m.afterBlockId !== "string" || m.afterBlockId === m.blockId || !Number.isSafeInteger(m.pdfPageNumber) || m.pdfPageNumber < 1 || m.pdfPageNumber > pages.length || typeof m.detail !== "string" || !m.detail.trim())
      fail(`/manualHeadings/${i}`, "invalid manual PDF page source");
    manual.set(m.blockId, m);
  }
  if (doc.importState !== "logical-review" && manual.size) fail("/manualHeadings", "requires logical review");
  const manualTexts = doc.manualTexts === void 0 ? [] : doc.manualTexts;
  if (!Array.isArray(manualTexts)) fail("/manualTexts", "must be an array");
  const transcribed = /* @__PURE__ */ new Map();
  for (const [i, m] of manualTexts.entries()) {
    if (!m || typeof m.blockId !== "string" || !/^blk_[0-9a-f]{24}$/.test(m.blockId) || transcribed.has(m.blockId) || manual.has(m.blockId) || m.method !== "manual-pdf-page" || typeof m.afterBlockId !== "string" || m.afterBlockId === m.blockId || !Number.isSafeInteger(m.pdfPageNumber) || m.pdfPageNumber < 1 || m.pdfPageNumber > pages.length || typeof m.detail !== "string" || !m.detail.trim())
      fail(`/manualTexts/${i}`, "invalid manually transcribed PDF body");
    transcribed.set(m.blockId, m);
  }
  const fileLayout = doc.chapterFileLayout ?? [];
  if (!Array.isArray(fileLayout)) fail("/chapterFileLayout", "must be an array");
  const seenLayout = /* @__PURE__ */ new Set();
  for (const [i, entry] of fileLayout.entries()) {
    if (!entry || typeof entry.blockId !== "string" || seenLayout.has(entry.blockId) || typeof entry.standalone !== "boolean" || entry.fileName !== void 0 && !validIrChapterFileName(entry.fileName))
      fail(`/chapterFileLayout/${i}`, "invalid file-only boundary or file name");
    seenLayout.add(entry.blockId);
  }
  const blocks = doc.blocks, blockIds = /* @__PURE__ */ new Set();
  const sourceUse = /* @__PURE__ */ new Map();
  let provisional = 0;
  for (const [i, block] of blocks.entries()) {
    const p = `/blocks/${i}`;
    if (!block || typeof block.blockId !== "string" || !/^blk_[0-9a-f]{24}$/.test(block.blockId) || blockIds.has(block.blockId) || typeof block.type !== "string" || !block.type || typeof block.text !== "string" || block.chapterId !== null && !chapters.has(block.chapterId) || block.readingOrder !== null && (!Number.isSafeInteger(block.readingOrder) || block.readingOrder < 0) || !["provisional", "structured"].includes(block.status) || !["unreviewed", "verified", "needs-correction"].includes(block.audit) || !Array.isArray(block.sources) || block.sources.length === 0 && !(manual.has(block.blockId) && block.type === "title") && !(transcribed.has(block.blockId) && block.type === "text") || block.sources.length > 0 && (manual.has(block.blockId) || transcribed.has(block.blockId)))
      fail(p, "invalid logical block, chapter or audit state");
    blockIds.add(block.blockId);
    if (block.status === "provisional") provisional++;
    for (const [j, ref] of block.sources.entries()) {
      const source2 = elements.get(ref?.elementId), rp = `${p}/sources/${j}`;
      if (!source2 || source2.collection !== "para_blocks") fail(rp, "block must cite a body OCR source");
      sourceUse.set(source2.id, (sourceUse.get(source2.id) || 0) + 1);
      if (ref.segmentPointer !== void 0) {
        const seg = source2.segments.find((s) => s.jsonPointer === ref.segmentPointer);
        if (!seg) fail(rp, "unknown segment pointer");
        if (ref.utf16Range) {
          const field = seg.content ?? seg.html;
          const [from, to] = ref.utf16Range;
          if (typeof field !== "string" || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from || to > field.length) fail(rp, "invalid segment UTF-16 range");
        }
      } else if (ref.utf16Range !== void 0) fail(rp, "range needs a segmentPointer");
    }
  }
  for (const [i, entry] of fileLayout.entries()) {
    if (!blocks.some((b) => b.blockId === entry.blockId && b.type === "title"))
      fail(`/chapterFileLayout/${i}`, "file boundary requires an existing title");
  }
  if (manual.size || transcribed.size) {
    const positions = new Map(blocks.map((b) => [b.blockId, b.readingOrder]));
    for (const [id, entry] of [...manual, ...transcribed]) {
      if (!positions.has(id) || !positions.has(entry.afterBlockId) || positions.get(entry.afterBlockId) >= positions.get(id))
        fail("/manualHeadings", "manual insertion must follow an existing source-anchored block");
    }
  }
  if (doc.importState === "logical-review") {
    const rec = obj(doc.reconstruction, "/reconstruction");
    if (rec.schemaVersion !== 1 || !["mineru-array-provisional", "explicit-reordered"].includes(String(rec.orderBasis)) || !Array.isArray(rec.candidates) || !Array.isArray(rec.appliedOperations))
      fail("/reconstruction", "invalid WP3 reconstruction metadata");
    const candidateIds = /* @__PURE__ */ new Set();
    rec.candidates.forEach((c, i) => {
      if (!c || typeof c.candidateId !== "string" || candidateIds.has(c.candidateId) || !["cross-page-continuation", "merge-prev-hint", "multi-column-order", "empty-ocr-text"].includes(c.kind) || c.status !== "needs-review" || typeof c.reason !== "string" || !c.reason || !Array.isArray(c.sourceElementIds) || !c.sourceElementIds.length || c.sourceElementIds.some((id) => !elements.has(id))) fail(`/reconstruction/candidates/${i}`, "invalid proposal");
      obj(c.evidence, `/reconstruction/candidates/${i}/evidence`);
      candidateIds.add(c.candidateId);
    });
    const operationIds = /* @__PURE__ */ new Set();
    rec.appliedOperations.forEach((op, i) => {
      if (!op || typeof op.operationId !== "string" || operationIds.has(op.operationId) || !["split", "merge", "reorder", "edit-text"].includes(op.kind) || op.mode !== "explicit" || !Array.isArray(op.originalBlockIds) || !op.originalBlockIds.length || !Array.isArray(op.resultBlockIds) || !op.resultBlockIds.length || typeof op.detail !== "string")
        fail(`/reconstruction/appliedOperations/${i}`, "invalid operation log");
      operationIds.add(op.operationId);
    });
    const assigned = /* @__PURE__ */ new Set();
    blocks.forEach((block, i) => {
      if (block.readingOrder === null || assigned.has(block.readingOrder))
        fail(`/blocks/${i}/readingOrder`, "WP3 must record a unique provisional reading order");
      assigned.add(block.readingOrder);
    });
    if (blocks.some((b) => b.readingOrder === null || b.readingOrder >= blocks.length) || blocks.some((b) => b.audit !== "unreviewed") || doc.outputMarkdown.length !== 0 || doc.chapterStructure === void 0 && doc.chapters.length !== 0)
      fail("/blocks", "WP3 cannot mint human verification, chapters, or Markdown files");
    for (const element of sourceElements.filter((e) => e.collection === "para_blocks")) {
      const refs = blocks.flatMap((b) => b.sources.filter((ref) => ref.elementId === element.id));
      if (!refs.length) fail("/blocks", "lost source element " + element.id);
      if (refs.length === 1 && !refs[0].segmentPointer) continue;
      if (refs.some((ref) => !ref.segmentPointer || !ref.utf16Range))
        fail("/blocks", "mixed full and partial source coverage");
      const sourceSegments = element.segments.filter((s) => typeof s.content === "string" && s.content.length > 0);
      if (sourceSegments.length === 0 || element.segments.some((s) => s.html !== void 0 || s.imagePath !== void 0))
        fail("/blocks", "cannot split source containing rich non-text content");
      for (const seg of sourceSegments) {
        const slices = refs.filter((r) => r.segmentPointer === seg.jsonPointer).map((r) => r.utf16Range).sort((a, b) => a[0] - b[0]);
        let position = 0;
        for (const [from, to] of slices) {
          if (from !== position) fail("/blocks", "split has a gap or overlap");
          position = to;
        }
        if (position !== seg.content.length) fail("/blocks", "missing OCR content after split");
      }
      if (refs.some((r) => !sourceSegments.some((seg) => seg.jsonPointer === r.segmentPointer)))
        fail("/blocks", "partial source points outside actual text segments");
    }
  }
  if (doc.chapterStructure !== void 0) {
    if (doc.importState !== "logical-review") fail("/chapterStructure", "requires WP3 logical review mode");
    const structure = obj(doc.chapterStructure, "/chapterStructure");
    if (structure.schemaVersion !== 1 || structure.method !== "ocr-title-provisional" || !Array.isArray(structure.candidates) || !Array.isArray(structure.operations) || !chapters.size)
      fail("/chapterStructure", "invalid chapter tree metadata");
    const positions = new Map(blocks.map((b) => [b.blockId, b.readingOrder]));
    const anchors = /* @__PURE__ */ new Map();
    const chapterOrders = /* @__PURE__ */ new Set();
    const fileNames = /* @__PURE__ */ new Set();
    for (const [i, ch] of doc.chapters.entries()) {
      if (typeof ch.anchorBlockId !== "string" || !positions.has(ch.anchorBlockId) || !Number.isSafeInteger(ch.depth) || ch.depth < 1 || ch.depth > 6 || ch.status !== "provisional" || chapterOrders.has(ch.order)) fail(`/chapters/${i}`, "invalid chapter boundary/level/order");
      chapterOrders.add(ch.order);
      if (ch.fileName !== void 0) {
        if (ch.depth !== 1 || !validIrChapterFileName(ch.fileName) || fileNames.has(ch.fileName.toLocaleLowerCase()))
          fail(`/chapters/${i}/fileName`, "unsafe, duplicated or non-root MD filename");
        fileNames.add(ch.fileName.toLocaleLowerCase());
      }
      const pos = positions.get(ch.anchorBlockId);
      if (anchors.has(pos)) fail(`/chapters/${i}`, "repeated chapter boundary");
      anchors.set(pos, ch);
      if (ch.parentChapterId === null && ch.depth !== 1 || ch.parentChapterId !== null && chapters.get(ch.parentChapterId).depth !== ch.depth - 1)
        fail(`/chapters/${i}`, "parent and child depth mismatch");
    }
    if (!anchors.has(0)) fail("/chapters", "every block requires a starting root section");
    const ordered = [...anchors.entries()].sort((a, b) => a[0] - b[0]);
    if (ordered.some(([_, chapter], index) => chapter.order !== index))
      fail("/chapters", "chapter order must match source block boundaries");
    const active = /* @__PURE__ */ new Map();
    let ix = 0;
    for (const b of [...blocks].sort((a, b2) => a.readingOrder - b2.readingOrder)) {
      while (ix < ordered.length && ordered[ix][0] === b.readingOrder) {
        const ch = ordered[ix][1];
        if (ch.depth > 1 && active.get(ch.depth - 1)?.chapterId !== ch.parentChapterId)
          fail("/chapters", "chapter child outside parent boundary");
        for (const depth of [...active.keys()]) if (depth >= ch.depth) active.delete(depth);
        active.set(ch.depth, ch);
        ix++;
      }
      const assigned = active.get(Math.max(...active.keys()));
      if (!assigned || b.chapterId !== assigned.chapterId)
        fail("/blocks", "chapter membership must follow contiguous source block boundaries");
    }
    if (ix !== ordered.length) fail("/chapters", "unused chapter boundary");
    for (const [i, c] of structure.candidates.entries()) {
      if (!c || typeof c.candidateId !== "string" || typeof c.headingBlockId !== "string" || !positions.has(c.headingBlockId) || !Array.isArray(c.sourceElementIds) || c.sourceElementIds.length === 0 && !manual.has(c.headingBlockId) || c.sourceElementIds.length > 0 && manual.has(c.headingBlockId) || c.sourceElementIds.some((id) => !elements.has(id)) || !["root", "section", "uncertain"].includes(c.proposedRole) || !Number.isSafeInteger(c.pageNumber) || c.pageNumber < 1 || c.pageNumber > pages.length || !["needs-review", "confirmed"].includes(c.status) || (c.status === "confirmed" ? typeof c.reviewReason !== "string" || !c.reviewReason.trim() : c.reviewReason !== void 0) || typeof c.reason !== "string" || !c.reason || (manual.has(c.headingBlockId) ? manual.get(c.headingBlockId).pdfPageNumber !== c.pageNumber : elements.get(c.sourceElementIds[0])?.pdfPageNumber !== c.pageNumber) || c.sourceElementIds.some((id) => !blocks.find((b) => b.blockId === c.headingBlockId)?.sources.some((r) => r.elementId === id)))
        fail(`/chapterStructure/candidates/${i}`, "invalid chapter boundary candidate");
    }
    const proposalIds = structure.candidates.map((c) => c.candidateId);
    if (new Set(proposalIds).size !== proposalIds.length) fail("/chapterStructure/candidates", "duplicate candidate ID");
    for (const [i, op] of structure.operations.entries()) {
      if (!op || typeof op.operationId !== "string" || !["move-boundary", "promote-heading", "demote-section", "rename", "classify-heading", "assign-file", "assign-sequence", "insert-manual-title", "delete-manual-title", "demote-ocr-title"].includes(op.kind) || !Array.isArray(op.chapterIds) || !op.chapterIds.length || typeof op.detail !== "string" || !op.detail || op.mode !== "explicit")
        fail(`/chapterStructure/operations/${i}`, "invalid chapter edit log");
    }
  } else if (doc.chapters.length !== 0) fail("/chapters", "chapters require chapterStructure metadata");
  if (doc.importState === "page-import-provisional") {
    if (doc.reconstruction !== void 0 || doc.chapterStructure !== void 0)
      fail("/reconstruction", "import cannot predeclare review metadata");
    if (doc.chapters.length !== 0 || doc.outputMarkdown.length !== 0 || blocks.length !== body || provisional !== body || blocks.some((b) => b.chapterId !== null || b.readingOrder !== null || b.audit !== "unreviewed") || [...sourceUse.values()].some((count) => count !== 1) || sourceUse.size !== body || blocks.some((b) => b.sources.length !== 1 || b.sources[0].segmentPointer !== void 0))
      fail("/blocks", "provisional import may not infer chapter/order/review or merge/split");
  }
  const sum = obj(doc.summary, "/summary");
  if (sum.pages !== pages.length || sum.bodyElements !== body || sum.discardedElements !== discarded || sum.provisionalBlocks !== provisional)
    fail("/summary", "import counts inconsistent with elements and blocks");
}
function encodeDocumentIrV1(doc) {
  validateDocumentIrV1(doc);
  return new TextEncoder().encode(JSON.stringify(doc, null, 2) + "\n");
}

// ../../src/documentIrMarkdown.ts
var import_crypto2 = require("crypto");

// ../../src/obsidianTableSanitize.ts
var TAGS = /* @__PURE__ */ new Set(["table", "caption", "colgroup", "col", "thead", "tbody", "tfoot", "tr", "th", "td", "p", "span", "br", "b", "strong", "i", "em", "s", "u", "small", "sup", "sub", "code", "eq"]);
var VOID = /* @__PURE__ */ new Set(["col", "br"]);
var PARENTS = /* @__PURE__ */ new Set(["table", "colgroup", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "p", "span"]);
var escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function safeObsidianHtmlTable(source) {
  const raw = source.trim();
  if (!/^<table(?:\s[^>]*)?>[\s\S]*<\/table>$/i.test(raw) || raw.length > 5e5) return null;
  const tokens = raw.match(/<!--[^]*?-->|<[^>]*>|[^<]+/g);
  if (!tokens || tokens.join("") !== raw) return null;
  const stack = [], result = [];
  let cells = 0;
  for (const token of tokens) {
    if (token.startsWith("<!--")) return null;
    if (!token.startsWith("<")) {
      if (token.includes(">")) result.push(escape(token));
      else result.push(token.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z]+);)/gi, "&amp;"));
      continue;
    }
    const match = /^<\s*(\/?)\s*([a-z][\w-]*)([^>]*)>$/i.exec(token);
    if (!match) return null;
    const close = !!match[1], name = match[2].toLowerCase(), tail = match[3];
    if (!TAGS.has(name) || /\s*\/\s*>$/.test(token) && !VOID.has(name)) return null;
    if (close) {
      if (tail.trim() || stack.pop() !== name) return null;
      result.push(name === "eq" ? "</code>" : `</${name}>`);
      continue;
    }
    let attrs = "";
    if (tail.trim() && !/^\s*\/?\s*$/.test(tail)) {
      if (!["td", "th", "col", "colgroup"].includes(name)) return null;
      const at = tail.trim();
      const fragments = at.match(/\b(?:rowspan|colspan|scope|align)\s*=\s*(?:"[^"]*"|'[^']*'|\d+)/gi);
      if (!fragments || fragments.join("").replace(/\s/g, "") !== at.replace(/\s/g, "")) return null;
      const seen = /* @__PURE__ */ new Set();
      for (const value of fragments) {
        const attr = /^(rowspan|colspan|scope|align)\s*=\s*(.*)$/i.exec(value);
        const key = attr[1].toLowerCase(), v = attr[2].replace(/^["']|["']$/g, "");
        if (seen.has(key)) return null;
        seen.add(key);
        if (key === "rowspan" || key === "colspan") {
          if (!/^\d{1,3}$/.test(v) || +v < 1 || +v > 100) return null;
        } else if (key === "scope" && !["row", "col", "rowgroup", "colgroup"].includes(v.toLowerCase())) return null;
        else if (key === "align" && !["left", "right", "center"].includes(v.toLowerCase())) return null;
        attrs += ` ${key}="${escape(v)}"`;
      }
    }
    if (stack.includes("eq")) return null;
    if (name === "eq" && !["td", "th"].includes(stack.at(-1) ?? "")) return null;
    if (name === "table" && stack.length) return null;
    if (name === "tr" && !stack.some((t) => ["table", "tbody", "thead", "tfoot"].includes(t))) return null;
    if (["td", "th"].includes(name)) {
      if (stack.at(-1) !== "tr") return null;
      cells++;
    }
    if (!PARENTS.has(name) && stack.length === 0) return null;
    result.push(name === "eq" ? '<code class="ocr2md-latex-pending">' : `<${name}${attrs}>`);
    if (!VOID.has(name)) stack.push(name);
  }
  return stack.length === 0 && cells > 0 ? result.join("") : null;
}

// ../../src/documentIrChapters.ts
var import_crypto = require("crypto");
function hash(value) {
  return (0, import_crypto.createHash)("sha256").update(value).digest("hex");
}
function chapterIdForAnchor(blockId) {
  return "ch_" + hash("ocr2md-ir-wp4-chapter\0" + blockId).slice(0, 24);
}
function checkReady(doc) {
  validateDocumentIrV1(doc);
  if (doc.importState !== "logical-review" || !doc.reconstruction)
    throw Error("IR-WP4 needs a validated WP3 logical-review IR");
  if (doc.outputMarkdown.length !== 0) throw Error("IR-WP4 never modifies published Markdown");
}
function numberedBlocks(doc) {
  return [...doc.blocks].sort((a, b) => a.readingOrder - b.readingOrder);
}
function v2IrChapterHeadings(doc) {
  checkReady(doc);
  const chapters = new Map(doc.chapters.map((c) => [c.anchorBlockId, c]));
  const overrides = new Map((doc.chapterFileLayout ?? []).map((e) => [e.blockId, e]));
  return numberedBlocks(doc).filter((b) => b.type === "title").reduce((acc, block) => {
    const ch = chapters.get(block.blockId);
    const override = overrides.get(block.blockId);
    const standalone = acc.rows.length === 0 ? true : override?.standalone ?? ch?.depth === 1;
    if (standalone) acc.ownerFile = override?.fileName ?? ch?.fileName ?? "";
    acc.rows.push({
      blockId: block.blockId,
      raw: block.text,
      standalone,
      fileName: acc.ownerFile,
      first: acc.rows.length === 0
    });
    return acc;
  }, { rows: [], ownerFile: "" }).rows;
}

// ../../src/documentIrMarkdown.ts
var hash2 = (value) => (0, import_crypto2.createHash)("sha256").update(value).digest("hex");
var encoder = new TextEncoder();
function oneLine(value) {
  return value.replace(/\r?\n/gu, " ").trim();
}
function safeMarkdownText(value) {
  return value.replace(/\r\n?/gu, "\n").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/^(?=[#>|])([#>|])/gmu, "\\$1");
}
function safeHeading(value) {
  return safeMarkdownText(oneLine(value)).replace(/(^|\s)([#`*_[\]\\])/gu, "$1\\$2");
}
function fence(payload, kind) {
  const longest = Math.max(2, ...(payload.match(/`+/gu) ?? []).map((x) => x.length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${kind}
${payload}
${ticks}`;
}
function safeMediaLink(raw, description) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return `[${description}\uFF08\u4EC5\u94FE\u63A5\uFF0C\u4E0D\u81EA\u52A8\u8F7D\u5165\uFF09](${url.href.replace(/\(/gu, "%28").replace(/\)/gu, "%29")})`;
  } catch {
    return null;
  }
}
var sanitizedPath = (label) => label.normalize("NFKD").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48) || "chapter";
function mimeParts(s) {
  return {
    html: s.segments.flatMap((x) => x.html ? [x.html] : []),
    links: s.segments.flatMap((x) => x.imagePath ? [x.imagePath] : []),
    formula: s.segments.flatMap((x) => x.type === "interline_equation" && x.content ? [x.content] : [])
  };
}
function renderBlock(block, sources, chapter, asOrdinaryText = false, obCompatible = false) {
  const segments = sources.flatMap((s) => s.segments);
  const html = segments.flatMap((s) => s.html ? [s.html] : []);
  const media = [...new Set(segments.flatMap((s) => s.imagePath ? [s.imagePath] : []))];
  const name = safeHeading(block.text);
  if (block.type === "title") {
    if (asOrdinaryText) return { mode: "text", content: safeMarkdownText(block.text) || "[\u539F OCR \u6807\u9898\u88AB\u5224\u4E3A\u975E\u7AE0\u8282\uFF0C\u4F46\u6587\u672C\u4E3A\u7A7A]" };
    const depth = chapter?.anchorBlockId === block.blockId ? chapter.depth === 1 ? 1 : 2 : 3;
    return { mode: "heading", content: "#".repeat(depth) + " " + (name || "[\u7A7A\u6807\u9898\uFF1A\u8BF7\u6838\u5BF9 PDF]") };
  }
  if (block.type === "interline_equation") {
    const formulas = sources.flatMap((x) => mimeParts(x).formula);
    const payload = block.text || formulas.join("\n");
    return {
      mode: "equation",
      content: payload ? obCompatible ? `$$
${payload}
$$` : fence(payload, "math") : "[\u7A7A\u516C\u5F0F\uFF1A\u8BF7\u5BF9\u7167 PDF]",
      ...!payload ? { warning: "OCR \u7A7A\u516C\u5F0F" } : {}
    };
  }
  if (block.type === "table") {
    const normalized = html.map((h) => obCompatible ? safeObsidianHtmlTable(h) : null);
    const chunks = html.map((h, i) => normalized[i] ?? fence(h, "html"));
    if (block.text) chunks.unshift(safeMarkdownText(block.text));
    if (media.length) chunks.push(...media.map((src, i) => safeMediaLink(src, `\u8868\u683C\u56FE\u7247\u6765\u6E90 ${i + 1}`) ?? `[\u8868\u683C\u56FE\u7247\u8DEF\u5F84\u672A\u80FD\u5B89\u5168\u94FE\u63A5\uFF1A${i + 1}\uFF0C\u8BF7\u6838\u5BF9 JSON]`));
    return {
      mode: "table-html",
      content: chunks.length ? chunks.join("\n\n") : "[OCR \u8868\u683C\u65E0\u53EF\u63D0\u53D6\u5185\u5BB9\uFF1A\u8BF7\u6838\u5BF9 PDF]",
      ...obCompatible && normalized.every(Boolean) && !html.some((x) => /<eq(?:\s|>)/i.test(x)) ? {} : { warning: normalized.every(Boolean) ? "\u8868\u683C\u5305\u542B\u5F85\u5BA1\u6838 LaTeX \u5355\u5143\u683C\uFF0C\u516C\u5F0F\u539F\u6587\u5DF2\u4FDD\u7559" : "\u590D\u6742\u6216\u4E0D\u5B89\u5168\u8868\u683C\u4ECD\u4FDD\u7559\u4E3A\u4EE3\u7801\uFF0C\u9700\u5A92\u4F53\u6A21\u5757\u4EBA\u5DE5\u5BA1\u6838" }
    };
  }
  if (block.type === "image" || block.type === "chart") {
    const links = media.map((src, i) => safeMediaLink(src, `${block.type === "image" ? "\u56FE\u7247" : "\u56FE\u8868"}\u6765\u6E90 ${i + 1}`) ?? `[\u5A92\u4F53\u6765\u6E90\u8DEF\u5F84\u4E0D\u53EF\u5B89\u5168\u663E\u793A\uFF1A${i + 1}\uFF0C\u53C2\u89C1 IR \u539F\u59CB JSON]`);
    const content = [block.text ? safeMarkdownText(block.text) : "", ...links].filter(Boolean).join("\n\n");
    return {
      mode: block.type === "image" ? "image-link" : "chart-link",
      content: content || `[${block.type === "image" ? "\u56FE\u7247" : "\u56FE\u8868"}\u6682\u65E0 OCR \u6587\u672C/\u94FE\u63A5\uFF1A\u6838\u5BF9 PDF]`,
      warning: "\u5A92\u4F53\u6682\u4EE5\u6765\u6E90\u94FE\u63A5\u6216\u8BC1\u636E\u5360\u4F4D\u8868\u793A\uFF0C\u672A\u590D\u5236\u4E8C\u8FDB\u5236\u9644\u4EF6"
    };
  }
  if (block.type === "ref_text") return { mode: "reference", content: safeMarkdownText(block.text) || "[\u7A7A\u53C2\u8003\u6587\u732E\uFF1A\u8BF7\u6838\u5BF9 PDF]" };
  if (block.type === "text") return {
    mode: "text",
    content: safeMarkdownText(block.text) || "[\u7A7A\u6B63\u6587\uFF1A\u8BF7\u6838\u5BF9 PDF]",
    ...!block.text ? { warning: "OCR \u6B63\u6587\u4E3A\u7A7A" } : {}
  };
  return {
    mode: "evidence-only",
    content: (block.text ? safeMarkdownText(block.text) + "\n\n" : "") + `[\u672A\u652F\u6301 OCR \u5143\u7D20\u7C7B\u578B\uFF1A${safeMarkdownText(block.type)}\uFF1B\u8BF7\u6838\u5BF9 IR/PDF]`,
    warning: "\u5B58\u5728\u672A\u5B9E\u73B0\u7684 OCR \u5143\u7D20\u7C7B\u578B"
  };
}
function irFileOwners(doc) {
  const blocks = [...doc.blocks].sort((a, b) => a.readingOrder - b.readingOrder);
  const headings = v2IrChapterHeadings(doc);
  const roots = doc.chapters.filter((ch) => ch.parentChapterId === null);
  const candidates = /* @__PURE__ */ new Map();
  const selectable = new Set(headings.map((h) => h.blockId));
  for (const ch of roots) {
    if (ch.anchorBlockId && !selectable.has(ch.anchorBlockId))
      candidates.set(ch.anchorBlockId, {
        blockId: ch.anchorBlockId,
        chapterId: ch.chapterId,
        name: ch.name,
        fileName: ch.fileName
      });
  }
  for (const h of headings.filter((h2) => h2.standalone)) {
    const ch = doc.chapters.find((c) => c.anchorBlockId === h.blockId);
    candidates.set(h.blockId, {
      blockId: h.blockId,
      chapterId: chapterIdForAnchor(h.blockId),
      name: ch?.name ?? h.raw,
      ...h.fileName ? { fileName: h.fileName } : {}
    });
  }
  const owners = blocks.flatMap((b) => {
    const owner = candidates.get(b.blockId);
    return owner ? [owner] : [];
  });
  if (!owners.length || owners[0].blockId !== blocks[0]?.blockId)
    throw Error("\u7AE0\u8282\u6587\u4EF6\u7F3A\u5C11\u4E66\u7C4D\u9996\u5757\u7684\u8F93\u51FA\u5F52\u5C5E");
  return owners;
}
function generateIrMarkdownBundle(doc, options = {}) {
  validateDocumentIrV1(doc);
  if (doc.importState !== "logical-review" || !doc.chapterStructure || !doc.chapters.length || doc.outputMarkdown.length !== 0) throw Error("WP6 requires a provisional WP4 IR without prior published MD");
  const irSha256 = hash2(encodeDocumentIrV1(doc));
  const sortedBlocks = [...doc.blocks].sort((a, b) => a.readingOrder - b.readingOrder);
  const chapters = new Map(doc.chapters.map((ch) => [ch.chapterId, ch]));
  const source = new Map(doc.sourceElements.map((el) => [el.id, el]));
  const manual = new Map([...doc.manualHeadings ?? [], ...doc.manualTexts ?? []].map((h) => [h.blockId, h]));
  const owners = irFileOwners(doc);
  const sections = new Map(owners.map((o) => [o.blockId, []]));
  const boundary = new Set(owners.map((o) => o.blockId));
  let currentOwner = owners[0].blockId;
  for (const b of sortedBlocks) {
    if (boundary.has(b.blockId)) currentOwner = b.blockId;
    sections.get(currentOwner).push(b);
  }
  const warnings = /* @__PURE__ */ new Set();
  const excludedHeadingIds = new Set(doc.chapterStructure.candidates.filter((c) => c.status === "confirmed" && c.proposedRole === "uncertain").map((c) => c.headingBlockId));
  const bookRoot = doc.pdf.path.slice(0, doc.pdf.path.lastIndexOf("/"));
  const files = owners.map((owner, index) => {
    const path = `${bookRoot}/ir-generated/${owner.fileName ?? `${String(index + 1).padStart(2, "0")}-${sanitizedPath(owner.name)}-${owner.chapterId.slice(-8)}.md`}`;
    let content = "", ranges = [];
    const push = (value) => {
      content += value;
    };
    if (owner.name === "\u524D\u7F6E\u5185\u5BB9\uFF08\u5F85\u5BA1\u6838\uFF09") push("# \u524D\u7F6E\u5185\u5BB9\uFF08\u5F85\u5BA1\u6838\uFF0C\u7ED3\u6784\u5BB9\u5668\uFF09\n\n");
    const own = sections.get(owner.blockId);
    for (const block of own) {
      const chapter = chapters.get(block.chapterId);
      const sources = block.sources.map((r) => source.get(r.elementId));
      const evidence = block.sources.map((ref, i) => {
        const el = sources[i];
        return {
          elementId: el.id,
          pdfPageNumber: el.pdfPageNumber,
          jsonPointer: el.jsonPointer,
          bbox: el.bbox,
          normalizedBBox: el.normalizedBBox,
          ...ref.segmentPointer ? { segmentPointer: ref.segmentPointer } : {},
          ...ref.utf16Range ? { utf16Range: ref.utf16Range } : {}
        };
      });
      const heading = chapters.get(block.chapterId)?.anchorBlockId === block.blockId ? chapter : void 0;
      const output = renderBlock(
        block,
        sources,
        heading,
        excludedHeadingIds.has(block.blockId),
        options.obCompatible === true
      );
      if (output.warning) warnings.add(`${block.blockId}: ${output.warning}`);
      const manualRef = manual.get(block.blockId);
      const pages = [.../* @__PURE__ */ new Set([
        ...sources.map((x) => x.pdfPageNumber),
        ...manualRef ? [manualRef.pdfPageNumber] : []
      ])].sort((a, b) => a - b);
      const from = content.length;
      const marker = `<!-- ocr2md-ir:block=${block.blockId} -->
`;
      push(marker);
      const contentFrom = content.length;
      push(output.content);
      const contentTo = content.length;
      push("\n\n");
      ranges.push({
        blockId: block.blockId,
        chapterId: block.chapterId,
        pdfPages: pages,
        from,
        to: content.length,
        contentFrom,
        contentTo,
        mode: output.mode,
        audit: "unreviewed",
        evidence,
        ...manualRef ? { manualPdfPage: manualRef.pdfPageNumber } : {}
      });
    }
    if (!ranges.length) throw Error("Empty independent file: " + owner.chapterId);
    return {
      chapterId: owner.chapterId,
      path,
      label: owner.name,
      content,
      sha256: hash2(encoder.encode(content)),
      ranges,
      status: "provisional"
    };
  });
  const allRanges = files.flatMap((f) => f.ranges);
  if (allRanges.length !== doc.blocks.length || new Set(allRanges.map((r) => r.blockId)).size !== doc.blocks.length || allRanges.some((r) => !doc.blocks.find((b) => b.blockId === r.blockId)))
    throw Error("Markdown projection lost or duplicated one or more IR blocks");
  const bundle = {
    kind: "ocr2md/ir-markdown-bundle",
    schemaVersion: 1,
    sourcePdf: doc.pdf,
    sourceOcr: doc.ocr,
    irSha256,
    generatedFrom: "document-ir",
    audit: "unreviewed",
    warnings: [...warnings],
    files
  };
  validateIrMarkdownBundle(doc, bundle);
  return bundle;
}
var DIR_WHOLE_BOOK_ID = "dir:whole-book-draft";
function generateIrWholeBookMarkdown(doc, projected = generateIrMarkdownBundle(doc)) {
  validateIrMarkdownBundle(doc, projected);
  const expected = [...doc.blocks].sort((a, b) => a.readingOrder - b.readingOrder);
  const parts = new Map(projected.files.flatMap((f) => f.ranges.map((r) => [r.blockId, {
    file: f,
    range: r
  }])));
  let content = "";
  const ranges = [];
  for (const block of expected) {
    const item = parts.get(block.blockId);
    if (!item) throw Error("\u5168\u4E66\u6E90\u7801\u7F3A\u5C11\u4E00\u4E2A\u539F\u59CB OCR \u5757\uFF1A" + block.blockId);
    const { file, range } = item;
    const from = content.length;
    content += file.content.slice(range.from, range.to);
    const shift = from - range.from;
    ranges.push({
      ...range,
      from,
      to: content.length,
      contentFrom: range.contentFrom + shift,
      contentTo: range.contentTo + shift
    });
  }
  if (ranges.length !== doc.blocks.length || new Set(ranges.map((r) => r.blockId)).size !== ranges.length)
    throw Error("\u5168\u4E66\u6E90\u7801\u6765\u6E90\u8303\u56F4\u4E0D\u552F\u4E00");
  return {
    chapterId: DIR_WHOLE_BOOK_ID,
    path: doc.pdf.path.slice(0, doc.pdf.path.lastIndexOf("/")) + "/ir-generated/whole-book-draft.md",
    label: "\u5168\u4E66\u8FDE\u7EED MD \xB7 OCR \u7AE0\u754C\u5F85\u5BA1\u6838",
    content,
    sha256: hash2(encoder.encode(content)),
    ranges,
    status: "provisional"
  };
}
function isIrChapterFileLayoutReady(doc) {
  validateDocumentIrV1(doc);
  const owners = irFileOwners(doc);
  const assigned = Boolean(doc.chapterFileLayout?.length) || Boolean(
    doc.chapterStructure?.operations.some((op) => op.mode === "explicit" && ["assign-sequence", "assign-file", "classify-heading"].includes(op.kind))
  );
  return assigned && owners.length > 0 && owners.every((o) => typeof o.fileName === "string" && o.fileName.length > 0) && doc.blocks.every((b) => b.chapterId !== null);
}
function isIrChapterDelimitationConfirmed(doc) {
  if (!isIrChapterFileLayoutReady(doc)) return false;
  return Boolean(doc.chapterStructure?.candidates.length) && doc.chapterStructure.candidates.every((c) => c.status === "confirmed");
}
function validateIrMarkdownBundle(doc, bundle) {
  validateDocumentIrV1(doc);
  if (bundle.kind !== "ocr2md/ir-markdown-bundle" || bundle.schemaVersion !== 1 || bundle.audit !== "unreviewed" || bundle.generatedFrom !== "document-ir" || bundle.sourcePdf.sha256 !== doc.pdf.sha256 || bundle.sourceOcr.sha256 !== doc.ocr.sha256 || bundle.irSha256 !== hash2(encodeDocumentIrV1(doc))) throw Error("Markdown bundle source mismatch");
  const allIds = /* @__PURE__ */ new Set();
  const sources = new Map(doc.sourceElements.map((s) => [s.id, s]));
  const manual = new Map([...doc.manualHeadings ?? [], ...doc.manualTexts ?? []].map((h) => [h.blockId, h]));
  const refs = new Map(doc.blocks.map((b) => [b.blockId, b]));
  const owners = irFileOwners(doc);
  if (bundle.files.length !== owners.length || new Set(bundle.files.map((f) => f.path)).size !== bundle.files.length)
    throw Error("Missing/duplicate generated independent file");
  for (const file of bundle.files) {
    if (!owners.some((o) => o.chapterId === file.chapterId) || file.status !== "provisional" || !file.path.startsWith(doc.pdf.path.slice(0, doc.pdf.path.lastIndexOf("/")) + "/ir-generated/") || !/^\/[^\u0000-\u001f]+\.md$/u.test(file.path) || file.sha256 !== hash2(encoder.encode(file.content))) throw Error("Generated file invalid or SHA mismatch");
    let cursor = file.content.startsWith("# \u524D\u7F6E\u5185\u5BB9\uFF08\u5F85\u5BA1\u6838\uFF0C\u7ED3\u6784\u5BB9\u5668\uFF09\n\n") ? "# \u524D\u7F6E\u5185\u5BB9\uFF08\u5F85\u5BA1\u6838\uFF0C\u7ED3\u6784\u5BB9\u5668\uFF09\n\n".length : 0;
    for (const r of file.ranges) {
      if (r.from !== cursor || r.to > file.content.length || r.to <= r.from || r.contentFrom < r.from || r.contentTo > r.to || r.contentTo <= r.contentFrom || !file.content.slice(r.from, r.contentFrom).includes(`<!-- ocr2md-ir:block=${r.blockId} -->`))
        throw Error("Broken Markdown UTF-16 range or block marker");
      const block = refs.get(r.blockId);
      if (!block || allIds.has(r.blockId) || block.chapterId !== r.chapterId || r.audit !== "unreviewed" || r.evidence.length !== block.sources.length || r.manualPdfPage !== manual.get(r.blockId)?.pdfPageNumber || manual.has(r.blockId) && (r.mode !== (block.type === "title" ? "heading" : "text") || r.pdfPages.length !== 1 || r.pdfPages[0] !== manual.get(r.blockId).pdfPageNumber) || r.evidence.some((v, i) => {
        const expected = block.sources[i], physical = sources.get(expected.elementId);
        return !physical || physical.pdfPageNumber !== v.pdfPageNumber || physical.jsonPointer !== v.jsonPointer || v.elementId !== expected.elementId || JSON.stringify(physical.bbox) !== JSON.stringify(v.bbox) || JSON.stringify(physical.normalizedBBox) !== JSON.stringify(v.normalizedBBox) || v.segmentPointer !== expected.segmentPointer || JSON.stringify(v.utf16Range) !== JSON.stringify(expected.utf16Range);
      })) throw Error("Markdown range lacks correct immutable OCR provenance");
      allIds.add(r.blockId);
      cursor = r.to;
    }
    if (cursor !== file.content.length) throw Error("Unindexed material at end of generated Markdown");
  }
  if (allIds.size !== doc.blocks.length) throw Error("Missing generated block or stale record");
}

// ../../src/documentIrArchive.ts
var enc = new TextEncoder();
var u16 = (v, n, o) => v.setUint16(o, n, true);
var u32 = (v, n, o) => v.setUint32(o, n >>> 0, true);
function crc32(bytes) {
  let c = 4294967295;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c >>> 1 ^ (c & 1 ? 3988292384 : 0);
  }
  return (c ^ 4294967295) >>> 0;
}
function buildIrMarkdownArchive(doc, bundle) {
  validateIrMarkdownBundle(doc, bundle);
  const approved = isIrChapterDelimitationConfirmed(doc);
  const fileReady = isIrChapterFileLayoutReady(doc);
  const files = fileReady ? [...bundle.files] : [generateIrWholeBookMarkdown(doc, bundle)];
  const manifest = {
    ...bundle,
    projectionState: approved ? "confirmed-chapters" : fileReady ? "chapter-files-for-cleaning" : "whole-book-unreviewed",
    files: files.map(({ content, ...meta }) => meta)
  };
  const members = [
    { name: "document-ir.v1.json", bytes: encodeDocumentIrV1(doc) },
    { name: "document-ir.markdown-manifest.v1.json", bytes: enc.encode(JSON.stringify(manifest, null, 2) + "\n") },
    ...files.map((f) => ({ name: "chapters/" + f.path.split("/").at(-1), bytes: enc.encode(f.content) }))
  ];
  const unique = /* @__PURE__ */ new Set();
  for (const file of members) {
    if (unique.has(file.name) || file.name.startsWith("/") || file.name.includes("..") || file.name.includes("\\") || file.name.includes("\0")) throw Error("Unsafe ZIP member");
    unique.add(file.name);
  }
  const locals = [], centrals = [];
  let offset = 0;
  for (const file of members) {
    const name = enc.encode(file.name), data = file.bytes;
    if (data.length > 4294967295 || name.length > 65535) throw Error("IR ZIP member too large");
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length), lv = new DataView(local.buffer);
    u32(lv, 67324752, 0);
    u16(lv, 20, 4);
    u16(lv, 2048, 6);
    u32(lv, crc, 14);
    u32(lv, data.length, 18);
    u32(lv, data.length, 22);
    u16(lv, name.length, 26);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    u32(cv, 33639248, 0);
    u16(cv, 20, 4);
    u16(cv, 20, 6);
    u16(cv, 2048, 8);
    u32(cv, crc, 16);
    u32(cv, data.length, 20);
    u32(cv, data.length, 24);
    u16(cv, name.length, 28);
    u32(cv, offset, 42);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22), dv = new DataView(end.buffer);
  u32(dv, 101010256, 0);
  u16(dv, members.length, 8);
  u16(dv, members.length, 10);
  u32(dv, centralSize, 12);
  u32(dv, offset, 16);
  const all = [...locals, ...centrals, end];
  const result = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let pos = 0;
  for (const item of all) {
    result.set(item, pos);
    pos += item.length;
  }
  return { bytes: result, count: members.length, size: result.length };
}

// ../../src/v3IrChapterProjectionCli.ts
try {
  const source = (0, import_node_fs.readFileSync)(0);
  if (source.byteLength > 10 * 1024 * 1024) throw Error("DIRjson input exceeds 10MB");
  const doc = JSON.parse(source.toString("utf8"));
  validateDocumentIrV1(doc);
  if (!isIrChapterFileLayoutReady(doc)) throw Error("Named chapter file boundaries incomplete");
  const output = buildIrMarkdownArchive(doc, generateIrMarkdownBundle(doc, { obCompatible: true }));
  if (output.bytes.byteLength > 16 * 1024 * 1024) throw Error("Projected archive exceeds 16MB");
  (0, import_node_fs.writeSync)(1, output.bytes);
} catch (error) {
  process.stderr.write("IR chapter projection rejected: " + String(error) + "\n");
  process.exitCode = 2;
}
