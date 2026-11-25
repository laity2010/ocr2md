/** One immutable CM6 source; no write or structure-edit port. */
import {EditorState,StateEffect,StateField} from '@codemirror/state';
import {EditorView,Decoration,lineNumbers,highlightActiveLine} from '@codemirror/view';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {obsidianMarkdown} from '../obsidian-markdown.js';
import {obsidianSourceSyntax} from '../obsidian-source-syntax.js';
import {obsidianHeadingMarkers} from '../obsidian-heading-markers.js';
import {logicalAtOffset} from '../v2-focus-map.js';
import {documentChanged,publishFocus,selectionChanged} from '../view-store.js';
import './review.css';
export function mountSentenceSource(host){
 let snapshot=null,workspace='',programmatic=false,selectedId=null;
 const mark=StateEffect.define();
 const marks=StateField.define({create:()=>Decoration.none,update(value,tr){
  for(const e of tr.effects)if(e.is(mark)){
   const row=e.value;if(!row)return Decoration.none;
   const doc=tr.state.doc,from=doc.lineAt(Math.min(row.from,doc.length)).number;
   const to=doc.lineAt(Math.max(row.from,row.to-1)).number;
   value=Decoration.set(Array.from({length:to-from+1},(_,i)=>Decoration.line({class:'v2-sync-source-focus'}).range(doc.line(from+i).from)));
  }
  return value;
 },provide:f=>EditorView.decorations.from(f)});
 const extensions=[EditorState.readOnly.of(true),EditorView.editable.of(false),
  EditorView.contentAttributes.of({tabindex:'0','aria-label':'只读逻辑表 Markdown 原文'}),
  EditorState.transactionFilter.of(tr=>tr.docChanged?[]:tr),
  lineNumbers(),highlightActiveLine(),EditorView.lineWrapping,markdown({base:markdownLanguage}),
  obsidianMarkdown,obsidianSourceSyntax,obsidianHeadingMarkers,
  syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),marks,
  EditorView.updateListener.of(u=>{if(u.selectionSet&&!programmatic&&snapshot)publish(u.state.selection.main.head);})];
 const editor=new EditorView({state:EditorState.create({doc:'',extensions}),parent:host});
 host.classList.add('v2-source-session');
 const blocks=()=>snapshot?.blocks??[];
 const locate=(row,pos)=>{
  if(!row)return false;
  selectedId=row.logicalId;programmatic=true;
  try{editor.dispatch({selection:{anchor:pos},effects:[mark.of(row),EditorView.scrollIntoView(pos,{y:'nearest'})]});}
  finally{programmatic=false;}
  return true;
 };
 function publish(pos){
  const row=logicalAtOffset(blocks(),pos);if(!row)return;
  selectedId=row.logicalId;selectionChanged(pos);
  publishFocus({sourceLine:editor.state.doc.lineAt(pos).number,sourceOffset:pos,origin:'cm6',intent:'click',elementId:String(row.logicalId)});
  // Dispatch after selection update to avoid nested CM6 view updates.
  queueMicrotask(()=>{if(selectedId===row.logicalId&&snapshot?.blocks.includes(row))editor.dispatch({effects:mark.of(row)});});
 }
 const load=(next,path)=>{
  const state=EditorState.create({doc:next?.markdown??'',extensions});
  if(next&&state.doc.toString()!==next.markdown)throw Error('CM6 源文不能无损加载');
  snapshot=next;workspace=next?path:'';selectedId=null;editor.setState(state);
  documentChanged();document.dispatchEvent(new CustomEvent('v2-cm-session',{detail:{kind:next?'load':'clear',book:workspace}}));
 };
 const port=Object.freeze({load,clear:()=>load(null,''),getWorkspace:()=>workspace,
  getEditorView:()=>editor,getDoc:()=>editor.state.doc,getMarkdown:()=>editor.state.doc.toString(),
  getIntervals:blocks,getBlocks:()=>blocks().map(b=>({...b,markdownText:b.text})),
  getMdLineIndex:()=>null,getState:()=>({loaded:!!snapshot,readOnly:true,ownedLF:true,dirty:false,selectedId}),
  getLineAtOffset:pos=>editor.state.doc.lineAt(Math.max(0,Math.min(editor.state.doc.length,pos))).number,
  locateLogicalId:id=>{const b=blocks().find(r=>r.logicalId===id);return locate(b,b?.from);},
  locateSourceLine:line=>{if(!Number.isInteger(line)||line<1||line>editor.state.doc.lines)return false;
   const pos=editor.state.doc.line(line).from;return locate(logicalAtOffset(blocks(),pos),pos);}
 });
 host.v2SourcePort=port;
 return {layout:()=>editor.requestMeasure(),dispose(){delete host.v2SourcePort;editor.destroy();}};
}
