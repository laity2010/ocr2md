import './styles.css';
import './obsidian-everforest.css';
import './workspace.css';
import './sentence-benchmark.css';
import './translation-review.css';
import {prepareTranslationReview,filterTranslationRows} from './translation-review-core.js';
import {buildCleanReviewedMD} from './translation-review-clean-md.js';
import {buildTranslationReadingProjection} from './translation-review-reading.js';
import {createTranslationCompareWorkspace} from './translation-review-workspace.js';

const $=id=>document.getElementById(id);
let workspace=null,model=null,visible=[];
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
  visible=filterTranslationRows(model.rows,$('filter-mode').value);
  const select=$('record-picker');
  select.replaceChildren();
  for(const row of visible){
    const option=new Option(row.id+' · '+row.blockId+' · '+
      (row.type==='sentence'?'句子':'整块'),row.id);
    select.add(option);
  }
  workspace.filter(visible);
  renderSelection(workspace.selected());
  $('ai-summary').textContent=model.names.map(x=>x.toUpperCase()).join(' / ')+
    ' · '+model.rows.length+' 行 · 英文分歧 '+model.rows.filter(r=>r.englishDiff).length+
    ' · 中文分歧 '+model.rows.filter(r=>r.translationDiff).length;
}
async function load(){
  $('reload-input').disabled=true;
  $('translation-empty').hidden=true;
  status('校译 Lab 正在读取独立输入…');
  try{
    const response=await fetch('./api/translation-review-data',{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status+' · 校译输入不可用');
    const candidate=prepareTranslationReview(await response.json());
    candidate.clean=buildCleanReviewedMD(candidate.source,candidate.rows);
    candidate.reading=buildTranslationReadingProjection(candidate.clean);
    workspace?.destroy();workspace=null;
    model=candidate;
    visible=model.rows;
    workspace=createTranslationCompareWorkspace($('translation-workspace'),model,{
      onSelect:renderSelection
    });
    renderFilter();
    status('单语 MD 重组无损 PASS · '+model.rows.length+' 条 · '+
      model.clean.stats.sentenceBreaks+' 处句界换行 · '+model.names.length+' 家 AI');
  }catch(error){
    status('校译 Lab 载入失败：'+error.message,true);
    $('translation-empty').hidden=false;
    $('translation-empty').textContent='独立校译输入不可用：'+error.message;
  }finally{$('reload-input').disabled=false;}
}
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
