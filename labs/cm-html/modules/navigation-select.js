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
  const updateVisibility=()=>{
    const hidden=element.hidden||element.closest('[hidden]')!==null;
    tom.wrapper.hidden=hidden;
    if(hidden)tom.close();
  };
  const refresh=()=>{
    if(destroyed)return;
    reflectOptions();
    tom.sync(true); // safe: mutates only proxy, never the original select
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
    updateVisibility();
  };
  const onProxyChange=()=>{
    const next=tom.getValue();
    if(next===element.value)return;
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
