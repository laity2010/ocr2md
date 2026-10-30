"""Grok independent save-safety probe (R2: HMAC session, legacy raw cookie disabled). Runs v6_serve.py from an isolated /tmp copy only."""
import os,sys,subprocess,time,hashlib,http.client,threading,json
T=sys.argv[1]; PORT=int(sys.argv[2]); OUT=[]
env=dict(os.environ,V6_PORT=str(PORT),V6_LEGACY_RAW_COOKIE='0')
env.pop('V6_LAB_ID',None)
srv=subprocess.Popen([sys.executable,f'{T}/scripts/v6_serve.py'],cwd=T,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
  for _ in range(50):
    try: c=http.client.HTTPConnection('127.0.0.1',PORT,timeout=5);c.request('GET','/healthz');c.getresponse().read();break
    except Exception: time.sleep(0.2)
  key=open(f'{T}/.v6/private/editor-token').read().strip()
  O=f'http://127.0.0.1:{PORT}'
  def req(m,p,body=None,h=None):
    c=http.client.HTTPConnection('127.0.0.1',PORT,timeout=30);c.request(m,p,body=body,headers=h or {});r=c.getresponse();b=r.read();return r.status,dict(r.getheaders()),b
  def rec(name,ok,detail): OUT.append(dict(test=name,result='PASS' if ok else 'FAIL',detail=detail)); print(('PASS' if ok else 'FAIL'),name,detail,flush=True)
  sys.path.insert(0,f'{T}/scripts'); from v6_auth import unlock_code
  s,uh,_=req('POST','/api/unlock',json.dumps({'code':key[:12]}).encode(),{'Origin':O,'Content-Type':'application/json'}); rec('unlock with legacy KEY[:12] -> 403',s==403,f'status={s}')
  s,uh,_=req('POST','/api/unlock',json.dumps({'code':unlock_code(key)}).encode(),{'Origin':O,'Content-Type':'application/json'})
  sess=uh.get('Set-Cookie','').split(';')[0]
  rec('unlock with derived code -> 200, cookie is not raw KEY',s==200 and sess.startswith('v6edit=') and key not in sess,f'status={s} raw_key_in_cookie={key in sess}')
  s,_,_=req('PUT','/api/document',b'x',{'Cookie':'v6edit='+key,'Origin':O,'If-Match':'"x"'}); rec('PUT with legacy raw-KEY cookie (migration closed) -> 403',s==403,f'status={s}')
  auth={'Cookie':sess,'Origin':O}
  s,h,b=req('GET','/api/document'); et=h.get('ETag')
  rec('GET returns strong sha256 ETag',s==200 and et=='"'+hashlib.sha256(b).hexdigest()+'"',f'status={s} etag_matches_body_sha256={et=="\""+hashlib.sha256(b).hexdigest()+"\""}')
  base=b
  s,_,_=req('PUT','/api/document',base+b'\nX',{'Origin':O,'If-Match':et}); rec('PUT without cookie -> 403',s==403,f'status={s}')
  s,_,_=req('PUT','/api/document',base+b'\nX',{'Cookie':sess,'Origin':'http://evil.example','If-Match':et}); rec('PUT cross-origin -> 403',s==403,f'status={s}')
  s,_,_=req('PUT','/api/document',base+b'\nX',{'Cookie':sess,'If-Match':et}); rec('PUT without Origin -> 403',s==403,f'status={s}')
  s,_,_=req('PUT','/api/document',base+b'\nX',auth); rec('PUT without If-Match -> 428',s==428,f'status={s}')
  s,_,_=req('PUT','/api/document',base+b'\nX',{**auth,'If-Match':'"deadbeef"'}); rec('PUT stale If-Match -> 412',s==412,f'status={s}')
  disk=open(f'{T}/.v6/workspace/buffetts-alpha.minerujson.md','rb').read(); rec('rejected PUTs leave disk unchanged',disk==base,f'sha={hashlib.sha256(disk).hexdigest()[:12]}')
  s,h2,_=req('PUT','/api/document',base+b'\nA',{**auth,'If-Match':et}); rec('PUT valid If-Match -> 200 + new ETag',s==200 and h2.get('ETag')=='"'+hashlib.sha256(base+b'\nA').hexdigest()+'"',f'status={s}')
  et2=h2.get('ETag')
  s,_,_=req('PUT','/api/document',base+b'\nB',{**auth,'If-Match':et}); rec('second editor with old ETag -> 412 (lost update prevented)',s==412,f'status={s}')
  # concurrency: 20 writers with same ETag, exactly one wins
  res=[];
  def w(i):
    st,_,_=req('PUT','/api/document',base+f'\nC{i}'.encode(),{**auth,'If-Match':et2}); res.append((i,st))
  th=[threading.Thread(target=w,args=(i,)) for i in range(20)];[t.start() for t in th];[t.join() for t in th]
  wins=[i for i,st in res if st==200]; codes=sorted(set(st for _,st in res))
  disk=open(f'{T}/.v6/workspace/buffetts-alpha.minerujson.md','rb').read()
  rec('20 concurrent PUTs same ETag: exactly one 200, others 412, disk==winner',len(wins)==1 and codes==[200,412] and disk==base+f'\nC{wins[0]}'.encode(),f'wins={wins} codes={codes}')
  leftovers=[f for f in os.listdir(f'{T}/.v6/workspace') if f.endswith('.tmp')]; rec('no temp files left after atomic replace',not leftovers,f'tmp={leftovers}')
  s,_,_=req('POST','/api/unlock',json.dumps({'code':'x'*12}).encode(),{'Origin':O,'Content-Type':'application/json'}); rec('unlock wrong code -> 403',s==403,f'status={s}')
  s,_,_=req('PUT','/api/settings',b'{}',{'Origin':O}); rec('settings PUT unauthorized -> 403',s==403,f'status={s}')
finally:
  srv.terminate(); srv.wait(10)
json.dump(OUT,open(sys.argv[3],'w'),ensure_ascii=False,indent=1)
print('SUMMARY',sum(o['result']=='PASS' for o in OUT),'/',len(OUT))
