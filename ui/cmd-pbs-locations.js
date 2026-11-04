/** CMD-owned PDF placement sidecar for manually reviewed PBS structure.
 * The public Markdown CMD tag contains ONLY id=. This compact footer maps
 * logical PBS atoms to unchanged physical PDF rectangles, and records which
 * original OCR parent labels have been dissolved by human review.
 * It is NOT an OCR round-trip requirement or a constraint on text editing.
 */
const prefix='<!-- cmd:pbs-locations:v1 ';
const regex=/^<!-- cmd:pbs-locations:v1 (\{[^\n]*\}) -->\n/gm;
const id=/^p(?:0|[1-9]\d*)b(?:0|[1-9]\d*)(?:s(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))*)?$/;
const parent=/^p(?:0|[1-9]\d*)b(?:0|[1-9]\d*)$/;
export function readCMDPBSLocations(source){
  const tail=source.indexOf('<!-- minerujson:source:v1:');
  if(tail<0)throw Error('Missing sealed MinerU source');
  const matches=[...source.matchAll(regex)];
  if(matches.length>1||source.slice(0,tail).split(prefix).length-1!==matches.length||
     matches.some(m=>m.index>=tail))throw Error('Duplicate or malformed CMD PBS locations');
  if(!matches.length)return {bindings:{},bodies:[],removed:[],range:null};
  const m=matches[0];
  let object;try{object=JSON.parse(m[1]);}catch{throw Error('Malformed PBS locations JSON');}
  if(!object||object.schema!==1||!object.bindings||Array.isArray(object.bindings)||
    typeof object.bindings!=='object'||!Array.isArray(object.bodies)||
    !Array.isArray(object.removed)||Object.keys(object).join(',')!=='schema,bindings,bodies,removed')
    throw Error('Invalid PBS locations schema');
  const entries=Object.entries(object.bindings);
  if(entries.length>20000||object.bodies.length>20000||object.removed.length>20000||
    // The logical pN page of a reviewed child can differ from its unchanged
    // original physical PDF page. Bindings are deliberately cross-page.
    entries.some(([key,origin])=>!id.test(key)||!id.test(origin))||
    object.bodies.some(x=>!id.test(x)||!Object.hasOwn(object.bindings,x))||
    object.removed.some(x=>!parent.test(x))||
    new Set(object.bodies).size!==object.bodies.length||
    new Set(object.removed).size!==object.removed.length)
    throw Error('Invalid PBS locations identities');
  return {bindings:object.bindings,bodies:object.bodies,removed:object.removed,
    range:{from:m.index,to:m.index+m[0].length,expected:m[0]}};
}
export function planCMDPBSLocationsEdit(source,{bindings,bodies,removed}){
  const current=readCMDPBSLocations(source);
  const stable=Object.fromEntries(Object.entries(bindings).sort(([a],[b])=>a.localeCompare(b)));
  const value=prefix+JSON.stringify({schema:1,bindings:stable,
    bodies:[...new Set(bodies)].sort(),removed:[...new Set(removed)].sort()})+' -->\n';
  if(current.range)return {from:current.range.from,to:current.range.to,
    expected:current.range.expected,insert:value};
  const tail=source.indexOf('<!-- minerujson:source:v1:');
  const bbox=source.indexOf('<!-- cmd:pdf-bbox:v1 ');
  // Keep the PDF bbox footer immediately before original sealed source.
  if(bbox>=0&&bbox<tail){
    // The PDF bbox comment is CMD-owned, not sealed MinerU evidence. Insert
    // on its first byte, retaining the already-existing line separator;
    // unlike a sealed OCR comment this editable CMD boundary is safe.
    if(bbox<1||source[bbox-1]!=='\n')throw Error('No editable PDF bbox footer separator');
    return {from:bbox,to:bbox,expected:'',insert:value};
  }
  const at=tail>0&&source[tail-1]==='\n'?tail-1:tail;
  if(at<1||source[at-1]!=='\n')throw Error('No editable CMD footer separator');
  return {from:at,to:at,expected:'',insert:value};
}
