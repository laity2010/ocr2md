/**
 * AG Grid Community IFilterComp: categorical checkbox filter, adapted from
 * OCR2MD V4's proven EnumCheckboxFilter contract.
 *
 * The grid owns the filter model, popup lifecycle and row filtering.
 * No custom header, external filter, parallel state store, or Enterprise API.
 */
export class EnumCheckboxFilter {
  constructor() {
    this.gui=document.createElement('div');
    this.gui.className='ocr-enum-filter';
    this.selected=null; // null === All (no active filter)
    this.values=[];
  }

  init(params) {
    this.params=params;
    this.gui.setAttribute('aria-label',params.colDef?.headerName+' 筛选');
    this.refreshValues();
    this.render();
  }

  getGui() { return this.gui; }

  isFilterActive() { return this.selected!==null; }

  doesFilterPass(params) {
    if(this.selected===null)return true;
    return this.selected.has(String(this.params.getValue(params.node)??''));
  }

  getModel() {
    return this.selected===null ? null : {values:[...this.selected]};
  }

  setModel(model) {
    this.selected=Array.isArray(model?.values)?new Set(model.values.map(String)):null;
    this.refreshValues();
    this.render();
  }

  afterGuiAttached() {
    this.refreshValues();
    this.normaliseSelection();
    this.render();
  }

  onNewRowsLoaded() {
    this.refreshValues();
    this.normaliseSelection();
    this.render();
  }

  refreshValues() {
    const values=new Set();
    // Public AG Grid client-side row-model API. Gather all leaf nodes,
    // independent of other active filters.
    this.params.api.forEachLeafNode(node=>{
      values.add(String(this.params.getValue(node)??''));
    });
    this.values=[...values].sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));
  }

  normaliseSelection() {
    if(this.selected===null)return;
    const available=new Set(this.values);
    this.selected=new Set([...this.selected].filter(value=>available.has(value)));
    if(this.values.length && this.selected.size===this.values.length)this.selected=null;
  }

  render() {
    this.gui.replaceChildren();
    const addOption=(value,caption,checked,update)=>{
      const label=document.createElement('label');
      label.className='ocr-enum-filter-option';
      label.dataset.filterValue=value;
      const checkbox=document.createElement('input');
      checkbox.type='checkbox';
      checkbox.checked=checked;
      checkbox.setAttribute('aria-label',caption);
      checkbox.addEventListener('change',()=>update(checkbox.checked));
      const text=document.createElement('span');
      text.textContent=caption;
      text.title=caption;
      label.append(checkbox,text);
      this.gui.append(label);
    };
    addOption('all','all',this.selected===null,checked=>{
      this.selected=checked?null:new Set();
      this.params.filterChangedCallback();
      this.render();
    });
    const separator=document.createElement('div');
    separator.className='ocr-enum-filter-separator';
    this.gui.append(separator);
    for(const value of this.values) {
      addOption(value,value,this.selected===null||this.selected.has(value),checked=>{
        const next=this.selected===null?new Set(this.values):new Set(this.selected);
        if(checked)next.add(value);
        else next.delete(value);
        this.selected=next.size===this.values.length?null:next;
        this.params.filterChangedCallback();
        this.render();
      });
    }
  }
}
