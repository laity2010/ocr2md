import './styles.css';
import './obsidian-everforest.css';
import './workspace.css';
import './cm-preview-spike.css';
import {EditorView} from '@codemirror/view';
import {EditorState} from '@codemirror/state';
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
    const parseStart=performance.now();
    const cm=createCMMarkdownPreviewSpike(reading.doc,reading.anchors);
    const parseMs=Math.round(performance.now()-parseStart);
    const view=new EditorView({parent:$('cm-spike-editor'),doc:reading.doc,
      extensions:[EditorState.readOnly.of(true),EditorView.editable.of(false),
        markdown(),...cm.extensions]});
    const record=$('cm-spike-record');
    for(const row of reading.anchors)record.add(new Option(row.id,row.id));
    record.addEventListener('change',()=>{
      const anchor=reading.anchors.find(x=>x.id===record.value);
      if(!anchor)return;
      cm.reveal(view,anchor.from);
      status('CM6 定位：'+anchor.id+' · 偏移 '+anchor.from);
    });
    $('cm-spike-render').addEventListener('change',event=>
      cm.setRendered(view,event.target.checked));
    $('cm-spike-ids').addEventListener('change',event=>
      cm.setSentenceIDs(view,event.target.checked));
    $('cm-spike-fold').addEventListener('change',event=>{
      const n=event.target.checked?cm.foldHeadings(view):cm.unfoldHeadings(view);
      status('CM6 原生标题折叠：'+n+' 处');
    });
    const metrics={...cm.metrics,parseMs,
      buildMs:Math.round(performance.now()-time),
      unitCount:reading.anchors.length,
      firstId:reading.anchors[0]?.id,
      lastId:reading.anchors.at(-1)?.id,
      cmDocMatchesProjection:view.state.doc.toString()===reading.doc,
      cleanRestored:clean.stats.restored,
    };
    $('cm-spike-metrics').textContent=JSON.stringify(metrics,null,2);
    status('CM6 实验已加载 · '+metrics.renderedBlocks+'/'+
      (metrics.renderedBlocks+metrics.skippedBlocks)+' 个 Markdown 块已映射');
    window.__cmPreviewSpike={view,cm,metrics,reading,clean};
  }catch(error){
    status('CM6 实验失败：'+error.message,true);
    console.error('CM6 preview spike',error);
  }
}
void run();
