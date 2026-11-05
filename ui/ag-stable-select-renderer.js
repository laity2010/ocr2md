/** AG Grid native <select> contract shared by review modules.
 * A function renderer is recreated by refreshCells(); a class renderer that
 * returns true from refresh() retains the SAME select DOM/focus on WebKit.
 * Data changes belong to the AG owner's source-backed transaction, never to
 * this presentation component. Do not call setGridOption('rowData') on change.
 */
export function createStableAGSelectRenderer({choices,className,ariaLabel,getValue,onChange,decorate=()=>{},isDisabled=()=>false}){
  if(!Array.isArray(choices)||!choices.length||typeof onChange!=='function')
    throw Error('Stable AG select renderer requires choices and onChange');
  return class StableAGSelectRenderer{
    init(params){
      this.params=params;
      const dropdown=document.createElement('select');
      dropdown.className=className;
      for(const choice of choices){
        const option=document.createElement('option');
        option.value=choice;option.textContent=choice;
        dropdown.append(option);
      }
      for(const event of ['pointerdown','mousedown','touchstart','click','dblclick'])
        dropdown.addEventListener(event,evt=>evt.stopPropagation());
      dropdown.addEventListener('change',event=>{
        event.stopPropagation();
        const row=this.params.node?.data;
        if(row)onChange(row,dropdown.value);
      });
      this.dropdown=dropdown;
      this.refresh(params);
    }
    getGui(){return this.dropdown;}
    refresh(params){
      this.params=params;
      const row=params.data;
      if(!row)return false;
      const dropdown=this.dropdown;
      const value=getValue(row);
      if(dropdown.value!==value)dropdown.value=value;
      dropdown.setAttribute('aria-label',ariaLabel(row));
      dropdown.disabled=Boolean(isDisabled(row));
      decorate(dropdown,value,row);
      return true;
    }
  };
}
