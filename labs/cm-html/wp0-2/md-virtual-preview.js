/** WP5 virtual Markdown: existing renderMarkdown owns syntax; select one
 * full-source range and remap token source-line attributes to global CM6.
 */
import {renderMarkdown} from '../../../ui/markdown-preview.js';
export function chapterPreviewRange(source,scope){
  if(typeof source!=='string')throw TypeError('Expected full Markdown');
  if(scope===null)return Object.freeze({source,offsetLines:0});
  if(!scope||typeof scope.id!=='string'||
     !Number.isInteger(scope.from)||!Number.isInteger(scope.to)||
     scope.from<0||scope.to>source.length||scope.from>=scope.to||
     (scope.from>0&&source[scope.from-1]!=='\n')||
     (scope.to<source.length&&source[scope.to-1]!=='\n'))
    throw Error('Invalid CMD whole-document chapter projection');
  return Object.freeze({
    source:source.slice(scope.from,scope.to),
    offsetLines:(source.slice(0,scope.from).match(/\n/g)||[]).length,
  });
}
export function renderVirtualMarkdown(source,scope=null){
  const piece=chapterPreviewRange(source,scope);
  const html=renderMarkdown(piece.source);
  if(!piece.offsetLines)return html;
  return html.replace(/(data-source-(?:start|end)=")(\d+)(")/g,
    (_whole,leading,number,trailing)=>leading+
      String(Number(number)+piece.offsetLines)+trailing);
}
