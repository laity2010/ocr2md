/** Read-only CMD Block coverage in the rendered Markdown projection.
 * Never search the visible prose by text: Block ownership comes solely from
 * CMD source anchors and each renderer's source-line bounds. This is a lens,
 * independent of the selected block's existing emphasis.
 */
import './text-block-preview-coverage.css';
const selector='[data-source-start][data-source-end]';
export function clearCMDTextBlockCoverage(body){
  body?.querySelectorAll('.ocr-md-block-covered').forEach(node=>{
    node.classList.remove('ocr-md-block-covered');
    node.removeAttribute('data-coverage-block');
  });
}
export function paintCMDTextBlockCoverage(body,blocks){
  clearCMDTextBlockCoverage(body);
  const mappedIds=[];
  if(!body?.isConnected||!Array.isArray(blocks)||!blocks.length)return {mappedIds,painted:0};
  const marked=blocks.filter(b=>b.anchorCount===1&&Number.isInteger(b.sourceLine))
    .sort((a,b)=>a.sourceLine-b.sourceLine);
  const candidates=[...body.querySelectorAll(selector)].map(node=>({node,
    start:Number(node.dataset.sourceStart),end:Number(node.dataset.sourceEnd)}))
    .filter(entry=>Number.isInteger(entry.start)&&Number.isInteger(entry.end)&&entry.end>entry.start);
  let painted=0;
  for(let i=0;i<marked.length;i++){
    const block=marked[i];if(!block.expectsPreview)continue;
    // CMD sourceLine is zero based. The line directly after its block marker
    // is sourceLine+2, and the next marker at sourceLine+1 ends its range.
    const start=block.sourceLine+2;
    const end=marked[i+1]?.sourceLine+1??Infinity;
    const eligible=candidates.filter(c=>c.start>=start&&c.end<=end&&
      !c.node.closest('details.ocr-callout:not([open])'));
    // Prefer leaf source-mapped nodes: a list/blockquote that contains
    // another separately mapped paragraph must not paint its entire area.
    const leaf=eligible.filter(c=>!eligible.some(other=>other!==c&&c.node.contains(other.node)));
    if(!leaf.length)continue;
    for(const {node} of leaf){
      node.classList.add('ocr-md-block-covered');node.dataset.coverageBlock=block.id;
      painted++;
    }
    mappedIds.push(block.id);
  }
  return {mappedIds,painted};
}
