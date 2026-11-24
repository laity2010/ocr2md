/** WP23D isolated real CM6 document in Chromium and iPad WebKit.
 * No live workspace, Vite application startup, API requests or writes.
 */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium,webkit} from 'playwright';
import {fixture} from './v2-owned-lf.test.mjs';
const bundle=await build({stdin:{contents:`
 import {EditorState} from '@codemirror/state';
 import {EditorView} from '@codemirror/view';
 import {composeBlockSource,logicalTextRows} from './ui/v2-block-source.js';
 window.checkOwnedLF=(old,snapshot)=>{
   const previous=composeBlockSource(old);
   const result=composeBlockSource(snapshot);
   const editor=new EditorView({state:EditorState.create({
     doc:result.source,extensions:[EditorState.readOnly.of(true),EditorView.editable.of(false)]
   }),parent:document.querySelector('#editor')});
   let end=0;
   const ownership=result.blocks.every(row=>{
     const valid=row.from===end&&row.to>row.from&&
       editor.state.doc.sliceString(row.from,row.to)===row.markdownText&&
       !Object.hasOwn(row,'groupEndPad');
     end=row.to;
     return valid;
   });
   const evidence={
     exact:editor.state.doc.toString()===previous.source&&editor.state.doc.toString()===snapshot.markdown,
     complete:ownership&&end===editor.state.doc.length,
     rows:logicalTextRows(editor.state.doc.toString(),result.blocks).length,
     lines:editor.state.doc.lines,
     first:editor.state.doc.line(1).text,
     length:editor.state.doc.length,
     dom:editor.contentDOM.isConnected&&editor.contentDOM.textContent.length>0,
   };
   editor.destroy();
   return evidence;
 };
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'});
for(const [name,browserType] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
 const browser=await browserType.launch({headless:true});
 try{
   const page=await browser.newPage({viewport:{width:834,height:1112},hasTouch:true});
   await page.setContent('<div id="editor"></div>');
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   const result=await page.evaluate(({old,plan})=>window.checkOwnedLF(old,plan.snapshot),fixture);
   assert.deepEqual(result,{exact:true,complete:true,rows:267,lines:498,
     first:'# 标题🧪',length:83337,dom:true});
   console.log('WP23D_OWNED_LF_BROWSER_PASS',name,result.rows,result.lines,result.length);
 }finally{await browser.close();}
}
