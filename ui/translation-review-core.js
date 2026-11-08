/** Translation-review module's independent, read-only comparison contract.
 * The source and review files are immutable inputs. No segmentation, Gold,
 * or cross-module source write APIs are present.
 */
export const TRANSLATION_REVIEW_DATASET='ocr2md-translation-review-dataset/v1';

export function prepareTranslationReview(dataset){
  if(!dataset||dataset.schema!==TRANSLATION_REVIEW_DATASET||
      typeof dataset.source!=='string'||!Array.isArray(dataset.baseline?.rows))
    throw Error('校译输入格式不正确');
  const baseline=dataset.baseline;
  if(baseline.schema!=='ocr2md-translation-units/v1'||
      typeof baseline.sourceSha256!=='string'||!baseline.sourceSha256)
    throw Error('校译基准不合法');
  const names=Object.keys(dataset.translations||{}).sort();
  if(!names.length)throw Error('尚未导入任何 AI 翻译文件');
  if(names.some(x=>!/^[a-z][a-z0-9-]{0,15}$/.test(x)))
    throw Error('非法 AI 身份');
  const baselineRows=baseline.rows;
  const idSet=new Set(baselineRows.map(x=>x.id));
  if(idSet.size!==baselineRows.length||baselineRows.some(x=>!x.id||!x.original))
    throw Error('校译基准缺少有效唯一 ID');
  for(const name of names){
    const result=dataset.translations[name];
    if(result?.schema!==baseline.schema||result.sourceSha256!==baseline.sourceSha256||
       result.coordinate!==baseline.coordinate||
       !Array.isArray(result.rows)||result.rows.length!==baselineRows.length)
      throw Error(name+' 译文版本或数量不匹配');
    for(let i=0;i<baselineRows.length;i++){
      const expected=baselineRows[i],actual=result.rows[i];
      if(!actual||actual.id!==expected.id||
         !Object.keys(expected).every(k=>(k==='corrected'||k==='translation')||
           JSON.stringify(actual[k])===JSON.stringify(expected[k]))||
         !['corrected','translation'].every(k=>typeof actual[k]==='string'&&actual[k].trim()))
        throw Error(name+' 存在来源错位、缺失或未翻译的记录');
    }
  }
  const rows=baselineRows.map((row,index)=>{
    const corrected=names.map(name=>dataset.translations[name].rows[index].corrected);
    const translated=names.map(name=>dataset.translations[name].rows[index].translation);
    return {...row,
      englishChanged:corrected.some(text=>text!==row.original),
      englishDiff:new Set(corrected).size>1,
      translationDiff:new Set(translated).size>1};
  });
  return {source:dataset.source,sourceSha256:baseline.sourceSha256,
    names,rows,translations:dataset.translations};
}

export function filterTranslationRows(rows,mode){
  if(mode==='all')return rows;
  if(mode==='corrected')return rows.filter(r=>r.englishChanged);
  if(mode==='english-diff')return rows.filter(r=>r.englishDiff);
  if(mode==='translation-diff')return rows.filter(r=>r.translationDiff);
  throw Error('未知校译筛选模式');
}
