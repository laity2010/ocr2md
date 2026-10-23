/** CMD syntax-only HTML comment annotations. No business semantics or tree. */
const TAG=/^\/?[A-Za-z][A-Za-z0-9_.:-]*$/;
const KEY=/^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const COMMENT=/<!--([\s\S]*?)-->/g;
const ENTITY=/&(?:amp|quot|apos|lt|gt|#(?:x[0-9a-f]+|[0-9]+));/gi;
const ENTITIES={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'};
function decode(value){
  return value.replace(ENTITY,entity=>{
    const key=entity.slice(1,-1).toLowerCase();
    if(Object.hasOwn(ENTITIES,key))return ENTITIES[key];
    const num=key[1]==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
    return num>0&&num<=0x10ffff&&!(num>=0xd800&&num<=0xdfff)?String.fromCodePoint(num):entity;
  });
}
function encode(value){
  if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')
    throw Error('Annotation attribute must be text, number or boolean');
  const s=String(value);
  if(/[\r\n\0]/.test(s))throw Error('Annotation attributes must be single-line');
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/--/g,'&#45;&#45;');
}
/** Exact, deterministic grammar: `<!--name key="value" ...-->`.
 * Also reads legacy bare key=value and whitespace surrounding comment body.
 * Free prose, partial records, and multi-line evidence are ignored.
 */
export function parseAnnotation(raw){
  if(typeof raw!=='string'||!raw.startsWith('<!--')||!raw.endsWith('-->')||/[\r\n]/.test(raw))return null;
  const body=raw.slice(4,-3).trim();
  const head=/^(\/?[A-Za-z][A-Za-z0-9_.:-]*)(?=\s|$)/.exec(body);
  if(!head||!TAG.test(head[1]))return null;
  let rest=body.slice(head[0].length);
  const attributes=Object.create(null);
  while(rest.length){
    const match=/^\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/.exec(rest);
    if(!match||!KEY.test(match[1])||Object.hasOwn(attributes,match[1]))return null;
    attributes[match[1]]=decode(match[2]??match[3]??match[4]);
    rest=rest.slice(match[0].length);
  }
  // Do not turn ordinary `<!-- note -->` prose comments into markers.
  if(!head[1].includes(':')&&Object.keys(attributes).length===0)return null;
  return {tag:head[1],attributes:{...attributes}};
}
export function formatAnnotation(tag,attributes={}){
  if(typeof tag!=='string'||!TAG.test(tag))throw Error('Invalid annotation tag');
  if(!attributes||typeof attributes!=='object'||Array.isArray(attributes))
    throw Error('Annotation attributes must be an object');
  const pairs=[];
  for(const [key,value]of Object.entries(attributes)){
    if(!KEY.test(key))throw Error('Invalid annotation attribute name');
    pairs.push(`${key}="${encode(value)}"`);
  }
  if(!tag.includes(':')&&pairs.length===0)throw Error('Annotation tag requires a namespace or attributes');
  return `<!--${tag}${pairs.length?' '+pairs.join(' '):''}-->`;
}
export function scanAnnotations(source){
  const items=[];
  for(const match of source.matchAll(COMMENT)){
    const annotation=parseAnnotation(match[0]);
    if(annotation)items.push({...annotation,from:match.index,to:match.index+match[0].length,raw:match[0]});
  }
  return items;
}
