/** WP04F2: native CM6 state/effect history is the live review authority.
 * SQL is a saved checkpoint, never the UI mutation gate.
 */
import {EditorState,StateEffect,StateField} from '@codemirror/state';
import {history,invertedEffects,isolateHistory,undo,redo,undoDepth,redoDepth} from '@codemirror/commands';
const setChoice=StateEffect.define();
const choicesField=StateField.define({create:()=>new Map(),update(value,tr){
 for(const e of tr.effects)if(e.is(setChoice)){
  value=new Map(value);
  if(e.value.engine===null)value.delete(e.value.line);else value.set(e.value.line,e.value.engine);
 }
 return value;
}});
const ids=['intl','sentence-splitter','wink-nlp'];
const require=(ok,message)=>{if(!ok)throw Error(message);};
export function choiceRows(line,group,engine){
 const first=group[0];
 if((first.adopted_engine??null)===engine)return group;
 require(['disputed','adopted'].includes(first.review_state),'不可仲裁行');
 const cuts=engine===null?[]:JSON.parse(first.candidates_json)[engine].boundaries;
 const points=[0,...cuts,line.text.length];
 return points.slice(0,-1).map((from,i)=>({...first,
  sentence_index:i,from_utf16:from,to_utf16:points[i+1],raw:line.text.slice(from,points[i+1])+(i===points.length-2?line.ownedTail:''),candidates_json:i===0?first.candidates_json:null,
  review_state:i===0?(engine===null?'disputed':'adopted'):null,adopted_engine:i===0?engine:null
 }));
}
export function createReviewSession(snapshot,rows,{save,report=()=>{},delay=850,timers={set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)}}){
 const groups=new Map();
 for(const r of rows){if(!groups.has(r.source_line))groups.set(r.source_line,[]);groups.get(r.source_line).push(r);}
 const base=new Map(),eligible=new Set(),initial=new Map();
 for(const [line,group] of groups){
  const first=group[0];base.set(line,first.adopted_engine??null);
  if(first.adopted_engine)initial.set(line,first.adopted_engine);
  if(['disputed','adopted'].includes(first.review_state))eligible.add(line);
 }
 let state=EditorState.create({doc:'',extensions:[
  choicesField.init(()=>initial),history(),
  invertedEffects.of(tr=>tr.effects.filter(e=>e.is(setChoice)).map(e=>setChoice.of({line:e.value.line,engine:tr.startState.field(choicesField).get(e.value.line)??null})))
 ]});
 let timer=null,inflight=null,attempt=null,disposed=false;
 const choices=()=>state.field(choicesField);
 const value=line=>choices().get(line)??null;
 const changes=()=>[...eligible].filter(line=>value(line)!==base.get(line)).map(line=>({
  line,previous:base.get(line),next:value(line),first:groups.get(line)[0]
 }));
 const pending=()=>Boolean(attempt||inflight||changes().length);
 const clear=()=>{if(timer!==null){timers.clear(timer);timer=null;}};
 function schedule(){
  clear();
  if(disposed)return;
  if(pending())timer=timers.set(()=>{timer=null;void writeOne();},delay);
  else report('✓ 分句状态与已保存句表一致','ok');
 }
 function writeOne(){
  if(disposed)return Promise.resolve(false);
  if(inflight)return inflight;
  attempt??=changes();
  if(!attempt.length){attempt=null;return Promise.resolve(true);}
  const batch=attempt;
  report('正在保存 '+batch.length+' 行仲裁…','info');
  inflight=(async()=>{
   try{
    await save(batch);
    for(const c of batch)base.set(c.line,c.next);
    attempt=null;
    report(changes().length?'● 仲裁有新修改 · 待保存':'✓ 分句仲裁已保存',changes().length?'warning':'ok');
    return true;
   }catch(error){
    report('● 分句尚未确认保存：'+error.message+' · 内存及撤销历史保留，点击全局保存重试','error');
    return false;
   }
  })();
  const running=inflight;
  void running.then(ok=>{
   if(inflight===running)inflight=null;
   // A later edit may have happened while the request was in flight.
   // Failed attempts are retained, including lost replies; no retry loop.
   if(ok&&!disposed&&changes().length&&timer===null)schedule();
  });
  return running;
 }
 function changed(){
  report(pending()?'● 分句仲裁待保存':'✓ 分句状态与已保存句表一致',pending()?'warning':'ok');
  schedule();
 }
 return {
  choices,depth:()=>({undo:undoDepth(state),redo:redoDepth(state)}),pending,
  rows:()=>[...groups].flatMap(([line,group])=>eligible.has(line)?choiceRows(snapshot.lines[line-1],group,value(line)):group),
  choose(line,engine){
   if(!eligible.has(line)||!([null,...ids].includes(engine))||value(line)===engine)return false;
   state=state.update({effects:setChoice.of({line,engine}),annotations:isolateHistory.of('full')}).state;
   changed();return true;
  },
  history(direction){
   let tr;const command=direction==='undo'?undo:redo;
   if(!command({state,dispatch:t=>{tr=t;}}))return null;
   const effect=tr.effects.find(e=>e.is(setChoice));
   if(!effect)throw Error('缺少仲裁历史 effect');
   state=tr.state;changed();return effect.value.line;
  },
  async flush(){
   clear();
   while(pending()){
    if(!await writeOne())return false;
    clear();
   }
   return true;
  },
  dispose(){clear();disposed=true;}
 };
}
