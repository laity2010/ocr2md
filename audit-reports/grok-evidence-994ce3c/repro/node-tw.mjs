import http from 'node:http';import net from 'node:net';import {execSync} from 'node:child_process';
const srv=http.createServer((q,r)=>{r.setHeader('connection','close');r.end('x')});
srv.listen(0,'127.0.0.1',()=>{const port=srv.address().port;
 http.get({host:'127.0.0.1',port,agent:false},res=>{res.resume();res.on('end',()=>srv.close(()=>setTimeout(()=>{
  console.log(execSync(`ss -tan '( sport = :${port} )'`).toString());
  console.log(execSync(`python3 -c "import importlib.util as u;s=u.spec_from_file_location('p','audit-port-preflight.py');m=u.module_from_spec(s);s.loader.exec_module(m);print('node-server TIME_WAIT -> can_listen =',m.can_listen(${port}))"`).toString());
 },300)))})});
