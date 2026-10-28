/** Legacy-compatible chapter column schema, sharing Main AG ownership.
 * Delegate scanning, CMD edits, AG creation and focus routing unchanged to
 * the mainline outline component. Only adapt AG's owned column definitions.
 */
import {createOutlineGrid as createMainlineOutlineGrid} from './outline-grid.js';
export {OUTLINE_TITLE_SCALE_KEY,registerOutlineTitleScaleSetting} from './outline-grid.js';

const nameFromURL=()=>new URLSearchParams(location.search).get('chapter');
const chapterCell=params=>{
  const element=document.createElement('span');
  element.className='ocr-chapter-file-actual';
  element.textContent=params.value||'';
  element.title=params.value||'';
  return element;
};

export function createOutlineGrid(element,getMarkdown,getCMD){
  const core=createMainlineOutlineGrid(element,getMarkdown,getCMD);
  const originalColumns=core.api.getGridOption('columnDefs');
  const virtualColumns=originalColumns.map(column=>column.field==='chapterFile'
    ? {...column,cellRenderer:chapterCell}:column);
  if(!Array.isArray(originalColumns)||!originalColumns.some(c=>c.field==='independent')||
     !originalColumns.some(c=>c.field==='chapterFile')){
    core.dispose();
    throw Error('V6 chapter column schema changed; lab adapter needs review');
  }
  let currentName=null;
  function updateColumns(next){
    const name=next||null;
    if(name===currentName&&currentName!==null)return;
    currentName=name;
    if(!name){
      // These are CMD virtual views. Nothing is pending export, clickable
      // as a physical chapter, or downloadable from the boundary grid.
      core.api.setGridOption('columnDefs',virtualColumns);
      return;
    }
    // A bounded element resides in the actual opened file, not in a new
    // chapterAssignment calculated from its H1/H2 headings. No write/link to
    // the mother's chapter export is available in the bounded view.
    const columns=originalColumns.filter(c=>c.field!=='independent').map(c=>{
      if(c.field!=='chapterFile')return c;
      const file='chapter/'+name;
      return {...c,headerName:'章节文件',
        valueGetter:()=>file,
        filterValueGetter:()=>file,
        cellRenderer:chapterCell};
    });
    core.api.setGridOption('columnDefs',columns);
  }
  updateColumns(nameFromURL());
  const originalDispose=core.dispose;
  core.dispose=()=>{
    originalDispose();
  };
  return core;
}
