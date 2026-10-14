/** JSON top-level property anchors. Unlike an indentation regex, this keeps
 * the owning key when a cursor enters nested arrays/objects. It also works on
 * a partially edited JSON document (no successful JSON.parse required).
 * String literals / escaped quotes are excluded from property detection.
 */
export interface JsonTopLevelAnchor {key:string;from:number;to:number;end:number;}
export function jsonTopLevelAnchors(source:string):JsonTopLevelAnchor[]{
  let objectDepth=0,arrayDepth=0,escaped=false,inString=false,start=-1,rootEnd=source.length;
  const result:JsonTopLevelAnchor[]=[];
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(inString){
      if(escaped){escaped=false;continue;}
      if(char==='\\'){escaped=true;continue;}
      if(char==='"'){
        inString=false;
        if(start>=0){
          let next=i+1;
          while(next<source.length&&/\s/.test(source[next]))next++;
          if(source[next]===':'){
            try{
              result.push({key:JSON.parse(source.slice(start,i+1)),from:start,to:i+1,end:source.length});
            }catch{ /* incomplete key text has no anchor yet */ }
          }
        }
        start=-1;
      }
      continue;
    }
    if(char==='"'){
      inString=true;
      start=objectDepth===1&&arrayDepth===0?i:-1;
      continue;
    }
    if(char==='{')objectDepth++;
    else if(char==='}'){
      if(objectDepth===1&&arrayDepth===0)rootEnd=i;
      objectDepth=Math.max(0,objectDepth-1);
    }
    else if(char==='[')arrayDepth++;
    else if(char===']')arrayDepth=Math.max(0,arrayDepth-1);
  }
  for(let i=0;i<result.length;i++)result[i].end=
    i+1<result.length?result[i+1].from:rootEnd;
  return result;
}
export function jsonKeyAtOffset(source:string,offset:number):string|null{
  const anchors=jsonTopLevelAnchors(source);
  for(let i=anchors.length-1;i>=0;i--){
    if(offset>=anchors[i].from&&offset<anchors[i].end)return anchors[i].key;
  }
  return null;
}
