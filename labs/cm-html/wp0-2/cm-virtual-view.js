/** WP4 experimental CM6 projection: one authoritative EditorState/Text.
 * A stable chapter ID selects a source range; all text outside it is
 * Decoration.replace'd, never split/copy/rewritten. Positions map through
 * CM6 changes; structural boundary edits fail open to the full document.
 */
import {EditorSelection,EditorState,StateEffect,StateField} from '@codemirror/state';
import {Decoration,EditorView,WidgetType} from '@codemirror/view';
import './cm-virtual-view.css';

export const virtualScopeEffect=StateEffect.define();
const setScope=virtualScopeEffect;
class HiddenSection extends WidgetType {
  constructor(side){super();this.side=side;}
  eq(other){return other.side===this.side;}
  toDOM(){
    const el=document.createElement('div');
    el.className='ocr-wp4-hidden-section';
    el.dataset.hiddenSection=this.side;
    el.textContent=this.side==='before'?'··· 前面章节已折叠 ···':'··· 后续章节／原始证据已折叠 ···';
    return el;
  }
  ignoreEvent(){return true;}
}
const hiddenBefore=Decoration.replace({block:true,widget:new HiddenSection('before')});
const hiddenAfter=Decoration.replace({block:true,widget:new HiddenSection('after')});
const empty=Decoration.none;
const atStart=(doc,pos)=>pos===0||doc.sliceString(pos-1,pos)==='\n';
function visibleDecorations(doc,scope){
  if(!scope)return empty;
  if(scope.from<0||scope.to>doc.length||scope.from>=scope.to||
     !atStart(doc,scope.from)||(!atStart(doc,scope.to)&&scope.to!==doc.length))return empty;
  const ranges=[];
  if(scope.from>0)ranges.push(hiddenBefore.range(0,scope.from));
  if(scope.to<doc.length)ranges.push(hiddenAfter.range(scope.to,doc.length));
  return Decoration.set(ranges);
}
function intersectsBoundary(change,doc){
  // Check only source lines actually edited, not a wide neighborhood. Typing
  // close to a heading must not eject the editor from the chapter scope.
  let structural=false;
  change.iterChanges((fromA,toA,_fromB,_toB,inserted)=>{
    if(structural)return;
    const first=doc.lineAt(fromA).number,last=doc.lineAt(toA).number;
    for(let n=first;n<=last;n++){
      const line=doc.line(n).text;
      if(/(?:minerujson:(?:block:v1:|source:v1:)|ocr2md:chapter:v1)|^#{1,6}\s/.test(line)){
        structural=true;break;
      }
    }
    if(/(?:<!--\s*(?:minerujson:(?:block:v1:|source:v1:)|ocr2md:chapter:v1))|^#{1,6}\s/m.test(inserted.toString()))
      structural=true;
  });
  return structural;
}
const scopedField=StateField.define({
  create(){return null;},
  update(value,transaction){
    let scope=value;
    // Position changes inside the chapter map without constructing a second
    // CMDocument or re-parsing the full 300KB source on every keystroke.
    if(scope&&transaction.docChanged){
      let outside=false;
      transaction.changes.iterChangedRanges((fromA,toA)=>{
        if(fromA<scope.from||toA>scope.to)outside=true;
      });
      if(outside||intersectsBoundary(transaction.changes,transaction.startState.doc))scope=null;
      else scope={...scope,from:transaction.changes.mapPos(scope.from,-1),
        to:transaction.changes.mapPos(scope.to,1)};
    }
    for(const effect of transaction.effects){
      if(effect.is(setScope))scope=effect.value;
    }
    if(scope&&(!atStart(transaction.state.doc,scope.from)||
      !(scope.to===transaction.state.doc.length||atStart(transaction.state.doc,scope.to))))scope=null;
    return scope;
  },
  provide:field=>[
    EditorView.decorations.compute([field],state=>visibleDecorations(state.doc,state.field(field))),
    EditorView.atomicRanges.of(view=>visibleDecorations(view.state.doc,view.state.field(field))),
  ],
});
function scopeFor(state){return state.field(scopedField,false);}
const preventCrossChapterEdit=EditorState.changeFilter.of(tr=>{
  const scope=scopeFor(tr.startState);
  if(!scope)return true;
  let inside=true;
  tr.changes.iterChangedRanges((a,b)=>{
    if(a<scope.from||b>scope.to||(a===b&&a===scope.to))inside=false;
  });
  return inside;
});
const clampSelection=EditorState.transactionFilter.of(tr=>{
  const scope=scopeFor(tr.startState);
  // Switching chapters must jump to the NEW range, not clamp the selection
  // against the previously active chapter's hidden range.
  if(!scope||tr.docChanged||!tr.selection||
     tr.effects.some(effect=>effect.is(setScope)))return tr;
  const selected=tr.newSelection;
  const clamped=selected.ranges.map(range=>EditorSelection.range(
    Math.max(scope.from,Math.min(scope.to,range.anchor)),
    Math.max(scope.from,Math.min(scope.to,range.head))));
  if(selected.ranges.every((range,i)=>range.anchor===clamped[i].anchor&&range.head===clamped[i].head))
    return tr;
  return [tr,{selection:EditorSelection.create(clamped,selected.mainIndex)}];
});
export const virtualChapterExtensions=[scopedField,preventCrossChapterEdit,clampSelection];
export function currentVirtualChapter(state){
  const scope=scopeFor(state);
  return scope&&Object.freeze({...scope});
}
/** Public WCP message consumer. An id and exact CMD-derived range enter here,
 * never the document string itself. Scope switching is not an undo step. */
export function setVirtualChapter(view,scope){
  if(!(view instanceof EditorView))throw TypeError('Expected live CM6 EditorView');
  if(scope!==null&&(!scope||!Number.isInteger(scope.from)||!Number.isInteger(scope.to)||
    scope.from<0||scope.to>view.state.doc.length||scope.to<=scope.from||!scope.id))
    throw Error('Invalid CMD chapter mapping');
  const existing=scopeFor(view.state);
  if((existing?.id??null)===(scope?.id??null)&&
    (!existing||existing.from===scope.from&&existing.to===scope.to))return false;
  const current=view.state.selection.main.head;
  const anchor=scope===null?current:
    current>=scope.from&&current<=scope.to?current:scope.from;
  view.dispatch({effects:setScope.of(scope),selection:{anchor},scrollIntoView:scope!==null,
    userEvent:'select.virtualChapter'});
  return true;
}
