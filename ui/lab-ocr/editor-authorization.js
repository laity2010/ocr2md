/** Lab OCR UI adapter for Main's EXISTING /api/unlock and /api/session.
 * No new credential, cookie, server, local storage, or directory authorization.
 * The browser never reads Main's HttpOnly session cookie or persists the code.
 */
import './editor-authorization.css';

export function createMainEditorAuthorization({onStatus=()=>{},fetcher=fetch}={}){
  let outstanding=null;
  let modal=null;
  function show(){
    if(outstanding)return outstanding;
    if(!modal){
      modal=document.createElement('dialog');
      modal.className='lab-ocr-main-authorization';
      modal.setAttribute('aria-labelledby','lab-ocr-auth-title');
      const form=document.createElement('form');form.method='dialog';
      const heading=document.createElement('h2');heading.id='lab-ocr-auth-title';
      heading.textContent='授权浏览服务器目录';
      const explanation=document.createElement('p');
      explanation.textContent='服务器目录由 Main 的编辑权限保护。输入同一个 12 位编辑授权码，成功后将自动继续浏览目录；授权码不会存入 Lab 设置，权限由 Main 会话管理。';
      const label=document.createElement('label');
      label.textContent='Main 编辑授权码';label.htmlFor='lab-ocr-auth-code';
      const input=document.createElement('input');
      input.id='lab-ocr-auth-code';input.type='password';input.required=true;
      input.autocomplete='off';input.spellcheck=false;input.maxLength=64;
      const error=document.createElement('p');error.id='lab-ocr-auth-error';
      error.setAttribute('role','alert');error.setAttribute('aria-live','polite');
      const actions=document.createElement('div');actions.className='lab-ocr-auth-actions';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
      const submit=document.createElement('button');submit.className='primary';submit.type='submit';
      submit.textContent='验证并继续浏览';
      actions.append(cancel,submit);
      label.append(input);form.append(heading,explanation,label,error,actions);
      modal.append(form);document.body.append(modal);
      modal._parts={form,input,error,cancel,submit};
    }
    const {form,input,error,cancel,submit}=modal._parts;
    input.value='';error.textContent='';submit.disabled=false;
    let resolvePrompt;
    outstanding=new Promise(resolve=>{resolvePrompt=resolve;});
    let settled=false;
    const finish=value=>{
      if(settled)return;
      settled=true;input.value='';submit.disabled=false;
      form.removeEventListener('submit',onSubmit);
      cancel.removeEventListener('click',onCancel);
      modal.removeEventListener('cancel',onEscape);
      modal.removeEventListener('close',onClose);
      if(modal.open)modal.close();
      outstanding=null;resolvePrompt(value);
    };
    const onCancel=()=>finish(false);
    const onEscape=event=>{event.preventDefault();finish(false);};
    const onClose=()=>finish(false);
    const onSubmit=async event=>{
      event.preventDefault();
      const code=input.value.trim().replace(/[\u200b-\u200d\ufeff]/gi,'');
      input.value='';
      if(code.length!==12){error.textContent='编辑授权码应为 12 位，请重新输入';return;}
      submit.disabled=true;error.textContent='正在验证 Main 编辑授权…';
      try{
        const result=await fetcher('/api/unlock',{
          method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{'Content-Type':'application/json'},body:JSON.stringify({code}),
        });
        if(!result.ok){
          const reason=await result.text();
          if(result.status===403&&reason.includes('Invalid code'))
            throw Error('授权码不正确，请核对 Main 的 12 位编辑授权码');
          if(result.status===403&&reason.includes('Invalid origin'))
            throw Error('访问来源校验失败，请从原始公网域名进入');
          throw Error('授权服务返回 HTTP '+result.status);
        }
        // A successful unlock response without a working Main cookie does
        // NOT permit directory reads. Validate the server session explicitly.
        const session=await fetcher('/api/session',{
          credentials:'same-origin',cache:'no-store',
        });
        if(!session.ok||(await session.json()).canSave!==true)
          throw Error('Main 授权会话未建立，目录仍受保护');
        onStatus('Main 编辑授权已验证，正在继续浏览目录','ok');
        finish(true);
      }catch(cause){
        if(!settled)error.textContent='授权失败：'+cause.message;
      }finally{submit.disabled=false;}
    };
    form.addEventListener('submit',onSubmit);
    cancel.addEventListener('click',onCancel);
    modal.addEventListener('cancel',onEscape);
    modal.addEventListener('close',onClose);
    modal.showModal();input.focus();
    onStatus('🔒 浏览服务器目录需要 Main 编辑授权','warning');
    return outstanding;
  }
  return Object.freeze({request:show});
}
