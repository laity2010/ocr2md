/** Lab-Sentence: three engine panes, source pane and a synchronized sentence-grid pane. */
import {createDockview,themeAbyss} from 'dockview';
import {EditorState,StateEffect,StateField,Prec} from '@codemirror/state';
import {EditorView,Decoration,WidgetType,keymap} from '@codemirror/view';
import {lineAtOffset,boundaryDisplay,isDisputed,reviewProjection,lineCandidateDisplay,projectSentenceRows} from '../sentence/display.js';
import {basicSetup} from 'codemirror';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {nativeIOSBasicSetup,isIOSWebKit} from '../ios-native-selection.js';
import {obsidianMarkdown} from '../obsidian-markdown.js';
import {obsidianSourceSyntax} from '../obsidian-source-syntax.js';
import {obsidianHeadingMarkers} from '../obsidian-heading-markers.js';
import 'dockview/dist/styles/dockview.css';
import '../workspace.css';
import '../outline-grid.css';
import '../settings-module.css';
import '../sentence/layout.css';
import {createSentenceGrid} from '../sentence/grid.js';
import {createReviewHistory} from '../sentence/review-history.js';
const names={source:'原文',sentence:'分句表',intl:'Intl',splitter:'Sentence Splitter',wink:'Wink NLP'};
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

const setFocus=StateEffect.define();
const decorations=marks=>Decoration.set(marks.map(m=>Decoration.widget({
 widget:new BreakWidget(m.label,m.style,m.title),side:1
}).range(m.pos)),true);
const marksField=StateField.define({create:()=>Decoration.none,update:value=>value,provide:f=>EditorView.decorations.from(f)});
const focusField=StateField.define({create:()=>Decoration.none,update(value,tr){
 for(const e of tr.effects)if(e.is(setFocus)){
  if(!e.value)return Decoration.none;
  const {from,to,pos}=e.value,doc=tr.state.doc;
  const first=doc.lineAt(from).number,last=doc.lineAt(Math.max(from,to-1)).number,active=doc.lineAt(pos).number;
  const marks=[];
  for(let n=first;n<=last;n++)marks.push(Decoration.line({class:n===active?'ocr-sb-active-line':'sentence-active-block'}).range(doc.line(n).from));
  if(active<first||active>last)marks.push(Decoration.line({class:'ocr-sb-active-line'}).range(doc.line(active).from));
  return Decoration.set(marks,true);
 }
 return value;
},provide:f=>EditorView.decorations.from(f)});
function pane(name,onModuleChange,onSelection,onScroll,onAll,onAdopt,onHistory){
  const element=document.createElement('div');
  element.className='ocr-source-pane ocr-source-file-source sentence-pane';
  element.dataset.sentencePane=name;
  const bar=document.createElement('div');bar.className='ocr-source-file-toolbar';
  let title,check;const historyButtons={};
  function checkbox(text,aria,callback){
    const label=document.createElement('label');label.className='sentence-review-check';
    check=document.createElement('input');check.type='checkbox';check.disabled=true;
    check.setAttribute('aria-label',aria);
    check.addEventListener('change',()=>callback(check.checked));
    label.append(check,document.createTextNode(text));bar.append(label);
  }
  if(name==='source'){
    const select=document.createElement('select');select.className='ocr-source-file-select';
    select.setAttribute('aria-label','源码文件导航');
    for(const [label,text,value] of [['全局设置','settings.json','settings']]){
      const group=document.createElement('optgroup');group.label=label;group.append(new Option(text,value));select.append(group);
    }
    select.value='';select.addEventListener('change',()=>{if(select.value)onModuleChange(select.value);});
    const actions=document.createElement('div');actions.className='ocr-source-undo-redo';
    for(const [id,text,label] of [['undo','↶','撤销'],['redo','↷','重做']]){
      const b=document.createElement('button');b.type='button';b.id=id;b.textContent=text;b.title=label+'分句仲裁';b.disabled=true;b.setAttribute('aria-label',label);b.addEventListener('click',()=>onHistory(id));historyButtons[id]=b;actions.append(b);
    }
    bar.append(select,actions);checkbox('全部','全部',onAll);
  }else{
    title=document.createElement('span');title.className='sentence-engine-label';title.textContent=names[name];bar.append(title);checkbox('采用','采用 '+names[name],checked=>onAdopt(name,checked));
  }
  const host=document.createElement('div');const ios=isIOSWebKit();
  host.className='ocr-cm-source frame-editor v2-source-session'+(ios?' ocr-ios-native-selection':'');
  host.id=name==='source'?'editor':'sentence-editor-'+name;
  element.append(bar,host);
  let view,syncing=false,suppressUntil=0,lastGesture=0,displayKey=null;
  const extensions=[
      ios?nativeIOSBasicSetup:basicSetup,
      ...(name==='source'?[Prec.highest(keymap.of([
        {key:'Mod-z',run:()=>{onHistory('undo');return true;}},
        {key:'Mod-Shift-z',run:()=>{onHistory('redo');return true;}},
        {key:'Mod-y',run:()=>{onHistory('redo');return true;}}
      ])),Prec.highest(EditorView.domEventHandlers({beforeinput(e){
        if(!['historyUndo','historyRedo'].includes(e.inputType))return false;
        e.preventDefault();onHistory(e.inputType==='historyUndo'?'undo':'redo');return true;
      }}))]:[]),
      EditorState.lineSeparator.of('\n'),EditorState.readOnly.of(true),EditorView.editable.of(false),
      EditorState.transactionFilter.of(tr=>tr.docChanged?[]:tr),
      EditorView.contentAttributes.of({tabindex:'0',spellcheck:'false','aria-label':names[name]+' · 只读源码'}),
      EditorView.lineWrapping,markdown({base:markdownLanguage}),obsidianMarkdown,
      syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),obsidianSourceSyntax,obsidianHeadingMarkers,marksField,focusField,
      EditorView.updateListener.of(update=>{
        if(syncing||!update.selectionSet)return;
        const doc=update.state.doc,head=update.state.selection.main.head;
        queueMicrotask(()=>{if(view?.state.doc===doc&&view.state.selection.main.head===head)onSelection(name,head);});
      })
    ];
  const stateFor=(doc,marks=[])=>EditorState.create({doc,extensions:[...extensions,marksField.init(()=>decorations(marks))]});
  return {element,init(){
    view=new EditorView({parent:host,state:stateFor('')});
    const scroller=view.scrollDOM;
    const gesture=()=>{lastGesture=performance.now();suppressUntil=0;};
    for(const event of ['wheel','touchstart','pointerdown','keydown'])scroller.addEventListener(event,gesture,{passive:true});
    scroller.addEventListener('scroll',()=>{
      const now=performance.now();
      if(now<suppressUntil||now-lastGesture>2500)return;
      const top=scroller.getBoundingClientRect().top;
      const pos=view.lineBlockAtHeight(Math.max(0,top+24-view.documentTop)).from;
      onScroll(name,pos);
    },{passive:true});
    view.dom.addEventListener('pointerup',event=>{
      const pos=view.posAtCoords({x:event.clientX,y:event.clientY});
      if(Number.isInteger(pos))onSelection(name,pos);
    });
  },
    setMarkdown(text,marks,label){
      if(title)title.textContent=names[name]+(label?' · '+label:'');
      const key=marks===undefined?null:JSON.stringify([text,marks]);
      if((marks===undefined&&view.state.doc.toString()===text)||(key!==null&&displayKey===key))return;
      const state=stateFor(text,marks);
      if(state.doc.toString()!==text)throw Error('Markdown changed during CM6 import');
      view.setState(state);displayKey=key;
    },setCheck(checked,disabled){check.checked=checked;check.disabled=disabled;},setHistory({undo,redo},disabled){if(historyButtons.undo){historyButtons.undo.disabled=disabled||!undo;historyButtons.redo.disabled=disabled||!redo;}},highlight(focus){view.dispatch({effects:setFocus.of(focus)});},
    getPosition:()=>view.state.selection.main.head,
    locate(pos,select=true,anchor='center'){
      suppressUntil=performance.now()+700;syncing=true;
      try{view.dispatch({...(select?{selection:{anchor:pos}}:{}),effects:EditorView.scrollIntoView(pos,{y:anchor})});}
      finally{syncing=false;}
    },
    activate(){view?.focus();},
    layout(){view?.requestMeasure();},dispose(){view?.destroy();}};
}
function sentencePane(onRowFocus){
 const element=document.createElement('div');
 element.className='sentence-pane ocr-source-pane';
 element.dataset.sentencePane='sentence';
 const bar=document.createElement('div');bar.className='ocr-source-file-toolbar';
 const title=document.createElement('span');title.className='sentence-engine-label';title.textContent='分句表 · sentence';
 bar.append(title);element.append(bar);
 let host=null,grid=null;
 return {element,init(){},setRows(rows){
  if(rows===null){grid?.dispose();grid=null;host?.remove();host=null;title.textContent='分句表 · sentence';return;}
  title.textContent='分句表 · sentence · '+rows.length+' 条';
  if(!grid){
   host=document.createElement('div');host.className='sentence-table-grid ocr-outline-grid';
   host.tabIndex=0;host.setAttribute('aria-label','分句表');element.append(host);
   grid=createSentenceGrid(host,rows,{onRowFocus});
  }else grid.setRows(rows);
 },focus(line,offset,scroll){grid?.focus(line,offset,scroll);},
 activate(){grid?.activate();},layout(){},dispose(){grid?.dispose();}};
}
export function createFrameWorkspace(container,{onModuleChange=()=>{},onStatus=()=>{},onArbitrate=async()=>{throw Error("仲裁服务未连接");}}={}){
  const panes=new Map();
  const engineIds={intl:'intl',splitter:'sentence-splitter',wink:'wink-nlp'};
  let snapshot=null,results=null,visible=null,visibleRows=null,marks=null,all=false,active=null,reviewVersion=null,persistedRows=null;
  const adopted=new Map(),disputed=new Set(),reviewHistory=createReviewHistory();
  let busy=false,locked=false,operation=null,historyStamp=null;
  function refreshChecks(){
    panes.get('source').setCheck(all,!snapshot||busy||locked);
    panes.get('source').setHistory(reviewHistory.depth(),!snapshot||busy||locked);
    for(const [name,id] of Object.entries(engineIds)){
      const allowed=!!active&&disputed.has(active.sourceLine);
      panes.get(name).setCheck(allowed&&adopted.get(active.sourceLine)===id,!allowed||busy||locked);
    }
  }
  function refreshGrid(){
    panes.get("sentence").setRows(persistedRows===null?null:projectSentenceRows(persistedRows,visible?.lines??[]));
  }
  function render(sourcePos){
    const projection=reviewProjection(snapshot,results,all,adopted);
    visible=projection.snapshot;
    visibleRows=new Map(projection.results.lines.map(row=>[row.sourceLine,row]));
    marks=boundaryDisplay(visible,projection.results);
    active=null;
    panes.get('source').setMarkdown(visible.markdown,marks.source.marks);
    refreshGrid();

    if(visible.lines.length){
      const origin=b=>b.sourceFrom??b.from;
      const line=visible.lines.find(b=>sourcePos>=origin(b)&&sourcePos<origin(b)+b.text.length+b.eol.length)
        ??visible.lines.find(b=>origin(b)>=sourcePos)??visible.lines.at(-1);
      const pos=line.from+Math.max(0,Math.min(line.text.length,sourcePos-origin(line)));
      panes.get('source').locate(pos);
      onSelection('source',pos);
    }else{
      for(const name of Object.keys(engineIds))panes.get(name).setMarkdown('',[],'');
      panes.get('source').highlight(null);panes.get('sentence').focus(null,0,false);refreshChecks();
    }
  }
  function sourcePosition(){
    if(!active)return 0;
    const pos=panes.get('source').getPosition();
    return (active.sourceFrom??active.from)+Math.max(0,Math.min(active.text.length,pos-active.from));
  }
  function onAll(checked){
    if(!snapshot||busy||locked){refreshChecks();return;}
    const pos=sourcePosition();all=checked;render(pos);
  }
  function onAdopt(name,checked){
    if(!active||!disputed.has(active.sourceLine)||busy||locked){refreshChecks();return;}
    const id=engineIds[name],previousEngine=adopted.get(active.sourceLine)??null;
    const adoptedEngine=checked?id:previousEngine===id?null:previousEngine;
    if(previousEngine===adoptedEngine){refreshChecks();return;}
    perform(reviewHistory.prepare({sourceLine:active.sourceLine,previousEngine,adoptedEngine}));
  }
  function onHistory(direction){
    if(!snapshot||busy||locked)return;
    const staged=reviewHistory.prepareHistory(direction);
    if(staged)perform(staged);
  }
  function perform(staged){
    busy=true;refreshChecks();
    const change=staged.change,target=snapshot.lines[change.sourceLine-1];
    const pos=active?.sourceLine===change.sourceLine?sourcePosition():target.from;
    onStatus('正在保存 MDLine '+change.sourceLine+' 仲裁…');
    operation=(async()=>{
      try{
        const receipt=await onArbitrate(change);
        // Server acknowledgement is the sole mutation boundary.
        persistedRows=receipt.rows;
        results={...results,lines:results.lines.map(row=>row.sourceLine===change.sourceLine?receipt.reviewLine:row)};
        if(change.adoptedEngine===null)adopted.delete(change.sourceLine);
        else adopted.set(change.sourceLine,change.adoptedEngine);
        staged.commit();historyStamp=JSON.stringify(persistedRows);
        if(all&&active?.sourceLine===change.sourceLine){
          visibleRows.set(change.sourceLine,receipt.reviewLine);refreshGrid();
          panes.get('sentence').focus(change.sourceLine,pos-target.from);
        }else render(pos);
        onStatus('✓ MDLine '+change.sourceLine+' 仲裁已保存 · '+persistedRows.length+' 句记录','ok');
      }catch(error){
        onStatus('仲裁未确认成功：'+error.message+' · 可重新打开目录核对','error');
      }finally{busy=false;refreshChecks();}
    })();
  }
  function onSelection(name,pos){
    if(name!=='source'||!visible)return;
    const line=lineAtOffset(visible.lines,pos);
    if(!line){active=null;panes.get('sentence').focus(null,0,false);panes.get('source').highlight(null);for(const name of Object.keys(engineIds))panes.get(name).setMarkdown('',[],'');refreshChecks();return;}
    panes.get('source').highlight({from:line.from,to:line.to,pos:Math.min(pos,line.textTo)});
    panes.get('sentence').focus(line.sourceLine,Math.max(0,pos-line.from));
    if(active===line)return;
    active=line;refreshChecks();
    const row=visibleRows.get(line.sourceLine);
    for(const [name,id] of Object.entries(engineIds)){
      const item=lineCandidateDisplay(line,row?.candidates.find(c=>c.engine===id),marks[id].marks);
      panes.get(name).setMarkdown(item.text,item.marks,item.label);
    }
  }
  function onGridFocus(row){
    const line=visible?.lines.find(l=>l.sourceLine===row.source_line);
    if(!line)return;
    const pos=line.from+Math.min(line.text.length,row.from_utf16);
    panes.get('source').locate(pos);
    onSelection('source',pos);
  }
  // Only source or sentence-grid selection controls review, never left engines.
  function onScroll(){}
  const dockview=createDockview(container,{theme:themeAbyss,createComponent:({name})=>{
    const component=name==='sentence'?sentencePane(onGridFocus):pane(name,onModuleChange,onSelection,onScroll,onAll,onAdopt,onHistory);
    panes.set(name,component);return component;
  }});
  function add(name,position){
    const p=dockview.addPanel({id:name,component:name,title:names[name],...(position?{position}:{})});
    p.group.header.hidden=true;p.group.relayout();return p;
  }
  const source=add('source');
  const intl=add('intl',{referencePanel:source,direction:'left'});
  const splitter=add('splitter',{referencePanel:intl,direction:'below'});
  const wink=add('wink',{referencePanel:splitter,direction:'below'});
  const sentence=add('sentence',{referencePanel:source,direction:'below'});
  let sized=false;
  return Object.freeze({setSourceMarkdown(text,{resetReview=false}={}){
    if(resetReview){adopted.clear();all=false;reviewVersion=null;reviewHistory.reset();historyStamp=null;}
    persistedRows=null;panes.get('sentence').setRows(null);
    snapshot=null;results=null;visible=null;visibleRows=null;marks=null;active=null;
    refreshChecks();
    panes.get('source').setMarkdown(text,[]);
    panes.get('source').highlight(null);
    for(const name of Object.keys(engineIds))panes.get(name).setMarkdown('',[],'');
  },setReview(next,candidates,rows){
    if(next.documentVersion!==candidates.documentVersion)throw Error('Candidate source version mismatch');
    const stamp=JSON.stringify(rows);
    if(reviewVersion!==next.documentVersion||historyStamp!==stamp){reviewHistory.reset();all=false;}
    reviewVersion=next.documentVersion;historyStamp=stamp;
    adopted.clear();for(const row of candidates.lines)if(row.adoptedEngine)adopted.set(row.sourceLine,row.adoptedEngine);
    snapshot=next;results=candidates;persistedRows=rows;disputed.clear();
    for(const row of results.lines)if(isDisputed(row))disputed.add(row.sourceLine);
    render(0);
  },setLocked(value){locked=value;refreshChecks();},isBusy(){return busy;},whenIdle(){return operation??Promise.resolve();},focusTable(){panes.get('sentence').activate();},focusSource(){panes.get('source').activate();},activate(){
    const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
    dockview.layout(w,h);
    if(!sized){
      source.api.setSize({width:Math.round(w*.4)});
      sentence.api.setSize({height:Math.round(h*.4)});
      wink.api.setSize({height:Math.round(h/3)});
      intl.api.setSize({height:Math.round(h/3)});
      sized=true;
    }
  },dispose(){dockview.dispose();}});
}
