/** Workspace component-owned AG and CodeMirror. UI only; no Vault/fetch. */
import {createGrid,AllCommunityModule,ModuleRegistry,themeQuartz,type GridApi} from '../../v2/node_modules/ag-grid-community';
import {EnumCheckboxFilter} from '../../v2/src/tableConfigurationGrid';
ModuleRegistry.registerModules([AllCommunityModule]);
export class WorkspaceView{
 private readonly grid:GridApi;
 private readonly surface:HTMLElement & {value:string;destroy():void;refresh():void};
 constructor(gridHost:HTMLElement,sourceHost:HTMLElement,onSelect:(row:any)=>void,onOpen:(row:any)=>void){
  const surface=document.createElement('laity-source-surface') as typeof this.surface;
  surface.setAttribute('editable','false');surface.setAttribute('line-numbers','true');
  surface.setAttribute('wrap','true');surface.setAttribute('scroll-container','true');
  surface.setAttribute('aria-label','工作目录只读源码');
  surface.style.cssText='display:block;width:100%;height:100%;--lss-bg:#1d2732;--lss-fg:#e1e7ef;--lss-gutter-bg:#1d2732;--lss-font-size:var(--las-source-font-size,14px);--lss-line-height:var(--las-source-line-height,1.55);--lss-font-family:var(--laity-ui-font,"Sarasa Fixed SC",ui-monospace,monospace)';
  sourceHost.replaceChildren(surface);this.surface=surface;
  this.surface.value='选择 AG 行查看文件信息；双击目录名称进入子目录。';
  this.grid=createGrid(gridHost,{
    theme:themeQuartz.withParams({backgroundColor:'#1d2732',foregroundColor:'#dbe5f0',headerBackgroundColor:'#253343',borderColor:'#475258',fontSize:13}),
    rowData:[],columnDefs:[
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
 setRows(rows:any[]){this.grid.setGridOption('rowData',rows)}
 setSource(text:string){this.surface.setAttribute('syntax',text.trimStart().startsWith('{')?'jsonc':'plain');this.surface.value=text;}
 destroy(){this.grid.destroy();this.surface.destroy();this.surface.remove();}
}

