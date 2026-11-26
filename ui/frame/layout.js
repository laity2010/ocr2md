/** Lab-Sentence: one source pane and three independent read-only CM6 panes. */
import {createDockview,themeAbyss} from 'dockview';
import {EditorState,StateEffect,StateField} from '@codemirror/state';
import {EditorView,Decoration,WidgetType} from '@codemirror/view';
import {blockAtOffset,boundaryDisplay,isDisputed,reviewProjection} from '../sentence/display.js';
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
const names={source:'原文',intl:'Intl',splitter:'Sentence Splitter',wink:'Wink NLP'};
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
function pane(name,onModuleChange,onSelection,onScroll,onAll,onAdopt){
  const element=document.createElement('div');
  element.className='ocr-source-pane ocr-source-file-source sentence-pane';
  element.dataset.sentencePane=name;
  const bar=document.createElement('div');bar.className='ocr-source-file-toolbar';
  let title,check;
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
    for(const [label,text,value] of [['SQL','逻辑表 · logical_block','frame'],['全局设置','settings.json','settings']]){
      const group=document.createElement('optgroup');group.label=label;group.append(new Option(text,value));select.append(group);
    }
    select.value='frame';select.addEventListener('change',()=>{if(select.value==='settings')onModuleChange('settings');});
    const actions=document.createElement('div');actions.className='ocr-source-undo-redo';
    for(const [id,text,label] of [['undo','↶','撤销'],['redo','↷','重做']]){
      const b=document.createElement('button');b.type='button';b.id=id;b.textContent=text;b.title='只读源码';b.disabled=true;b.setAttribute('aria-label',label);actions.append(b);
    }
    bar.append(select,actions);checkbox('全部','全部',onAll);
  }else{
    title=document.createElement('span');title.className='sentence-engine-label';title.textContent=names[name];bar.append(title);checkbox('采用','采用 '+names[name],checked=>onAdopt(name,checked));
  }
  const host=document.createElement('div');const ios=isIOSWebKit();
  host.className='ocr-cm-source frame-editor v2-source-session'+(ios?' ocr-ios-native-selection':'');
  host.id=name==='source'?'editor':'sentence-editor-'+name;
  element.append(bar,host);
  let view,syncing=false,suppressUntil=0,lastGesture=0;
  const extensions=[
      ios?nativeIOSBasicSetup:basicSetup,
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
      if(marks===undefined&&view.state.doc.toString()===text)return;
      const state=stateFor(text,marks);
      if(state.doc.toString()!==text)throw Error('Markdown changed during CM6 import');
      view.setState(state);
    },setCheck(checked,disabled){check.checked=checked;check.disabled=disabled;},highlight(focus){view.dispatch({effects:setFocus.of(focus)});},
    getPosition:()=>view.state.selection.main.head,
    locate(pos,select=true,anchor='center'){
      suppressUntil=performance.now()+700;syncing=true;
      try{view.dispatch({...(select?{selection:{anchor:pos}}:{}),effects:EditorView.scrollIntoView(pos,{y:anchor})});}
      finally{syncing=false;}
    },
    layout(){view?.requestMeasure();},dispose(){view?.destroy();}};
}
export function createFrameWorkspace(container,{onModuleChange=()=>{}}={}){
  const panes=new Map();
  const engineIds={intl:'intl',splitter:'sentence-splitter',wink:'wink-nlp'};
  let snapshot=null,results=null,visible=null,lastSync=0,all=false,active=null,reviewVersion=null;
  const adopted=new Map(),disputed=new Set();
  function refreshChecks(){
    panes.get('source').setCheck(all,!snapshot);
    for(const [name,id] of Object.entries(engineIds)){
      const allowed=!!active&&disputed.has(active.logicalId);
      panes.get(name).setCheck(allowed&&adopted.get(active.logicalId)===id,!allowed);
    }
  }
  function render(sourcePos){
    const projection=reviewProjection(snapshot,results,all,adopted);
    visible=projection.snapshot;
    const marks=boundaryDisplay(visible,projection.results);
    active=null;
    panes.get('source').setMarkdown(visible.markdown,marks.source.marks);
    for(const [name,id] of Object.entries(engineIds)){
      const item=marks[id];
      panes.get(name).setMarkdown(visible.markdown,item.marks,item.count+' 句'+(item.failed?' · '+item.failed+' 块失败':''));
    }
    if(visible.blocks.length){
      const origin=b=>b.sourceFrom??b.from;
      const block=visible.blocks.find(b=>sourcePos>=origin(b)&&sourcePos<origin(b)+b.text.length)
        ??visible.blocks.find(b=>origin(b)>=sourcePos)??visible.blocks.at(-1);
      const pos=block.from+Math.max(0,Math.min(block.text.length-1,sourcePos-origin(block)));
      panes.get('source').locate(pos);
      onSelection('source',pos);
    }else refreshChecks();
  }
  function sourcePosition(){
    if(!active)return 0;
    const pos=panes.get('source').getPosition();
    return (active.sourceFrom??active.from)+Math.max(0,Math.min(active.text.length-1,pos-active.from));
  }
  function onAll(checked){
    if(!snapshot)return;
    const pos=sourcePosition();all=checked;render(pos);
  }
  function onAdopt(name,checked){
    if(!active||!disputed.has(active.logicalId))return;
    const id=engineIds[name],pos=sourcePosition();
    if(checked)adopted.set(active.logicalId,id);
    else if(adopted.get(active.logicalId)===id)adopted.delete(active.logicalId);
    if(all)refreshChecks();else render(pos);
  }
  function onSelection(name,pos){
    if(!visible)return;
    const block=blockAtOffset(visible.blocks,pos);
    if(!block)return;
    active=block;refreshChecks();
    for(const [id,component] of panes){
      component.highlight({from:block.from,to:block.to,pos});
      if(id!==name)component.locate(pos);
    }
  }
  function onScroll(name,pos){
    if(!visible||performance.now()-lastSync<35)return;
    lastSync=performance.now();
    for(const [id,component] of panes)if(id!==name)component.locate(pos,false,'start');
  }
  const dockview=createDockview(container,{theme:themeAbyss,createComponent:({name})=>{
    const component=pane(name,onModuleChange,onSelection,onScroll,onAll,onAdopt);
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
  let sized=false;
  return Object.freeze({setSourceMarkdown(text){
    snapshot=null;results=null;visible=null;active=null;
    refreshChecks();
    panes.get('source').setMarkdown(text,[]);
    panes.get('source').highlight(null);
    for(const name of Object.keys(engineIds))panes.get(name).setMarkdown('',[],'');
  },setReview(next,candidates){
    if(next.documentVersion!==candidates.documentVersion)throw Error('Candidate source version mismatch');
    if(reviewVersion!==next.documentVersion){adopted.clear();all=false;reviewVersion=next.documentVersion;}
    snapshot=next;results=candidates;disputed.clear();
    for(const row of results.blocks)if(isDisputed(row))disputed.add(row.logicalId);
    render(0);
  },activate(){
    const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
    dockview.layout(w,h);
    if(!sized){
      source.api.setSize({width:Math.round(w*.4)});
      wink.api.setSize({height:Math.round(h/3)});
      intl.api.setSize({height:Math.round(h/3)});
      sized=true;
    }
  },dispose(){dockview.dispose();}});
}
