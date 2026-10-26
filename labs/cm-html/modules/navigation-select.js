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
    // Do not pass controlInput:undefined: Tom Select interprets the presence
    // of the key as an explicit custom control, suppressing its search input.
    ...(search?{}:{controlInput:null}),
    dropdownParent:'body',
    placeholder:search?'搜索文件名或路径…':undefined,
    sortField:[{field:'$order',direction:'asc'}],
    closeAfterSelect:true,
    render:{no_results:(data,escape)=>`<div class="no-results">未找到：${escape(data.input)}</div>`},
  });
  tom.wrapper.classList.add('ocr-navigation-select',`ocr-navigation-${kind}`);
  // Tom Select copies native classes onto its wrapper. Strip selector-contract
  // names so existing code/tests targeting the real <select> stay unambiguous.
  tom.wrapper.classList.remove('ocr-source-file-select','ocr-lab-file-select',
    'ocr-lab-element-select','ocr-preview-mode');
  tom.dropdown.classList.add('ocr-navigation-popup',`ocr-navigation-popup-${kind}`);
  const updateVisibility=()=>{
    tom.wrapper.hidden=element.hidden||element.closest('[hidden]')!==null;
    if(tom.wrapper.hidden)tom.close();
  };
  let destroyed=false;
  // Native change events come from existing module/navigation controllers,
  // including Tom Select's own user-driven selections. React only if a
  // controller changed the underlying value, never write it back recursively.
  const synchronize=()=>{
    if(destroyed)return;
    if(tom.getValue()!==element.value)tom.setValue(element.value,true);
    updateVisibility();
  };
  element.addEventListener('change',synchronize);
  // File option replacement calls the adapter explicitly from syncOptions().
  // Observing ALL native mutations caused an infinite Tom Select <-> select
  // update loop (sync() itself rebuilds native options). Avoid that entirely.
  const refresh=()=>{
    if(destroyed)return;
    tom.sync(true);
    updateVisibility();
  };
  updateVisibility();
  const adapter=Object.freeze({tom,refresh,show:updateVisibility,
    dispose:()=>{destroyed=true;element.removeEventListener('change',synchronize);tom.destroy();adapters.delete(element);}});
  adapters.set(element,adapter);
  return adapter;
}
