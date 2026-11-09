/* Reusable Web reviewer for the two public OCR2MD sentence operations.
 * All samples, Gold decisions, source hashes and calculations are isolated
 * from CMD, Main and PDF. Browser storage is per-device; JSON is portable.
 */
import './styles.css';
import './obsidian-everforest.css';
import './workspace.css';
import './sentence-benchmark.css';
import {createSentenceCompareWorkspace} from './sentence-benchmark-workspace.js';
import buffett from '../packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md?raw';
import {split,rebuild} from './sentence-benchmark-core.js';
import {engineCatalog} from './sentence-benchmark-engines.js';
import {buildTranslationTable} from './sentence-benchmark-translation-table.js';
import {createReviewedSourcePackage} from './sentence-benchmark-reviewed-package.js';
import {reviewInventory,blockAt,freshReview,synchronizeReview,reviewChanged,acceptedBoundaries,REVIEW_SCHEMA} from './sentence-benchmark-review.js';
const $=id=>document.getElementById(id);
function compactLabBuild(version){
  const match=/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(?:\d{2})?$/.exec(version||'');
  return match?'lab-'+match[1].slice(-2)+match[2]+match[3]+'-'+match[4]+match[5]:null;
}
async function loadBuildBadge(){
  const badge=$('build-version');
  try{
    const res=await fetch('./healthz',{cache:'no-store'});
    if(!res.ok)throw Error('HTTP '+res.status);
    const info=await res.json();
    const label=compactLabBuild(info.version);
    if(!label)throw Error('未知 Lab 版本');
    badge.textContent=label;
    badge.title=info.version;
  }catch(error){
    badge.textContent='lab-版本未知';
    badge.title='无法读取 Lab healthz: '+error.message;
  }
}
void loadBuildBadge();
const KEY='ocr2md-sentence-benchmark-v1';
const defaults=()=>({custom:[],selected:'reviewed',engines:engineCatalog.map(e=>e.id),gold:{}});
const samples=[
  {id:'demo',name:'演示 · 缩写 / 小数 / Markdown',
   md:'# Sentence test\n\nDr. Smith arrived at 3 p.m. He was late. The report contained $3.5 billion. Mr. Jones asked, "Is that final?" Yes!\n\n<!-- cmd:block:v1 id="p2b3" -->\nA $x+y$ formula stays untouched. The next sentence continues.\n'},
  {id:'buffett',name:'原始 MinerU 测试夹具 · 未审阅',md:buffett},
  {id:'zh',name:'演示 · 中文 / 公式 / 注释',
   md:'# 标题\n\n这是一句话。第二句话！第三句话？\n\n计算 $x+y=3$ 后，结果仍然正确。\n\n这是一个带注释[^1]的句子。下一句。\n\n[^1]: 注释原文。\n'}
];
function getSaved(){try{return {...defaults(),...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{return defaults();}}
const state=getSaved();
// The comparison surface has exactly three fixed vertically stacked engines.
state.engines=engineCatalog.map(e=>e.id);
const allSamples=()=>[...samples,...state.custom];
let sample=samples[0],runs=new Map(),issues=[],focused=null,manual=false;
let lastRevealed=null;
let inventory=new Map(),activeBlockId=null;
let review=freshReview(''),reviewRevision=null,reviewReady=false;
let saveTail=Promise.resolve(),reviewSavingError=false;
let translationTable=null;
function selectBlockAt(offset){
  activeBlockId=blockAt(inventory,offset)?.id??null;
}
function refreshReview(){
  const next=synchronizeReview(review,inventory);
  const changed=reviewChanged(review,next);
  review=next;
  if(changed&&reviewReady)enqueueReviewSave();
}
function enqueueReviewSave(){
  if(!reviewReady||sample.id!=='reviewed'||reviewSavingError)return;
  const snapshot=structuredClone(review);
  saveTail=saveTail.then(async()=>{
    if(reviewSavingError)return;
    const response=await fetch('./api/sentence-review',{
      method:'PUT',headers:{'Content-Type':'application/json',
        'X-OCR2MD-Sentence-Review':'1','If-Match':reviewRevision},
      body:JSON.stringify(snapshot),cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status+
      (response.status===412?'：其他窗口已修改审阅文件，请刷新':''));
    const result=await response.json();
    reviewRevision=result.revision;
    status('已持久化 '+Object.keys(snapshot.blocks).length+
      ' 个块的分句审阅 · CMD 原文未修改');
  }).catch(error=>{
    reviewSavingError=true;reviewReady=false;
    status('分句审阅保存失败：'+error.message+'。已停止写入，刷新后重新读取。',true);
    renderSource();
  });
}
async function loadReview(){
  const loaded=sample;
  await saveTail;
  if(loaded!==sample||loaded.id!=='reviewed')return;
  try{
    const response=await fetch('./api/sentence-review',{cache:'no-store'});
    if(!response.ok)throw Error('审阅文件 HTTP '+response.status);
    const value=await response.json();
    if(value.schema!==REVIEW_SCHEMA||value.sourceSha256!==loaded.sha256)
      throw Error('审阅文件的 CMD SHA-256 不匹配');
    if(loaded!==sample)return;
    reviewRevision=value.revision;
    review={schema:REVIEW_SCHEMA,sourceSha256:value.sourceSha256,
      blocks:value.blocks||{},manualGold:{...gold(),...value.manualGold}};
    state.gold[sourceKey()]=review.manualGold;
    persist();reviewReady=true;reviewSavingError=false;
    refreshReview();computeIssues();render();
    const auto=Object.values(review.blocks).filter(x=>x.status==='auto').length;
    status('已加载独立审阅文件 · 自动一致 '+auto+
      ' 块 · 已仲裁 '+Object.values(review.blocks).filter(x=>x.status==='arbitrated').length+' 块');
  }catch(error){
    reviewReady=false;reviewSavingError=true;
    status('审阅文件不可用：'+error.message+'；已停用采用操作，Gold 仍在浏览器。',true);
    renderSource();
  }
}
function adoptEngine(engine,checked){
  const row=inventory.get(activeBlockId);
  if(!reviewReady||sample.id!=='reviewed'||!row?.disagreed){
    status('请先在已审阅 CMD 中点击一个存在句界分歧的 PBS 文本块。',true);
    renderSource();return;
  }
  if(checked){
    const chosen=row.engines.find(e=>e.engine===engine&&e.valid&&e.covered);
    if(!chosen){renderSource();return;}
    review.blocks[row.id]={status:'arbitrated',engine,boundaries:[...chosen.boundaries]};
  }else{
    delete review.blocks[row.id];
  }
  // The adopted atom leaves 分歧块 immediately; the revoked atom leaves
  // 已仲裁 immediately. Move the visible selection to the next eligible
  // subblock, rather than leaving a checked control bound to hidden source.
  const mode=$('view-mode').value;
  if((checked&&mode==='disagree')||(!checked&&mode==='arbitrated')){
    const remaining=[...inventory.values()].filter(item=>mode==='disagree'?
      item.disagreed&&review.blocks[item.id]?.status!=='arbitrated':
      review.blocks[item.id]?.status==='arbitrated');
    const next=remaining.find(item=>item.from>row.from)??remaining[0]??null;
    activeBlockId=next?.id??null;
    focused=next?.textFrom??null;
    lastRevealed=null;
  }
  enqueueReviewSave();render();
  status(row.id+(checked?' 已采用 '+engine+' 的完整句界；已移出分歧块':' 已撤销仲裁；已返回分歧块')+' · 正在落盘');
}
const compare=createSentenceCompareWorkspace($('workspace'),{
  onPosition(source){
    selectBlockAt(source);
    if(!issues.length){renderSource();return;}
    const closest=issues.reduce((best,item)=>
      Math.abs(item.pos-source)<Math.abs(best.pos-source)?item:best,issues[0]);
    focused=Math.abs(closest.pos-source)>220?source:closest.pos;
    lastRevealed=focused;manual=false;
    renderSource();renderJudgments();renderIndex();renderManual();renderReport();
  },
  onAdopt:adoptEngine
});
// The review layer reads only source coordinates and never CM6 EditorView.
const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function checksum(s){let v=2166136261;for(let i=0;i<s.length;i++)v=Math.imul(v^s.charCodeAt(i),16777619);return(v>>>0).toString(16);}
const sourceKey=()=>sample.md.length+':'+checksum(sample.md);
const gold=()=>state.gold[sourceKey()]||{};
function status(msg,err=false){$('status').textContent=msg;$('status').style.color=err?'#b34036':'';}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch(e){status('本地存储不足，请导出 Gold：'+e.message,true);return false;}}
function selectSample(id){
  sample=allSamples().find(s=>s.id===id)||samples[0];state.selected=sample.id;
  const selector=$('sample-select');selector.replaceChildren();
  for(const entry of allSamples())selector.add(new Option(entry.name,entry.id));
  selector.value=sample.id;
  $('delete-sample').disabled=samples.some(s=>s.id===sample.id);
  $('sample-meta').textContent=sample.md.length.toLocaleString()+' 字符 · '+
    (sample.sha256?'SHA-256 '+sample.sha256.slice(0,16):checksum(sample.md));
  $('sample-meta').title=sample.sha256||'非封存测试样本';
  focused=null;lastRevealed=null;manual=false;
  reviewReady=false;reviewSavingError=false;reviewRevision=null;
  review=freshReview(sample.sha256||'');activeBlockId=null;
  $('translation-drawer').hidden=true;translationTable=null;
  $('toggle-translation').textContent='待翻译句块表';
  $('toggle-translation').setAttribute('aria-expanded','false');
  persist();compute();
  if(sample.id==='reviewed')void loadReview();
}
function updateEngineOptions(){
  const node=$('engine-options');node.replaceChildren();
  for(const e of engineCatalog){
    const label=document.createElement('label'),box=document.createElement('input');
    box.type='checkbox';box.value=e.id;box.checked=state.engines.includes(e.id);
    box.onchange=()=>{
      const chosen=[...node.querySelectorAll('input:checked')].map(x=>x.value);
      if(!chosen.length){box.checked=true;return;}
      state.engines=chosen;persist();compute();
    };
    label.append(box,document.createTextNode(e.name));node.append(label);
  }
}
function compute(){
  runs=new Map();
  for(const id of state.engines){
    const started=performance.now();
    try{
      const value=split(sample.md,id),elapsed=performance.now()-started;
      if(rebuild(value)!==sample.md)throw Error('无损重组失败');
      runs.set(id,{value,elapsed,positions:new Set(value.sentences
        .map(s=>s.fragments.at(-1)?.to).filter(x=>Number.isInteger(x))),lossless:true});
    }catch(e){runs.set(id,{error:String(e.message||e),
      elapsed:performance.now()-started,lossless:false});}
  }
  inventory=reviewInventory(sample.md,runs);
  computeIssues();selectBlockAt(focused);
  refreshReview();render();
  const failures=[...runs.values()].filter(v=>!v.lossless);
  status(failures.length?'引擎运行失败 '+failures.length+' 个，已排除其评分。':
    '分句完成。先选择有分歧的 PBS 子块，再勾选对应引擎顶栏「采用」。',!!failures.length);
}
function computeIssues(){
  const union=new Set();
  for(const run of runs.values())for(const pos of run.positions||[])union.add(pos);
  for(const offset of Object.keys(gold()))union.add(Number(offset));
  issues=[...union].filter(n=>Number.isInteger(n)&&n>=0&&n<=sample.md.length)
    .sort((a,b)=>a-b).map(pos=>{
      const votes=[...runs.values()].filter(v=>v.positions).map(v=>v.positions.has(pos));
      return {pos,disagree:votes.some(v=>v!==votes[0]),manual:!votes.some(Boolean),
        reviewed:Object.hasOwn(gold(),String(pos))};
    });
  if(!issues.some(i=>i.pos===focused))focused=issues.find(i=>i.disagree)?.pos??issues[0]?.pos??null;
}
function visibleIssues(){
  const filter=$('review-filter').value;
  if(filter==='pending')return issues.filter(i=>!i.reviewed);
  if(filter==='disagree')return issues.filter(i=>i.disagree||i.manual);
  return issues;
}
function move(n){
  const list=visibleIssues(),index=list.findIndex(i=>i.pos===focused);
  if(!list.length)return;
  focused=list[Math.min(list.length-1,Math.max(0,index+n))].pos;
  selectBlockAt(focused);manual=false;render();
}
function decide(pos,value,isManual=false){
  if(!Number.isInteger(pos)||pos<0||pos>sample.md.length)return;
  const key=sourceKey();state.gold[key] ||= {};
  if(value===null)delete state.gold[key][pos];
  else state.gold[key][pos]={break:!!value,manual:!!isManual};
  focused=pos;manual=false;
  const saved=persist();
  if(sample.id==='reviewed'&&reviewReady){review.manualGold={...gold()};enqueueReviewSave();}
  computeIssues();render();
  if(saved)status('已自动保存：'+pos+' → '+(value===null?'未裁决':value?'应断句':'不应断句')+
    '。换设备请导出、导入 Gold JSON。');
}
function renderSource(){
  const mode=$('view-mode').value;
  if((mode==='disagree'||mode==='arbitrated')&&inventory.size){
    const eligible=[...inventory.values()].filter(row=>mode==='disagree'?
      row.disagreed&&review.blocks[row.id]?.status!=='arbitrated':
      review.blocks[row.id]?.status==='arbitrated');
    const current=blockAt(inventory,focused)?.id;
    if(!eligible.some(row=>row.id===activeBlockId&&
      (focused===null||row.id===current))){
      const next=eligible.find(row=>row.id===current)??
        eligible.find(row=>focused!==null&&row.from>focused)??eligible[0]??null;
      activeBlockId=next?.id??null;
      focused=next?.textFrom??null;
      lastRevealed=null;
    }
  }
  compare.update({source:sample.md,results:runs,filter:mode,
    decisions:gold(),selectedPos:focused,accepted:review.blocks,
    disputed:[...inventory.values()].filter(x=>x.disagreed).map(x=>x.id),
    activeBlockId,finalBoundaries:acceptedBoundaries(review,inventory),
    canAdopt:reviewReady&&sample.id==='reviewed'});
  if(focused!==null&&focused!==lastRevealed){
    compare.reveal(focused);
    lastRevealed=focused;
  }
}
function renderJudgments(){
  const active=issues.find(i=>i.pos===focused),list=visibleIssues();
  const n=list.findIndex(i=>i.pos===focused);
  $('issue-number').textContent=n<0?'无待审句界':(n+1)+' / '+list.length;
  $('issue-summary').textContent=active?
    '原文字符偏移 '+active.pos+' · '+
    (active.disagree?'引擎分歧':active.manual?'人工补充':'引擎一致')+' · '+
    (gold()[active.pos]?(gold()[active.pos].break?'✓ 应断句':'× 不应断句'):'待审阅'):
    '当前筛选没有候选句界。';
  const host=$('engine-judgments');host.replaceChildren();
  if(!active)return;
  for(const e of engineCatalog.filter(e=>state.engines.includes(e.id))){
    const r=runs.get(e.id),cut=r?.positions?.has(active.pos);
    const item=document.createElement('div');item.className='engine-judgment';
    if(!r?.positions)item.textContent=e.name+'：'+(r?.error||'引擎失败');
    else{
      item.innerHTML='<div class="judgment-head"><span>'+esc(e.name)+'</span><span class="'+
        (cut?'split':'no-split')+'">'+(cut?'│ 此处断句':'↔ 此处不断')+'</span></div><code>'+
        esc(sample.md.slice(Math.max(0,active.pos-68),active.pos))+
        (cut?'<em> │ </em>':'')+
        esc(sample.md.slice(active.pos,Math.min(sample.md.length,active.pos+68)))+'</code>';
      item.title='点击采纳此引擎的判断';item.onclick=()=>decide(active.pos,cut);
    }
    host.append(item);
  }
}
function renderIndex(){
  const container=$('issue-list');container.replaceChildren();
  const visible=visibleIssues();$('issue-list-count').textContent=visible.length+' 处';
  for(const i of visible){
    const btn=document.createElement('button');btn.type='button';
    const vote=gold()[i.pos];
    btn.className='issue-button'+(i.pos===focused?' selected':'')+
      (vote?(vote.break?' decided':' rejected'):'');
    const left=document.createElement('span');
    left.textContent=sample.md.slice(Math.max(0,i.pos-14),Math.min(sample.md.length,i.pos+15))
      .replace(/\s+/g,' ').trim()||'(空白)';
    const right=document.createElement('span');right.textContent=i.pos;
    right.style.color='#8191a4';btn.append(left,right);
    btn.onclick=()=>{focused=i.pos;manual=false;render();};
    container.append(btn);
  }
  container.querySelector('.selected')?.scrollIntoView({block:'nearest'});
}
function renderManual(){
  const panel=$('manual-picker');panel.hidden=!manual||focused==null;
  if(panel.hidden)return;
  const from=Math.max(0,focused-52),to=Math.min(sample.md.length,focused+52);
  const box=$('manual-chars');box.replaceChildren();
  const substr=sample.md.slice(from,to);
  for(const item of new Intl.Segmenter('en',{granularity:'grapheme'}).segment(substr)){
    const button=document.createElement('button');button.type='button';
    const pos=from+item.index+item.segment.length;
    button.textContent=item.segment==='\n'?'↵':item.segment===' '?'·':item.segment;
    button.title='在字符 '+pos+' 后断句';button.onclick=()=>decide(pos,true,true);
    box.append(button);
  }
}
function scores(){
  const reviewed=Object.entries(gold()).filter(([_,v])=>typeof v?.break==='boolean');
  return engineCatalog.filter(e=>state.engines.includes(e.id)).map(e=>{
    const r=runs.get(e.id);if(!r?.positions)return {engine:e.name,error:r?.error};
    let tp=0,fp=0,fn=0,tn=0;
    for(const [pos,choice] of reviewed){
      const hit=r.positions.has(Number(pos));
      if(hit&&choice.break)tp++;else if(hit)fp++;else if(choice.break)fn++;else tn++;
    }
    const precision=tp+fp?tp/(tp+fp):null,recall=tp+fn?tp/(tp+fn):null;
    return {engine:e.name,engineId:e.id,sentences:r.value.sentences.length,
      elapsedMs:Math.round(r.elapsed*10)/10,precision,recall,
      f1:precision!=null&&recall!=null&&precision+recall?
        2*precision*recall/(precision+recall):null,tp,fp,fn,tn,lossless:r.lossless};
  });
}
function renderReport(){
  const reviewed=Object.keys(gold()).length;
  $('kpi-engines').textContent=[...runs.values()].filter(r=>r.lossless).length+' / '+runs.size;
  $('kpi-diffs').textContent=issues.filter(i=>i.disagree).length;
  $('kpi-reviewed').textContent=reviewed+' / '+issues.length;
  const entries=Object.values(review.blocks);
  $('kpi-saved').textContent=entries.filter(x=>x.status==='auto').length+' 自动 / '+
    entries.filter(x=>x.status==='arbitrated').length+' 仲裁';
  const okay=[...runs.values()].every(v=>v.lossless);
  $('kpi-roundtrip').textContent=okay?'100% PASS':'FAIL';
  $('kpi-roundtrip').style.color=okay?'#2a7752':'#ae3b33';
  const tbody=$('score-table').querySelector('tbody');tbody.replaceChildren();
  const fmt=x=>x==null?'—':(x*100).toFixed(1)+'%';
  for(const item of scores()){
    const tr=document.createElement('tr');
    const fields=item.error?[item.engine,'失败','—','—','—','—','FAIL']:
      [item.engine,item.sentences,item.elapsedMs+' ms',fmt(item.precision),
      fmt(item.recall),fmt(item.f1),'PASS'];
    for(const value of fields){
      const td=document.createElement('td');td.textContent=String(value);tr.append(td);
    }
    tbody.append(tr);
  }
  $('gold-note').textContent='人工已裁决 '+reviewed+' / '+issues.length+
    ' 个候选句界。F1 仅统计人工审过的位置；引擎全部遗漏的位置需要全文审阅并手工补充。'+
    '裁决自动保存于本设备浏览器，支持 Gold JSON 导入/导出以跨设备继续。';
}
function render(){
  const select=$('display-engine'),previous=select.value;select.replaceChildren();
  for(const e of engineCatalog.filter(e=>runs.get(e.id)?.positions))
    select.add(new Option(e.name,e.id));
  if([...select.options].some(o=>o.value===previous))select.value=previous;
  const visible=visibleIssues();
  if(!visible.some(i=>i.pos===focused)&&visible.length)focused=visible[0].pos;
  renderSource();renderJudgments();renderIndex();renderManual();renderReport();
  renderTranslationTable();
  const n=visible.findIndex(i=>i.pos===focused);
  $('prev-issue').disabled=n<=0;$('next-issue').disabled=n<0||n>=visible.length-1;
  for(const id of ['approve-issue','reject-issue','clear-issue','manual-issue'])
    $(id).disabled=focused===null;
}
function currentTranslationTable(){
  if(sample.id!=='reviewed'||!reviewReady||reviewSavingError||
    !sample.sha256||review.sourceSha256!==sample.sha256)
    throw Error('请先载入已审阅 CMD 与匹配的句界审阅文件');
  return buildTranslationTable(sample.md,review,inventory);
}
function renderTranslationTable(){
  if($('translation-drawer').hidden)return;
  try{
    const table=currentTranslationTable();
    translationTable=table;
    const rows=table.rows;
    const sentences=rows.filter(row=>row.type==='sentence').length;
    const blocks=rows.length-sentences;
    const merged=rows.filter(row=>row.blockIds?.length>1).length;
    $('translation-summary').textContent=rows.length+' 行 · 句子 '+sentences+
      ' · 整块 '+blocks+' · 已合并断行 '+merged+' 处 · 全部可交 AI';
    const tbody=$('translation-table').querySelector('tbody');
    const fragment=document.createDocumentFragment();
    const sources={auto:'引擎一致',arbitrated:'人工采用',whole_block:'整块默认'};
    for(const row of rows){
      const tr=document.createElement('tr');
      for(const value of [row.id,row.blockIds?.join(' → ')||row.blockId,
        row.type==='sentence'?'句子':'整块',
        sources[row.decision]||'整块默认',
        row.original,'待 AI 回填','待 AI 回填']){
        const cell=document.createElement('td');
        cell.textContent=value;
        if(value==='待 AI 回填')cell.classList.add('ocr-sb-unfilled');
        tr.append(cell);
      }
      tr.title='CMD UTF-16 '+row.from+'–'+row.to+' · 点击定位原文';
      tr.onclick=()=>{
        $('view-mode').value='full';
        focused=row.from;selectBlockAt(focused);lastRevealed=null;manual=false;
        renderSource();
      };
      fragment.append(tr);
    }
    tbody.replaceChildren(fragment);
    $('export-translation').disabled=false;
    $('export-reviewed-md').disabled=false;
    $('publish-reviewed').disabled=false;
  }catch(error){
    translationTable=null;
    $('translation-summary').textContent='句块表不可用：'+error.message;
    $('translation-table').querySelector('tbody').replaceChildren();
    $('export-translation').disabled=true;
    $('export-reviewed-md').disabled=true;
    $('publish-reviewed').disabled=true;
  }
}
async function exportTranslationTable(){
  try{
    await saveTail;
    const table=currentTranslationTable();
    // Distinguish corrected reviewed-seam units from the historical broken
    // export: the CMD SHA is unchanged, but the AI unit identity has changed.
    const sourceName='translation-units-'+table.sourceSha256.slice(0,12)+'-reviewed-seams.json';
    download(sourceName,table);
    status('已导出唯一待翻译句块表 · '+table.rows.length+
      ' 行（均为有效 AI 翻译单位），不修改 CMD 或审阅文件');
  }catch(error){
    status('句块表导出失败：'+error.message,true);
  }
}
async function exportReviewedMD(){
  try{
    await saveTail;
    const packageData=createReviewedSourcePackage(sample.md,currentTranslationTable(),reviewRevision);
    downloadText('reviewed-'+packageData.sourceSha256.slice(0,12)+'.md',
      packageData.clean.doc,'text/markdown; charset=utf-8');
    status('已导出审阅 MD · '+packageData.baseline.rows.length+' 条 · 已接合 '+
      packageData.clean.stats.reviewedJoins+' 处 · CMD 无改动');
  }catch(error){status('审阅 MD 导出失败：'+error.message,true);}
}
async function publishReviewedSource(){
  $('publish-reviewed').disabled=true;
  try{
    await saveTail;
    const pkg=createReviewedSourcePackage(sample.md,currentTranslationTable(),reviewRevision);
    const response=await fetch('./api/reviewed-source',{
      method:'PUT',headers:{'Content-Type':'application/json',
        'X-OCR2MD-Reviewed-Source':'1','If-Match':reviewRevision},
      body:JSON.stringify(pkg),cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status+
      (response.status===412?' · 仲裁已更新，请刷新':''));
    const written=await response.json();
    if(written.sourceSha256!==pkg.sourceSha256||
        written.units!==pkg.baseline.rows.length)
      throw Error('服务器审阅 MD 回执不一致');
    status('已发布审阅 MD 至校译 Lab · '+written.units+
      ' 条 · 已接合 '+pkg.clean.stats.reviewedJoins+' 处；GPT/Grok 新译文仍待导入');
  }catch(error){status('审阅 MD 发布失败：'+error.message,true);}
  finally{$('publish-reviewed').disabled=false;}
}
function downloadText(name,text,mime){
  const blob=new Blob([text],{type:mime});
  const href=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=href;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(href),1500);
}
function download(name,data){
  downloadText(name,JSON.stringify(data,null,2)+'\n','application/json');
}
const sampleMeta=()=>({name:sample.name,length:sample.md.length,checksum:checksum(sample.md)});
function exportGold(){
  download('human-gold-'+checksum(sample.md)+'.json',{
    schema:'ocr2md-human-gold/v1',sample:sampleMeta(),
    coordinate:'UTF16 offset in original Markdown; boundary after offset',
    decisions:Object.entries(gold()).map(([offset,v])=>({
      offset:Number(offset),break:v.break,manual:!!v.manual
    })).sort((a,b)=>a.offset-b.offset)});
  status('human-gold.json 已导出，可在另一设备导入。');
}
function exportReport(){
  download('sentence-report-'+checksum(sample.md)+'.json',{
    schema:'ocr2md-sentence-score/v1',sample:sampleMeta(),
    candidates:issues.length,disagreements:issues.filter(x=>x.disagree).length,
    adjudicated:Object.keys(gold()).length,
    scope:'F1 valid only on human-reviewed boundaries; not full-document accuracy',
    scores:scores()});
}
async function importGold(event){
  const file=event.target.files?.[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(data.schema!=='ocr2md-human-gold/v1'||
      data.sample.length!==sample.md.length||
      data.sample.checksum!==checksum(sample.md)||!Array.isArray(data.decisions))
      throw Error('样本指纹不匹配');
    const decisions={};
    for(const d of data.decisions){
      if(!Number.isInteger(d.offset)||d.offset<0||d.offset>sample.md.length||
        typeof d.break!=='boolean')throw Error('存在无效句界');
      decisions[d.offset]={break:d.break,manual:!!d.manual};
    }
    state.gold[sourceKey()]=decisions;
    if(!persist())return;
    if(sample.id==='reviewed'&&reviewReady){review.manualGold={...gold()};enqueueReviewSave();}
    computeIssues();render();
    status('已验证样本指纹并导入 '+Object.keys(decisions).length+' 条裁决。');
  }catch(error){status('Gold 导入失败：'+error.message,true);}
  finally{event.target.value='';}
}
async function importSample(event){
  const file=event.target.files?.[0];if(!file)return;
  try{
    if(file.size>1500000)throw Error('单份 Markdown 大于 1.5MB');
    const md=await file.text(),id='import-'+checksum(md)+'-'+checksum(file.name);
    if(!allSamples().some(s=>s.id===id)){
      state.custom.push({id,name:file.name,md});
      if(!persist()){state.custom.pop();return;}
    }
    selectSample(id);status('已导入 '+file.name+'，样本与裁决仅存本设备。');
  }catch(error){status('样本导入失败：'+error.message,true);}
  finally{event.target.value='';}
}
$('sample-select').onchange=e=>selectSample(e.target.value);
$('sample-file').onchange=importSample;
$('delete-sample').onclick=()=>{if(samples.some(s=>s.id===sample.id))return;
  state.custom=state.custom.filter(s=>s.id!==sample.id);selectSample('demo');};
$('view-mode').onchange=()=>{lastRevealed=null;renderSource();};
$('pbs-page-select').onchange=()=>{
  const select=$('pbs-page-select');
  const target=compare.pbsPageTarget(select.value);
  if(!target){status('当前样本没有 PBS p 编码。',true);return;}
  // This p is already present in the selected block type's visible range.
  // Keep 分歧块 / 无分句块 active when navigating within that filtered set.
  const match=[...inventory.values()].find(row=>
    row.id.startsWith(select.value+'b')&&
    ($('view-mode').value==='arbitrated'?review.blocks[row.id]?.status==='arbitrated':
      $('view-mode').value==='disagree'?
        row.disagreed&&review.blocks[row.id]?.status!=='arbitrated':false));
  focused=match?.textFrom??target.sourceOffset;
  selectBlockAt(focused);lastRevealed=null;manual=false;
  renderSource();
  status(target.key+' → CMD 第 '+target.sourceLine+
    ' 行 · '+target.blockId);
};
$('toggle-translation').onclick=()=>{
  const panel=$('translation-drawer'),open=panel.hidden;
  if(open&&!$('review-drawer').hidden){
    $('review-drawer').hidden=true;
    $('toggle-review').setAttribute('aria-expanded','false');
    $('toggle-review').textContent='人工裁决 / Gold';
  }
  panel.hidden=!open;
  $('toggle-translation').setAttribute('aria-expanded',String(open));
  $('toggle-translation').textContent=open?'收起句块表':'待翻译句块表';
  renderTranslationTable();
  window.dispatchEvent(new Event('resize'));
};
$('close-translation').onclick=()=>$('toggle-translation').click();
$('export-translation').onclick=exportTranslationTable;
$('export-reviewed-md').onclick=exportReviewedMD;
$('publish-reviewed').onclick=publishReviewedSource;
$('toggle-review').onclick=()=>{
  if($('review-drawer').hidden&&!$('translation-drawer').hidden){
    $('translation-drawer').hidden=true;
    $('toggle-translation').setAttribute('aria-expanded','false');
    $('toggle-translation').textContent='待翻译句块表';
  }
  const drawer=$('review-drawer'),open=drawer.hidden;
  drawer.hidden=!open;
  $('toggle-review').setAttribute('aria-expanded',String(open));
  $('toggle-review').textContent=open?'收起人工裁决':'人工裁决 / Gold';
  // Dockview observes the resizable root. Do not recreate CM6 states.
  window.dispatchEvent(new Event('resize'));
};
$('display-engine').onchange=renderSource;
$('review-filter').onchange=()=>{const list=visibleIssues();
  focused=list.find(i=>i.pos===focused)?.pos??list[0]?.pos??null;render();};
$('prev-issue').onclick=()=>move(-1);
$('next-issue').onclick=()=>move(1);
$('approve-issue').onclick=()=>decide(focused,true);
$('reject-issue').onclick=()=>decide(focused,false);
$('clear-issue').onclick=()=>decide(focused,null);
$('manual-issue').onclick=()=>{manual=true;renderManual();};
$('cancel-manual').onclick=()=>{manual=false;renderManual();};
$('export-gold').onclick=exportGold;
$('gold-file').onchange=importGold;
$('export-report').onclick=exportReport;
updateEngineOptions();
// The server exposes its OWN persisted CMD document. In the Lab that file is
// an isolated, frozen copy of Main's SAVED PDF-reviewed CMD. This page never
// fetches Main origin, mutates the server document or stores a shadow MD in
// localStorage. Sample switching affects only this read-only reviewer.
async function initializeReviewedSample(){
  try {
    const response=await fetch('./api/document',{cache:'no-store'});
    if(!response.ok)throw Error('Lab snapshot HTTP '+response.status);
    const md=await response.text();
    if(!md.includes('<!-- cmd:block:v1'))throw Error('服务器文档缺少已审阅 CMD 块标记');
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(md)));
    const sha256=[...hash].map(x=>x.toString(16).padStart(2,'0')).join('');
    samples.unshift({id:'reviewed',name:'Main 已审阅 CMD · 独立快照',md,sha256});
    // One-time migration from the previous unreviewed-fixture default.
    // Subsequent user-selected samples remain sticky across reloads.
    if(!state.reviewedDefaultApplied){
      state.reviewedDefaultApplied=true;
      state.selected='reviewed';
    }
    selectSample(state.selected);
    if(sample.id==='reviewed')status('已加载 Main 审阅 CMD 隔离快照 · SHA-256 '+sha256.slice(0,16));
  } catch (error) {
    // Failure is visible: never silently present the MinerU fixture as
    // though it were the reviewed Main document.
    selectSample(state.selected==='reviewed'?'demo':state.selected);
    status('已审阅 CMD 快照不可用：'+error.message+'。当前仅有旧测试样本。',true);
  }
}
await initializeReviewedSample();
