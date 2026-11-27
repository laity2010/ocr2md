/** Two read-only presentations, one shared sentence identity. */
import {mountReadingSource} from './reading.js';
import {comparisonAnchor} from './scroll-anchor.js';
import {mountComparisonDivider} from './comparison-divider.js';
export function mountSourceComparison(host,onLocate){
  host.className='translation-source-comparison';
  function pane(id,title){
    const section=document.createElement('section');section.className='translation-source-column';
    const label=document.createElement('div');label.className='translation-source-label';label.textContent=title;label.hidden=true;
    const body=document.createElement('div');body.id=id;body.className='ocr-cm-source frame-editor';
    section.append(label,body);host.append(section);return {section,label,body};
  }
  const left=pane('editor','原句 · RAW'),right=pane('prepared-editor','待译句 · text');
  const divider=mountComparisonDivider(host,()=>{original.layout();prepared?.layout();});
  host.insertBefore(divider.element,right.section);
  right.section.hidden=true;
  let leader=null,prepared=null,active=false,comparisonModel=null,originalModel=null;
  const intent=origin=>{leader=origin;};
  const forward=(anchor,origin)=>{
    if(!active||leader!==origin)return;
    if(origin==='source'){const target=comparisonAnchor(anchor,originalModel,comparisonModel);if(target)prepared?.scrollToAnchor(target);}
    else original.scrollToAnchor(anchor);
  };
  const original=mountReadingSource(left.body,onLocate,{onScroll:forward,onScrollIntent:intent});
  function setDocument(model,comparison=null){
    leader=null;comparisonModel=comparison;originalModel=model;
    active=!!comparison;host.classList.toggle('is-comparing',active);
    left.label.hidden=!active;right.label.hidden=!active;right.section.hidden=!active;divider.element.hidden=!active;
    if(active&&!prepared)prepared=mountReadingSource(right.body,onLocate,{numbered:false,origin:'prepared',onScroll:forward,onScrollIntent:intent});
    original.setDocument(model);prepared?.setDocument(comparison);
    original.layout();if(active)prepared.layout();
  }
  return Object.freeze({
    setDocument,getMarkdown:()=>original.getMarkdown(),
    locate(row,{scroll=true,origin}={}){
      leader=null;
      original.locate(row,{scroll:scroll&&origin!=='source'});
      if(active)prepared.locate(row?comparisonRow(row):null,{scroll:scroll&&origin!=='prepared'});
    },
    layout(){original.layout();if(active)prepared.layout();},
    dispose(){active=false;divider.dispose();original.dispose();prepared?.dispose();}
  });
  function comparisonRow(row){return comparisonModel?.byKey(row.key)??null;}
}
