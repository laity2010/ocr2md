/** Experiment NavigationSelect: original HTMLSelectElement is the business API.
 * Tom Select receives its own mirrored <select>, NEVER the original. This is
 * required because Tom Select rewrites option children in updateOriginalInput.
 */
import TomSelect from 'tom-select';
import 'tom-select/dist/css/tom-select.default.css';
import './navigation-select.css';

const adapters=new WeakMap();
export function enhanceNavigationSelect(element,{search=false,kind='navigation'}={}){
  if(!(element instanceof HTMLSelectElement))throw Error('NavigationSelect requires a select');
  if(adapters.has(element))return adapters.get(element);
  const proxy=document.createElement('select');
  proxy.className='ocr-navigation-proxy';
  proxy.setAttribute('aria-label',element.getAttribute('aria-label')||'导航');
  element.classList.add('ocr-navigation-native');
  element.after(proxy);
  const reflectOptions=()=>{
    proxy.replaceChildren(...[...element.children].map(child=>child.cloneNode(true)));
    proxy.value=element.value;
  };
  reflectOptions();
  const tom=new TomSelect(proxy,{
    create:false,maxItems:1,maxOptions:1000,hideSelected:false,
    searchField:search?['text']:[],
    ...(search?{}:{controlInput:null}),
    dropdownParent:'body',
    sortField:[{field:'$order',direction:'asc'}],
    closeAfterSelect:true,
    render:{no_results:(data,escape)=>`<div class="no-results">未找到：${escape(data.input)}</div>`},
  });
  tom.wrapper.classList.add('ocr-navigation-select',`ocr-navigation-${kind}`);
  tom.dropdown.classList.add('ocr-navigation-popup',`ocr-navigation-popup-${kind}`);
  let destroyed=false,scheduled=false;
  // Searchable file navigation can retain its previously *active* keyboard
  // option after the selected file changes, making two rows look selected
  // (one `.active`, one `.selected`). Align the active highlight to the real
  // selection on popup open or option refresh, not during user search/arrowing.
  const syncActiveFile=()=>{
    if(destroyed||kind!=='files'||!tom.isOpen||tom.inputValue)return;
    const current=tom.getOption(tom.getValue());
    if(current&&tom.activeOption!==current)tom.setActiveOption(current);
  };
  if(kind==='files')tom.on('dropdown_open',()=>queueMicrotask(syncActiveFile));
  // Tom Select repositions its portal on open, scroll, resize and search.
  // Apply our viewport clamp AFTER each built-in positionDropdown() call;
  // a one-time dropdown_open handler is overwritten by a later reposition.
  if(kind==='files'){
    const originalPosition=tom.positionDropdown.bind(tom);
    tom.positionDropdown=()=>{
      originalPosition();
      if(destroyed||!tom.isOpen)return;
      const trigger=tom.control.getBoundingClientRect();
      const vw=Math.max(0,document.documentElement.clientWidth||window.innerWidth);
      const width=Math.min(Math.max(540,Math.ceil(trigger.width)),Math.max(0,vw-16));
      if(width<80)return;
      const left=Math.max(8,Math.min(trigger.left,vw-width-8));
      tom.dropdown.style.width=`${width}px`;
      tom.dropdown.style.left=`${left+window.scrollX}px`;
    };
  }
  const updateVisibility=()=>{
    // The original select's own hidden flag controls only its proxy. A hidden
    // Dockview/settings ancestor already hides the proxy via CSS; copying that
    // temporary ancestor state onto the proxy sticks after the pane returns.
    tom.wrapper.hidden=element.hidden;
    if(element.hidden||element.closest('[hidden]'))tom.close();
  };
  const refresh=()=>{
    if(destroyed)return;
    reflectOptions();
    tom.sync(true); // safe: mutates only proxy, never the original select
    queueMicrotask(syncActiveFile);
    tom.wrapper.title=element.selectedOptions[0]?.textContent||'';
    updateVisibility();
  };
  const scheduleRefresh=()=>{
    if(destroyed||scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;refresh();});
  };
  // Native application selects remain authoritative. Programmatic native
  // change updates Tom silently; Tom user changes dispatch one native event.
  const onNativeChange=()=>{
    if(tom.getValue()!==element.value)tom.setValue(element.value,true);
    queueMicrotask(syncActiveFile);
    tom.wrapper.title=element.selectedOptions[0]?.textContent||'';
    updateVisibility();
  };
  const onProxyChange=()=>{
    const next=tom.getValue();
    if(next===element.value)return;
    // File switching can hide/reparent the source pane synchronously. Close
    // the portal before dispatch so it cannot block neighboring controls.
    tom.close();
    element.value=next;
    element.dispatchEvent(new Event('change',{bubbles:true}));
  };
  element.addEventListener('change',onNativeChange);
  proxy.addEventListener('change',onProxyChange);
  // Attribute/text changes (including PDF preheat disabling) and rebuilt
  // option groups are mirrored without any feedback to the source tree.
  const observer=new MutationObserver(scheduleRefresh);
  observer.observe(element,{subtree:true,childList:true,attributes:true,characterData:true});
  updateVisibility();
  const adapter=Object.freeze({tom,refresh,show:updateVisibility,dispose:()=>{
    destroyed=true;observer.disconnect();
    element.removeEventListener('change',onNativeChange);
    proxy.removeEventListener('change',onProxyChange);
    tom.destroy();proxy.remove();element.classList.remove('ocr-navigation-native');
    adapters.delete(element);
  }});
  element.ocrNavigationSelect=adapter;
  adapters.set(element,adapter);
  return adapter;
}

// Navigation owns only its CSS variable. Settings publishes validated values
// through the public event contract and remains sole CMD JSON editor.
export const NAVIGATION_FONT_SETTING_KEY='globalUi.navigation.dropdownFontSize';
export function registerNavigationFontSetting(settings){
  settings.register({module:'N',key:NAVIGATION_FONT_SETTING_KEY,
    category:['全局 UI','导航下拉'],label:'导航下拉字号',
    comment:'导航下拉框与展开菜单共用字号（8–16 pt）；顶栏高度保持不变',
    type:'number',control:'slider',defaultValue:10,min:8,max:16,step:1,
    message:'settings.changed'});
  return settings.subscribe({module:'N',key:NAVIGATION_FONT_SETTING_KEY},({value})=>{
    document.documentElement.style.setProperty('--ocr-navigation-font-size',value+'pt');
  });
}
