/** WP2/WP3: presentational KaTeX + PDF bbox crop cells for existing AG.
 * Imported only when the read-only LaTeX view opens. No editor or SQL writes.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './latex-view.css';

const cache=new Map();
export function renderFormula(formula,kind){
  const key=kind+'\0'+formula;
  if(cache.has(key))return cache.get(key);
  let result;
  if(!formula?.trim())result={render_status:'失败',render_html:'',render_error:'空公式'};
  else try{
    result={render_status:'成功',render_html:katex.renderToString(formula,{
      displayMode:kind==='独立',throwOnError:true,trust:false,maxExpand:1000,strict:'warn',
    }),render_error:''};
  }catch(error){
    result={render_status:'失败',render_html:'',
      render_error:String(error?.message??error).slice(0,300)};
  }
  if(cache.size>500)cache.clear();
  cache.set(key,result);
  return result;
}
export function decorateLatexRows(rows){
  return rows.map(row=>({...row,...renderFormula(row.formula,row.kind)}));
}

const textCell=(className,selector)=>params=>{
  const el=document.createElement('span');el.className=className;
  el.textContent=selector(params.data)??'';return el;
};

export function formulaRenderCell(params){
  const status=params.data?.render_status??'—';
  const el=document.createElement('span');
  el.className='lab-ocr-latex-render-status '+
    (status==='成功'?'lab-ocr-latex-render-ok':
     status==='失败'?'lab-ocr-latex-render-fail':'');
  el.textContent=status;
  if(status==='失败'&&params.data?.render_error)el.title=params.data.render_error;
  return el;
}

export function formulaPreviewCell(params){
  const row=params.data;
  if(!row)return '';
  const container=document.createElement('div');
  container.className='lab-ocr-latex-preview';
  if(row.render_html){
    // Only KaTeX-produced sanitized HTML, never raw MinerU HTML/LaTeX.
    container.innerHTML=row.render_html;
    container.title='KaTeX 可解析，不代表 OCR 已经校正';
  }else{
    container.classList.add('lab-ocr-latex-invalid');
    container.textContent=row.formula||'无有效公式';
    container.title=row.render_error||row.scan_issue||'未检查';
  }
  return container;
}

export function formulaImageCell(params,getPdfFormulaCrop){
  const row=params.data;
  const root=document.createElement('div');root.className='lab-ocr-latex-image';
  if(!row)return root;
  const canCrop=Number.isInteger(row.page)&&Array.isArray(row.pdf_bbox)&&
    Array.isArray(row.page_size)&&typeof getPdfFormulaCrop==='function';
  const visual=document.createElement('img');
  visual.alt='PDF 原文公式局部截图';
  visual.loading='lazy';visual.decoding='async';visual.hidden=true;
  const caption=document.createElement('span');caption.className='lab-ocr-latex-image-caption';
  caption.textContent=canCrop?'读取 PDF 公式图…':
    (row.pdf_bbox?'PDF 框可定位':'无 PDF 公式截图');
  const figure=document.createElement('div');figure.className='lab-ocr-latex-image-figure';
  figure.append(visual,caption);root.append(figure);
  if(!canCrop)return root;
  Promise.resolve().then(()=>getPdfFormulaCrop({page:row.page,bbox:row.pdf_bbox,
    pageSize:row.page_size})).then(data=>{
      if(!root.isConnected)return;
      if(typeof data==='string'&&data.startsWith('data:image/png;base64,')){
        visual.src=data;visual.hidden=false;
        caption.textContent='PDF 原文局部图';
      }else caption.textContent='PDF 截图暂不可用 · 可定位 PDF 框';
    }).catch(()=>{
      if(root.isConnected)caption.textContent='PDF 截图失败 · 可定位 PDF 框';
    });
  return root;
}

export function latexColumns({filter,pbsPageKey,getPdfFormulaCrop}){
  const valueColumn=(field,name,width)=>({field,headerName:name,width,sortable:true,
    filter,filterValueGetter:p=>p.data?.[field]??'—',
    suppressHeaderMenuButton:true});
  return [
    {field:'formula',headerName:'源码',minWidth:180,flex:1,filter:false,
      cellRenderer:textCell('lab-ocr-latex-source',row=>row?.formula)},
    {field:'render_status',headerName:'渲染',width:80,sortable:true,
      filter,filterValueGetter:p=>p.data?.render_status??'—',
      suppressHeaderMenuButton:true,cellRenderer:formulaRenderCell},
    valueColumn('kind','类型',76),
    {field:'render_html',headerName:'预览',minWidth:205,flex:1.2,filter:false,
      cellRenderer:formulaPreviewCell},
    {field:'pdf_crop',headerName:'截图',width:175,filter:false,
      cellRenderer:params=>formulaImageCell(params,getPdfFormulaCrop)},
    {field:'pbs',headerName:'PBS',width:119,
      filter,filterValueGetter:p=>pbsPageKey(p.data?.pbs),
      suppressHeaderMenuButton:true},
    {field:'line_no',headerName:'行号',width:71,sortable:true,
      filter,filterValueGetter:p=>p.data?.line_no??'仅 OCR',
      suppressHeaderMenuButton:true},
    valueColumn('match_status','来源',86),
    {field:'render_error',headerName:'错误 / 边界',minWidth:160,flex:0.9,filter:false,
      cellRenderer:textCell('lab-ocr-latex-error',row=>row?.render_error||row?.scan_issue||'—')},
    {field:'syntax',headerName:'定界',width:112},
    {field:'formula_id',headerName:'公式 ID',width:190,hide:true},
    {field:'block_id',headerName:'BlockID',width:94,hide:true},
  ];
}
