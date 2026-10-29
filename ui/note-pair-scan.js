/** Read-only footnote pairing projection over the single CMD source.
 * Only explicit review persists annotations through CMD. 
 */
import {scanAnnotations} from './cmd-annotations.js';

export const DEFAULT_NOTE_TEMPLATE=Object.freeze({
  // Numeric sup references are common MinerU output: \\<sup>1\\</sup>.
  // Restrict default IDs to digits: OCR also emits M\\<sup>uch\\</sup>.
  // Users can configure alphabetic IDs for books that genuinely use them.
  reference:String.raw`(?:\[\^|\\?<sup\s*>)(?<id>[0-9]{1,3})(?:\]|\\?</sup\s*>)`,
  body:String.raw`^[ \t]*(?:\[\^)?(?<id>[0-9]{1,3})(?:\]:|\\?\.)[ \t]+(?<content>[^\r\n]+)`,
});
export const NOTE_TEMPLATE_KEY='ocr2md:note-pair-templates:v1';
function compileRule(value,label){
  if(typeof value!=='string'||!value||value.length>400||!value.includes('(?<id>'))
    throw Error(label+'正则必须含 (?<id>...) 命名组，且不超过400字符');
  let rx;
  try{rx=new RegExp(value,'gm');}catch(e){throw Error(label+'正则错误：'+e.message);}
  if(rx.test(''))throw Error(label+'正则不可匹配空串');
  rx.lastIndex=0;return rx;
}
export function validateNoteTemplate(template){
  if(!template||typeof template!=='object')throw Error('缺少注释配对模板');
  compileRule(template.reference,'引用');compileRule(template.body,'正文');
  return {reference:template.reference,body:template.body};
}
function positionLine(source,offset){
  let line=1;
  for(let at=0;at<offset;at++)if(source.charCodeAt(at)===10)line++;
  return line;
}
function listMatches(source,rx,type){
  const output=[];
  for(let found;(found=rx.exec(source))!==null;){
    const id=found.groups?.id?.trim();
    if(id){
      const from=found.index,to=from+found[0].length;
      const prior=source.lastIndexOf('<!--',from);
      const inComment=prior>=0&&source.indexOf('-->',prior)>=from;
      if(!inComment)output.push({id,from,to,raw:found[0],
        line:positionLine(source,from),
        content:type==='body'?(found.groups?.content||found[0]):found[0]});
    }
    if(output.length>5000)throw Error('匹配超过5000项，请调整模板');
    if(rx.lastIndex===found.index)rx.lastIndex++;
  }
  return output;
}
function existingMarker(annotations,source,tag,item){
  return annotations.filter(a=>a.tag===tag&&a.to<=item.from&&
    a.attributes.id===item.id&&source.slice(a.to,item.from).trim()==='').at(-1)||null;
}
export function scanNotePairs(source,template=DEFAULT_NOTE_TEMPLATE){
  if(typeof source!=='string')throw TypeError('Expected Markdown string');
  validateNoteTemplate(template);
  const tail=/^<!--[ \t]*minerujson:source\b/m.exec(source);
  const content=source.slice(0,tail?tail.index:source.length);
  const refs=listMatches(content,compileRule(template.reference,'引用'),'ref');
  const bodies=listMatches(content,compileRule(template.body,'正文'),'body');
  const actualRefs=refs.filter(ref=>!bodies.some(b=>ref.from>=b.from&&ref.to<=b.to));
  const map=new Map();
  for(const b of bodies){const list=map.get(b.id)||[];list.push(b);map.set(b.id,list);}
  const annotations=scanAnnotations(content);
  const coveredBodies=new Set(),rows=[];
  for(const ref of actualRefs){
    const matches=map.get(ref.id)||[],body=matches.length===1?matches[0]:null;
    if(body)coveredBodies.add(body.from);
    const refMarker=existingMarker(annotations,content,'ocr2md:note-ref',ref);
    const bodyMarker=body&&existingMarker(annotations,content,'ocr2md:note-body',body);
    rows.push({id:'ref:'+ref.from,number:ref.id,from:ref.from,
      reference:ref.raw,referenceFrom:ref.from,referenceTo:ref.to,referenceLine:ref.line,
      content:body?.content??'',bodyRaw:body?.raw??'',bodyFrom:body?.from??null,bodyTo:body?.to??null,
      bodyLine:body?.line??null,
      status:matches.length>1?'编号冲突':body?'已配对':'缺正文',
      marked:!!refMarker&&!!bodyMarker,refMarker,bodyMarker});
  }
  for(const body of bodies)if(!coveredBodies.has(body.from)){
    rows.push({id:'body:'+body.from,number:body.id,from:body.from,
      reference:'',referenceFrom:null,referenceTo:null,referenceLine:null,
      content:body.content,bodyRaw:body.raw,bodyFrom:body.from,bodyTo:body.to,bodyLine:body.line,
      status:(map.get(body.id)?.length||0)>1?'编号冲突':'缺引用',
      marked:false,refMarker:null,bodyMarker:existingMarker(annotations,content,'ocr2md:note-body',body)});
  }
  return rows.sort((a,b)=>a.from-b.from);
}
export function planMarkNotePair(source,row){
  if(!row||row.status!=='已配对'||row.referenceFrom==null||row.bodyFrom==null)
    throw Error('只能标定明确的一对一注释');
  if(source.slice(row.referenceFrom,row.referenceTo)!==row.reference ||
     source.slice(row.bodyFrom,row.bodyTo)!==row.bodyRaw)
    throw Error('注释来源已变化，请重新扫描');
  const id=row.number,reference=`[^${id}]`;
  const body=row.bodyRaw,content=row.content;
  // Avoid destructive guesses for user-defined rules without a content group.
  const contentOffset=content?body.indexOf(content):-1;
  if(contentOffset<0||!content.trim())
    throw Error('注文正则必须提取非空 (?<content>...)，才能安全转换 Obsidian 脚注');
  const oldPrefix=body.slice(0,contentOffset);
  const indent=/^[ \t]*/.exec(oldPrefix)[0];
  if(indent.length>3)
    throw Error('注文缩进超过三格，不能直接转换为 Obsidian 脚注');
  const wantedPrefix=`${indent}[^${id}]: `;
  const annotations=scanAnnotations(source),ops=[];
  if(!existingMarker(annotations,source,'ocr2md:note-ref',{id:row.number,from:row.referenceFrom}))
    ops.push({action:'insert',at:row.referenceFrom,tag:'ocr2md:note-ref',
      attributes:{id:row.number}});
  if(row.reference!==reference)
    ops.push({action:'text',from:row.referenceFrom,to:row.referenceTo,
      expected:row.reference,insert:reference});
  if(!existingMarker(annotations,source,'ocr2md:note-body',{id:row.number,from:row.bodyFrom}))
    ops.push({action:'insert',at:row.bodyFrom,tag:'ocr2md:note-body',
      attributes:{id:row.number},suffix:'\n'});
  if(oldPrefix!==wantedPrefix)
    ops.push({action:'text',from:row.bodyFrom,to:row.bodyFrom+oldPrefix.length,
      expected:oldPrefix,insert:wantedPrefix});
  return ops;
}
