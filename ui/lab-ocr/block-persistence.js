/** WCP42 asynchronous persistence transport; ALL editable rows/history/queue
 * live in CM6. This object owns only an in-flight idempotency receipt, an
 * idle timer and network I/O. It must never hold an alternate Block dataset.
 */
export function createBlockPersistence({
  read,ack,post,onStatus=()=>{},idleMs=1050,makeBatchId=()=>crypto.randomUUID(),
}){
  if(typeof read!=='function'||typeof ack!=='function'||typeof post!=='function')
    throw Error('Block 持久化需要 CM 状态和 API 函数');
  let timer=null,running=null,inflight=null,blocked=false,disposed=false;
  const idle=()=>{
    if(timer!==null)clearTimeout(timer);
    timer=setTimeout(()=>{timer=null;void flush().catch(()=>{});},idleMs);
  };
  async function flush(){
    if(disposed)throw Error('Block 持久化已销毁');
    if(blocked)throw Error('Block 版本冲突；CM 内存状态仍保留，请先解决冲突');
    if(timer!==null){clearTimeout(timer);timer=null;}
    if(running){
      // Explicit Save may join an in-flight idle flush. Return the actual
      // successful write result, not 'false' merely because the idle worker
      // already drained the queue before Save resumed.
      const saved=await running;
      if(read()?.queue?.length)return Boolean(await flush())||saved;
      return saved;
    }
    const process=async()=>{
      let wrote=false;
      while(!disposed){
        const state=read();
        if(!state?.queue?.length)return wrote;
        if(!inflight){
          const commands=state.queue.slice(0,32);
          inflight={batchId:makeBatchId().replaceAll('-',''),expectedRevision:state.revision,
            ids:commands.map(c=>c.id),
            operations:commands.map(({id,...command})=>command)};
        }
        try{
          const reply=await post(inflight);
          if(reply?.appliedCount!==inflight.ids.length||
             reply?.revision!==inflight.expectedRevision+inflight.ids.length)
            throw Error('SQLite 批次回执不完整，CM 保留待保存记录');
          ack(inflight.ids,reply.revision);
          inflight=null;
          wrote=true;
          onStatus(`✓ SQLite 已异步保存 · revision ${reply.revision}`,'ok');
        }catch(error){
          if(/版本冲突/.test(error.message)){
            blocked=true;
            onStatus('Block 持久化冲突 · CM 未落盘关系保留；请勿直接重载本页：'+error.message,'error');
          }else{
            onStatus('Block 后台保存失败 · CM 仍保留待持久操作，点击保存可重试：'+error.message,'warning');
          }
          throw error;
        }
      }
      return wrote;
    };
    running=process();
    try{return await running;}
    finally{running=null;}
  }
  return Object.freeze({
    changed(){if(!disposed)idle();},
    flush,
    status(){return {pending:read()?.queue?.length??0,
      inFlight:!!inflight,running:!!running,blocked};},
    dispose(){disposed=true;if(timer!==null)clearTimeout(timer);timer=null;},
  });
}
