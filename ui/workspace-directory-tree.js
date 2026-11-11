/** Generic server-directory picker. The injected port owns authorization,
 * allowlisted paths, and all filesystem access. No OCR/book assumptions.
 * Public API: createWorkspaceDirectoryTree(host, port, {onSelect,onStatus}).
 */
import '@awesome.me/webawesome/dist/components/tree/tree.js';
import '@awesome.me/webawesome/dist/components/tree-item/tree-item.js';
import './workspace-directory-tree.css';

const safePath=path=>typeof path==='string'&&path.startsWith('/')&&
  path.length<=1024&&!/[\0\r\n]/.test(path);

export function createWorkspaceDirectoryTree(host,port,{onSelect=()=>{},onStatus=()=>{}}={}){
  if(!host||typeof port?.roots!=='function'||typeof port?.browse!=='function')
    throw Error('Directory tree requires a host and roots/browse capabilities');
  const tree=document.createElement('wa-tree');
  tree.className='ocr-workspace-directory-tree';
  tree.selection='single';
  host.replaceChildren(tree);
  let disposed=false,refreshPending=null,refreshTimer=null,allowedRoots=null;

  function childrenOf(parent){
    return [...parent.children].filter(node=>node.tagName==='WA-TREE-ITEM');
  }
  function selectedPath(){
    return tree.querySelector('wa-tree-item[selected]')?.dataset.path||'';
  }
  function selectionStillExists(previous){
    if(previous&&!tree.querySelectorAll('wa-tree-item').length)return false;
    return !previous||[...tree.querySelectorAll('wa-tree-item')].some(
      node=>node.dataset.path===previous&&node.selected);
  }
  async function updateChildren(item){
    const path=item.dataset.path;
    const response=await port.browse(path);
    if(disposed||!item.isConnected)return false;
    if(response?.path!==path||!Array.isArray(response.children))
      throw Error('Directory response did not match requested path');
    const previous=childrenOf(item);
    const old=new Map(previous.map(node=>[node.dataset.path,node]));
    const next=[];
    for(const child of response.children.slice(0,120)){
      if(!safePath(child?.path)||typeof child?.name!=='string')continue;
      // Do not allow an unexpected server entry to escape its parent.
      if(!child.path.startsWith(path.replace(/\/$/,'')+'/')||
        child.path.slice(path.replace(/\/$/,'').length+1).includes('/'))continue;
      next.push(old.get(child.path)||itemFor(child.path,child.name));
    }
    let changed=previous.length!==next.length||next.some((node,i)=>node!==previous[i]);
    if(changed){
      // WebAwesome uses light-DOM text for the item's OWN label. Replacing all
      // children removes that label, leaving only a chevron on expanded rows.
      // Reconcile nested tree-items while retaining the parent's label nodes.
      const ownLabelNodes=[...item.childNodes].filter(node=>
        node.nodeType!==1||node.tagName!=='WA-TREE-ITEM');
      item.replaceChildren(...ownLabelNodes,...next);
    }
    item.lazy=false;
    item.loading=false;
    if(response.children.length>120)onStatus('目录较多，仅显示前 120 个子目录','warning');
    // Only visible branches need rechecking. Collapsed branches refresh on expand.
    for(const child of next){
      if(child.expanded&&!child.lazy)changed=(await updateChildren(child))||changed;
    }
    return changed;
  }

  function itemFor(path,label){
    if(!safePath(path))throw Error('Invalid directory entry from server');
    const item=document.createElement('wa-tree-item');
    item.dataset.path=path;
    item.textContent='📁 '+label;
    item.lazy=true;
    item.addEventListener('wa-lazy-load',async event=>{
      if(event.target!==item)return;
      event.stopPropagation();
      try{
        await updateChildren(item);
      }catch(error){
        item.loading=false;
        onStatus('无法展开目录：'+error.message,'error');
      }
    });
    item.addEventListener('wa-expand',event=>{
      if(event.target!==item||item.lazy)return;
      void updateChildren(item).catch(error=>onStatus('无法刷新目录：'+error.message,'error'));
    });
    return item;
  }
  tree.addEventListener('wa-selection-change',event=>{
    const item=event.detail?.selection?.[0]||tree.querySelector('wa-tree-item[selected]');
    if(item&&safePath(item.dataset.path))onSelect(item.dataset.path);
  });
  async function refresh({announce=false,reloadRoots=false}={}){
    if(refreshPending)return refreshPending;
    const work=(async()=>{
    // The Main roots endpoint also resolves the active BOOK. Re-requesting
    // it every five seconds can return 422 when that unrelated selection is
    // moved or renamed. Refresh the actual directories with browse instead.
    if(reloadRoots||allowedRoots===null){
      const response=await port.roots();
      if(!Array.isArray(response?.allowedRoots))throw Error('授权目录响应无效');
      allowedRoots=response.allowedRoots.filter(safePath);
    }
    if(disposed)return 0;
    const selectedBefore=selectedPath();
    const previous=childrenOf(tree);
    const existing=new Map(previous.map(node=>[node.dataset.path,node]));
    const roots=[];
    for(const path of allowedRoots){
      if(!safePath(path))continue;
      roots.push(existing.get(path)||itemFor(path,path));
    }
    const rootsChanged=previous.length!==roots.length||
      roots.some((node,index)=>node!==previous[index]);
    if(rootsChanged)tree.replaceChildren(...roots);
    let changed=rootsChanged;
    if(!roots.length)onStatus('服务器没有可浏览的授权目录','warning');
    // An initially collapsed single root resembles an empty chooser on iPad.
    for(const root of roots){
      await root.updateComplete;
      if(!root.isConnected)continue;
      if(!root.expanded)root.expanded=true;
      else if(!root.lazy)changed=(await updateChildren(root))||changed;
    }
    if(!selectionStillExists(selectedBefore))onSelect('');
    if(changed)onStatus('Mac 目录内容已更新','ok');
    else if(announce)onStatus('目录已是最新','ok');
    return roots.length;
    })().catch(error=>{
      // Fail closed if authorization is revoked or the server is unreachable.
      tree.replaceChildren();
      onSelect('');
      throw error;
    });
    refreshPending=work.finally(()=>{refreshPending=null;});
    return refreshPending;
  }
  function stopAutoRefresh(){
    if(refreshTimer!==null){clearInterval(refreshTimer);refreshTimer=null;}
  }
  function startAutoRefresh(){
    stopAutoRefresh();
    refreshTimer=setInterval(()=>{
      if(!host.isConnected){stopAutoRefresh();return;}
      if(!host.getClientRects().length||document.visibilityState==='hidden')return;
      void refresh().catch(error=>onStatus('目录同步失败：'+error.message,'error'));
    },5000);
  }
  return Object.freeze({
    loadRoots:()=>refresh({reloadRoots:true}),refresh,startAutoRefresh,stopAutoRefresh,
    dispose(){disposed=true;stopAutoRefresh();tree.remove();}
  });
}
