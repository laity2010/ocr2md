/** V4 navigation component. Reads platform inventory via its public API only. */
export function mountComponentInventory({getWcp}){
  const trigger=document.getElementById('v4-version-trigger');
  const dialog=document.getElementById('v4-component-dialog');
  const close=document.getElementById('v4-component-close');
  const list=document.getElementById('v4-component-list');
  const build=document.getElementById('workbench-build');
  if(!trigger||!dialog||!close||!list||!build)throw Error('V4_COMPONENT_INVENTORY_MOUNT_MISSING');
  const route=document.getElementById('v4-access-route');
  if(route){
    const hostname=location.hostname;
    const lan=hostname==='localhost'||hostname==='127.0.0.1'||
      /^(?:10|192\.168|172\.(?:1[6-9]|2[0-9]|3[01]))\./.test(hostname);
    route.textContent='当前访问入口：'+(lan?'局域网/本机':'公网域名')+
      '（按页面网址识别，不代表 iPad 的 Wi-Fi/蜂窝网络类型）';
  }
  const render=()=>{
    const rows=[
      {id:'app:ocr2md',name:'OCR2MD 工作台',version:build.dataset.appVersion??'未知'},
      ...(getWcp()?.getComponents?.()??[])
    ];
    // Inventory is read at opening time: hot-swapped modules appear next time.
    const unique=new Set();
    list.replaceChildren();
    for(const component of rows){
      if(unique.has(component.id))continue;
      unique.add(component.id);
      const item=document.createElement('li');
      item.className='v4-component-item';
      item.dataset.componentId=component.id;
      const left=document.createElement('span');
      left.className='v4-component-name';
      left.textContent=component.name;
      const id=document.createElement('small');
      id.textContent=component.id;
      left.append(id);
      const version=document.createElement('span');
      version.className='v4-component-version';
      version.textContent=component.version;
      item.append(left,version);
      list.append(item);
    }
    if(!getWcp()){
      const status=document.createElement('li');
      status.className='v4-component-pending';
      status.textContent='WCP 组件信息加载中…';
      list.append(status);
    }
  };
  trigger.addEventListener('click',()=>{render();if(!dialog.open)dialog.showModal()});
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||
      event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
  });
}
