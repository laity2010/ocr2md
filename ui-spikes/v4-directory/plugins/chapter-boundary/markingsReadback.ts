/** Confirm a small chapter-map commit without confusing iCloud metadata churn
 * with changed document contents. Never repeats a write or bypasses CAS. */
export interface MarkingsReadback {
  exists:boolean;
  generation:string|null;
  revision:string;
  markings:unknown;
}

export function sameMarkings(a:unknown,b:unknown):boolean {
  const canonical=(value:unknown):string|undefined=>JSON.stringify(value,(_key,item)=>
    item!==null&&typeof item==='object'&&!Array.isArray(item)?
      Object.fromEntries(Object.entries(item).sort(([x],[y])=>x.localeCompare(y))):item);
  return canonical(a)===canonical(b);
}

export async function confirmMarkingsReadback(
  read:()=>Promise<MarkingsReadback>, generation:string, submitted:unknown,
  wait:(ms:number)=>Promise<void>=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),
):Promise<MarkingsReadback> {
  // A new iCloud map can temporarily read as the legacy sidecar. Retry ONLY
  // reading; require the same generation and exact semantic mapping throughout.
  for(const delay of [0,200,500,900]){
    if(delay)await wait(delay);
    const current=await read();
    if(current.exists&&current.generation===generation&&current.revision&&
       sameMarkings(current.markings,submitted))return current;
  }
  throw Error('服务器已确认提交，但章节映射读回仍不一致；请检查并发修改');
}
