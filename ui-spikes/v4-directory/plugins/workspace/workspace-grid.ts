/** Workspace component-owned AG and CodeMirror. UI only; no Vault/fetch. */
import {createGrid,AllCommunityModule,ModuleRegistry,themeQuartz,type GridApi} from '../../../v2/node_modules/ag-grid-community';
import {EnumCheckboxFilter} from '../../../v2/src/tableConfigurationGrid';
ModuleRegistry.registerModules([AllCommunityModule]);
export class WorkspaceView{
 private readonly grid:GridApi;
 private selectedDirectoryPath:string|null=null;
 private readonly gridHost:HTMLElement;
 private readonly initialGridWidth:number;
 private readonly surface:HTMLElement & {value:string;destroy():void;refresh():void};
 constructor(gridHost:HTMLElement,sourceHost:HTMLElement,onSelect:(row:any)=>void,onOpen:(row:any)=>void){
  this.gridHost=gridHost;
  this.initialGridWidth=Math.round(gridHost.getBoundingClientRect().width);
  const surface=document.createElement('laity-source-surface') as typeof this.surface;
  surface.setAttribute('editable','false');surface.setAttribute('line-numbers','true');
  surface.setAttribute('wrap','true');surface.setAttribute('scroll-container','true');
  surface.setAttribute('aria-label','工作目录只读源码');
  surface.style.cssText='display:block;width:100%;height:100%;--lss-bg:#1d2732;--lss-fg:#e1e7ef;--lss-gutter-bg:#1d2732;--lss-font-size:var(--las-source-font-size,14px);--lss-line-height:var(--las-source-line-height,1.55);--lss-font-family:var(--laity-ui-font,"Sarasa Fixed SC",ui-monospace,monospace)';
  sourceHost.replaceChildren(surface);this.surface=surface;
  this.surface.value='选择 AG 行查看文件信息；双击目录名称进入子目录。';
  this.grid=createGrid(gridHost,{
    theme:themeQuartz.withParams({backgroundColor:'#1d2732',foregroundColor:'#dbe5f0',headerBackgroundColor:'#253343',borderColor:'#475258',fontSize:14,fontFamily:'var(--laity-ui-font, "Sarasa Fixed SC", "Sarasa Mono SC", ui-monospace, monospace)'}),
    rowData:[],columnDefs:[
     {colId:'directoryChoice',headerName:'选择',width:66,minWidth:66,maxWidth:66,
      pinned:'left',lockPinned:true,suppressMovable:true,resizable:false,sortable:false,filter:false,
      cellRenderer:(p:any)=>{
       if(p.data?.kind!=='directory')return '';
       const radio=document.createElement('input');
       radio.type='radio';radio.className='ws-directory-radio';
       radio.name='ocr2md-workspace-directory-choice';
       radio.setAttribute('aria-label','选择目录 '+p.data.name);
       radio.dataset.directoryChoice=p.data.nodeId;
       radio.checked=this.selectedDirectoryPath===p.data.path;
       radio.addEventListener('click',event=>{
        event.stopPropagation();this.selectDirectory(p.data.path);onSelect(p.data);
       });
       return radio;
      }},
     {field:'name',headerName:'名称',flex:3,minWidth:190,filter:EnumCheckboxFilter,cellRenderer:(p:any)=>{
       const button=document.createElement('button');button.className='workspace-entry';button.type='button';
       const data=p.data;if(!data)return button;
       button.textContent=(data.kind==='directory'?'📁 ':'📄 ')+data.name;
       button.dataset.openPath=data.path;
       let suppressNextClick=false;
       button.addEventListener('click',e=>{e.stopPropagation();if(suppressNextClick){suppressNextClick=false;return;}onSelect(data)});
       if(data.kind==='directory')button.addEventListener('dblclick',e=>{e.stopPropagation();onOpen(data)});
       // Mobile Safari may not dispatch dblclick for touch; two taps on same path.
       let lastTap=0;
       button.addEventListener('pointerup',(e:PointerEvent)=>{
         if(e.pointerType!=='touch'||data.kind!=='directory')return;
         const now=performance.now();if(now-lastTap<650){lastTap=0;suppressNextClick=true;onOpen(data)}else lastTap=now;
       });
       return button;
     }},
     {field:'kind',headerName:'类型',width:110,filter:EnumCheckboxFilter,valueFormatter:(p:any)=>p.value==='directory'?'目录':p.data?.name?.split('.').at(-1)?.toLowerCase()||'文件'},
     {field:'size',headerName:'大小',width:115,filter:EnumCheckboxFilter,valueFormatter:(p:any)=>p.data?.kind==='directory'?'—':String(p.value??0)+' B'},
     {field:'modifiedAt',headerName:'修改时间',width:160,filter:EnumCheckboxFilter},
     {field:'revision',headerName:'版本',width:200,filter:EnumCheckboxFilter},
    ],defaultColDef:{sortable:true,resizable:false,suppressMovable:true,filter:true},
    suppressMovableColumns:true,animateRows:false,rowHeight:40,headerHeight:40,
    getRowId:(p:any)=>p.data.nodeId,onRowClicked:(event:any)=>{if(event.data)onSelect(event.data)},
  });
 }
 setRows(rows:any[]){this.selectedDirectoryPath=null;this.grid.setGridOption('rowData',rows)}
 selectDirectory(path:string|null){
  if(this.selectedDirectoryPath===path)return;
  this.selectedDirectoryPath=path;
  this.grid.refreshCells({columns:['directoryChoice'],force:true});
 }
 /** Metadata-only diagnostics for AG row model vs Safari's actual DOM. No names,
  * paths, credentials or user text leave this component. Public AG Grid APIs. */
 rowHealth(){
  let total=0;this.grid.forEachNode(()=>total++);
  const rect=this.gridHost.getBoundingClientRect();
  return {total,displayed:this.grid.getDisplayedRowCount(),
   rendered:this.grid.getRenderedNodes().length,
   dom:this.gridHost.querySelectorAll('.workspace-entry').length,
   visible:[...this.gridHost.querySelectorAll('.workspace-entry')].filter(node=>{
    const r=node.getBoundingClientRect(),g=this.gridHost.getBoundingClientRect();
    return r.height>0 && r.width>0 && r.bottom>g.top && r.top<g.bottom && r.right>g.left && r.left<g.right;
   }).length,
   filtered:this.grid.isAnyFilterPresent(),
   geometry:this.rowGeometry(),initialWidth:this.initialGridWidth,
   width:Math.round(rect.width),height:Math.round(rect.height)};
 }
 /** WP3 iPhone-only diagnostic: inspect geometry without reading user text. */
 private rowGeometry(){
  const host=this.gridHost.getBoundingClientRect();
  const button=this.gridHost.querySelector<HTMLElement>('.workspace-entry');
  const row=button?.closest<HTMLElement>('.ag-row');
  const view=this.gridHost.querySelector<HTMLElement>('.ag-body-viewport');
  const center=this.gridHost.querySelector<HTMLElement>('.ag-center-cols-viewport');
  const rel=(element:Element|null|undefined)=>{
   if(!element)return null;
   const box=element.getBoundingClientRect();
   return [box.left-host.left,box.top-host.top,box.width,box.height].map(x=>Math.round(x));
  };
  const style=button?getComputedStyle(button):null;
  const rowStyle=row?getComputedStyle(row):null;
  return {button:rel(button),row:rel(row),view:rel(view),center:rel(center),
   scrollTop:view?.scrollTop??0,scrollHeight:view?.scrollHeight??0,clientHeight:view?.clientHeight??0,
   opacity:style?.opacity??'',visibility:style?.visibility??'',display:style?.display??'',
   rowOpacity:rowStyle?.opacity??'',rowVisibility:rowStyle?.visibility??'',rowDisplay:rowStyle?.display??'',
   rowTransform:rowStyle?.transform??'',rowTop:rowStyle?.top??'',
   scrollRange:this.grid.getVerticalPixelRange()};
 }
 redraw(){this.grid.redrawRows();this.grid.resetRowHeights();this.grid.refreshCells({force:true})}

 setSource(text:string){this.surface.setAttribute('syntax',text.trimStart().startsWith('{')?'jsonc':'plain');this.surface.value=text;}
 destroy(){this.grid.destroy();this.surface.destroy();this.surface.remove();}
}

