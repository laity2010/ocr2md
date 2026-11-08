/** Independent translation Lab view: Dockview + read-only CM6 panes.
 * Only record IDs and mapped clean-source offsets are shared. Neither
 * the sentence engine nor its Gold/sidecar state is imported here.
 */
import {createDockview,themeAbyss} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import {EditorView,Decoration,lineNumbers} from '@codemirror/view';
import {EditorState,StateEffect,StateField} from '@codemirror/state';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {obsidianMarkdown} from './obsidian-markdown.js';
import {obsidianSourceSyntax} from './obsidian-source-syntax.js';
import {obsidianHeadingMarkers} from './obsidian-heading-markers.js';
import {TranslationReaderPane} from './translation-review-reader-pane.js';
import {buildTranslationPairs} from './translation-review-bilingual.js';

const markEffect=StateEffect.define();
const markField=StateField.define({
  create:()=>Decoration.none,
  update(value,tr){
    for(const e of tr.effects)if(e.is(markEffect))return e.value;
    return tr.docChanged?value.map(tr.changes):value;
  },provide:field=>EditorView.decorations.from(field)
});
const changesEffect=StateEffect.define();
const changesField=StateField.define({
  create:()=>Decoration.none,
  update(value,tr){
    for(const e of tr.effects)if(e.is(changesEffect))return e.value;
    return tr.docChanged?value.map(tr.changes):value;
  },provide:field=>EditorView.decorations.from(field)
});
const unitLinesEffect=StateEffect.define();
const unitLinesField=StateField.define({
  create:()=>Decoration.none,
  update(value,tr){
    for(const effect of tr.effects)if(effect.is(unitLinesEffect))return effect.value;
    return tr.docChanged?value.map(tr.changes):value;
  },provide:field=>EditorView.decorations.from(field)
});
const RO=[EditorState.readOnly.of(true),EditorView.editable.of(false),
  EditorView.lineWrapping,markdown({base:markdownLanguage}),
  obsidianMarkdown,obsidianSourceSyntax,
  syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),markField,changesField,unitLinesField];
const ORIGINAL=[lineNumbers(),obsidianHeadingMarkers];
function recordAt(anchors,position){
  if(!anchors.length)return null;
  let low=0,high=anchors.length;
  while(low<high){
    const mid=(low+high)>>>1;
    if(anchors[mid].from<=position)low=mid+1;
    else high=mid;
  }
  return anchors[Math.max(0,low-1)].id;
}

class TranslationPane {
  constructor(id,owner){
    this.id=id;this.owner=owner;
    this.element=document.createElement('div');
    this.element.className='ocr-sb-pane ocr-cm-source ocr-tr-pane';
    this.element.dataset.engine=id==='original'?'original':'translation';
    this.editorHost=document.createElement('div');
    this.editorHost.className='ocr-sb-pane-editor';
    const toolbar=document.createElement('div');
    toolbar.className='ocr-sb-pane-toolbar';
    const title=document.createElement('strong');
    title.textContent=id==='original'?'干净原文 · 单语 MD':id.toUpperCase()+' · 校译';
    this.status=document.createElement('span');
    this.status.className='ocr-sb-pane-status ocr-tr-pane-status';
    this.status.textContent=id==='original'?'原始 CMD':'待载入';
    toolbar.append(title,this.status);
    this.element.append(toolbar,this.editorHost);
    this.content='';this.anchors=[];this.edits=[];this.lines=[];this.view=null;this.suppressUntil=0;
    this.lastGesture=0;
  }
  init(){
    this.view=new EditorView({parent:this.editorHost,doc:this.content,
      extensions:this.id==='original'?[...RO,...ORIGINAL]:RO});
    const scroller=this.view.scrollDOM;
    for(const name of ['wheel','touchstart','pointerdown','keydown'])
      scroller.addEventListener(name,()=>{
        this.lastGesture=performance.now();this.suppressUntil=0;
      },{passive:true});
    scroller.addEventListener('scroll',()=>{
      if(performance.now()<this.suppressUntil||
          performance.now()-this.lastGesture>2200)return;
      this.owner.receiveScroll(this.id);
    },{passive:true});
    let clickStart=null;
    this.view.dom.addEventListener('pointerdown',event=>{
      const line=event.target instanceof Element?
        event.target.closest('.cm-line[data-tr-unit-id]'):null;
      clickStart=event.isPrimary&&event.button===0&&line?
        {pointerId:event.pointerId,x:event.clientX,y:event.clientY,
          unitId:line.getAttribute('data-tr-unit-id')}:null;
    });
    this.view.dom.addEventListener('pointercancel',()=>{clickStart=null;});
    this.view.dom.addEventListener('pointerup',event=>{
      const start=clickStart;clickStart=null;
      // Touch scrolling, text selection, scrollbar drags and clicks outside
      // the text must NEVER be mistaken for explicit sentence selection.
      if(!start||start.pointerId!==event.pointerId||
          Math.hypot(event.clientX-start.x,event.clientY-start.y)>9)return;
      // Commit the original line's EXPLICIT unit ID from pointerDOWN.
      // After WebKit shifts focus, pointerup can hit a different CM6 line;
      // posAtDOM(line) / posAtCoords must not silently select p5b2.
      this.owner.receiveUnit(this.id,start.unitId);
    });
  }
  updateDoc(text,anchors,edits=[],lines=[]){
    this.content=text;this.anchors=anchors;this.edits=edits;this.lines=lines;
    if(!this.view)return;
    if(this.view.state.doc.toString()!==text){
      this.view.dispatch({changes:{from:0,to:this.view.state.doc.length,insert:text}});
    }
    this.view.dispatch({effects:[changesEffect.of(Decoration.set(
      edits.map(({from,to})=>Decoration.mark({class:'ocr-tr-english-change'}).range(from,to)),true)),
      unitLinesEffect.of(Decoration.set(lines.map(({id,part,from})=>
        Decoration.line({attributes:{'data-tr-unit-id':id,'data-tr-unit-part':part}}).range(from)),true))]});
  }
  mark(id){
    if(!this.view)return;
    const item=this.anchors.find(a=>a.id===id);
    const marks=[];
    if(item){
      const line=this.view.state.doc.lineAt(Math.min(item.from,this.view.state.doc.length));
      marks.push(Decoration.line({class:'ocr-tr-current'}).range(line.from));
    }
    this.view.dispatch({effects:markEffect.of(Decoration.set(marks,true))});
  }
  reveal(id){
    const item=this.anchors.find(a=>a.id===id);
    if(!item||!this.view)return;
    const viewport=this.view.scrollDOM.getBoundingClientRect();
    const coords=this.view.coordsAtPos(item.from);
    // Do not re-center a sentence that is already readable. Repeated
    // scrollIntoView across Dockview panes made clicks feel like jumping.
    if(coords&&coords.top>=viewport.top+12&&
        coords.bottom<=viewport.bottom-12)return;
    this.suppressUntil=performance.now()+650;
    this.view.dispatch({effects:EditorView.scrollIntoView(item.from,{y:'center'})});
  }
  atPosition(pos){return recordAt(this.anchors,pos);}
  visiblePosition(){
    if(!this.view)return null;
    const rect=this.view.scrollDOM.getBoundingClientRect();
    return this.view.posAtCoords({x:rect.left+Math.min(110,rect.width/2),
      y:rect.top+Math.min(48,rect.height/2)});
  }
  layout(){this.view?.requestMeasure();}
  dispose(){this.view?.destroy();this.view=null;}
}

export function createTranslationCompareWorkspace(container,model,{onSelect=()=>{}}={}){
  const panes=new Map();
  let visible=model.rows,activeId=null;
  const owner={receivePosition:(id,pos)=>{
    const target=panes.get(id)?.atPosition(pos);
    if(target)select(target,id,true);
  },receiveUnit:(paneId,unitId)=>{
    // Unlike generic source offsets, a bilingual English/Chinese line
    // already carries its own canonical sentence ID.
    if(typeof unitId==='string'&&unitId)select(unitId,paneId,true);
  },receiveScroll:()=>{
    // A scroll gesture is NOT selection. Previous code changed activeId on
    // every vertical movement and the highlighted "focus row" wandered even
    // when the reader's scrollTop was stable. Only explicit hits/selectors
    // may change the shared sentence ID.
  }};
  const dockview=createDockview(container,{
    theme:themeAbyss,
    createComponent:({name})=>{
      const pane=name==='original'?new TranslationReaderPane(name,owner):
        new TranslationPane(name,owner);
      panes.set(name,pane);
      return pane;
    }
  });
  const panels=[];
  panels.push(dockview.addPanel({id:'original',component:'original',title:'单语 Markdown · 成品预览'}));
  let previous='original';
  for(const name of model.names){
    panels.push(dockview.addPanel({id:name,component:name,title:name.toUpperCase(),
      position:{referencePanel:previous,direction:previous==='original'?'right':'below'}}));
    previous=name;
  }
  // This Lab is strictly read-only. Dockview's BasePanelView.focus() calls
  // HTMLElement.focus() WITHOUT preventScroll. On physical iPad Safari that
  // can reset the nested article's scroll anchor to an earlier heading
  // (reported as source line 225, p5b2) on EACH tap/active-panel change.
  // Panel activation must not steal DOM focus from the user's reading scroll.
  // Explicit navigation is handled solely by select() / reveal() below.
  const focusGuards=panels.map(panel=>panel.api.onWillFocus(event=>{
    event.preventDefault();
  }));
  for(const panel of panels){panel.group.header.hidden=true;panel.group.relayout();}
  panes.get('original').updateDoc(model.reading.doc,model.reading.anchors);
  function refresh(rows){
    visible=rows;
    // Keep the full clean document regardless of the active discrepancy
    // filter, but navigate only among the currently visible AI records.
    const included=new Set(rows.map(row=>row.id));
    panes.get('original').updateDoc(model.reading.doc,
      model.reading.anchors.filter(a=>included.has(a.id)));
    for(const name of model.names){
      const {doc,anchors,edits,lines}=buildTranslationPairs(rows,model.translations[name].rows);
      const pane=panes.get(name);
      pane.updateDoc(doc,anchors,edits,lines);
      pane.status.textContent=rows.length+' 组 · 中英逐句';
    }
    panes.get('original').status.textContent=model.rows.length+' 条 · 无损 PASS · SHA '+model.sourceSha256.slice(0,12);
    const next=rows.some(r=>r.id===activeId)?activeId:rows[0]?.id??null;
    if(next)select(next,null,true);
    else {activeId=null;onSelect(null);}
  }
  function select(id,origin=null,scroll=true){
    if(!visible.some(row=>row.id===id))return;
    const changed=id!==activeId;
    // A second click on the *same* sentence must be side-effect free. An
    // explicit toolbar selection may still locate it when off-screen.
    if(!changed&&origin!==null)return;
    activeId=id;
    for(const [name,pane] of panes){
      pane.mark(id);
      if(scroll&&name!==origin)pane.reveal(id);
    }
    if(changed)onSelect(id);
  }
  refresh(visible);
  return {filter:refresh,select,selected:()=>activeId,
    destroy:()=>{for(const guard of focusGuards)guard.dispose();dockview.dispose()}};
}
