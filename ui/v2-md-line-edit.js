/** WP25C: plan native CM6 line edits using the WP25A ownership index.
 * Never manufacture block identities. Return exact requested source and
 * mandatory real LF repairs, to be applied in the same native transaction.
 */
import {createMdLineIndex} from './v2-md-line-index.js';
import {composeOwnedSource,logicalTextRows} from './v2-block-source.js';

export function planMdLineEdit(doc,blocks,changes){
  if(!blocks.length||!changes?.iterChanges)return null;
  let index;
  try{index=createMdLineIndex(doc,blocks);}catch{return null;}
  const original=logicalTextRows(doc.toString(),blocks);
  const byId=new Map(),byBlock=new Map(blocks.map((r,i)=>[r.logicalId,i]));
  let valid=true;
  const add=(id,a,b,text)=>{
    const r=blocks[byBlock.get(id)];
    if(!r||a<r.from||b>r.to||a>b){valid=false;return;}
    if(a===b&&!text)return;
    const list=byId.get(id)||[];
    list.push({a:a-r.from,b:b-r.from,text});byId.set(id,list);
  };
  changes.iterChanges((a,b,_c,_d,inserted)=>{
    if(!valid)return;
    const text=inserted.toString();
    const first=index.atOffset(a),last=b>a?index.atOffset(b-1):first;
    if(a===b){
      const id=first?.logical_id??(a===doc.length?index.eofOwner:null);
      if(id==null){valid=false;return;}
      const r=blocks[byBlock.get(id)],previous=blocks[byBlock.get(id)-1];
      if(previous&&a===r.from&&text.includes('\n')){
        // Complete inserted lines precede the original next-block line.
        // Its non-terminated prefix remains part of that original line.
        const split=text.lastIndexOf('\n')+1;
        add(previous.logicalId,a,a,text.slice(0,split));
        add(id,a,a,text.slice(split));
      }else add(id,a,a,text);
      return;
    }
    if(!first||!last){valid=false;return;}
    if(first.logical_id===last.logical_id){add(first.logical_id,a,b,text);return;}
    // Multi-owner removal is unambiguous only for complete physical lines.
    // Replacement across owners with new text could silently merge them.
    if(text||a!==first.from||b!==last.to){valid=false;return;}
    for(let i=byBlock.get(first.logical_id);i<=byBlock.get(last.logical_id);i++){
      const r=blocks[i];add(r.logicalId,Math.max(a,r.from),Math.min(b,r.to),'');
    }
  });
  if(!valid||!byId.size)return null;
  let requested='',repairs=[];
  const rows=original.map((r,i)=>{
    const edits=byId.get(r.logicalId)||[];
    let cursor=0,text='';
    for(const e of edits){
      if(e.a<cursor||e.b>r.markdownText.length){valid=false;break;}
      text+=r.markdownText.slice(cursor,e.a)+e.text;cursor=e.b;
    }
    text+=r.markdownText.slice(cursor);
    requested+=text;
    const next=original[i+1],min=next&&next.p===r.p&&next.b===r.b?1:2;
    const suffix='\n'.repeat(Math.max(0,min-(text.match(/\n+$/)?.[0].length||0)));
    if(suffix){
      if(repairs.at(-1)?.from===requested.length)repairs.at(-1).insert+=suffix;
      else repairs.push({from:requested.length,insert:suffix});
    }
    return {...r,markdownText:text+suffix};
  });
  if(!valid)return null;
  try{return {...composeOwnedSource(rows),requested,repairs};}catch{return null;}
}
