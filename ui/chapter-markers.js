/**
 * CM6 is the sole editable document. This lab only understands two marker
 * serializations and applies all edits through EditorView.dispatch().
 * Original MinerU evidence and the main V6 workspace remain immutable.
 */
import {CMDocument} from './cm-document.js';
import {quotePrefix,unquotePrefix} from './mineru-anchors.js';

export const formats = ['comment','tag'];

const comment=/^<!-- ocr2md:chapter:v1 id="([\w:.-]+)" independent="([01])" -->$/;
const tag=/^<ocr2md-chapter data-id="([\w:.-]+)" data-independent="([01])"><\/ocr2md-chapter>$/;

export function decodeMarker(source) {
  const prefix=quotePrefix(source);
  source=unquotePrefix(source).trim();
  let match=comment.exec(source);
  if(match) return {id:match[1],independent:match[2]==='1',format:'comment',quotePrefix:prefix};
  match=tag.exec(source);
  if(match) return {id:match[1],independent:match[2]==='1',format:'tag',quotePrefix:prefix};
  return null;
}

export function encodeMarker(id,independent,format) {
  if(!/^[\w:.-]+$/.test(id))throw Error('Invalid element ID');
  if(format==='comment')
    return `<!-- ocr2md:chapter:v1 id="${id}" independent="${independent?1:0}" -->`;
  if(format==='tag')
    return `<ocr2md-chapter data-id="${id}" data-independent="${independent?1:0}"></ocr2md-chapter>`;
  throw Error('Unknown marker format');
}

export function markerForHeading(doc,row) {
  if(!row?.sourceLine||row.sourceLine<2)return null;
  // A marker belongs only to the immediately following heading. The
  // association follows CM6's live document positions, never saved line IDs.
  const line=doc.line(row.sourceLine-1);
  const data=decodeMarker(line.text.trim());
  if(!data || data.id!==row.id)return null;
  return {...data,from:line.from,to:line.to,line:line.number};
}

export function countMarkers(doc){
  const counts={comment:0,tag:0};
  for(let i=1;i<=doc.lines;i++){
    const value=decodeMarker(doc.line(i).text.trim());
    if(value)counts[value.format]++;
  }
  return counts;
}

export function putMarker(view,row,independent,format) {
  if(!view||!row)throw Error('Missing editor or heading');
  if(!/^[\w:.-]+$/.test(row.id))throw Error('Heading lacks a stable ID');
  const doc=view.state.doc;
  const heading=doc.line(row.sourceLine);
  if(!/^\s*#{1,6}\s+/.test(unquotePrefix(heading.text)))
    throw Error('Heading has moved; refresh the AG outline first');
  const previous=markerForHeading(doc,row);
  const lineDelta=previous?0:1;
  const rendered=encodeMarker(row.id,independent,format);
  // The chapter module decides WHAT to write. The wrapper owns HOW to
  // transactionally insert or replace HTML in the CM6 document.
  const cm=new CMDocument({view});
  cm.writeHtml({html:rendered,beforeLine:row.sourceLine,
    replaceLine:previous?.line??null,
    quotePrefix:previous?.quotePrefix??quotePrefix(heading.text)});
  // CM6 is the authority for line positions: an inserted standalone marker
  // shifts the title by one line; replacing a marker does not.
  return {id:row.id,format,independent,
    sourceLine:row.sourceLine+lineDelta,sourceEnd:row.sourceEnd+lineDelta};
}

export function convertMarkers(view,format){
  if(!formats.includes(format))throw Error('Unsupported conversion');
  const doc=view.state.doc,changes=[];
  for(let n=1;n<=doc.lines;n++){
    const line=doc.line(n),found=decodeMarker(line.text.trim());
    if(found&&found.format!==format){
      changes.push({from:line.from,to:line.to,
        insert:found.quotePrefix+encodeMarker(found.id,found.independent,format)});
    }
  }
  if(changes.length)view.dispatch({changes,userEvent:'input'});
  return changes.length;
}
