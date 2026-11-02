/** CM6 source-lane presentation of CMD's parent/child ID projection.
 * No synthetic source text, duplicate state, or edits to original OCR evidence.
 * This separate gutter coexists with native line numbers and their caret menu.
 */
import {RangeSetBuilder,StateField} from '@codemirror/state';
import {gutter,GutterMarker} from '@codemirror/view';
import {projectCMDSourceBlockLabels} from './cmd-block-labels.js';
import {publishFocus} from './view-store.js';
import './cmd-source-block-gutter.css';

class SourceBlockID extends GutterMarker {
  constructor(entry){super();this.entry=entry;}
  eq(other){return other instanceof SourceBlockID&&
    this.entry.id===other.entry.id&&this.entry.label===other.entry.label&&
    this.entry.sourceKind===other.entry.sourceKind&&
    this.entry.sourceLine===other.entry.sourceLine;}
  toDOM(){
    const {id,label,kind,sourceKind,sourceLine,elementId}=this.entry;
    const button=document.createElement('button');
    button.type='button';button.className='ocr-cmd-block-id';
    button.dataset.sourceId=id;button.dataset.sourceKind=sourceKind;
    button.dataset.blockKind=kind;button.dataset.blockId=label;
    button.textContent=label;
    button.setAttribute('aria-label',`${kind==='parent'?'父块':'子块'} ${label}，${sourceKind==='content'?'源码有正文':'源码作用域无正文'}，点击定位`);
    button.title=`${id===label?id:`原始 ${id} · 逻辑 ${label}`} · ${sourceKind==='content'?'源码有正文':'源码作用域无正文（可能已合并或审阅修正）'}`;
    button.addEventListener('pointerdown',event=>{
      event.stopPropagation();if(event.pointerType!=='touch')event.preventDefault();
    });
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      publishFocus({sourceLine,origin:'cm6',elementId,intent:'click'});
    });
    return button;
  }
}

function createMarkers(doc){
  const labels=projectCMDSourceBlockLabels(doc.toString());
  const builder=new RangeSetBuilder();
  for(const item of labels){
    const line=doc.line(item.sourceLine);
    builder.add(line.from,line.from,new SourceBlockID(item));
  }
  return builder.finish();
}
const markers=StateField.define({
  create(state){return createMarkers(state.doc);},
  update(value,transaction){return transaction.docChanged?createMarkers(transaction.state.doc):value;},
});
export const cmdSourceBlockGutter=[markers,gutter({
  class:'ocr-cmd-block-id-gutter',
  markers:view=>view.state.field(markers),
  initialSpacer:()=>new SourceBlockID({id:'p000b000s0',label:'p000b000s0',
    kind:'child',sourceKind:'content',sourceLine:1,elementId:''}),
})];
