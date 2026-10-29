/** HTML AG's pure plan: wrap existing standalone tables without parsing or
 * moving nearby OCR titles/notes. Every source byte of <table> stays intact.
 * CMD alone owns the optimistic edit transaction and Save remains global.
 */
export const TABLE_TITLE_PLACEHOLDER='【待填写：表格标题】';
export const TABLE_NOTES_PLACEHOLDER='【待填写：表格注释及来源】';
const PREFIX=`<figure class="table-block">\n<figcaption>${TABLE_TITLE_PLACEHOLDER}</figcaption>\n<!-- 表格内容：保留原始表格 -->\n`;
const SUFFIX=`\n<div class="table-notes">\n<p>${TABLE_NOTES_PLACEHOLDER}</p>\n</div>\n</figure>`;
const owns=(outer,inner)=>outer.from<inner.from&&outer.to>=inner.to&&outer.status==='完整';

export function planNormalizeTables(source,groups,{bodyEnd=source.length,scope={mode:'all'},chapter=null}={}){
  if(typeof source!=='string'||!Array.isArray(groups)||!Number.isInteger(bodyEnd)||
     bodyEnd<0||bodyEnd>source.length||!['all','chapter'].includes(scope?.mode))
    throw TypeError('Invalid HTML normalization input');
  if(scope.mode==='chapter'&&(!chapter||!Number.isInteger(chapter.from)||
      !Number.isInteger(chapter.to)))throw TypeError('Missing CMD chapter scope');
  const tables=groups.filter(x=>x.tag==='table'&&x.openLine!=null&&
    (scope.mode==='all'||x.from>=chapter.from&&x.from<chapter.to));
  const result={operations:[],converted:0,skipped:0,reasons:{}};
  const skip=reason=>{result.skipped++;result.reasons[reason]=(result.reasons[reason]||0)+1;};
  for(const table of tables){
    if(table.status!=='完整'||table.closeLine==null){skip('未配对表格');continue;}
    if(table.to>bodyEnd||(scope.mode==='chapter'&&table.to>chapter.to)){
      skip('超出可编辑范围');continue;
    }
    if(groups.some(x=>x.tag==='figure'&&owns(x,table))){
      skip('已在 figure 中，需人工核对');continue;
    }
    if(groups.some(x=>x!==table&&x.tag==='table'&&owns(x,table))){
      skip('嵌套在另一表格中');continue;
    }
    // Insert HTML block markup only at safe standalone source boundaries.
    // Never split prose or quote/fence prefixes just to achieve coverage.
    const lineStart=source.lastIndexOf('\n',table.from-1)+1;
    const nextNewline=source.indexOf('\n',table.to);
    const lineEnd=nextNewline===-1?source.length:nextNewline;
    if(source.slice(lineStart,table.from).trim()||
       source.slice(table.to,lineEnd).trim()||
       source.slice(lineStart,table.from).includes('>')){
      skip('非独立 HTML 表格行');continue;
    }
    result.operations.push({action:'text',from:table.from,to:table.from,
      expected:'',insert:PREFIX});
    result.operations.push({action:'text',from:table.to,to:table.to,
      expected:'',insert:SUFFIX});
    result.converted++;
  }
  return result;
}
