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
        const response=await port.browse(path);
        if(response?.path!==path||!Array.isArray(response.children))
          throw Error('Directory response did not match requested path');
        for(const child of response.children.slice(0,120)){
          if(!safePath(child?.path)||typeof child?.name!=='string')continue;
          item.append(itemFor(child.path,child.name));
        }
        item.lazy=false;
        if(response.children.length>120)onStatus('目录较多，仅显示前 120 个子目录');
      }catch(error){
        item.loading=false;
        onStatus('无法展开目录：'+error.message);
      }
    });
    return item;
  }
  tree.addEventListener('wa-selection-change',event=>{
    const item=event.detail?.selection?.[0]||tree.querySelector('wa-tree-item[selected]');
    if(item&&safePath(item.dataset.path))onSelect(item.dataset.path);
  });
  async function loadRoots(){
    const response=await port.roots();
    if(!Array.isArray(response?.allowedRoots))throw Error('授权目录响应无效');
    tree.replaceChildren();
    for(const path of response.allowedRoots){
      if(!safePath(path))continue;
      tree.append(itemFor(path,path));
    }
    if(!tree.children.length)onStatus('服务器没有可浏览的授权目录');
    return tree.children.length;
  }
  return Object.freeze({loadRoots,dispose(){tree.remove();}});
}
