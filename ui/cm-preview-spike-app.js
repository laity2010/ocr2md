import './styles.css';
import './obsidian-everforest.css';
import './workspace.css';
import './cm-preview-spike.css';
import {EditorView} from '@codemirror/view';
import {EditorState,Text} from '@codemirror/state';
import {markdown} from '@codemirror/lang-markdown';
import {prepareTranslationReview} from './translation-review-core.js';
import {buildCleanReviewedMD} from './translation-review-clean-md.js';
import {buildTranslationReadingProjection} from './translation-review-reading.js';
import {createCMMarkdownPreviewSpike} from './cm-markdown-preview-spike.js';

const $=id=>document.getElementById(id);
const status=(text,error=false)=>{
  $('cm-spike-status').textContent=text;
  $('cm-spike-status').style.color=error?'#e19c86':'';
};

async function run(){
  try{
    const response=await fetch('./api/translation-review-data',{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const time=performance.now();
    const model=prepareTranslationReview(await response.json());
    const clean=buildCleanReviewedMD(model.source,model.rows);
    const reading=buildTranslationReadingProjection(clean);
    const sourceDoc=Text.of(model.source.split('\n'));
    const cmdAnchors=model.rows.map(row=>({id:row.id,from:row.from,
      line:sourceDoc.lineAt(row.from).number}));
    const record=$('cm-spike-record');
    for(const row of reading.anchors)record.add(new Option(row.id,row.id));
    let current=null;
    const activate=(mode)=>{
      current?.view.destroy();
      const source=mode==='cmd'?{doc:model.source,anchors:cmdAnchors}:reading;
      const parseStart=performance.now();
      const cm=createCMMarkdownPreviewSpike(source.doc,source.anchors);
      const parseMs=Math.round(performance.now()-parseStart);
      const view=new EditorView({parent:$('cm-spike-editor'),doc:source.doc,
        extensions:[EditorState.readOnly.of(true),EditorView.editable.of(false),
          markdown(),...cm.extensions]});
      if($('cm-spike-ids').checked)cm.setSentenceIDs(view,true);
      if($('cm-spike-fold').checked)cm.foldHeadings(view);
      if(!$('cm-spike-render').checked)cm.setRendered(view,false);
      const metrics={...cm.metrics,parseMs,
        buildMs:Math.round(performance.now()-time),
        mode:mode==='cmd'?'完整 CMD 原文':'校译清洁预览投影',
        cmdExact:mode==='cmd'?view.state.doc.toString()===model.source:null,
        unitCount:source.anchors.length,
        firstId:source.anchors[0]?.id,lastId:source.anchors.at(-1)?.id,
        cmDocMatchesProjection:view.state.doc.toString()===source.doc,
        cleanRestored:clean.stats.restored};
      $('cm-spike-metrics').textContent=JSON.stringify(metrics,null,2);
      status('CM6 '+metrics.mode+' · '+metrics.renderedBlocks+'/'+
        (metrics.renderedBlocks+metrics.skippedBlocks)+' 个 Markdown 块映射');
      current={view,cm,metrics,source};
      window.__cmPreviewSpike={...current,reading,clean,model};
    };
    $('cm-spike-source').addEventListener('change',event=>activate(event.target.value));
    record.addEventListener('change',()=>{
      const anchor=current.source.anchors.find(x=>x.id===record.value);
      if(!anchor)return;
      current.cm.reveal(current.view,anchor.from);
      status('CM6 定位：'+anchor.id+' · 偏移 '+anchor.from);
    });
    $('cm-spike-render').addEventListener('change',event=>
      current.cm.setRendered(current.view,event.target.checked));
    $('cm-spike-ids').addEventListener('change',event=>
      current.cm.setSentenceIDs(current.view,event.target.checked));
    $('cm-spike-fold').addEventListener('change',event=>{
      const n=event.target.checked?current.cm.foldHeadings(current.view):
        current.cm.unfoldHeadings(current.view);
      status('CM6 原生标题折叠：'+n+' 处');
    });
    activate($('cm-spike-source').value);
  }catch(error){
    status('CM6 实验失败：'+error.message,true);
    console.error('CM6 preview spike',error);
  }
}
void run();
