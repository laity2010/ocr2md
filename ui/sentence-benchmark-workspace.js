/** Sentence Lab presentation only. Four independent, read-only CM6 views of
 * ONE immutable CMD Markdown snapshot. Never edit/save through these views.
 * Layout owner is the same Dockview library/theme as Main workspace.js.
 */
import {createDockview, themeAbyss} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import {EditorView, Decoration, WidgetType, GutterMarker, gutter, lineNumbers} from '@codemirror/view';
import {EditorState, StateEffect, StateField, RangeSet} from '@codemirror/state';
import {markdown, markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {obsidianMarkdown} from './obsidian-markdown.js';
import {obsidianSourceSyntax} from './obsidian-source-syntax.js';
import {obsidianHeadingMarkers} from './obsidian-heading-markers.js';
import {sentenceSourceFolding,foldSourceInitially,revealFoldedSource} from './sentence-benchmark-source-folding.js';
import {readCMDBlockChains, parseCMDBlockTag} from './cmd-block-chains.js';

const markEffect=StateEffect.define();
const markField=StateField.define({
  create:()=>Decoration.none,
  update(value,transaction){
    for(const effect of transaction.effects)if(effect.is(markEffect))return effect.value;
    return transaction.docChanged?value.map(transaction.changes):value;
  },
  provide:field=>EditorView.decorations.from(field)
});
// Source gutter data follows the CURRENT visible CMD projection. The labels
// always describe positions in the immutable original source, even when
// "分歧块" hides unrelated blocks and inserts display-only separators.
const sourceLinesEffect=StateEffect.define();
const sourceLinesField=StateField.define({
  create:()=>[],
  update(value,tr){
    for(const effect of tr.effects)if(effect.is(sourceLinesEffect))return effect.value;
    return value;
  }
});
const blockMarkersEffect=StateEffect.define();
const blockMarkersField=StateField.define({
  create:()=>RangeSet.empty,
  update(value,tr){
    for(const effect of tr.effects)if(effect.is(blockMarkersEffect))return effect.value;
    return tr.docChanged?value.map(tr.changes):value;
  }
});
class BlockGutterMarker extends GutterMarker {
  constructor(id){super();this.id=id;
    this.elementClass=id.includes('s')?'ocr-sb-child-block':'ocr-sb-parent-block';}
  eq(other){return other instanceof BlockGutterMarker&&other.id===this.id;}
  toDOM(){
    const span=document.createElement('span');
    span.className='ocr-sb-block-id';
    span.textContent=this.id;
    span.title='CMD 文本块 '+this.id;
    span.setAttribute('aria-label','文本块 '+this.id);
    return span;
  }
}
const ORIGINAL_GUTTERS=[
  sourceLinesField,blockMarkersField,
  lineNumbers({formatNumber:(n,state)=>{
    const original=state.field(sourceLinesField)[n-1];
    return original===null?'·':String(original??n);
  }}),
  gutter({
    class:'ocr-sb-block-gutter',
    markers:view=>view.state.field(blockMarkersField),
    initialSpacer:()=>new BlockGutterMarker('p0b0')
  })
];
const RO=Object.freeze([
  EditorState.readOnly.of(true), EditorView.editable.of(false),
  EditorView.lineWrapping,
  markdown({base:markdownLanguage}),
  obsidianMarkdown,obsidianSourceSyntax,
  syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),
  markField
]);
const titles={original:'CMD 原文 · 只读',intl:'Intl.Segmenter',
  'sentence-splitter':'sentence-splitter','wink-nlp':'winkNLP'};
const ids=Object.keys(titles);
const parentOf=id=>/^p\d+b\d+/.exec(id)?.[0]??id;

function sectionsFor(md){
  // CMD's authoritative PBS/BC atoms are read-only. All child atoms inherit
  // their parent block identity for the disagreement block filter.
  let atoms=[];
  try {
    // A sealed CMD document follows the official PBS/BC reader.
    atoms=readCMDBlockChains(md).atoms.slice();
  } catch {
    // Imported non-CMD Markdown may contain ordinary example anchors but
    // does not carry sealed MinerU provenance: read them only as locations.
    // This never writes a replacement document or claims a valid CMD tree.
    // Use the CMD tag parser rather than a strict full-line regex: labels
    // carrying a reviewed lb="m" / lb="i" decision are still PBS blocks.
    const anchor=/^<!-- cmd:block:v1[^\n]* -->$/gm;
    for(const match of md.matchAll(anchor)){
      const tag=parseCMDBlockTag(match[0]);
      if(tag)atoms.push({id:tag.id,from:match.index});
    }
  }
  atoms.sort((a,b)=>a.from-b.from);
  if(atoms.length){
    const spans=[];
    if(atoms[0].from>0)spans.push({id:'preamble',from:0,to:atoms[0].from});
    let last=null;
    for(const atom of atoms){
      const id=parentOf(atom.id);
      if(!last||last.id!==id){
        if(last)last.to=atom.from;
        last={id,from:atom.from,to:md.length};spans.push(last);
      }
    }
    return spans;
  }
  // Plain Markdown samples without PBS labels: paragraph-as-block fallback.
  const spans=[];
  const blank=/(?:\r?\n)[ \t]*(?:\r?\n)+/g;
  let start=0,index=0,m;
  while((m=blank.exec(md))){
    if(m.index>start)spans.push({id:'paragraph-'+(++index),from:start,to:m.index});
    start=blank.lastIndex;
  }
  if(start<md.length)spans.push({id:'paragraph-'+(++index),from:start,to:md.length});
  return spans;
}
// For arbitration views a "block" means the exact PBS atom (including sN
// children), not its parent group. Two disputed children may share a parent;
// adopting one must not leave that child visible beside its pending sibling.
// These are read-only slices of the original CMD, never rewritten segments.
function pbsAtomSections(md){
  const atoms=[];
  let from=0;
  for(const line of md.split('\n')){
    const tag=parseCMDBlockTag(line);
    if(tag)atoms.push({id:tag.id,from,to:md.length});
    from+=line.length+1;
  }
  for(let i=0;i<atoms.length-1;i++)atoms[i].to=atoms[i+1].from;
  return atoms;
}
function breakPositions(run){
  return run?.positions instanceof Set?run.positions:new Set();
}
function getDifferences(runs){
  const valid=[...runs.values()].filter(run=>run?.positions instanceof Set);
  const candidates=new Set(valid.flatMap(r=>[...r.positions]));
  return [...candidates].filter(p=>valid.some(v=>v.positions.has(p)!==valid[0].positions.has(p)));
}
function containsReviewableText(md,section){
  // Candidate blocks must contain prose, not just CMD metadata, LaTeX,
  // HTML tables, code, footnote definitions or an empty parent anchor.
  if(section.id==='preamble')return false;
  const body=md.slice(section.from,section.to)
    .replace(/<!--[\s\S]*?-->/g,'')
    .replace(/(?:^|\n)\s*(?:\x60{3,}|~{3,})[\s\S]*?(?:\n\s*(?:\x60{3,}|~{3,})|$)/g,'');
  return body.split('\n').some(raw=>{
    const line=raw.trim();
    if(!line||/^(?:#\s|>\s|!\[|\[\^|\||<|\$\$|\\\[|\\\]|\\begin|[-*]\s)/.test(line))return false;
    if(/^\d+\.\s+/.test(line))return false;
    const cleaned=line.replace(/\$[^$]+\$/g,'')
      .replace(/!\[[^\]]*\]\([^)]*\)/g,'').trim();
    // Never impose a minimum prose length here: even a short omitted text
    // block (such as "Oops.") is a legitimate zero-sentence finding.
    return /[\p{L}\p{N}]/u.test(cleaned);
  });
}
function sectionsWithoutSentences(md,sections,runs){
  const usable=[...runs.values()].filter(run=>run?.lossless&&Array.isArray(run.value?.sentences));
  if(!usable.length)return [];
  const covered=usable.flatMap(run=>run.value.sentences.flatMap(s=>s.fragments||[]))
    .sort((a,b)=>a.from-b.from);
  return sections.filter(section=>containsReviewableText(md,section)&&
    !covered.some(part=>part.from<section.to&&part.to>section.from));
}
export function createSourceProjection(md,runs,mode,reviewedBlocks={},disputedIds=null){
  const sections=sectionsFor(md);
  if(mode==='full')return {doc:md,
    ranges:[{sourceFrom:0,sourceTo:md.length,viewFrom:0,viewTo:md.length}],
    blocks:sections.map(s=>s.id),disagreements:getDifferences(runs)};
  const diffs=getDifferences(runs);
  const atoms=(mode==='disagree'||mode==='arbitrated')?pbsAtomSections(md):[];
  const reviewable=Array.isArray(disputedIds)&&atoms.length>0;
  const pending=new Set(disputedIds??[]);
  const selected=mode==='disagree'?
    (reviewable?atoms.filter(s=>pending.has(s.id)&&
      reviewedBlocks[s.id]?.status!=='arbitrated'):
      sections.filter(s=>diffs.some(p=>p>s.from&&p<=s.to))):
    mode==='no-sentence'?sectionsWithoutSentences(md,sections,runs):
    mode==='arbitrated'?(atoms.length?atoms:sections).filter(s=>
      reviewedBlocks[s.id]?.status==='arbitrated'||
      (!atoms.length&&Object.entries(reviewedBlocks).some(([id,item])=>
        item.status==='arbitrated'&&parentOf(id)===s.id))):[];
  let doc='',ranges=[];
  for(const section of selected){
    // Separator is view-only. It never changes the original CMD document.
    if(doc)doc+='\n\n';
    const start=doc.length;
    doc+=md.slice(section.from,section.to);
    ranges.push({sourceFrom:section.from,sourceTo:section.to,
      viewFrom:start,viewTo:doc.length});
  }
  return {doc,ranges,blocks:selected.map(s=>s.id),disagreements:diffs};
}
function toView(projection,pos){
  for(const r of projection.ranges)if(pos>=r.sourceFrom&&pos<=r.sourceTo)
    return Math.min(r.viewTo,r.viewFrom+pos-r.sourceFrom);
  return null;
}
function toSource(projection,pos){
  for(const r of projection.ranges)if(pos>=r.viewFrom&&pos<=r.viewTo)
    return Math.min(r.sourceTo,r.sourceFrom+pos-r.viewFrom);
  const after=projection.ranges.find(r=>pos<r.viewFrom);
  return after?.sourceFrom??projection.ranges.at(-1)?.sourceTo??0;
}

/** The picker uses the literal PBS p-prefix already present in CMD tags.
 * No origin lookup, pageIndex conversion, or generated PDF page numbers.
 */
function pbsPageTargets(md){
  const lines=md.split('\n'),starts=sourceLineStarts(md),tags=[];
  for(let i=0;i<lines.length;i++){
    const tag=parseCMDBlockTag(lines[i]);
    const match=/^p(\d+)b\d+(?:s\d+)*$/.exec(tag?.id||'');
    if(match)tags.push({key:'p'+match[1],index:Number(match[1]),id:tag.id,
      sourceLine:i+1,sourceOffset:starts[i]});
  }
  const pages=new Map(),locations=[];
  for(let i=0;i<tags.length;i++){
    const tag=tags[i];
    const end=i+1<tags.length?tags[i+1].sourceLine-1:lines.length;
    let contentLine=null;
    for(let j=tag.sourceLine;j<end;j++){
      const text=lines[j].trim();
      if(!text||text.startsWith('<!--')||text.startsWith('[MinerU '))continue;
      contentLine=j+1;break;
    }
    const line=contentLine??tag.sourceLine;
    const candidate={key:tag.key,index:tag.index,sourceLine:line,
      sourceOffset:starts[line-1],blockId:tag.id,hasContent:contentLine!==null};
    locations.push({key:tag.key,sourceOffset:tag.sourceOffset,
      contentOffset:candidate.sourceOffset,contentLine:line,blockId:tag.id});
    if(!pages.has(tag.key)||(!pages.get(tag.key).hasContent&&candidate.hasContent))
      pages.set(tag.key,candidate);
  }
  return {pages:[...pages.values()].sort((a,b)=>a.index-b.index)
    .map(({hasContent,index,...page})=>page),locations};
}
function sourceLineStarts(md){
  const starts=[0];
  for(let i=0;i<md.length;i++)if(md.charCodeAt(i)===10)starts.push(i+1);
  return starts;
}
function originalLineNumber(starts,offset){
  let lo=0,hi=starts.length;
  while(lo<hi){
    const mid=(lo+hi)>>>1;
    if(starts[mid]<=offset)lo=mid+1;else hi=mid;
  }
  return lo; // 1-based, including the newline boundary.
}
function visibleSourceOffset(projection,viewOffset){
  for(const range of projection.ranges){
    if(viewOffset>=range.viewFrom&&viewOffset<range.viewTo)
      return range.sourceFrom+(viewOffset-range.viewFrom);
  }
  return null; // Synthetic separator between two visible disagreement blocks.
}
function visibleBlockOffset(projection,sourceOffset){
  for(const range of projection.ranges){
    if(sourceOffset>=range.sourceFrom&&sourceOffset<range.sourceTo)
      return range.viewFrom+(sourceOffset-range.sourceFrom);
  }
  return null;
}
/** Build gutter display data solely from CMD source. No text or annotations
 * are changed, and no off-screen/filtered block gains a fabricated label.
 */
function updateOriginalGutters(view,md,projection){
  const starts=sourceLineStarts(md),displayed=[];
  for(let n=1;n<=view.state.doc.lines;n++){
    const line=view.state.doc.line(n);
    const source=visibleSourceOffset(projection,line.from);
    displayed.push(source===null?null:originalLineNumber(starts,source));
  }
  let atoms=[];
  try{atoms=readCMDBlockChains(md).atoms;}
  catch{
    // Unsealed test snippets have no MinerU source envelope; only display
    // IDs of syntactically valid CMD tags already present in the input.
    // This is a read-only display fallback, not a CMD structure mutation.
    let from=0;
    for(const line of md.split('\n')){
      const parsed=parseCMDBlockTag(line);
      if(parsed)atoms.push({id:parsed.id,from});
      from+=line.length+1;
    }
  }
  const markers=[];
  const occupied=new Set();
  for(const atom of atoms){
    const at=visibleBlockOffset(projection,atom.from);
    if(at===null)continue;
    const line=view.state.doc.lineAt(at);
    if(at!==line.from||occupied.has(line.from))continue;
    occupied.add(line.from);
    markers.push(new BlockGutterMarker(atom.id).range(line.from));
  }
  view.dispatch({effects:[
    sourceLinesEffect.of(displayed),
    blockMarkersEffect.of(RangeSet.of(markers.sort((a,b)=>a.from-b.from),true))
  ]});
}

class BreakWidget extends WidgetType {
  constructor(label,style,title){super();this.label=label;this.style=style;this.title=title;}
  eq(other){return other instanceof BreakWidget &&
    this.label===other.label&&this.style===other.style&&this.title===other.title;}
  toDOM(){
    const marker=document.createElement('span');
    marker.className='ocr-sb-boundary '+this.style;
    marker.textContent=this.label;marker.title=this.title;
    marker.setAttribute('aria-label',this.title);
    return marker;
  }
  ignoreEvent(){return false;}
}

class ComparePane {
  constructor(id,owner){
    this.id=id;this.owner=owner;
    this.element=document.createElement('div');
    this.element.className='ocr-sb-pane ocr-cm-source';
    this.element.dataset.engine=id;
    const toolbar=document.createElement('div');toolbar.className='ocr-sb-pane-toolbar';
    const label=document.createElement('strong');label.textContent=titles[id];
    const state=document.createElement('span');state.className='ocr-sb-pane-status';
    state.textContent='只读';
    toolbar.append(label);
    if(id==='original'){
      const select=document.createElement('select');select.id='view-mode';
      select.setAttribute('aria-label','原文显示范围');
      select.add(new Option('全文','full'));
      select.add(new Option('分歧块','disagree'));
      select.add(new Option('无分句块','no-sentence'));
      select.add(new Option('已仲裁','arbitrated'));
      toolbar.append(select);
      const pdfSelect=document.createElement('select');
      pdfSelect.id='pbs-page-select';
      pdfSelect.setAttribute('aria-label','PBS p 编码定位');
      pdfSelect.title='按当前块类型筛选中已有的 PBS p 编码定位';
      pdfSelect.add(new Option('无 PBS p',''));
      pdfSelect.disabled=true;
      toolbar.append(pdfSelect);
    }else{
      const adoption=document.createElement('label');
      adoption.className='ocr-sb-engine-adopt';
      adoption.title='在左窗点击有分歧的 PBS 子块后，采用此引擎的整块句界';
      const box=document.createElement('input');
      box.type='checkbox';box.className='ocr-sb-engine-adopt-check';
      box.setAttribute('aria-label','采用 '+titles[id]+' 当前文本块的句界');
      box.disabled=true;
      box.onchange=()=>this.owner.adoptEngine(this.id,box.checked);
      adoption.append(box,document.createTextNode('采用'));
      toolbar.append(adoption);
      this.adoptCheck=box;
    }
    toolbar.append(state);this.status=state;
    this.editorHost=document.createElement('div');this.editorHost.className='ocr-sb-pane-editor';
    this.element.append(toolbar,this.editorHost);
    this.view=null;this.suppressUntil=0;this.lastGesture=0;
  }
  init(){
    this.view=new EditorView({parent:this.editorHost,doc:'',
      extensions:this.id==='original'?[...RO,...ORIGINAL_GUTTERS,obsidianHeadingMarkers,...sentenceSourceFolding]:RO});
    const scroller=this.view.scrollDOM;
    // A fresh user gesture always takes precedence over a previous pane-sync
    // animation. Otherwise a swipe immediately after unfolding a block could
    // move only one engine pane until the 700ms suppression expires.
    const gesture=()=>{this.lastGesture=performance.now();this.suppressUntil=0;};
    for(const event of ['wheel','touchstart','pointerdown','keydown'])
      scroller.addEventListener(event,gesture,{passive:true});
    scroller.addEventListener('scroll',()=>{
      if(performance.now()<this.suppressUntil||performance.now()-this.lastGesture>2500)return;
      this.owner.receiveScroll(this.id);
    },{passive:true});
    this.view.dom.addEventListener('pointerup',event=>{
      const pos=this.view.posAtCoords({x:event.clientX,y:event.clientY});
      if(Number.isInteger(pos))this.owner.receivePosition(this.id,pos);
    });
    if(this.id==='original'){
      const gutter=this.view.dom.querySelector('.ocr-sb-block-gutter');
      this.gutterObserver=new ResizeObserver(()=>this.schedulePickerAlign());
      this.gutterObserver.observe(this.element);
      if(gutter)this.gutterObserver.observe(gutter);
      const lineNumbers=this.view.dom.querySelector('.cm-lineNumbers');
      if(lineNumbers)this.gutterObserver.observe(lineNumbers);
      this.schedulePickerAlign();
    }
  }
  schedulePickerAlign(){
    if(this.id!=='original')return;
    if(this.pickerFrame)cancelAnimationFrame(this.pickerFrame);
    this.pickerFrame=requestAnimationFrame(()=>{
      this.pickerFrame=null;
      this.alignPagePicker();
      // CM6 may shrink its line-number gutter one paint after a filter change.
      this.pickerFrame=requestAnimationFrame(()=>{
        this.pickerFrame=null;this.alignPagePicker();
      });
    });
  }
  alignPagePicker(){
    if(this.id!=='original'||!this.view)return;
    const gutter=this.view.dom.querySelector('.ocr-sb-block-gutter');
    const toolbar=this.element.querySelector('.ocr-sb-pane-toolbar');
    if(!gutter||!toolbar)return;
    const left=gutter.getBoundingClientRect().left-toolbar.getBoundingClientRect().left;
    if(Number.isFinite(left)&&left>=0){
      const next=left.toFixed(1)+'px';
      if(toolbar.style.getPropertyValue('--ocr-sb-block-left')!==next)
        toolbar.style.setProperty('--ocr-sb-block-left',next);
    }
  }
  setBlockGutterWidth(md){
    if(this.id!=='original')return;
    const lengths=[...md.matchAll(/<!-- cmd:block:v1 id="(p\d+b\d+(?:s\d+)?)"/g)]
      .map(match=>match[1].length);
    const width=Math.max(56,Math.ceil(Math.max(4,...lengths)*7.2+17));
    this.element.style.setProperty('--ocr-sb-block-width',width+'px');
    this.schedulePickerAlign();
  }
  layout(){this.view?.requestMeasure();this.schedulePickerAlign();}
  dispose(){
    if(this.pickerFrame)cancelAnimationFrame(this.pickerFrame);
    this.gutterObserver?.disconnect();this.view?.destroy();this.view=null;
  }
  updateDoc(next){
    if(!this.view)return;
    if(this.view.state.doc.toString()!==next){
      this.view.dispatch({changes:{from:0,to:this.view.state.doc.length,insert:next}});
    }
  }
}
export function createSentenceCompareWorkspace(container,{onPosition=()=>{},onAdopt=()=>{}}={}){
  const panes=new Map();
  let projection={doc:'',ranges:[],blocks:[],disagreements:[]};
  let runs=new Map(),gold={},md='',mode='full',focus=null,reviewedBlocks={};
  let selectedBlockId=null,disputedIds=new Set();
  let acceptedPositions=[],adoptionEnabled=false;
  let pbsPages=[],pbsLocations=[];
  let availablePages=[];
  let lastSync=0,api=null;
  const owner={receivePosition:(...args)=>api?.receivePosition(...args),
    receiveScroll:(...args)=>api?.receiveScroll(...args),
    adoptEngine:(...args)=>onAdopt(...args)};
  const dockview=createDockview(container,{
    theme:themeAbyss,
    createComponent:({name})=>{
      const pane=new ComparePane(name,owner);panes.set(name,pane);return pane;
    }
  });
  const original=dockview.addPanel({id:'original',component:'original',title:titles.original});
  const intl=dockview.addPanel({id:'intl',component:'intl',title:titles.intl,
    position:{referencePanel:'original',direction:'right'}});
  const splitter=dockview.addPanel({id:'sentence-splitter',component:'sentence-splitter',
    title:titles['sentence-splitter'],position:{referencePanel:'intl',direction:'below'}});
  const wink=dockview.addPanel({id:'wink-nlp',component:'wink-nlp',title:titles['wink-nlp'],
    position:{referencePanel:'sentence-splitter',direction:'below'}});
  for(const panel of [original,intl,splitter,wink]){
    panel.group.header.hidden=true;panel.group.relayout();
  }
  const eachPane=callback=>{for(const [id,pane] of panes)if(pane.view)callback(pane,id);};
  function refreshPageOptions(){
    const select=panes.get('original')?.element.querySelector('#pbs-page-select');
    if(!select)return;
    select.replaceChildren();
    if(!availablePages.length){
      select.add(new Option('无 PBS p',''));
      select.disabled=true;
      return;
    }
    select.disabled=false;
    for(const page of availablePages){
      const item=new Option(page.key,page.key);
      item.title=page.key+' · CMD 原文第 '+page.sourceLine+
        ' 行 · '+page.blockId;
      select.add(item);
    }
  }
  function filterPageOptions(){
    if(mode==='full')return pbsPages;
    const selected=new Map();
    for(const row of pbsLocations){
      if(!projection.ranges.some(r=>
        row.sourceOffset>=r.sourceFrom&&row.sourceOffset<r.sourceTo))continue;
      if(!selected.has(row.key))selected.set(row.key,{
        key:row.key,sourceOffset:row.contentOffset,
        sourceLine:row.contentLine,blockId:row.blockId
      });
    }
    return [...selected.values()].sort((a,b)=>
      Number(a.key.slice(1))-Number(b.key.slice(1)));
  }
  function updatePageSelection(source){
    const select=panes.get('original')?.element.querySelector('#pbs-page-select');
    if(!select||select.disabled||!Number.isInteger(source))return;
    // Do not select a p that the active filter excludes.
    let row=null;
    for(const item of pbsLocations){
      if(item.sourceOffset>source)break;
      if(availablePages.some(page=>page.key===item.key))row=item;
    }
    if(!row)row=availablePages[0];
    if(row?.key&&select.value!==row.key)select.value=row.key;
  }
  function showDecorations(){
    eachPane((pane,id)=>{
      const marks=[];
      const entries=id==='original'?[...runs.entries()]:[[id,runs.get(id)]];
      const byPos=new Map();
      for(const [engine,run] of entries){
        for(const pos of breakPositions(run)){
          const offset=toView(projection,pos);
          if(offset===null)continue;
          if(!byPos.has(offset))byPos.set(offset,[]);
          byPos.get(offset).push(engine);
        }
      }
      for(const [offset,engines] of byPos){
        const names=engines.map(n=>titles[n]||n).join(' / ');
        const sourcePos=toSource(projection,offset);
        const activeRuns=[...runs.values()].filter(r=>r?.positions instanceof Set);
        const agreed=activeRuns.length>1 && activeRuns.every(r=>r.positions.has(sourcePos));
        const style=agreed?'ocr-sb-agreed':'ocr-sb-split';
        const label=id==='original'?(agreed?'│':'┆'):'│';
        marks.push(Decoration.widget({widget:new BreakWidget(label,style,
          '句界 · '+names+' · CMD '+(toSource(projection,offset))),side:1}).range(offset));
      }
      for(const [pos,choice] of Object.entries(gold)){
        if(!choice?.break)continue;
        const offset=toView(projection,Number(pos));
        if(offset!==null)marks.push(Decoration.widget({widget:
          new BreakWidget('◆','ocr-sb-gold','人工 Gold 句界 · CMD '+pos),side:3}).range(offset));
      }
      if(id==='original')for(const pos of acceptedPositions){
        const offset=toView(projection,pos);
        if(offset!==null)marks.push(Decoration.widget({widget:
          new BreakWidget('✓','ocr-sb-accepted','已采纳句界 · CMD '+pos),side:2}).range(offset));
      }
      if(focus!==null){
        const offset=toView(projection,focus);
        if(offset!==null){
          const line=pane.view.state.doc.lineAt(offset);
          marks.push(Decoration.line({class:'ocr-sb-active-line'}).range(line.from));
        }
      }
      pane.view.dispatch({effects:markEffect.of(Decoration.set(marks,true))});
      if(id==='original')pane.status.textContent=
        (mode==='disagree'?'分歧块 '+projection.blocks.length+' · ':
          mode==='no-sentence'?'无分句块 '+projection.blocks.length+' · ':
          mode==='arbitrated'?'已仲裁 '+projection.blocks.length+' · ':'全文 · ')+
        (mode==='disagree'||mode==='arbitrated'?'原始句界分歧 ':'句界分歧 ')+
        projection.disagreements.length+' 处'+
        (selectedBlockId?' · 当前 '+selectedBlockId:'');
      else{
        const run=runs.get(id);
        const elapsed=Number.isFinite(run?.elapsed)?run.elapsed.toFixed(1)+' ms':'— ms';
        pane.status.textContent=run?.error?'失败 · '+elapsed:
          runSentenceCount(run)+' 句 · '+elapsed;
        pane.status.title=id+' 最近一次分句操作耗时 '+elapsed;
        if(pane.adoptCheck){
          const item=reviewedBlocks[selectedBlockId];
          pane.adoptCheck.checked=item?.status==='arbitrated'&&item.engine===id;
          pane.adoptCheck.disabled=!adoptionEnabled||!selectedBlockId||!disputedIds.has(selectedBlockId)||
            !runs.get(id)?.lossless;
          pane.adoptCheck.parentElement.title=selectedBlockId?
            '当前 '+selectedBlockId+(disputedIds.has(selectedBlockId)?' · 勾选采用本引擎整块分句':' · 此块无分歧'):
            '先在左窗选择一个有分歧的文本块';
        }
      }
    });
  }
  function runSentenceCount(run){return run?.value?.sentences?.length??0;}
  function scrollToSource(source,origin=null,anchor='center'){
    updatePageSelection(source);
    const now=performance.now();
    eachPane((pane,id)=>{
      if(id===origin)return;
      const offset=toView(projection,source);
      if(offset===null)return;
      pane.suppressUntil=now+700;
      pane.view.dispatch({effects:EditorView.scrollIntoView(offset,{y:anchor})});
    });
  }
  api={
    update({source,results,filter='full',decisions={},selectedPos=null,
            accepted={},disputed=[],activeBlockId=null,finalBoundaries=[],canAdopt=false}){
      if(typeof source!=='string')throw TypeError('CMD source required');
      const sourceChanged=source!==md;
      const reviewChanged=JSON.stringify(accepted)!==JSON.stringify(reviewedBlocks);
      const changed=sourceChanged||filter!==mode||
        (reviewChanged&&(filter==='arbitrated'||filter==='disagree'))||
        (results!==runs && filter!=='full');
      md=source;mode=filter;runs=results;gold=decisions;
      reviewedBlocks=structuredClone(accepted);disputedIds=new Set(disputed);
      selectedBlockId=activeBlockId;acceptedPositions=finalBoundaries;
      adoptionEnabled=canAdopt;
      if(sourceChanged){
        const pages=pbsPageTargets(md);
        pbsPages=pages.pages;pbsLocations=pages.locations;
      }
      if(changed){
        projection=createSourceProjection(md,runs,mode,reviewedBlocks,disputed);
        availablePages=filterPageOptions();
        refreshPageOptions();
        eachPane(pane=>pane.updateDoc(projection.doc));
        const sourcePane=panes.get('original');
        if(sourcePane?.view){
          sourcePane.setBlockGutterWidth(md);
          updateOriginalGutters(sourcePane.view,md,projection);
          if(mode!=='no-sentence')foldSourceInitially(sourcePane.view,md,projection);
          else foldSourceInitially(sourcePane.view,md,projection,{showUnsentenced:true});
        }
        const selected=selectedPos!==null&&toView(projection,selectedPos)!==null?
          selectedPos:projection.ranges[0]?.sourceFrom??null;
        focus=selected;
      }else if(selectedPos!==null)focus=selectedPos;
      showDecorations();
      if(focus!==null)updatePageSelection(focus);
      if(changed&&focus!==null)scrollToSource(focus);
      if(changed)panes.get('original')?.schedulePickerAlign();
    },
    reveal(source){
      if(!Number.isInteger(source))return;
      focus=source;
      const original=panes.get('original')?.view;
      const at=toView(projection,source);
      if(original&&at!==null)revealFoldedSource(original,at);
      showDecorations();scrollToSource(source);
    },
    pbsPageTarget(key){
      return availablePages.find(page=>page.key===key)||null;
    },
    selectedBlockId(){return selectedBlockId;},
    receivePosition(id,viewPos){
      const source=toSource(projection,viewPos);
      focus=source;
      if(id!=='original'){
        const original=panes.get('original')?.view;
        const at=toView(projection,source);
        if(original&&at!==null)revealFoldedSource(original,at);
      }
      showDecorations();scrollToSource(source,id);
      onPosition(source,id);
    },
    receiveScroll(id){
      if(performance.now()-lastSync<35)return;
      const pane=panes.get(id);
      if(!pane?.view)return;
      const rect=pane.view.scrollDOM.getBoundingClientRect();
      const viewPos=pane.view.posAtCoords({x:rect.left+25,y:rect.top+24});
      if(viewPos==null)return;
      lastSync=performance.now();
      scrollToSource(toSource(projection,viewPos),id,'start');
    },
    snapshot(){
      return {mode,projectionLength:projection.doc.length,sourceLength:md.length,
        pbsPages:pbsPages.map(page=>({...page})),
        availablePages:availablePages.map(page=>({...page})),
        currentPbsPage:panes.get('original')?.element.querySelector('#pbs-page-select')?.value||null,
        blocks:projection.blocks,disagreements:projection.disagreements,
        paneCount:[...panes.values()].filter(p=>p.view).length,
        positions:[...panes.values()].map(p=>({id:p.id,scroll:p.view?.scrollDOM.scrollTop??0,
          readOnly:p.view?.state.readOnly??false,editable:p.view?.contentDOM.isContentEditable??true}))};
    },
    dispose(){dockview.dispose();}
  };
  return api;
}
