/** Chapter-boundary metadata is one business meaning embedded in HTML.
 * Both an HTML comment and an older custom element may express that meaning;
 * CMD handles their source edits through one generic HTML read/write API.
 * This module owns chapter semantics, not a second HTML storage format.
 */
import {CMDocument} from './cm-document.js';
import {quotePrefix,unquotePrefix} from './mineru-anchors.js';

const comment=/^<!-- ocr2md:chapter:v1 id="([\w:.-]+)" independent="([01])" -->$/;
const tag=/^<ocr2md-chapter data-id="([\w:.-]+)" data-independent="([01])"><\/ocr2md-chapter>$/;

export function decodeMarker(source) {
  const prefix=quotePrefix(source);
  source=unquotePrefix(source).trim();
  let match=comment.exec(source);
  if(match) return {id:match[1],independent:match[2]==='1',htmlKind:'comment',quotePrefix:prefix};
  match=tag.exec(source);
  if(match) return {id:match[1],independent:match[2]==='1',htmlKind:'tag',quotePrefix:prefix};
  return null;
}

/** One canonical chapter annotation serialization, written through CMD's
 * generic writeHtml(). The reader still accepts existing custom HTML tags. */
export function encodeMarker(id,independent) {
  if(!/^[\w:.-]+$/.test(id))throw Error('Invalid element ID');
  return `<!-- ocr2md:chapter:v1 id="${id}" independent="${independent?1:0}" -->`;
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
    if(value)counts[value.htmlKind]++;
  }
  return counts;
}

export function putMarker(view,row,independent) {
  if(!view||!row)throw Error('Missing editor or heading');
  if(!/^[\w:.-]+$/.test(row.id))throw Error('Heading lacks a stable ID');
  const doc=view.state.doc;
  const heading=doc.line(row.sourceLine);
  if(!/^\s*#{1,6}\s+/.test(unquotePrefix(heading.text)))
    throw Error('Heading has moved; refresh the AG outline first');
  const previous=markerForHeading(doc,row);
  const lineDelta=previous?0:1;
  const rendered=encodeMarker(row.id,independent);
  // The chapter module decides WHAT to write. The wrapper owns HOW to
  // transactionally insert or replace HTML in the CM6 document.
  const cm=new CMDocument({view});
  cm.writeHtml({html:rendered,beforeLine:row.sourceLine,
    replaceLine:previous?.line??null,
    quotePrefix:previous?.quotePrefix??quotePrefix(heading.text)});
  // CM6 is the authority for line positions: an inserted standalone marker
  // shifts the title by one line; replacing a marker does not.
  return {id:row.id,htmlKind:'comment',independent,
    sourceLine:row.sourceLine+lineDelta,sourceEnd:row.sourceEnd+lineDelta};
}
