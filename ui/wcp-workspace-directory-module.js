/** WCP Workspace directory component. Owns catalogue/book selection UI, never
 * imports Settings, CMD, Shell or filesystem. All edits use injected Settings
 * get/set API, all server discovery uses injected Workspace HTTP capability.
 */
import './wcp-workspace-directory-module.css';

export function createWorkspaceDirectoryModule(directoryPort){
  if(!directoryPort || !['roots','browse','books'].every(key=>typeof directoryPort[key]==='function'))
    throw Error('Workspace directory component requires three public discovery APIs');
  function renderBookControl(pane,item,record,{get,set}){
    const label=document.createElement('label');label.textContent='当前书籍工作目录';
    const selected=document.createElement('p');selected.className='ocr-settings-description';
    selected.textContent=record.value?`当前选择：${record.value}`:'尚未选中书籍，继续使用原工作文档';
    const note=document.createElement('p');note.className='ocr-settings-description';
    note.textContent='书籍必须是根目录的首层文件夹，含 mineru json/ 和 pdf/。转换后的 .minerujson.md 若不存在，会在全局保存时自动生成；已有文件绝不覆盖。';
    const feedback=document.createElement('div');feedback.className='ocr-settings-directory-feedback';
    feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    const items=document.createElement('div');items.className='ocr-settings-directory-list';
    const show=(kind,msg)=>{feedback.dataset.state=kind;feedback.textContent=msg;};
    const root=get('workspace.files.rootPath');
    if(!root){show('warning','⚠ 请先在工作根目录设置中选好书库根路径');pane.append(label,selected,note,feedback,items);return;}
    show('info','正在扫描书籍工作目录…');
    void directoryPort.books(root).then(data=>{
      if(!pane.isConnected)return;
      items.replaceChildren();
      for(const book of data.books){
        const choice=document.createElement('button');choice.type='button';
        const ready=book.state==='ready';
        choice.textContent=(ready?'✓ ':book.selectable?'◷ ':'⚠ ')+book.name+
          (ready?' · 已有转换文档':book.state==='needs-conversion'?' · 保存时转换':' · '+(book.reason||'母文档格式不合格'));
        choice.disabled=!book.selectable;
        choice.addEventListener('click',()=>{
          try{set(item.key,book.name);selected.textContent=`当前选择：${book.name}`;
            show(ready?'success':'warning',ready
              ?'✓ 已选中现有 MinerU 母 Markdown；全局保存后切换'
              :'◷ 已选中；全局保存时先无覆盖生成 MinerU 母 Markdown 再切换');}
          catch(error){show('error','✕ '+error.message);}
        });
        items.append(choice);
      }
      if(!data.books.length)show('warning','⚠ 工作根目录没有首层书籍文件夹');
      else if(data.books.every(book=>!book.selectable))show('warning','⚠ 这些文件夹尚无合格的 MinerU JSON/PDF 配套资料');
      else show('info',`发现 ${data.books.length} 个首层文件夹；请选择可用书籍`);
    }).catch(error=>{if(pane.isConnected)show('error','✕ 无法读取书籍目录：'+error.message);});
    pane.append(label,selected,note,feedback,items);
  }
  function renderDirectoryControl(pane,item,record,{get,set}){
    const label=document.createElement('label');label.textContent='工作根目录';
    label.htmlFor='settings-workspace-root';
    const pathInput=document.createElement('input');pathInput.id='settings-workspace-root';
    pathInput.type='text';pathInput.value=String(record.value);
    pathInput.placeholder='Mac 上的书库根目录（首层为每本书）';
    pathInput.setAttribute('aria-label','服务器工作根目录');
    const actions=document.createElement('div');actions.className='ocr-settings-directory-actions';
    const browseButton=document.createElement('button');browseButton.type='button';
    browseButton.textContent='浏览目录';
    const verifyButton=document.createElement('button');verifyButton.type='button';
    verifyButton.textContent='验证路径';
    const feedback=document.createElement('div');feedback.className='ocr-settings-directory-feedback';
    feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    const showFeedback=(kind,message)=>{
      feedback.dataset.state=kind;feedback.textContent=message;
      pathInput.setAttribute('aria-invalid',String(kind==='error'));
    };
    const normalizedPath=raw=>raw.trim().replace(/\\([ ~()&])/g,'$1');
    // Book identity is relative to its catalogue; changing roots clears old selection.
    const setRoot=path=>{
      if(get(item.key)===path)return;
      set('workspace.files.bookName','');
      set(item.key,path);
    };
    pathInput.addEventListener('change',()=>{
      try{const path=normalizedPath(pathInput.value);setRoot(path);pathInput.value=path;}
      catch(error){showFeedback('error','✕ '+error.message);}
    });
    const directoryList=document.createElement('div');directoryList.className='ocr-settings-directory-list';
    const display=async value=>{
      directoryList.replaceChildren();showFeedback('info','正在检查服务器目录…');
      try{
        const data=await directoryPort.browse(value);
        const selectable=data.books.filter(book=>book.selectable);
        showFeedback(selectable.length?'success':'warning',selectable.length
          ?`✓ 发现 ${data.books.length} 个首层文件夹，其中 ${selectable.length} 个可选；请再选择当前书籍`
          :'⚠ 目录存在，但没有完整的首层书籍（mineru json/、pdf/）');
        const choices=[...(data.parent?[{name:'.. 上一级',path:data.parent}]:[]),...data.children];
        const current=document.createElement('button');current.type='button';
        current.textContent='设为工作根目录';
        current.addEventListener('click',()=>{
          try{
            setRoot(data.path);pathInput.value=data.path;
            showFeedback('success','✓ 根目录已填写；请在「当前书籍工作目录」选书籍，然后顶栏保存');
          }catch(error){showFeedback('error','✕ 无法选用：'+error.message);}
        });
        directoryList.append(current);
        for(const choice of choices){
          const row=document.createElement('button');row.type='button';
          row.textContent='📁 '+choice.name;
          row.addEventListener('click',()=>void display(choice.path));
          directoryList.append(row);
        }
      }catch(error){showFeedback('error','✕ 无法浏览：'+error.message);}
    };
    browseButton.addEventListener('click',async()=>{
      try{
        const data=await directoryPort.roots();
        directoryList.replaceChildren();showFeedback('info','授权目录（选择后逐级浏览到书库根目录）');
        for(const path of data.allowedRoots){
          const button=document.createElement('button');button.type='button';
          button.textContent='📁 '+path;
          button.addEventListener('click',()=>void display(path));
          directoryList.append(button);
        }
      }catch(error){showFeedback('error','✕ 浏览失败：'+error.message);}
    });
    verifyButton.addEventListener('click',async()=>{
      const path=normalizedPath(pathInput.value);
      try{
        setRoot(path);pathInput.value=path;
        showFeedback('info','正在验证书库根目录…');
        const data=await directoryPort.books(path);
        const available=data.books.filter(book=>book.selectable);
        showFeedback(available.length?'success':'warning',available.length
          ?`✓ 目录可用：${available.length} 本书已具备转换前提；请选中当前书籍后保存`
          :'⚠ 目录存在，但没有同时具备 mineru json/、pdf/ 的可用书籍');
      }catch(error){showFeedback('error','✕ 验证失败：'+error.message);}
    });
    actions.append(browseButton,verifyButton);
    const help=document.createElement('p');help.className='ocr-settings-key-comment';
    help.textContent=record.comment;
    pane.append(label,pathInput,actions,feedback,directoryList,help);
    void directoryPort.roots().then(data=>{
      if(pane.isConnected&&record.value==='')
        showFeedback('info','默认工作文档仍保持不变；可选择其他书库根目录');
    }).catch(()=>{});
    return pathInput;
  }
  return Object.freeze({renderBookControl,renderDirectoryControl});
}
