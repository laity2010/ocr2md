/** Read-only title projection of the existing MD line / reviewed Block states.
 * The original Markdown source, LineIDs and BlockIDs remain unchanged.
 */
import {projectMdAgRows} from './md-ag-projection.js';

export function projectTitleMdRows(mdRows,blockRows){
  return projectMdAgRows(mdRows,blockRows).filter(row=>row.block_type==='title');
}

/** Use exactly the CM6 source ATX recognition rule, not MinerU Level guessing. */
export function titleSourceParts(text){
  const source=typeof text==='string'?text:'';
  const match=/^(#{1,6})(?=\s|$)/.exec(source);
  return match?{level:match[1].length,marker:match[1],remainder:source.slice(match[1].length)}:
    {level:null,marker:'',remainder:source};
}

/** AG cellRenderer, display only. CM6 owns edits, renderer never emits HTML. */
export function renderTitleMdCell(params){
  const line=document.createElement('span');
  line.className='ocr-ag-title-source';
  const parts=titleSourceParts(params.value);
  if(parts.marker){
    // Keep the complete title source line, not only '#', at the same
    // Everforest heading level as the CM6 source. No font-size scaling.
    line.classList.add('cm-ob-heading-line-'+parts.level);
    const marker=document.createElement('span');
    marker.className='cm-ob-heading-marker-'+parts.level;
    marker.textContent=parts.marker;
    line.append(marker);
  }
  line.append(document.createTextNode(parts.remainder));
  return line;
}
