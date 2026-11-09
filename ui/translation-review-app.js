import './styles.css';
import './obsidian-everforest.css';
import './workspace.css';
import './sentence-benchmark.css';
import './translation-review.css';
import {prepareTranslationReview,filterTranslationRows} from './translation-review-core.js';
import {buildCleanReviewedMD} from './translation-review-clean-md.js';
import {buildTranslationReadingProjection} from './translation-review-reading.js';
import {createTranslationCompareWorkspace} from './translation-review-workspace.js';
import {parseCMDBlockTag} from './cmd-block-chains.js';
import {prepareReviewedSourcePackage} from './sentence-benchmark-reviewed-package.js';

const $=id=>document.getElementById(id);
let workspace=null,model=null,visible=[];
let historicalModel=null,reviewedModel=null;
function status(message,error=false){
  $('status').textContent=message;
  $('status').style.color=error?'#e19c86':'';
}
async function buildBadge(){
  try{
    const response=await fetch('./healthz',{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const {version}=await response.json();
    const m=/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(version||'');
    $('build-version').textContent=m?'lab-'+m[1].slice(-2)+m[2]+m[3]+'-'+m[4]+m[5]:'lab-未知';
    $('build-version').title=version||'';
  }catch{$('build-version').textContent='lab-离线';}
}
function renderSelection(id){
  const select=$('record-picker');
  select.value=id||'';
  const index=visible.findIndex(x=>x.id===id);
  $('record-count').textContent=index<0?'0 / '+visible.length:
    (index+1)+' / '+visible.length;
  $('prev-record').disabled=index<=0;
  $('next-record').disabled=index<0||index>=visible.length-1;
}
function renderFilter(){
  if(!workspace||!model)return;
  const hasAI=model.names.length>0;
  const filter=$('filter-mode');
  for(const option of filter.options)option.disabled=!hasAI&&option.value!=='all';
  if(!hasAI)filter.value='all';
  visible=filterTranslationRows(model.rows,filter.value);
  const select=$('record-picker');
  select.replaceChildren();
  for(const row of visible){
    const owner=row.blockIds?.join(' → ')||row.blockId;
    select.add(new Option(row.id+' · '+owner+' · '+
      (row.type==='sentence'?'句子':'整块'),row.id));
  }
  workspace.filter(visible);
  renderSelection(workspace.selected());
  $('ai-summary').textContent=hasAI?
    model.names.map(x=>x.toUpperCase()).join(' / ')+
    ' · '+model.rows.length+' 行 · 英文分歧 '+model.rows.filter(r=>r.englishDiff).length+
    ' · 中文分歧 '+model.rows.filter(r=>r.translationDiff).length:
    '审阅 MD '+model.rows.length+' 条 · 已合并断行 '+model.reviewedJoins+' 处 · AI 待翻译';
}
function activateRevision(){
  const selected=$('revision-mode').value;
  const candidate=selected==='reviewed'?reviewedModel:historicalModel;
  if(!candidate)return;
  workspace?.destroy();workspace=null;
  model=candidate;
  visible=model.rows;
  workspace=createTranslationCompareWorkspace($('translation-workspace'),model,{
    onSelect:renderSelection
  });
  renderFilter();
  if(selected==='reviewed'){
    status('新版审阅 MD · '+model.rows.length+' 条 · '+model.reviewedJoins+
      ' 处已确认断行已接合 · CMD 可无损恢复 · 等待对应版本 GPT/Grok 译文');
  }else{
    const joined=new Set(model.rows.flatMap(row=>row.blockIds?.slice(1)||[]));
    const missing=model.source.split('\n').map(line=>parseCMDBlockTag(line))
      .filter(tag=>tag?.lb==='m'&&!joined.has(tag.id));
    status('单语 MD 重组无损 PASS · 历史校译 · '+model.rows.length+' 条 · '+model.names.length+
      ' 家 AI'+(missing.length?' · ⚠ 旧译文缺少 '+missing.length+
        ' 处断行合并；仅供历史对照，不能用于新版校译':''),missing.length>0);
  }
}
async function load(){
  $('reload-input').disabled=true;
  $('translation-empty').hidden=true;
  status('校译 Lab 正在读取版本化审阅成果…');
  const mode=$('revision-mode');
  const preferred=mode.value||'reviewed';
  try{
    // Sentence Lab published a sealed versioned source/ID/MD package.
    // Historical AI data is loaded independently and NEVER rebound to it.
    const [reviewed,historical]=await Promise.allSettled([
      fetch('./api/reviewed-source',{cache:'no-store'}).then(async response=>{
        if(!response.ok)throw Error('审阅 MD HTTP '+response.status);
        return prepareReviewedSourcePackage(await response.json());
      }),
      fetch('./api/translation-review-data',{cache:'no-store'}).then(async response=>{
        if(!response.ok)throw Error('历史译文 HTTP '+response.status);
        const candidate=prepareTranslationReview(await response.json());
        candidate.clean=buildCleanReviewedMD(candidate.source,candidate.rows);
        candidate.reading=buildTranslationReadingProjection(candidate.clean);
        return candidate;
      })
    ]);
    reviewedModel=reviewed.status==='fulfilled'?reviewed.value:null;
    historicalModel=historical.status==='fulfilled'?historical.value:null;
    if(!reviewedModel&&!historicalModel)
      throw Error('新版审阅 MD 与历史译文都不可用');
    mode.querySelector('option[value="reviewed"]').disabled=!reviewedModel;
    mode.querySelector('option[value="historical"]').disabled=!historicalModel;
    mode.value=preferred==='historical'&&historicalModel?'historical':
      reviewedModel?'reviewed':'historical';
    activateRevision();
  }catch(error){
    status('校译 Lab 载入失败：'+error.message,true);
    $('translation-empty').hidden=false;
    $('translation-empty').textContent='校译数据不可用：'+error.message;
  }finally{$('reload-input').disabled=false;}
}
$('revision-mode').onchange=activateRevision;
$('filter-mode').onchange=renderFilter;
$('record-picker').onchange=event=>workspace?.select(event.target.value);
function move(offset){
  if(!workspace)return;
  const index=visible.findIndex(r=>r.id===workspace.selected());
  const next=visible[index+offset];
  if(next)workspace.select(next.id);
}
$('prev-record').onclick=()=>move(-1);
$('next-record').onclick=()=>move(1);
$('reload-input').onclick=load;
void buildBadge();
void load();
