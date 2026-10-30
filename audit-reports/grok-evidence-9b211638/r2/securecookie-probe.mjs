import http from 'node:http';import {chromium,webkit} from 'playwright';
const s=http.createServer((q,r)=>{if(q.url==='/set'){r.setHeader('Set-Cookie','t=1; Path=/; Secure; HttpOnly; SameSite=Lax');r.end('ok')}else r.end('cookie='+(q.headers.cookie||''))});
await new Promise(o=>s.listen(0,'127.0.0.1',o));const u=`http://127.0.0.1:${s.address().port}`;
for(const [n,e] of [['chromium',chromium],['webkit',webkit]]){const b=await e.launch();const c=await b.newContext();
await c.request.get(u+'/set');const p=await c.newPage();await p.goto(u+'/x');
console.log(n,'store=',JSON.stringify((await c.cookies()).map(x=>x.name+':secure='+x.secure)),'page sent:',await p.textContent('body'));await b.close();}
s.close();
