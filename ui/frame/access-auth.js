/** Frame-owned user authorization interface, independent of Main/V1.
 * Uses Frame's public F02 session/unlock endpoints and no stored browser secret.
 */
const BASE='/labs/lab-frame/api/workspace-io/';
export function mountFrameAuthorization({host,fetcher=fetch,onAuthorized=()=>{},onStatus=()=>{}}={}){
  if(!host||typeof fetcher!=='function')throw Error('Frame authorization host and fetcher required');
  const doc=host.ownerDocument;
  const win=doc.defaultView;
  const open=doc.createElement('button');open.type='button';open.id='frame-access-open';
  open.textContent='授权 Frame';open.title='输入 Lab-Frame 自己的访问码，不使用 Main 授权';
  open.hidden=true;
  const dialog=doc.createElement('dialog');dialog.id='frame-access-dialog';
  dialog.setAttribute('aria-label','Lab-Frame 独立工作区授权');
  const form=doc.createElement('form');form.method='dialog';
  const title=doc.createElement('strong');title.textContent='Lab-Frame 独立授权';
  const description=doc.createElement('p');description.textContent='输入 Mac 上 Frame 专属访问码；不需要进入 Main。';
  const code=doc.createElement('input');code.type='password';code.autocomplete='off';
  code.placeholder='16 位 Frame 访问码';code.maxLength=32;code.required=true;
  code.setAttribute('aria-label','Frame 访问码');
  const error=doc.createElement('p');error.id='frame-access-error';error.setAttribute('role','status');
  const actions=doc.createElement('div');actions.className='frame-access-actions';
  const cancel=doc.createElement('button');cancel.type='button';cancel.textContent='取消';
  cancel.addEventListener('click',()=>dialog.close());
  const submit=doc.createElement('button');submit.type='submit';submit.textContent='授权';
  actions.append(cancel,submit);form.append(title,description,code,error,actions);dialog.append(form);
  host.prepend(open);doc.body.append(dialog);
  let disposed=false,serial=0,previouslyAuthorized=null;
  open.addEventListener('click',()=>{error.textContent='';code.value='';dialog.showModal();code.focus();});
  async function refresh(){
    const current=++serial;
    try{
      const response=await fetcher(BASE+'session',{cache:'no-store',credentials:'same-origin'});
      if(!response.ok){if(!disposed&&current===serial)open.hidden=false;return null;}
      const body=await response.json();
      if(typeof body?.authorized!=='boolean'||disposed||current!==serial)return null;
      open.hidden=body.authorized;
      if(body.authorized&&previouslyAuthorized===false)onAuthorized();
      previouslyAuthorized=body.authorized;
      return body.authorized;
    }catch{if(!disposed&&current===serial)open.hidden=false;return null;}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();submit.disabled=true;error.textContent='';
    try{
      const response=await fetcher(BASE+'unlock',{method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code.value})});
      const result=await response.json().catch(()=>null);
      if(!response.ok)throw Error(result?.error||'HTTP '+response.status);
      if(result?.authorized!==true)throw Error('Frame 授权没有成功');
      // Refreshes from a real signed HttpOnly cookie, never trusts only a POST body.
      const authorized=await refresh();
      if(authorized!==true)throw Error('Frame 会话未建立，请检查 Safari Cookie 设置');
      code.value='';dialog.close();onStatus('✓ Frame 已独立授权 · 可以刷新 Mac 目录','ok');
    }catch(err){error.textContent=err.message;onStatus('Frame 授权失败：'+err.message,'error');}
    finally{submit.disabled=false;}
  });
  const onFocus=()=>{void refresh();};
  const onVisibility=()=>{if(!doc.hidden)void refresh();};
  win.addEventListener('focus',onFocus);doc.addEventListener('visibilitychange',onVisibility);
  void refresh();
  return Object.freeze({refresh,dispose(){disposed=true;++serial;
    win.removeEventListener('focus',onFocus);doc.removeEventListener('visibilitychange',onVisibility);
    dialog.remove();open.remove();}});
}
