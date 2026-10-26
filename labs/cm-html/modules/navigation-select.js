/** Lab NavigationSelect: Tom Select is presentation only. The original <select>
 * remains the only source of option values and original change events.
 * The adapter never owns file navigation, media, settings or preview state.
 */
import TomSelect from 'tom-select';
import 'tom-select/dist/css/tom-select.default.css';
import './navigation-select.css';

const adapters=new WeakMap();
export function enhanceNavigationSelect(element,{search=false,kind='navigation'}={}){
  if(!(element instanceof HTMLSelectElement))throw Error('NavigationSelect requires a select');
  if(adapters.has(element))return adapters.get(element);
  const tom=new TomSelect(element,{
    create:false,
    maxItems:1,
    maxOptions:1000,
    hideSelected:false,
    searchField:search?['text']:[],
    controlInput:search?undefined:null,
    dropdownParent:'body',
    placeholder:search?'搜索文件名或路径…':undefined,
    sortField:[{field:'$order',direction:'asc'}],
    closeAfterSelect:true,
    render:{no_results:(data,escape)=>`<div class="no-results">未找到：${escape(data.input)}</div>`},
  });
  tom.wrapper.classList.add('ocr-navigation-select',`ocr-navigation-${kind}`);
  tom.dropdown.classList.add('ocr-navigation-popup',`ocr-navigation-popup-${kind}`);
  const updateVisibility=()=>{
    tom.wrapper.hidden=element.hidden||element.closest('[hidden]')!==null;
    if(tom.wrapper.hidden)tom.close();
  };
  let destroyed=false;
  let scheduled=false;
  function synchronize(){
    if(destroyed||scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{
      scheduled=false;
      if(destroyed)return;
      tom.sync(true); // includes optgroup, disabled state and native selected value
      updateVisibility();
    });
  }
  // The original application programmatically uses select.value and options.
  // The DOM remains authoritative, and changing its value does NOT refire a
  // second change event (Tom Select's own user selections do that already).
  element.addEventListener('change',synchronize);
  const observer=new MutationObserver(synchronize);
  observer.observe(element,{subtree:true,childList:true,attributes:true,characterData:true});
  updateVisibility();
  const adapter=Object.freeze({tom,refresh:synchronize,show:updateVisibility,
    dispose:()=>{destroyed=true;observer.disconnect();tom.destroy();adapters.delete(element);}});
  adapters.set(element,adapter);
  return adapter;
}
