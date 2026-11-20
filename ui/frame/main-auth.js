/** Lab-Frame public Main-editor authorization guidance.
 * Main remains the only login authority and cookie issuer. This small UI
 * adapter reads /api/session and links to the SAME origin's existing Main UI;
 * it never accepts codes, copies cookies, or stores authorization state.
 */
export function mountFrameMainAuthorization({host,fetcher=fetch,onAuthorized=()=>{}}={}){
  if(!host||typeof fetcher!=='function')throw Error('Main authorization host and fetcher required');
  const doc=host.ownerDocument;
  const win=doc.defaultView;
  const link=doc.createElement('a');
  link.id='frame-main-authorization';
  link.href='/';
  link.target='_blank';
  link.rel='noopener noreferrer';
  link.textContent='前往 Main 授权';
  link.title='在同一域名的 Main 工作台点击保存，输入现有的12位编辑授权码；回到目录树刷新';
  link.hidden=true;
  host.prepend(link);
  let serial=0,disposed=false,previouslyAuthorized=null;
  async function refresh(){
    const current=++serial;
    try{
      const response=await fetcher('/api/session',{cache:'no-store',credentials:'same-origin'});
      if(!response.ok)return null;
      const data=await response.json();
      if(typeof data?.canSave!=='boolean'||disposed||current!==serial)return null;
      const authorized=data.canSave;
      link.hidden=authorized;
      if(authorized&&previouslyAuthorized===false)onAuthorized();
      previouslyAuthorized=authorized;
      return authorized;
    }catch{return null;}
  }
  const onFocus=()=>{void refresh();};
  const onVisibility=()=>{if(!doc.hidden)void refresh();};
  win.addEventListener('focus',onFocus);
  doc.addEventListener('visibilitychange',onVisibility);
  void refresh();
  return Object.freeze({refresh,dispose(){disposed=true;++serial;
    win.removeEventListener('focus',onFocus);doc.removeEventListener('visibilitychange',onVisibility);
    link.remove();
  }});
}
