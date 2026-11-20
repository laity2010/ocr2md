/** Frame-owned, inline directory-authorization control. No Main/V1 session.
 * Mounted only inside the Settings workspace directory picker, never the
 * global toolbar or a modal; the secret is never persisted by the browser.
 */
const BASE='/labs/lab-frame/api/workspace-io/';
export function mountFrameAuthorization({host,fetcher=fetch,onAuthorized=()=>{},onStatus=()=>{}}={}){
  if(!host||typeof fetcher!=='function')throw Error('Frame authorization host and fetcher required');
  const doc=host.ownerDocument;
  const form=doc.createElement('form');form.id='frame-directory-access';
  form.setAttribute('aria-label','Lab-Frame 独立工作区授权');
  const label=doc.createElement('label');label.htmlFor='frame-access-code';
  label.textContent='Frame 访问码';
  const row=doc.createElement('div');row.className='frame-directory-access-row';
  const code=doc.createElement('input');code.id='frame-access-code';
  code.type='password';code.autocomplete='off';code.maxLength=32;code.required=true;
  code.placeholder='输入 16 位 Frame 访问码';code.setAttribute('aria-label','Frame 访问码');
  const submit=doc.createElement('button');submit.id='frame-access-open';
  submit.type='submit';submit.textContent='授权 Frame';
  row.append(code,submit);form.append(label,row);host.append(form);
  let disposed=false,serial=0;
  async function refresh(){
    const current=++serial;
    try{
      const response=await fetcher(BASE+'session',{cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw Error('Frame 会话查询失败');
      const body=await response.json();
      if(typeof body?.authorized!=='boolean'||disposed||current!==serial)return null;
      form.hidden=body.authorized;
      return body.authorized;
    }catch{
      if(!disposed&&current===serial)form.hidden=false;
      return null;
    }
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();submit.disabled=true;
    try{
      const response=await fetcher(BASE+'unlock',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code.value})});
      const result=await response.json().catch(()=>null);
      if(!response.ok)throw Error(result?.error||'HTTP '+response.status);
      if(result?.authorized!==true)throw Error('Frame 授权没有成功');
      // Revalidate the signed HttpOnly Cookie before refreshing the tree.
      if(await refresh()!==true)throw Error('Frame 会话未建立，请检查 Safari Cookie 设置');
      code.value='';onStatus('✓ Frame 已独立授权 · 正在加载目录…','ok');
      onAuthorized();
    }catch(error){onStatus('Frame 授权失败：'+error.message,'error');}
    finally{submit.disabled=false;}
  });
  return Object.freeze({refresh,clear(){code.value='';},
    dispose(){disposed=true;++serial;form.remove();}});
}
