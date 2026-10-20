/** OCR2MD WP0 — three public APIs; no editor state and no filesystem I/O. */
import {createHash} from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import {toString as mdastText} from 'mdast-util-to-string';
import type {Root, RootContent} from 'mdast';

const VERSION = '0.1.0';
const parser = unified().use(remarkParse).use(remarkGfm);
const writer = unified().use(remarkStringify).use(remarkGfm);
const blockStart = /<!-- minerujson:block:v1:(\d+):(\d+) -->/g;
const blockEnd = (page: number, index: number) => `<!-- minerujson:end:v1:${page}:${index} -->`;
const sourcePattern = /<!-- minerujson:source:v1:([a-f0-9]{64})\n([a-zA-Z0-9_\-\n]+)\n-->\s*$/;

type Span = {type?: string; content?: string; html?: string; image_path?: string; [key: string]: unknown};
type Line = {spans?: Span[]};
type Block = {type?: string; level?: number; lines?: Line[]; blocks?: Block[]; [key: string]: unknown};
type Page = {para_blocks: Block[]; [key: string]: unknown};
type Mineru = {pdf_info: Page[]; [key: string]: unknown};
type Slot = {node: RootContent; spans: Span[]; kind: 'text'|'html'|'image'|'code'|'literal'};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('MINERUJSON_MD_INVALID: ' + message);
}
function sha(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function parseMineru(json: string): Mineru {
  const parsed: unknown = JSON.parse(json);
  assert(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'JSON must be an object');
  const data = parsed as Mineru;
  assert(Array.isArray(data.pdf_info), 'pdf_info must be an array');
  for (const page of data.pdf_info) assert(Array.isArray(page.para_blocks), 'para_blocks missing');
  return data;
}
function spansFrom(block: Block): Span[] {
  return (block.lines || []).flatMap(line => (line.spans || []).filter(span => typeof span.content === 'string'));
}
function spanString(block: Block): string {
  const lines = (block.lines || []).map(l => (l.spans || []).map(s =>
    typeof s.content === 'string' ? s.content : '').join('')).filter(Boolean);
  return lines.join(' ');
}
function childrenOfText(value: string): RootContent {
  return {type: 'paragraph', children: [{type: 'text',value}]};
}
function textSlot(block: Block, heading = false): Slot {
  const value = spanString(block);
  return {kind: 'text',spans: spansFrom(block),node: heading
    ? {type:'heading',depth: Math.max(1,Math.min(6, Number(block.level) || 1)) as 1|2|3|4|5|6,
       children:[{type:'text',value}]}
    : childrenOfText(value)};
}
function contentSlot(block: Block, kind: 'image'|'chart'|'table'): Slot[] {
  const sub = block.blocks || [];
  const slots: Slot[] = [];
  const ordered = kind === 'image'
    ? ['image_body','image_caption','image_footnote']
    : kind === 'chart' ? ['chart_body','chart_caption','chart_footnote']
    : ['table_caption','table_body','table_footnote'];
  for (const name of ordered) {
    for (const item of sub.filter(b => b.type === name)) {
      const spans = (item.lines || []).flatMap(l => l.spans || []);
      const main = spans.find(s => s.type === kind || (kind === 'chart' && s.type === 'chart'));
      if (main?.html && kind === 'table') {
        slots.push({kind:'html',spans:[main],node:{type:'html',value:main.html}});
      } else if (main?.image_path) {
        slots.push({kind:'image',spans:[main],node:{type:'paragraph',children:[{
          type:'image',url:main.image_path,alt:kind}]} });
      } else if (spanString(item)) {
        slots.push(textSlot(item));
      }
    }
  }
  if (!slots.length) slots.push({kind:'literal',spans:[],node:childrenOfText(`[MinerU ${kind}: source metadata only]`)});
  return slots;
}
function project(block: Block): Slot[] {
  switch (block.type) {
    case 'title': return [textSlot(block,true)];
    case 'text': case 'ref_text': case 'list': case 'index': return [textSlot(block)];
    case 'interline_equation': return [{kind:'code',spans:spansFrom(block),node:{type:'code',lang:'math',value:spanString(block)}}];
    case 'image': case 'table': case 'chart': return contentSlot(block,block.type);
    default:
      return [textSlot(block)];
  }
}
function serialize(nodes: RootContent[]): string {
  return writer.stringify({type:'root',children:nodes}).trim();
}
function canonical(value: RootContent): unknown {
  // AST type/content, not parser position; compare semantic markdown syntax.
  const {position: _position, data: _data, ...rest} = value;
  return rest;
}
function distinctCanonical(nodes: RootContent[]): string {
  return JSON.stringify(nodes.map(canonical));
}
function semantic(node: RootContent): string {
  if (node.type === 'code' || node.type === 'html') return node.value;
  return mdastText(node);
}
function patchText(spans: Span[], before: string, after: string): void {
  if (before === after) return;
  assert(spans.length > 0,'edited block has no editable MinerU text spans');
  // Original blocks can have line separators; find the smallest changed range.
  let begin = 0;
  while (begin < before.length && begin < after.length && before[begin] === after[begin]) begin++;
  let tail = 0;
  while (tail < before.length - begin && tail < after.length - begin &&
         before[before.length-1-tail] === after[after.length-1-tail]) tail++;
  const end = before.length - tail;
  const newPart = after.slice(begin,after.length-tail);
  // A single-span block admits all edits. Multi-span edits are supported only
  // when their changed range stays inside one original content span.
  if (spans.length === 1) {
    spans[0].content = after;
    return;
  }
  // Span offsets account for line joins as emitted by spanString().
  // Recreate offsets by looking for each original span sequentially.
  let search = 0;
  for (const span of spans) {
    const content = span.content || '';
    const start = before.indexOf(content, search);
    assert(start >= 0,'span projection differs from source');
    const stop = start + content.length;
    if (begin >= start && end <= stop) {
      span.content = content.slice(0,begin-start) + newPart + content.slice(end-start);
      return;
    }
    search = stop;
  }
  throw new Error('MINERUJSON_MD_INVALID: edit crosses multiple OCR spans; cannot preserve positional mapping');
}
function patchSlot(oldSlot: Slot, next: RootContent, block: Block): void {
  const previous = oldSlot.node;
  assert(previous.type === next.type,'block syntax type cannot be changed without a MinerU mapping');
  if (oldSlot.kind === 'literal') {
    assert(semantic(previous) === semantic(next),'metadata-only placeholder cannot be edited');
    return;
  }
  if (oldSlot.kind === 'html') {
    assert(next.type === 'html','table must remain standard HTML table');
    oldSlot.spans[0].html = next.value;
    return;
  }
  if (oldSlot.kind === 'image') {
    assert(next.type === 'paragraph' && next.children.length === 1 && next.children[0].type === 'image',
           'image must remain a markdown image');
    const base = previous;
    assert(base.type === 'paragraph' && base.children[0]?.type === 'image', 'internal image');
    assert(next.children[0].alt === base.children[0].alt,'image alt text has no MinerU mapping');
    oldSlot.spans[0].image_path = next.children[0].url;
    return;
  }
  if (oldSlot.kind === 'code') {
    assert(next.type === 'code' && next.lang === 'math','formula must remain a standard fenced math code block');
    patchText(oldSlot.spans,semantic(previous),next.value);
    return;
  }
  assert(next.type === 'paragraph' || next.type === 'heading','text must remain paragraph or heading');
  assert(next.children.length === 1 && next.children[0].type === 'text',
         'formatted/nested text cannot be projected back to plain OCR spans');
  patchText(oldSlot.spans, semantic(previous), semantic(next));
  if (previous.type === 'heading' && next.type === 'heading') block.level = next.depth;
}


/** API 1: MinerU JSON -> a standard CommonMark+GFM document with HTML comments. */
export function toMarkdown(input: string | Mineru): string {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  const data = parseMineru(raw);
  const pieces: string[] = [];
  for (const [pageIndex,page] of data.pdf_info.entries()) {
    for (const [index,block] of page.para_blocks.entries()) {
      const slots = project(block);
      const body = serialize(slots.map(s => s.node));
      // Anchor identifiers are regular HTML comments, not custom Markdown syntax.
      pieces.push(`<!-- minerujson:block:v1:${pageIndex}:${index} -->\n\n${body}\n\n${blockEnd(pageIndex,index)}`);
    }
  }
  const bytes = Buffer.from(raw, 'utf8');
  const encoded = gzipSync(bytes).toString('base64url');
  const wrapped = encoded.match(/.{1,100}/g)?.join('\n') || '';
  pieces.push(`<!-- minerujson:source:v1:${sha(bytes)}\n${wrapped}\n-->`);
  return pieces.join('\n\n') + '\n';
}

/** API 2: validated .minerujson.md -> MinerU JSON. Unedited documents return byte-identical source text. */
export function toMineruJSON(markdown: string): string {
  const source = sourcePattern.exec(markdown);
  assert(source,'original MinerU metadata comment missing or malformed');
  const compressed = Buffer.from(source[2].replace(/\s+/g,''),'base64url');
  let restored: string;
  try { restored = gunzipSync(compressed).toString('utf8'); }
  catch {throw new Error('MINERUJSON_MD_INVALID: corrupt source metadata');}
  assert(sha(Buffer.from(restored,'utf8'))===source[1], 'original JSON SHA-256 mismatch');
  const data = parseMineru(restored);
  const visible = markdown.slice(0,source.index).trim();
  const markers = [...visible.matchAll(blockStart)];
  const total = data.pdf_info.reduce((n,page)=>n+page.para_blocks.length,0);
  assert(markers.length === total, `block anchor count ${markers.length} != ${total}`);
  let cursor = 0;
  let counter = 0;
  let modified = false;
  for (const [pageNo,page] of data.pdf_info.entries()) {
    for (const [blockNo,block] of page.para_blocks.entries()) {
      const start = markers[counter++];
      assert(start.index !== undefined,'missing block marker');
      assert(visible.slice(cursor,start.index).trim()==='', 'unexpected content outside anchored blocks');
      assert(Number(start[1])===pageNo && Number(start[2])===blockNo, 'block order/anchor changed');
      const end = blockEnd(pageNo,blockNo);
      const from = start.index+start[0].length;
      const endAt = visible.indexOf(end,from);
      assert(endAt >= 0,'end anchor missing');
      const fragment = visible.slice(from,endAt).trim();
      cursor = endAt+end.length;
      const oldSlots = project(block);
      const oldFragment = serialize(oldSlots.map(x => x.node));
      if (fragment === oldFragment) continue;
      const parsed = parser.parse(fragment) as Root;
      assert(parsed.children.length === oldSlots.length,'block element count changed');
      for (let i=0;i<parsed.children.length;i++) {
        const prev = oldSlots[i];
        const next = parsed.children[i];
        if (distinctCanonical([prev.node])!==distinctCanonical([next])) {
          patchSlot(prev,next,block);
        }
      }
      modified = true;
    }
  }
  assert(visible.slice(cursor).trim()==='', 'unexpected extra content after last anchor');
  return modified ? JSON.stringify(data,null,2) : restored;
}

/** API 3: public package version. */
export function version(): string {return VERSION;}
