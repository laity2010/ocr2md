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
  const sealed=sourcePattern.exec(markdown);
  assert(sealed,'original MinerU metadata comment missing or malformed');
  const compressed=Buffer.from(sealed[2].replace(/\s+/g,''),'base64url');
  let restored: string;
  try { restored=gunzipSync(compressed).toString('utf8'); }
  catch {throw new Error('MINERUJSON_MD_INVALID: corrupt source metadata');}
  assert(sha(Buffer.from(restored,'utf8'))===sealed[1], 'original JSON SHA-256 mismatch');
  const data=parseMineru(restored);
  // A leaf root can become a CONTAINER without fabricating a second OCR
  // payload: its original content starts at a body alias pNbMs0. The alias
  // is an editable CMD anchor, but is stripped ONLY in the validated,
  // ephemeral inverse view. The physical parent source remains authoritative.
  const bodyRoots=new Set<string>();
  const bodyLine=/^((?: {0,3}>[ \t]?)* {0,3})<!-- cmd:block:v1 id="(p\d+b\d+)s0" origin="(p\d+b\d+)" role="body" -->[ \t]*$/gm;
  const allBlocks=[...markdown.matchAll(/^(?: {0,3}>[ \t]?)* {0,3}<!-- cmd:block:v1 id="(p\d+b\d+(?:s\d+(?:\.\d+)*)?)"((?: [a-z]+="[^"]*")*) -->[ \t]*$/gm)];
  markdown=markdown.replace(bodyLine,(line,_indent,logicalRoot,physicalRoot,offset)=>{
    const previous=[...allBlocks].reverse().find(m=>m.index!<offset);
    const physical=/^p(\d+)b(\d+)$/.exec(physicalRoot);
    const block=data.pdf_info[Number(physical?.[1])]?.para_blocks[Number(physical?.[2])];
    const actualRoot=previous?.[1]===logicalRoot;
    const rootOrigin=/ origin="(p\d+b\d+)"/.exec(previous?.[2]||'')?.[1]||previous?.[1];
    assert(actualRoot&&rootOrigin===physicalRoot&&block&&!(block.blocks||[]).length&&
      !bodyRoots.has(physicalRoot), 'invalid parent body-s0 alias');
    bodyRoots.add(physicalRoot);
    return ''; // physical parent text remains in its original source scope
  });
  // A PDF parent with no own body (its OCR content lives wholly in native
  // child paths) can be flattened into another logical parent. Its visible
  // pNbM marker is replaced by an explicit provenance record. Only here, in
  // the ephemeral audit view, reconstruct that original parent marker so
  // strict sealed-OCR verification still checks every native child and text.
  const absorbedParents=new Map<string,string>();
  const absorbedChildren=new Map<string,Set<number>>();
  const absorbedLine=/^((?: {0,3}>[ \t]?)* {0,3})<!-- cmd:absorbed-parent:v1 origin="(p\d+b\d+)" target="(p\d+b\d+)" -->[ \t]*$/gm;
  markdown=markdown.replace(absorbedLine,(_line,prefix,physicalRoot,physicalTarget)=>{
    const source=/^p(\d+)b(\d+)$/.exec(physicalRoot)!;
    const target=/^p(\d+)b(\d+)$/.exec(physicalTarget)!;
    const sourceBlock=data.pdf_info[Number(source[1])]?.para_blocks[Number(source[2])];
    const destination=data.pdf_info[Number(target[1])]?.para_blocks[Number(target[2])];
    assert(source[1]===target[1]&&physicalRoot!==physicalTarget&&
      sourceBlock?.blocks?.length&&destination&&
      !absorbedParents.has(physicalRoot),
      'invalid absorbed original parent or target');
    absorbedParents.set(physicalRoot,physicalTarget);
    absorbedChildren.set(physicalRoot,new Set());
    return `${prefix}<!-- cmd:block:v1 id="${physicalRoot}" -->`;
  });
  assert(!markdown.includes('<!-- cmd:absorbed-parent:v1'),
    'malformed or duplicate absorbed parent annotation');
  // A PDF reorder renumbers the public p/b/s IDs but never changes original
  // OCR provenance. In this ephemeral comparison view, resolve the parent's
  // logical label to its immutable physical root first, and then resolve all
  // native child paths through that same parent. Do not accept arbitrary
  // child aliases pointing at a different sealed parent.
  const logicalParent=new Map<string,string>();
  const cmdLine=/^(\s*(?:>\s*)*<!-- cmd:block:v1 )id="(p\d+b\d+(?:s\d+(?:\.\d+)*)?)"((?: [a-z]+="[^"]*")* -->)[ \t]*$/gm;
  for(const match of markdown.matchAll(cmdLine)){
    const id=/^p(\d+)b(\d+)$/.exec(match[2]);
    if(!id)continue;
    const origin=/ origin="(p\d+b\d+)"/.exec(match[3]);
    const original=origin?.[1]||match[2];
    logicalParent.set(match[2],original);
  }
  markdown=markdown.replace(cmdLine,(_all,prefix,id,rest)=>{
    const match=/^p(\d+)b(\d+)(?:s(\d+(?:\.\d+)*))?$/.exec(id)!;
    const origin=/ origin="(p\d+b\d+(?:s\d+(?:\.\d+)*)?)"/.exec(rest);
    if(!origin)return `${prefix}id="${id}"${rest}`;
    const physical=/^p(\d+)b(\d+)(?:s(\d+(?:\.\d+)*))?$/.exec(origin[1])!;
    const page=Number(match[1]),logicalB=Number(match[2]),physicalB=Number(physical[2]);
    const originalCount=data.pdf_info[page]?.para_blocks.length||0;
    const physicalBlock=data.pdf_info[page]?.para_blocks[physicalB];
    assert(physical[1]===match[1]&&physicalBlock,'invalid renumbered PBS provenance');
    const logicalRoot=`p${page}b${logicalB}`;
    const parentPhysical=logicalParent.get(logicalRoot)||logicalRoot;
    const nativeChild=match[3]!==undefined&&physical[3]!==undefined;
    if(nativeChild){
      const originalRoot=`p${physical[1]}b${physical[2]}`;
      const absorbedTarget=absorbedParents.get(originalRoot);
      if(absorbedTarget){
        const index=Number(physical[3]);
        const original=data.pdf_info[page].para_blocks[physicalB];
        const seen=absorbedChildren.get(originalRoot)!;
        // Once an original parent is absorbed its children may be split out
        // and reattached elsewhere. The sealed native origin, not the first
        // absorption target, determines whether this is the SAME OCR atom.
        assert(parentPhysical&&physical[3]&&!physical[3].includes('.')&&
          original.blocks?.[index]&&!seen.has(index),
          'absorbed child has invalid original OCR identity or target');
        seen.add(index);
      }else assert(origin[1].startsWith(parentPhysical+'s')&&
        physical[3]===match[3], 'renumbered native child changed physical lineage');
      return `${prefix}id="${origin[1]}"${rest.replace(origin[0],'')}`;
    }
    if(match[3]!==undefined&&physical[3]===undefined&&parentPhysical!==logicalRoot)
      return `${prefix}id="${parentPhysical}s${match[3]}"${rest}`;
    if(match[3]===undefined&&physical[3]===undefined&&
      (logicalB<originalCount||(physicalBlock.blocks||[]).length>0))
      return `${prefix}id="${origin[1]}"${rest.replace(origin[0],'')}`;
    return `${prefix}id="${id}"${rest}`;
  });
  // A native child split into an independent page-end parent still belongs
  // to its original *physical* absorbed parent in the sealed OCR evidence.
  // Account for that atom before checking completeness, without rewriting
  // its visible root/ID. The second pass validates the promoted marker.
  for(const match of markdown.matchAll(cmdLine)){
    const root=/^p(\d+)b(\d+)$/.exec(match[2]);
    const physical=/ origin="(p\d+b\d+s\d+)"/.exec(match[3]);
    if(!root||!physical)continue;
    const native=/^p(\d+)b(\d+)s(\d+)$/.exec(physical[1])!;
    const originalRoot=`p${native[1]}b${native[2]}`;
    if(!absorbedChildren.has(originalRoot))continue;
    const seen=absorbedChildren.get(originalRoot)!;
    const index=Number(native[3]);
    const original=data.pdf_info[Number(native[1])]?.para_blocks[Number(native[2])];
    assert(root[1]===native[1]&&original?.blocks?.[index]&&!seen.has(index),
      'promoted absorbed child must preserve one original native OCR identity');
    seen.add(index);
  }
  for(const [root,seen] of absorbedChildren){
    const physical=/^p(\d+)b(\d+)$/.exec(root)!;
    const count=data.pdf_info[Number(physical[1])].para_blocks[Number(physical[2])].blocks!.length;
    assert(seen.size===count&&[...Array(count).keys()].every(i=>seen.has(i)),
      'absorbed parent lost one or more original OCR children');
  }
  const origins: {id:string;origin:string;page:number;parent:number;child:number;source:number}[]=[];
  const promotions: {id:string;origin:string;page:number;parent:number;child:number;newParent:number}[]=[];
  const restoredRoots: {id:string;origin:string;page:number;source:number;newParent:number}[]=[];
  markdown=markdown.replace(/^(\s*(?:>\s*)*<!-- cmd:block:v1 )id="(p\d+b\d+(?:s\d+(?:\.\d+)*)?)"((?: [a-z]+="[^"]*")* -->)[ \t]*$/gm,
    (_all,prefix,id,rest)=>{
      const match=/^p(0|[1-9]\d*)b(0|[1-9]\d*)(?:s((?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))*))?$/.exec(id);
      assert(match, 'invalid CMD PBS identity');
      const provenance=/ origin="(p\d+b\d+(?:s\d+(?:\.\d+)*)?)"/.exec(rest);
      if(provenance){
        const promoted=/^p(0|[1-9]\d*)b(0|[1-9]\d*)s(0|[1-9]\d*)$/.exec(provenance[1]);
        if(promoted){
          assert(match[3]===undefined&&promoted[1]===match[1]&&
            rest.indexOf(' origin="')===rest.lastIndexOf(' origin="'),
            'invalid promoted PBS provenance');
          promotions.push({id,origin:provenance[1],page:Number(match[1]),
            parent:Number(promoted[2]),child:Number(promoted[3]),newParent:Number(match[2])});
          return `${prefix}p="${promoted[1]}" b="${promoted[2]}" s="${promoted[3]}"${rest.replace(provenance[0],'')}`;
        }
        const original=/^p(0|[1-9]\d*)b(0|[1-9]\d*)$/.exec(provenance[1]);
        if(original&&match[3]===undefined){
          assert(original[1]===match[1]&&
            rest.indexOf(' origin="')===rest.lastIndexOf(' origin="'),
            'invalid independently restored root provenance');
          restoredRoots.push({id,origin:provenance[1],page:Number(match[1]),
            source:Number(original[2]),newParent:Number(match[2])});
          return `${prefix}p="${original[1]}" b="${original[2]}"${rest.replace(provenance[0],'')}`;
        }
        assert(original&&match[3]!==undefined&&!match[3].includes('.')&&
          original[1]===match[1]&&rest.indexOf(' origin="')===rest.lastIndexOf(' origin="'),
          'invalid original PBS provenance');
        origins.push({id,origin:provenance[1],page:Number(match[1]),
          parent:Number(match[2]),child:Number(match[3]),source:Number(original[2])});
        // Validate the sealed source at its original physical position. The
        // renamed id remains intact in the editor, and the original JSON is
        // never rewritten or reordered by this reversible projection.
        return `${prefix}p="${original[1]}" b="${original[2]}"${rest.replace(provenance[0],'')}`;
      }
      return `${prefix}p="${match[1]}" b="${match[2]}"${match[3]===undefined?'':` s="${match[3]}"`}${rest}`;
    });
  const source=sourcePattern.exec(markdown);
  assert(source&&source[1]===sealed[1], 'original MinerU metadata comment changed');
  // A user-corrected child is not an invented MinerU native child.
  // Check both original OCR ownership and the exact free child slot.
  const seenOrigins=new Set<string>(),seenAliases=new Set<string>();
  for(const alias of origins){
    assert(!seenOrigins.has(alias.origin)&&!seenAliases.has(alias.id),
      'duplicate PBS provenance');
    seenOrigins.add(alias.origin);seenAliases.add(alias.id);
    const blocks=data.pdf_info[alias.page]?.para_blocks;
    const parent=blocks?.[alias.parent],sourceBlock=blocks?.[alias.source];
    assert(parent&&sourceBlock&&!(sourceBlock.blocks||[]).length&&
      alias.child>=(parent.blocks||[]).length,
      'structural correction has no corresponding sealed original OCR blocks');
  }
  for(const alias of origins){
    const nativeCount=(data.pdf_info[alias.page].para_blocks[alias.parent].blocks||[]).length;
    assert(alias.child===nativeCount+(bodyRoots.has(`p${alias.page}b${alias.parent}`)?1:0)+
      origins.filter(a=>a.page===alias.page&&a.parent===alias.parent&&a.child<alias.child).length,
      'corrected children must follow original native paths without holes');
  }

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
  // A reviewed PBS child (id=...sN origin=pNbM) carries its original OCR
  // physical *whole Markdown scope* to the new visible position. To verify
  // content against the immutable MinerU archive, reconstruct ONLY an
  // ephemeral original-order view. Never mutate the user's edited Markdown,
  // bypass body validation, or reserialize the sealed OCR metadata.
  // A promoted native child retains the OCR child identity while the
  // visible Markdown scope moves to its page's end. Validate exact original
  // ownership and monotone page-end numbering before inverse projection.
  for(const promoted of promotions){
    const page=data.pdf_info[promoted.page];
    const block=page?.para_blocks[promoted.parent];
    assert(block?.blocks?.[promoted.child]&&
      promoted.newParent>=page.para_blocks.length&&
      !promotions.some(other=>other!==promoted&&other.origin===promoted.origin),
      'promoted child has invalid original OCR source or new page index');
    const expected=page.para_blocks.length+[...promotions,...restoredRoots].filter(other=>
      other.page===promoted.page&&other.newParent<promoted.newParent).length;
    assert(promoted.newParent===expected,'promoted parents must use consecutive page-end PBS IDs');
  }
  // Reviewed child sourced from a whole original OCR parent can be
  // independently restored as a page-end logical parent. Its immutable root
  // provenance is verified exactly as strictly as native child promotion.
  for(const root of restoredRoots){
    const blocks=data.pdf_info[root.page]?.para_blocks;
    assert(blocks?.[root.source]&&!(blocks[root.source].blocks||[]).length&&
      root.newParent>=blocks.length&&
      !restoredRoots.some(other=>other!==root&&other.origin===root.origin),
      'restored root must refer to one original leaf OCR parent');
    const expected=blocks.length+[...promotions,...restoredRoots].filter(other=>
      other.page===root.page&&other.newParent<root.newParent).length;
    assert(root.newParent===expected,'restored page-end parent identity must be consecutive');
  }
  for(const alias of origins){
    const blocks=data.pdf_info[alias.page]?.para_blocks||[];
    assert(alias.source+1<blocks.length,
      'relocated original parent requires a following source anchor');
    const findRoot=(text:string,p:number,b:number)=>[
      ...text.matchAll(blockStart)].filter(m=>
        Number(m[2]??m[4])===p&&Number(m[3]??m[5])===b);
    const moved=findRoot(visible,alias.page,alias.source);
    assert(moved.length===1,'relocated original parent marker is not unique');
    const starts=[...visible.matchAll(blockStart)];
    const index=starts.findIndex(m=>m.index===moved[0].index);
    assert(index>=0&&index<starts.length-1,'relocated source scope missing next marker');
    const start=starts[index].index!,end=starts[index+1].index!;
    const segment=visible.slice(start,end);
    assert(!segment.includes('<!-- minerujson:page:v1:'),'relocated scope crosses sealed page evidence');
    const remaining=visible.slice(0,start)+visible.slice(end);
    const following=findRoot(remaining,alias.page,alias.source+1);
    assert(following.length===1,'relocated source successor missing');
    const destination=following[0].index!;
    visible=remaining.slice(0,destination)+segment+remaining.slice(destination);
  }
  // Inverse-project corrected root -> child -> independent root source
  // *before* native promotion, preserving every original Markdown scope.
  for(const root of [...restoredRoots].sort((a,b)=>a.page-b.page||a.source-b.source)){
    const anchors=[...visible.matchAll(blockStart)];
    const matches=anchors.filter(m=>Number(m[2]??m[4])===root.page&&
      Number(m[3]??m[5])===root.source);
    assert(matches.length===1,'restored OCR parent scope is not unique');
    const index=anchors.findIndex(m=>m.index===matches[0].index);
    const from=matches[0].index!;
    const following=anchors[index+1]?.index??visible.length;
    let end=following;
    const evidence=visible.slice(from,end).search(/<!-- minerujson:(?:page|source):v1:/);
    if(evidence>=0)end=from+evidence;
    assert(end>from,'restored source has empty scope');
    const segment=visible.slice(from,end),remaining=visible.slice(0,from)+visible.slice(end);
    const next=[...remaining.matchAll(blockStart)].find(m=>
      Number(m[2]??m[4])===root.page&&Number(m[3]??m[5])===root.source+1);
    assert(next?.index!==undefined,'original OCR root successor missing');
    visible=remaining.slice(0,next.index)+segment+remaining.slice(next.index);
  }
  // Inverse-project promoted children only for the strict original-OCR
  // round-trip comparison. The editable Markdown keeps its new child->parent
  // page-end location; the recovered native path is never persisted.
  for(const promoted of [...promotions].sort((a,b)=>a.page-b.page||a.parent-b.parent||a.child-b.child)){
    const allMarkers=()=>[...visible.matchAll(blockStart),...visible.matchAll(cmdChildAudit)]
      .sort((a,b)=>a.index!-b.index!);
    const child=allMarkers().filter(m=>{
      const line=m[0];
      return line.includes(`p="${promoted.page}" b="${promoted.parent}" s="${promoted.child}"`);
    });
    assert(child.length===1,'promoted child source must be unique');
    const start=child[0].index!;
    const next=allMarkers().find(m=>m.index!>start);
    let end=next?.index??visible.length;
    const evidence=visible.slice(start,end).search(/<!-- minerujson:(?:page|source):v1:/);
    if(evidence>=0)end=start+evidence;
    assert(end>start,'promoted child has empty source scope');
    const segment=visible.slice(start,end);
    const remaining=visible.slice(0,start)+visible.slice(end);
    const root=[...remaining.matchAll(blockStart)].filter(m=>
      Number(m[2]??m[4])===promoted.page&&Number(m[3]??m[5])===promoted.parent);
    assert(root.length===1,'promoted source original parent missing');
    const all=[...remaining.matchAll(blockStart),...remaining.matchAll(cmdChildAudit)]
      .sort((a,b)=>a.index!-b.index!);
    const succeeding=all.find(m=>m.index!>root[0].index!&&(
      m[0].includes(`p="${promoted.page}" b="${promoted.parent}" s="${promoted.child+1}"`)||
      (m[2]!==undefined||m[4]!==undefined)&&(
        Number(m[2]??m[4])>promoted.page||
        Number(m[2]??m[4])===promoted.page&&Number(m[3]??m[5])>promoted.parent)));
    assert(succeeding,'promoted original source successor missing');
    visible=remaining.slice(0,succeeding.index!)+segment+remaining.slice(succeeding.index!);
  }
  // A formerly absorbed native child may later be split into its own root,
  // then attached to a DIFFERENT logical parent. After resolving its immutable
  // origin= and undoing any promotion, reconstruct the physical child scopes
  // next to their original OCR parent in the audit copy only. The edited CMD
  // document is never rewritten by this inverse projection.
  for(const [originalRoot] of absorbedParents){
    const original=/^p(\d+)b(\d+)$/.exec(originalRoot)!;
    const nativeCount=data.pdf_info[Number(original[1])].para_blocks[Number(original[2])].blocks?.length||0;
    // Reinsert in reverse to preserve original OCR native-child order.
    for(let childNo=nativeCount-1;childNo>=0;childNo--){
      const anchorName=`p="${original[1]}" b="${original[2]}" s="${childNo}"`;
      const markers=()=>[...visible.matchAll(blockStart),...visible.matchAll(cmdChildAudit)]
        .sort((a,b)=>a.index!-b.index!);
      const originalChild=markers().filter(m=>m[0].includes(anchorName));
      assert(originalChild.length===1,'absorbed original child scope is not unique');
      const from=originalChild[0].index!;
      const next=markers().find(m=>m.index!>from);
      let to=next?.index??visible.length;
      const evidence=visible.slice(from,to).search(/<!-- minerujson:(?:page|source):v1:/);
      if(evidence>=0)to=from+evidence;
      assert(to>from,'absorbed native child has empty scope');
      const segment=visible.slice(from,to),remaining=visible.slice(0,from)+visible.slice(to);
      const root=[...remaining.matchAll(blockStart)].filter(m=>
        Number(m[2]??m[4])===Number(original[1])&&
        Number(m[3]??m[5])===Number(original[2]));
      assert(root.length===1,'absorbed original root must be unique');
      const following=[...remaining.matchAll(blockStart),...remaining.matchAll(cmdChildAudit)]
        .sort((a,b)=>a.index!-b.index!)
        .find(m=>m.index!>root[0].index!);
      assert(following,'absorbed original child has no following audit anchor');
      visible=remaining.slice(0,following.index!)+segment+remaining.slice(following.index!);
    }
  }
  // WCP PDF label sorting moves COMPLETE parent scopes in the editable CMD
  // source, not their immutable OCR identities. Before validating against the
  // sealed MinerU archive, reconstruct the original page-local block order
  // in this ephemeral string only. Native children travel with their parent;
  // page/document evidence stays at its original boundary. A missing,
  // duplicate or foreign anchor is still rejected by the checks below.
  for(let pageNo=0;pageNo<data.pdf_info.length;pageNo++){
    const all=[...visible.matchAll(blockStart)];
    const page=all.filter(m=>Number(m[2]??m[4])===pageNo);
    const count=data.pdf_info[pageNo].para_blocks.length;
    if(page.length!==count||page.length<2)continue;
    const order=page.map(m=>Number(m[3]??m[5]));
    if(order.every((n,i)=>n===i))continue;
    assert(new Set(order).size===count&&order.every(n=>n>=0&&n<count),
      'page-local reordered PBS must preserve every original OCR block');
    const from=page[0].index!,last=page.at(-1)!.index!;
    const following=all.find(m=>m.index!>last)?.index??visible.length;
    const pageEvidence=visible.indexOf('<!-- minerujson:page:v1:',last);
    const end=Math.min(following,pageEvidence<0?visible.length:pageEvidence);
    assert(end>last,'reordered page scope crosses an OCR boundary');
    const pieces=page.map((m,i)=>visible.slice(m.index!,page[i+1]?.index??end));
    assert(pieces.every(x=>!(/<!-- minerujson:(?:page|source|document-meta|discarded):v1/.test(x))),
      'reordered PBS scope contains sealed OCR evidence');
    visible=visible.slice(0,from)+order.map((_,i)=>pieces[order.indexOf(i)]).join('')+
      visible.slice(end);
  }
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
