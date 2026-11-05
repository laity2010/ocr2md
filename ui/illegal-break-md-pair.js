/** Two-block A/B review lens on the Markdown projection.
 * CM6/CMD atoms define ownership; rendered source-line attributes only
 * determine which *existing* Markdown DOM nodes to color. No text edits.
 */
import './illegal-break-md-pair.css';
const classes=['ocr-illegal-break-md-before','ocr-illegal-break-md-after'];
export function clearIllegalBreakMDPair(body){
  for(const node of body?.querySelectorAll(classes.map(c=>'.'+c).join(','))||[])
    node.classList.remove(...classes);
}
export function paintIllegalBreakMDPair(body,atoms,beforeId,afterId){
  clearIllegalBreakMDPair(body);
  if(!body||!Array.isArray(atoms)||!beforeId||!afterId)return {before:0,after:0};
  const ordered=[...atoms].sort((a,b)=>a.sourceLine-b.sourceLine);
  const regions=new Map();
  for(let i=0;i<ordered.length;i++){
    const atom=ordered[i],next=ordered[i+1];
    regions.set(atom.id,{start:atom.sourceLine+1,end:next?.sourceLine??Infinity});
  }
  const candidates=[...body.querySelectorAll('[data-source-start][data-source-end]')]
    .map(node=>({node,start:Number(node.dataset.sourceStart),end:Number(node.dataset.sourceEnd)}))
    .filter(x=>Number.isInteger(x.start)&&Number.isInteger(x.end)&&x.end>x.start);
  const result={before:0,after:0};
  for(const [name,id,css] of [['before',beforeId,classes[0]],['after',afterId,classes[1]]]){
    const scope=regions.get(id);
    if(!scope)continue;
    const matches=candidates.filter(x=>x.start>=scope.start&&x.start<scope.end&&
      !x.node.closest('details.ocr-callout:not([open])'));
    // Nested list parents do not own distinct source ranges; paint leaves.
    const leaves=matches.filter(x=>!matches.some(y=>y!==x&&x.node.contains(y.node)));
    for(const item of leaves){item.node.classList.add(css);result[name]++;}
  }
  return result;
}
