/** Versioned, read-only handoff from Sentence Lab to Translation Lab.
 * Sentence Lab is the ONLY producer. Review Lab renders this accepted MD,
 * never invents boundaries from the stale GPT/Grok 402-row baseline.
 */
import {buildCleanReviewedMD,restoreReviewedMD} from './translation-review-clean-md.js';
import {buildTranslationReadingProjection} from './translation-review-reading.js';

export const REVIEWED_SOURCE_SCHEMA='ocr2md-reviewed-source/v1';

export function createReviewedSourcePackage(source,baseline,reviewRevision){
  if(typeof reviewRevision!=='string'||!/^[a-f0-9]{64}$/.test(reviewRevision))
    throw Error('审阅包缺少有效的分句仲裁版本');
  if(baseline?.schema!=='ocr2md-translation-units/v1'||
     !Array.isArray(baseline.rows)||!baseline.rows.length)
    throw Error('审阅包需要有效的待译句块表');
  const clean=buildCleanReviewedMD(source,baseline.rows);
  const reading=buildTranslationReadingProjection(clean);
  return {schema:REVIEWED_SOURCE_SCHEMA,sourceSha256:baseline.sourceSha256,
    reviewRevision,baseline,clean,reading};
}

export function prepareReviewedSourcePackage(pkg){
  if(pkg?.schema!==REVIEWED_SOURCE_SCHEMA||
     pkg?.baseline?.schema!=='ocr2md-translation-units/v1'||
     pkg?.baseline?.sourceSha256!==pkg.sourceSha256||
     typeof pkg.reviewRevision!=='string'||!/^[a-f0-9]{64}$/.test(pkg.reviewRevision)||
     typeof pkg.clean?.source!=='string'||!Array.isArray(pkg.baseline.rows)||
     !Array.isArray(pkg.reading?.anchors))
    throw Error('审阅 MD 与句块表版本不匹配');
  const rows=pkg.baseline.rows;
  if(!rows.length||rows.length!==pkg.reading.anchors.length||
     new Set(rows.map(r=>r.id)).size!==rows.length||
     rows.some((r,i)=>r.id!==pkg.reading.anchors[i]?.id))
    throw Error('审阅 MD 句块 ID 无法对齐');
  if(restoreReviewedMD(pkg.clean)!==pkg.clean.source)
    throw Error('审阅 MD 未能完整恢复 CMD 原文');
  // Do not use a second rendering policy here: verify the *saved* reading
  // projection against the single shared adapter, then consume saved bytes.
  const expected=buildTranslationReadingProjection(pkg.clean);
  if(expected.doc!==pkg.reading.doc||
     JSON.stringify(expected.anchors)!==JSON.stringify(pkg.reading.anchors))
    throw Error('审阅 MD 预览与句块坐标不一致');
  const ids=rows.map(row=>({...row,englishChanged:false,englishDiff:false,
    translationDiff:false}));
  return {source:pkg.clean.source,sourceSha256:pkg.sourceSha256,
    reviewRevision:pkg.reviewRevision,rows:ids,names:[],translations:{},
    clean:pkg.clean,reading:pkg.reading,
    reviewedJoins:pkg.clean.stats.reviewedJoins||0};
}
