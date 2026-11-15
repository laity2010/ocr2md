/** CM6 -> SQLite MD line-splice transport. It never owns editable rows.
 * Its only cache is the exact immutable in-flight CAS request for retries.
 */
import {mdSplice} from './md-runtime.js';
export function createMdPersistence({
  read,ack,post,onStatus=()=>{},idleMs=1100,
  makeRequestId=()=>crypto.randomUUID(),
}){
  if([read,ack,post].some(fn=>typeof fn!=='function'))
    throw Error('MD 持久化依赖 CM6 状态和公开 API');
  let timer=null,running=null,inflight=null,blocked=false,disposed=false;
  const schedule=()=>{
    if(timer!==null)clearTimeout(timer);
    timer=setTimeout(()=>{timer=null;void flush().catch(()=>{});},idleMs);
  };
  async function flush(){
    if(disposed)throw Error('MD 持久化已销毁');
    if(blocked)throw Error('MD 版本冲突；CM 当前修改保留，不允许覆盖 SQLite');
    if(timer!==null){clearTimeout(timer);timer=null;}
    if(running){
      const saved=await running;
      if(read()?.dirty)return Boolean(await flush())||saved;
      return saved;
    }
    const work=async()=>{
      let wrote=false;
      while(!disposed){
        const state=read();
        if(!state?.dirty)return wrote;
        if(!inflight){
          const patch=mdSplice(state.savedRows,state.rows);
          if(!patch)return wrote;
          inflight={requestId:makeRequestId(),expectedRevision:state.revision,
            ...patch,savedRows:state.rows};
        }
        try{
          const {savedRows,...body}=inflight;
          const response=await post(body);
          if(response?.revision!==inflight.expectedRevision+1)
            throw Error('MD SQLite 回执版本异常，拒绝确认 CM 更新');
          ack(savedRows,response.revision);
          inflight=null;
          wrote=true;
          onStatus('✓ MD 行表已保存 · revision '+response.revision,'ok');
        }catch(error){
          if(/版本冲突/.test(error.message)){
            blocked=true;
            onStatus('MD 保存版本冲突 · CM6 未保存文本保持原样：'+error.message,'error');
          }else onStatus('MD 后台保存失败，CM6 保留修改；可点击保存重试：'+error.message,'warning');
          throw error;
        }
      }
      return wrote;
    };
    running=work();
    try{return await running;}
    finally{running=null;}
  }
  return Object.freeze({
    changed(){if(!disposed)schedule();},
    flush,
    dispose(){disposed=true;if(timer!==null)clearTimeout(timer);timer=null;},
    status(){return {pending:Boolean(read()?.dirty),inFlight:Boolean(inflight),blocked};},
  });
}
