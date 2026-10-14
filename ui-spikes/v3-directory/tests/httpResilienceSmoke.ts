import {strict as assert} from 'node:assert';
import {MacVaultHttpRegistry,MacVaultAccessError} from '../../../src/v3HttpWorkspaceFs';
const mockStore = ()=>({getItem:()=>null,setItem:()=>{},removeItem:()=>{}});
Object.assign(globalThis,{sessionStorage:mockStore(),localStorage:mockStore()});
const registry=new MacVaultHttpRegistry();
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
const html=(status=530)=>new Response('<html><title>cloudflare gateway error</title></html>',{status,headers:{'Content-Type':'text/html'}});
async function check(label:string, responses:Response[],method='GET',expectedCalls:number=responses.length,expectError?:string){
 let calls=0;
 (globalThis as any).fetch=async()=>{const answer=responses[Math.min(calls,responses.length-1)];calls++;return answer.clone();};
 let error:unknown;
 try{await registry.fetchJson('/__v3/fs?op=read',{method});}catch(e){error=e;}
 assert.equal(calls,expectedCalls,label+' number of HTTP calls');
 if(expectError){assert.ok(error,label+' rejects');assert.ok(String(error).includes(expectError),label+' specific reason: '+String(error));}
 else assert.equal(error,undefined,label+' recovers');
 console.log('PASS',label,'calls='+calls);
}
async function main(){
 await check('Cloudflare 530 then valid JSON',[html(530),json({base64:'AA==',revision:'1',totalBytes:1})], 'GET',2);
 await check('HTML 200 then valid JSON',[html(200),json({ok:true})], 'GET',2);
 await check('401 never retry',[json({error:'Access required'},401)],'GET',1,'Access required');
 await check('409 revision conflict never retry',[json({code:'ESTALE',error:'Stale version'},409)],'GET',1,'Stale version');
 await check('POST never replay',[html(530)],'POST',1,'HTTP 530');
 await check('Permanent 530 returns status not HTML',[html(530)],'GET',3,'HTTP 530');
 console.log('V3_HTTP_RESILIENCE_CONTRACT_PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
