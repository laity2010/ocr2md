/** Chapter-boundary metadata is one business meaning embedded in HTML.
 * Both an HTML comment and an older custom element may express that meaning;
 * CMD handles their source edits through one generic HTML read/write API.
 * This module owns chapter semantics, not a second HTML storage format.
 */
import {quotePrefix,unquotePrefix} from './mineru-anchors.js';
import {parseAnnotation} from './cmd-annotations.js';

const tag=/^<ocr2md-chapter data-id="([\w:.-]+)" data-independent="([01])"><\/ocr2md-chapter>$/;

export function decodeMarker(source) {
  const prefix=quotePrefix(source);
  source=unquotePrefix(source).trim();
  const marked=parseAnnotation(source);
  if(marked?.tag==='ocr2md:chapter:v1'&&
     /^[\w:.-]+$/.test(marked.attributes.id||'')&&
     ['0','1'].includes(marked.attributes.independent))
    return {id:marked.attributes.id,independent:marked.attributes.independent==='1',
      htmlKind:'comment',quotePrefix:prefix};
  const match=tag.exec(source);
  if(match) return {id:match[1],independent:match[2]==='1',htmlKind:'tag',quotePrefix:prefix};
  return null;
}

/** One canonical chapter annotation serialization, written through CMD's
 * generic writeHtml(). The reader still accepts existing custom HTML tags. */
export function encodeMarker(id,independent) {
  if(!/^[\w:.-]+$/.test(id))throw Error('Invalid element ID');
  return `<!-- ocr2md:chapter:v1 id="${id}" independent="${independent?1:0}" -->`;
}

export function markerForHeading(reader,row,annotations=null) {
  if(!row?.sourceLine||row.sourceLine<2)return null;
  const line=reader.readLine(row.sourceLine-1);
  // The CMD annotation scanner owns tag/attribute syntax. The chapter module
  // only associates an annotation on the immediately preceding heading line.
  const entries=annotations??reader.readAnnotations({tag:'ocr2md:chapter:v1'});
  const record=entries.find(item=>item.line===line.number&&
    item.attributes.id===row.id&&['0','1'].includes(item.attributes.independent)&&
    unquotePrefix(line.text).trim()===item.raw);
  if(record)return {id:record.attributes.id,independent:record.attributes.independent==='1',
    htmlKind:'comment',quotePrefix:quotePrefix(line.text),
    from:record.from,to:record.to,line:record.line,record};
  // Existing custom tags are historical, read-only compatibility inputs.
  const old=decodeMarker(line.text);
  if(!old||old.htmlKind!=='tag'||old.id!==row.id)return null;
  return {...old,from:line.from,to:line.to,line:line.number};
}

export function countMarkers(doc){
  const counts={comment:0,tag:0};
  for(let i=1;i<=doc.lines;i++){
    const value=decodeMarker(doc.line(i).text.trim());
    if(value)counts[value.htmlKind]++;
  }
  return counts;
}

export function putMarker(cm,row,independent) {
  if(!cm||!row)throw Error('Missing CMD interface or heading');
  if(!/^[\w:.-]+$/.test(row.id))throw Error('Heading lacks a stable ID');
  const heading=cm.readLine(row.sourceLine);
  if(!/^\s*#{1,6}\s+/.test(unquotePrefix(heading.text)))
    throw Error('Heading has moved; refresh the AG outline first');
  const previous=markerForHeading(cm,row);
  const lineDelta=previous?0:1;
  if(previous?.htmlKind==='tag'){
    // One-time legacy custom-tag conversion keeps its source line and quote.
    cm.writeHtml({html:encodeMarker(row.id,independent),beforeLine:row.sourceLine,
      replaceLine:previous.line,quotePrefix:previous.quotePrefix});
  }else{
    cm.writeAnnotation({tag:'ocr2md:chapter:v1',
      attributes:{id:row.id,independent:independent?'1':'0'},spaced:true,
      ...(previous?{target:previous.record}:{at:heading.from,
        prefix:quotePrefix(heading.text),suffix:'\n'})});
  }
  // CM6 is the authority for line positions: an inserted standalone marker
  // shifts the title by one line; replacing a marker does not.
  return {id:row.id,htmlKind:'comment',independent,
    sourceLine:row.sourceLine+lineDelta,sourceEnd:row.sourceEnd+lineDelta};
}
