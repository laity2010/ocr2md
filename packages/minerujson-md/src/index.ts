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
// One audited reader accepts both the shipped legacy source labels and new
// CMD PBS v1 anchors. New documents always serialize as CMD PBS; old bytes
// remain valid inputs, including native child tags and original OCR evidence.
const blockStart = /^((?: {0,3}>[ \t]?)*)(?: {0,3})(?:<!-- minerujson:block:v1:(\d+):(\d+) -->|<!-- cmd:block:v1 p="(\d+)" b="(\d+)"((?: (?:bc|seq|type|role|review|note)="[^"]*")*) -->)[ \t]*$/gm;
const cmdChildStart = /^<!-- cmd:block:v1 p="(\d+)" b="(\d+)" s="(\d+(?:\.\d+)*)"((?: [a-z]+="[^"]*")*) -->[ \t]*(?:\r?\n){0,2}/gm;
// BC audit also sees child tags inside nested Markdown blockquotes. The
// block parser strips the quote prefix before strict native child validation.
const cmdChildAudit = /^(?: {0,3}>[ \t]?)* {0,3}<!-- cmd:block:v1 p="(\d+)" b="(\d+)" s="(\d+(?:\.\d+)*)"((?: [a-z]+="[^"]*")*) -->[ \t]*$/gm;
const cmdAllowed = new Set(['bc','seq','type','role','review','note']);
const cmdEnum = /^[a-z][a-z0-9_-]{0,63}$/;
const cmdBC = /^bc-[a-z0-9][a-z0-9-]{0,63}$/;
const cmdUnsigned = /^(0|[1-9]\d*)$/;
function parseCMDFields(raw: string): Record<string,string> {
  const fields: Record<string,string>={};
  for(const match of raw.matchAll(/ ([a-z]+)="([^"]*)"/g)){
    const key=match[1],value=match[2];
    assert(cmdAllowed.has(key)&&!Object.hasOwn(fields,key),`invalid CMD property: ${key}`);
    assert(!/[<>]/.test(value),'unsafe CMD property');
    fields[key]=value;
  }
  assert((fields.bc===undefined)===(fields.seq===undefined),'incomplete BC membership');
  if(fields.bc!==undefined)assert(cmdBC.test(fields.bc),'invalid BC ID');
  if(fields.seq!==undefined)assert(cmdUnsigned.test(fields.seq)&&Number.isSafeInteger(Number(fields.seq)),'invalid BC sequence');
  for(const key of ['type','role','review'])
    if(fields[key]!==undefined)assert(cmdEnum.test(fields[key]),`invalid CMD ${key}`);
  if(fields.note!==undefined)assert(fields.note.length<=240,'CMD note too long');
  return fields;
}
function verifyBCRelations(entries: {id:string;fields:Record<string,string>}[]){
  const groups=new Map<string,{id:string;seq:number;type?:string}[]>();
  for(const entry of entries){
    if(!entry.fields.bc)continue;
    const group=groups.get(entry.fields.bc)||[];
    group.push({id:entry.id,seq:Number(entry.fields.seq),type:entry.fields.type});
    groups.set(entry.fields.bc,group);
  }
  for(const [bc,group] of groups){
    const seq=new Set(group.map(x=>x.seq));
    assert(seq.size===group.length&&seq.has(0)&&group.every(x=>x.seq<group.length),`invalid ${bc} member sequence`);
    const head=group.find(x=>x.seq===0);
    assert(group.every(x=>!x.type||x.type===head?.type),`conflicting ${bc} type`);
  }
}

const sourcePattern = /<!-- minerujson:source:v1:([a-f0-9]{64})\n([a-zA-Z0-9_\-\n]+)\n-->\s*$/;

type Span = {type?: string; content?: string; html?: string; image_path?: string; [key: string]: unknown};
type Line = {spans?: Span[]};
type Block = {type?: string; level?: number; lines?: Line[]; blocks?: Block[]; [key: string]: unknown};
type Page = {para_blocks: Block[]; preproc_blocks?: Block[]; discarded_blocks?: Block[]; [key: string]: unknown};
type Mineru = {pdf_info: Page[]; [key: string]: unknown};
type Slot = {node: RootContent; spans: Span[]; kind: 'text'|'html'|'image'|'code'|'literal'; path?: number[]};

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
    for (const [index,item] of sub.map((b,i)=>[i,b] as const).filter(([,b]) => b.type === name)) {
      const path=[index];
      const spans = (item.lines || []).flatMap(l => l.spans || []);
      const main = spans.find(s => s.type === kind || (kind === 'chart' && s.type === 'chart'));
      if (main?.html && kind === 'table') {
        slots.push({kind:'html',path,spans:[main],node:{type:'html',value:main.html}});
      } else if (main?.image_path) {
        slots.push({kind:'image',path,spans:[main],node:{type:'paragraph',children:[{
          type:'image',url:main.image_path,alt:kind}]} });
      } else if (spanString(item)) {
        slots.push({...textSlot(item),path});
      }
    }
  }
  if (!slots.length) slots.push({kind:'literal',spans:[],node:childrenOfText(`[MinerU ${kind}: source metadata only]`)});
  return slots;
}
function project(block: Block,pageIndex=0,index=0,audited=false): Slot[] {
  switch (block.type) {
    case 'title': return [textSlot(block,true)];
    case 'text': case 'ref_text': case 'list': case 'index': return [textSlot(block)];
    case 'interline_equation': return [{kind:'code',spans:spansFrom(block),node:{type:'code',lang:'math',value:spanString(block)}}];
    case 'image': case 'table': case 'chart': {
      const slots=contentSlot(block,block.type);
      return audited&&slots.every(s=>s.kind==='literal')
        ? [{kind:'literal',spans:[],node:{type:'html',value:auditBlock('unmapped',pageIndex,index,block)}}]
        : slots;
    }
    default:
      return audited
        ? [{kind:'literal',spans:[],node:{type:'html',value:auditBlock('unmapped',pageIndex,index,block)}}]
        : [textSlot(block)];
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


/** Audit-only HTML comments. The original JSON remains authoritative in the
 * source comment; the readable copies preserve type, bbox, OCR text and ALL
 * original fields without introducing any new rendered Markdown paragraphs.
 * Escape prohibited HTML-comment sequences (and angle brackets) as JSON
 * Unicode escapes; JSON decoding exactly reproduces the original payload.
 */
const AUDIT_VERSION = '<!-- minerujson:audit:v1:complete -->';
function safeJson(value: unknown, pretty = false): string {
  return JSON.stringify(value,null,pretty ? 2 : undefined)
    .replace(/</g,'\\u003c').replace(/>/g,'\\u003e')
    .replace(/--/g,'\\u002d\\u002d');
}
function textOf(block: Block): string {
  const own=spanString(block);
  const nested=(block.blocks || []).map(textOf).filter(Boolean).join(' | ');
  const media=(block.lines || []).flatMap(l=>l.spans || [])
    .flatMap(s=>[s.image_path,s.html].filter(v=>typeof v==='string'));
  return [own,nested,...media].filter(Boolean).join(' | ');
}
function auditBlock(kind: 'discarded'|'preproc-diff'|'unmapped', pageIndex: number,
                    index: number, block: Block): string {
  // The compact summary is for human inspection, the JSON for exhaustive
  // evidence. The summary itself must not carry unescaped HTML delimiters.
  const summary={pdfPage:pageIndex+1,type:block.type || 'unknown',
    bbox:block.bbox??null,text:textOf(block)};
  return `<!-- minerujson:${kind}:v1:${pageIndex}:${index}\nsummary: ${safeJson(summary,true)}\noriginal: ${safeJson(block)}\n-->`;
}
function pageAudit(page: Page,pageIndex: number): string {
  const evidence: string[]=[];
  const pageMeta: Record<string,unknown>={};
  for(const [key,value] of Object.entries(page))
    if(key!=='para_blocks'&&key!=='preproc_blocks'&&key!=='discarded_blocks')pageMeta[key]=value;
  evidence.push(`<!-- minerujson:page:v1:${pageIndex}\n${safeJson(pageMeta)}\n-->`);
  for(const [index,block] of (page.discarded_blocks||[]).entries())
    evidence.push(auditBlock('discarded',pageIndex,index,block));
  // preproc_blocks are normally identical to para_blocks. Keep the 1:1
  // duplicates only in the embedded source, surface every differing block.
  for(const [index,block] of (page.preproc_blocks||[]).entries())
    if(JSON.stringify(block)!==JSON.stringify(page.para_blocks[index]))
      evidence.push(auditBlock('preproc-diff',pageIndex,index,block));
  return evidence.join('\n\n');
}

// CMD child markers preserve the exact native MinerU `blocks[]` ancestry.
// They are independent source navigation anchors, not Markdown body content.
function childMarkers(block: Block,pageIndex: number,blockIndex: number):
  {path: string; type: string; tag: string}[] {
  const output: {path:string;type:string;tag:string}[]=[];
  const visit=(node: Block,path: number[])=>{
    for(const [index,child] of (node.blocks||[]).entries()){
      const next=[...path,index],key=next.join('.');
      const type=child.type||'unknown';
      assert(/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(type),'invalid child OCR type');
      output.push({path:key,type,
        tag:`<!-- cmd:block:v1 id="p${pageIndex}b${blockIndex}s${key}" -->`});
      visit(child,next);
    }
  };
  visit(block,[]);
  return output;
}
function stripChildMarkers(fragment: string,block: Block,pageIndex: number,blockIndex: number): string {
  const marker=/^<!-- minerujson:subblock:v1:(\d+):(\d+):(\d+(?:\.\d+)*)(?: type="([a-zA-Z_][a-zA-Z0-9_-]*)")?(?: id="(p\d+b\d+s\d+(?:\.\d+)*)")? -->[ \t]*(?:\r?\n){0,2}/gm;
  const legacy=[...fragment.matchAll(marker)].map(m=>({page:Number(m[1]),block:Number(m[2]),
    path:m[3],type:m[4]??null,id:m[5]??null}));
  const native=[...fragment.matchAll(cmdChildStart)].map(m=>{
    const page=Number(m[1]),block=Number(m[2]),path=m[3];
    assert(Number.isSafeInteger(page)&&Number.isSafeInteger(block)&&
      path.split('.').every(x=>Number.isSafeInteger(Number(x))), 'invalid child PBS path');
    const fields=parseCMDFields(m[4]);
    // Relation metadata is for CMD, never an OCR child `type` assertion.
    return {page,block,path,type:null,id:`p${page}b${block}s${path}`,fields};
  });
  const found=[...legacy,...native];
  const expected=childMarkers(block,pageIndex,blockIndex);
  // Legacy documents may have none or untyped markers. Once annotated,
  // require every native path exactly once, and validate declared OCR type.
  if(found.length){
    assert(found.length===expected.length,
      `block ${pageIndex}:${blockIndex} child anchors incomplete`);
    const lookup=new Map(expected.map(item=>[item.path,item.type]));
    const seen=new Set<string>();
    for(const item of found){
      assert(item.page===pageIndex&&item.block===blockIndex&&lookup.has(item.path)&&
        !seen.has(item.path)&&(!item.type||item.type===lookup.get(item.path))&&
        (!item.id||item.id===`p${pageIndex}b${blockIndex}s${item.path}`),
        `block ${pageIndex}:${blockIndex} child anchor invalid`);
      seen.add(item.path);
    }
    fragment=fragment.replace(marker,'').replace(cmdChildStart,'').trim();
  }
  assert(!fragment.includes('minerujson:subblock:v1:')&&!fragment.includes('<!-- cmd:block:v1'),
    'invalid nested child anchor');
  return fragment;
}
/** API 1: MinerU JSON -> a standard CommonMark+GFM document with HTML comments. */
export function toMarkdown(input: string | Mineru): string {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  const data = parseMineru(raw);
  const meta: Record<string,unknown>={};
  for(const [key,value] of Object.entries(data))if(key!=='pdf_info')meta[key]=value;
  const pieces: string[] = [AUDIT_VERSION,
    `<!-- minerujson:document-meta:v1\n${safeJson(meta)}\n-->`];
  for (const [pageIndex,page] of data.pdf_info.entries()) {
    pieces.push(pageAudit(page,pageIndex));
    for (const [index,block] of page.para_blocks.entries()) {
      const slots = project(block,pageIndex,index,true);
      const children=childMarkers(block,pageIndex,index);
      const byPath=new Map(children.map(c=>[c.path,c.tag]));
      const projectedPaths=new Set(slots.filter(s=>s.path).map(s=>s.path!.join('.')));
      // For mapped OCR content, locate the child marker immediately BEFORE
      // that Markdown node, not in an unrelated group at the parent header.
      // Empty OCR children still get visible source comments (and no invented
      // heading/prose). Top-level parent identity and original bytes remain.
      const missing=children.filter(c=>!projectedPaths.has(c.path)).map(c=>c.tag);
      const sections=slots.map(slot=>[
        ...(slot.path?[byPath.get(slot.path.join('.'))!]:[]),
        serialize([slot.node])].join('\n\n'));
      pieces.push([`<!-- cmd:block:v1 id="p${pageIndex}b${index}" -->`,...missing,
        ...sections].join('\n\n'));
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
  // v1's public identity is the same canonical PBS ID shown in PDF and AG.
  // Internally normalize this one annotation syntax for the existing proven
  // strict parent/child round-trip validator. Never modify the user's source.
  markdown=markdown.replace(/^(\s*(?:>\s*)*<!-- cmd:block:v1 )id="(p\d+b\d+(?:s\d+(?:\.\d+)*)?)"((?: [a-z]+="[^"]*")* -->)[ \t]*$/gm,
    (_all,prefix,id,rest)=>{
      const match=/^p(0|[1-9]\d*)b(0|[1-9]\d*)(?:s((?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))*))?$/.exec(id);
      assert(match, 'invalid CMD PBS identity');
      return `${prefix}p="${match[1]}" b="${match[2]}"${match[3]===undefined?'':` s="${match[3]}"`}${rest}`;
    });
  const source = sourcePattern.exec(markdown);
  assert(source,'original MinerU metadata comment missing or malformed');
  const compressed = Buffer.from(source[2].replace(/\s+/g,''),'base64url');
  let restored: string;
  try { restored = gunzipSync(compressed).toString('utf8'); }
  catch {throw new Error('MINERUJSON_MD_INVALID: corrupt source metadata');}
  assert(sha(Buffer.from(restored,'utf8'))===source[1], 'original JSON SHA-256 mismatch');
  const data = parseMineru(restored);
  // CMD WP6 PDF bbox overrides are presentation metadata outside MinerU OCR.
  // Accept only one strict footer immediately preceding the sealed archive;
  // never interpret its JSON as a Markdown block or silently tolerate garbage.
  let visible = markdown.slice(0,source.index).trim();
  const footer=/<!-- cmd:pdf-bbox:v1 ([^\n]*?) -->$/;
  const found=footer.exec(visible);
  if(found){
    let record: unknown;
    try{record=JSON.parse(found[1]);}catch{throw new Error('MINERUJSON_MD_INVALID: malformed PDF bbox footer');}
    const value=record as {schema?:unknown;boxes?:unknown};
    assert(value&&typeof value==='object'&&!Array.isArray(value)&&value.schema===1&&
      value.boxes&&typeof value.boxes==='object'&&!Array.isArray(value.boxes)&&
      Object.keys(value).join(',')==='schema,boxes', 'invalid PDF bbox schema');
    for(const [id,box] of Object.entries(value.boxes)){
      assert(/^p\d+b\d+(?:s\d+(?:\.\d+)*)?$/.test(id), 'invalid PDF bbox PBS identity');
      assert(Array.isArray(box)&&box.length===4&&box.every(n=>typeof n==='number'&&Number.isFinite(n)),
        'invalid PDF bbox coordinates');
    }
    visible=visible.slice(0,found.index).trim();
  }
  assert(!visible.includes('<!-- cmd:pdf-bbox:v1 '),'duplicate or misplaced PDF bbox footer');
  const markers = [...visible.matchAll(blockStart)];
  const total = data.pdf_info.reduce((n,page)=>n+page.para_blocks.length,0);
  assert(markers.length === total, `block anchor count ${markers.length} != ${total}`);
  let modified = false;
  const audited=visible.startsWith(AUDIT_VERSION);
  const meta: Record<string,unknown>={};
  for(const [key,value] of Object.entries(data))if(key!=='pdf_info')meta[key]=value;
  const documentHeader=audited
    ? `${AUDIT_VERSION}\n\n<!-- minerujson:document-meta:v1\n${safeJson(meta)}\n-->` : '';
  const blocks=data.pdf_info.flatMap((page,pageNo)=>page.para_blocks.map((block,blockNo)=>
    ({pageNo,blockNo,block})));
  const bcEntries: {id:string;fields:Record<string,string>}[]=[];
  for(const m of markers)if(m[6]!==undefined)
    bcEntries.push({id:`p${m[4]}b${m[5]}`,fields:parseCMDFields(m[6])});
  for(const child of visible.matchAll(cmdChildAudit))
    bcEntries.push({id:`p${child[1]}b${child[2]}s${child[3]}`,fields:parseCMDFields(child[4])});
  verifyBCRelations(bcEntries);
  const auditBetween=(start: number,end: number): string=>audited
    ? data.pdf_info.slice(start,end).map((page,index)=>pageAudit(page,start+index)).join('\n\n')
    : '';
  const beforeFirst=auditBetween(0,blocks[0]?.pageNo===undefined?data.pdf_info.length:blocks[0].pageNo+1);
  assert(visible.slice(0,markers[0]?.index??visible.length).trim()===
    [documentHeader,beforeFirst].filter(Boolean).join('\n\n').trim(),
    'document/page evidence before first block was modified');
  for(let i=0;i<blocks.length;i++){
    const {pageNo,blockNo,block}=blocks[i];
    const start=markers[i];
    assert(start.index!==undefined,'missing block marker');
    assert(Number(start[2]??start[4])===pageNo && Number(start[3]??start[5])===blockNo,
      'block order/anchor changed');
    if(start[6]!==undefined)parseCMDFields(start[6]);
    const next=markers[i+1];
    const nextPage=next?blocks[i+1].pageNo:data.pdf_info.length;
    const gap=visible.slice(start.index+start[0].length,next?.index??visible.length).trim();
    // Page evidence belongs BETWEEN blocks, never to the preceding block.
    // Include skipped empty pages and the final page, if any.
    const evidence=auditBetween(pageNo+1,Math.min(nextPage+1,data.pdf_info.length));
    if(evidence)assert(gap.endsWith(evidence),'page evidence missing, changed or misplaced');
    let fragment=(evidence?gap.slice(0,-evidence.length):gap).trim();
    // Quote prefixes around an OCR block express Markdown presentation, not
    // a new MinerU source identity. Strip only the anchored block's outer
    // quote depth, while leaving independent page evidence untouched.
    const outerDepth=(start[1].match(/>/g)||[]).length;
    if(outerDepth){
      const stripLine=(line: string): string=>{
        if(!line.trim())return '';
        let value=line;
        for(let depth=0;depth<outerDepth;depth++){
          const match=/^ {0,3}>[ \t]?/.exec(value);
          assert(match,`block ${pageNo}:${blockNo} has inconsistent quote depth`);
          value=value.slice(match[0].length);
        }
        return value;
      };
      fragment=fragment.split('\n').map(stripLine).join('\n').trim();
    }
    // Strip the independently navigable native child paths before checking
    // chapter tags and Markdown body syntax; the markers are not OCR text.
    fragment=stripChildMarkers(fragment,block,pageNo,blockNo);
    // A chapter marker is an editor annotation on its own heading, not
    // text to be projected back into the original MinerU OCR span.
    if(block.type==='title'){
      const prefix=/^<!-- ocr2md:chapter:v1 id="mineru:(\d+):(\d+):0" independent="[01]" -->\s*/.exec(fragment);
      if(prefix){
        assert(Number(prefix[1])===pageNo&&Number(prefix[2])===blockNo,
          'chapter marker belongs to another MinerU block');
        fragment=fragment.slice(prefix[0].length).trim();
      }
    }
    const oldSlots=project(block,pageNo,blockNo,audited);
    const oldFragment=serialize(oldSlots.map(x=>x.node));
    if(fragment===oldFragment)continue;
    // Earlier V6 files used a placeholder instead of a metadata-only block.
    if(audited&&oldSlots.every(s=>s.kind==='literal')&&
      fragment===serialize(project(block,pageNo,blockNo,false).map(s=>s.node)))continue;
    const parsed=parser.parse(fragment) as Root;
    if(distinctCanonical(parsed.children)===distinctCanonical(oldSlots.map(s=>s.node)))continue;
    assert(parsed.children.length===oldSlots.length,'block element count changed');
    for(let n=0;n<parsed.children.length;n++){
      const prev=oldSlots[n],nextSlot=parsed.children[n];
      if(distinctCanonical([prev.node])!==distinctCanonical([nextSlot])){
        assert(prev.node.type===nextSlot.type,`block ${pageNo}:${blockNo} expected ${prev.node.type}, got ${nextSlot.type}`);
        patchSlot(prev,nextSlot,block);
      }
    }
    modified=true;
  }
  return modified ? JSON.stringify(data,null,2) : restored;
}

/** API 3: public package version. */
export function version(): string {return VERSION;}
