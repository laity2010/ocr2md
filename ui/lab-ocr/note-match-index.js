/** WCP43 Note Match WP1 — pure, read-only projection from current CM6 MD rows.
 * No CMD comments, no SQL, no cached alternate document, no DOM, no writes.
 * A rule detects a candidate; its evidence is not an automatic editorial verdict.
 */

export const NOTE_REFERENCE_RULES=Object.freeze([
  'ref.html-sup','ref.md-footnote','ref.unicode-sup',
  'ref.bracket','ref.parenthesis','ref.symbol','ref.html-alpha',
]);
export const NOTE_BODY_RULES=Object.freeze([
  'body.md-footnote','body.number-dot','body.number-paren',
  'body.number-bracket','body.labelled','body.symbol','body.letter-dot',
]);
export const DEFAULT_NOTE_MATCH_CONFIG=Object.freeze({
  // Alphabetic superscripts are opt-in: MinerU can invent <sup>uch</sup>.
  referenceRules:Object.freeze(NOTE_REFERENCE_RULES.filter(x=>x!=='ref.html-alpha')),
  bodyRules:Object.freeze(NOTE_BODY_RULES.filter(x=>x!=='body.letter-dot')),
  scope:'book',chapterLevel:1,
  weakAutoMatch:false,
  continuation:'same-block',
  customRules:Object.freeze([]),
});

const ruleDefinition={
  'ref.html-sup':{rx:/\\?<sup\s*>\s*([0-9]{1,3}|[∗*†‡])\s*\\?<\/sup\s*>/gu,strength:'strong'},
  'ref.md-footnote':{rx:/\[\^([0-9]{1,3}|[*†‡])\]/gu,strength:'strong'},
  'ref.unicode-sup':{rx:/[⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3}/gu,strength:'strong'},
  'ref.bracket':{rx:/\[([0-9]{1,3})\]/gu,strength:'ambiguous'},
  'ref.parenthesis':{rx:/\(([0-9]{1,3})\)/gu,strength:'ambiguous'},
  'ref.symbol':{rx:/[*†‡]/gu,strength:'ambiguous'},
  'ref.html-alpha':{rx:/\\?<sup\s*>\s*([A-Za-z])\s*\\?<\/sup\s*>/gu,strength:'ambiguous'},
  'body.md-footnote':{rx:/^[ \t]{0,3}\[\^([0-9]{1,3}|[*†‡])\]:[ \t]*(.*)$/u,strength:'strong'},
  'body.number-dot':{rx:/^[ \t]{0,3}([0-9]{1,3})\\?\.[ \t]+(\S.*)$/u,strength:'contextual'},
  'body.number-paren':{rx:/^[ \t]{0,3}([0-9]{1,3})\)[ \t]+(\S.*)$/u,strength:'contextual'},
  'body.number-bracket':{rx:/^[ \t]{0,3}\[([0-9]{1,3})\][ \t]+(\S.*)$/u,strength:'contextual'},
  'body.labelled':{rx:/^[ \t]{0,3}(?:Notes?|Footnotes?|Endnotes?|注释?|脚注)[ \t]*([0-9]{1,3})[ \t]*[:：.．、][ \t]*(\S.*)$/iu,strength:'strong'},
  'body.symbol':{rx:/^[ \t]{0,3}([*†‡])[ \t]+(\S.*)$/u,strength:'ambiguous'},
  'body.letter-dot':{rx:/^[ \t]{0,3}([A-Za-z])\\?[.][ \t]+(\S.*)$/u,strength:'ambiguous'},
};
const numerals=Object.freeze({'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4',
  '⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','∗':'*'});
const headingPattern=/^[ \t]{0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/u;
const noteHeadingPattern=/^(?:endnotes?|footnotes?|notes?|注释|脚注|尾注|注文)(?:\s*[:：].*)?$/iu;
const bibliographyPattern=/^(?:references?|bibliography|works\s+cited|参考文献|文献目录)(?:\s*[:：].*)?$/iu;
const blockedBlockTypes=new Set(['table','image','interline_equation','display_equation','formula']);
const MAX_CANDIDATES=20000;

export function validateNoteMatchConfig(config=DEFAULT_NOTE_MATCH_CONFIG){
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('注释规则配置无效');
  const allReferenceRules=Array.from(config.referenceRules??DEFAULT_NOTE_MATCH_CONFIG.referenceRules);
  const allBodyRules=Array.from(config.bodyRules??DEFAULT_NOTE_MATCH_CONFIG.bodyRules);
  for(const [rules,known,label] of [[allReferenceRules,NOTE_REFERENCE_RULES,'注引'],
    [allBodyRules,NOTE_BODY_RULES,'注文']]){
    if(!Array.isArray(rules)||rules.length>known.length||
       rules.some(id=>!known.includes(id))||new Set(rules).size!==rules.length)
      throw Error(label+'识别规则无效');
  }
  // A book may need syntax absent from the built-ins. Rules are data, not
  // source edits or persistence. The later WP2 settings UI will supply these
  // book-scoped values; WP1 merely compiles and validates them.
  const custom=config.customRules??[];
  if(!Array.isArray(custom)||custom.length>8)throw Error('自定义注释规则数量超限');
  const seen=new Set();
  const customRules=custom.map(rule=>{
    if(!rule||typeof rule!=='object'||
       typeof rule.id!=='string'||!/^book\.(?:ref|body)\.[a-z][a-z0-9-]{0,30}$/.test(rule.id)||
       seen.has(rule.id)||!['reference','body'].includes(rule.kind)||
       rule.id.startsWith('book.ref.')!==(rule.kind==='reference')||
       typeof rule.pattern!=='string'||rule.pattern.length>240||
       !rule.pattern.includes('(?<id>')||
       rule.kind==='body'&&(!rule.pattern.startsWith('^')||!rule.pattern.includes('(?<content>'))||
       !['strong','ambiguous'].includes(rule.strength))
      throw Error('自定义注释规则不合法');
    seen.add(rule.id);
    let regex;
    try{regex=new RegExp(rule.pattern,rule.kind==='reference'?'gu':'u');}
    catch{throw Error('自定义注释规则表达式无效');}
    if(regex.test('')||regex.test(' '))throw Error('自定义注释规则不可匹配空文本');
    return Object.freeze({id:rule.id,kind:rule.kind,pattern:rule.pattern,
      strength:rule.strength});
  });
  const scope=config.scope??'book',chapterLevel=config.chapterLevel??1;
  const continuation=config.continuation??'same-block';
  if(!['book','chapter'].includes(scope)||!Number.isInteger(chapterLevel)||
     chapterLevel<1||chapterLevel>6||
     !['same-block','notes-section'].includes(continuation)||
     (config.weakAutoMatch!=null&&typeof config.weakAutoMatch!=='boolean'))
    throw Error('注释识别范围设置无效');
  return Object.freeze({referenceRules:Object.freeze([...allReferenceRules]),
    bodyRules:Object.freeze([...allBodyRules]),scope,chapterLevel,
    continuation,weakAutoMatch:config.weakAutoMatch===true,
    customRules:Object.freeze(customRules)});
}

function noteNumber(value){
  const normalized=String(value??'').trim().replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹∗]/gu,c=>numerals[c]);
  if(/^\d{1,3}$/.test(normalized))return String(Number(normalized));
  if(/^[A-Za-z]$/.test(normalized))return normalized.toLowerCase();
  return ['*','†','‡'].includes(normalized)?normalized:null;
}
function blockInfo(blockRows){
  const map=new Map();
  for(const block of blockRows){
    if(Number.isSafeInteger(block?.block_id)&&block.block_id>0)map.set(block.block_id,block);
  }
  return map;
}
function structurallyExcluded(block){
  if(!block)return false;
  return blockedBlockTypes.has(block.block_type)||
    (typeof block.block_group==='string'&&block.block_group!=='para_blocks'&&
     block.block_type!=='title');
}
function isSuppressed(index,intervals){return intervals.some(([lo,hi])=>index>=lo&&index<hi);}
function protectedIntervals(text){
  const covered=[];
  for(const rx of [/`{1,3}[^`\n]*`{1,3}/gu, /\$\$[^$]*\$\$/gu,
    /\$(?!\s)[^$\n]{1,200}\$/gu,/<!--[\s\S]*?-->/gu,
    /\[[^\]]+\]\([^\s)]+\)/gu]){
    for(const m of text.matchAll(rx))covered.push([m.index,m.index+m[0].length]);
  }
  return covered;
}
function headingKind(text){
  const found=headingPattern.exec(text);
  if(!found)return null;
  const label=found[2].trim();
  return {level:found[1].length,label,notes:noteHeadingPattern.test(label),
    bibliography:bibliographyPattern.test(label)};
}
function contextualize(mdRows,blockById,config){
  const contexts=[];
  let chapterKey='root',notesSection=false,bibliography=false;
  let inFence=false,inDisplayMath=false,inHtmlTable=false,inHtmlComment=false;
  for(const row of mdRows){
    const text=row.text;
    const heading=headingKind(text);
    if(heading){
      if(heading.notes){notesSection=true;bibliography=false;}
      else if(heading.bibliography){notesSection=false;bibliography=true;}
      else{
        notesSection=false;bibliography=false;
        if(heading.level<=config.chapterLevel)chapterKey='chapter:'+row.line_id;
      }
    }
    const prefix=text.trimStart();
    const fence=/^(`{3,}|~{3,})/u.exec(prefix);
    if(fence)inFence=!inFence;
    const countDollars=(text.match(/\$\$/gu)||[]).length;
    if(countDollars%2===1)inDisplayMath=!inDisplayMath;
    const openingTable=/<table(?:\s|>)/iu.test(text);
    if(openingTable)inHtmlTable=true;
    if(/<!--[\s\S]*$/u.test(text)&&!text.includes('-->'))inHtmlComment=true;
    const codeOrMath=inFence||inDisplayMath||inHtmlTable||inHtmlComment||
      /^\s*(?:\$\$|\\\[|\\begin\{|<table)/u.test(text);
    const excluded=codeOrMath||structurallyExcluded(blockById.get(row.block_id));
    contexts.push({chapterKey:config.scope==='chapter'?chapterKey:'book',
      notesSection,bibliography,excluded,heading,protected:protectedIntervals(text)});
    if(inHtmlTable&&/<\/table\s*>/iu.test(text))inHtmlTable=false;
    if(inHtmlComment&&text.includes('-->'))inHtmlComment=false;
  }
  return contexts;
}
function asLocation(row,blockById){
  const block=blockById.get(row.block_id);
  return {line_id:row.line_id,line_no:row.line_no,block_id:row.block_id??null,
    pbs:block?.pbs??null,page:Number.isInteger(block?.global_page)?block.global_page+1:null};
}
function evidence(ruleId,strength,context){
  return Object.freeze({rule_id:ruleId,strength,
    notes_section:context.notesSection,scope:context.chapterKey});
}
function isBodyLikeLine(text){
  return /^(?:\s{0,3}\[\^[0-9*†‡]+\]:|\s{0,3}(?:\d{1,3}[.)]|\[\d{1,3}\])\s+|\s{0,3}(?:Notes?|Footnotes?|脚注|注释?)\s*\d+\s*[:：.．])/iu.test(text);
}
function enabledRules(config,kind){
  const builtin=kind==='reference'?config.referenceRules:config.bodyRules;
  const custom=config.customRules.filter(rule=>rule.kind===kind);
  return [...builtin.map(id=>({id,rule:ruleDefinition[id],custom:false})),
    ...custom.map(rule=>({id:rule.id,rule:{
      rx:new RegExp(rule.pattern,kind==='reference'?'gu':'u'),
      strength:rule.strength},custom:true}))];
}
function refCandidates(mdRows,contexts,config,blockById){
  const all=[],rules=enabledRules(config,'reference');
  for(let i=0;i<mdRows.length;i++){
    const row=mdRows[i],ctx=contexts[i];
    if(ctx.excluded||ctx.heading||ctx.notesSection||ctx.bibliography||
       isBodyLikeLine(row.text))continue;
    const matches=[];
    for(const {id:ruleId,rule:def,custom} of rules){
      const rx=new RegExp(def.rx.source,def.rx.flags);
      for(const match of row.text.matchAll(rx)){
        const from=match.index,raw=match[0],to=from+raw.length;
        const id=noteNumber(ruleId==='ref.unicode-sup'?raw:
          custom?match.groups?.id:match[1]??raw);
        if(!id||isSuppressed(from,ctx.protected)||
           isSuppressed(Math.max(from,to-1),ctx.protected))continue;
        if(ruleId==='ref.symbol'){
          const before=row.text[from-1]??'',after=row.text[to]??'';
          if(!/[\p{L}\p{N}\])”’]/u.test(before)||
             (after&&!/[\s.,;:!?）\])”’]/u.test(after)))continue;
        }
        if(ruleId==='ref.bracket'&&/\]\s*\(/u.test(row.text.slice(from,to+3)))continue;
        matches.push({candidate_id:`ref:${row.line_id}:${from}:${ruleId}`,kind:'reference',
          number:id,raw,from,to,...asLocation(row,blockById),
          context:row.text.slice(Math.max(0,from-32),Math.min(row.text.length,to+32)),
          evidence:evidence(ruleId,def.strength,ctx)});
      }
    }
    // One physical marker may satisfy multiple rule patterns. Keep the most
    // specific one; do not double count a sup reference as a bare symbol.
    matches.sort((a,b)=>a.from-b.from||(b.to-b.from)-(a.to-a.from));
    for(const item of matches){
      if(all.length>=MAX_CANDIDATES)throw Error('注释候选数量超过上限');
      if(matches.some(other=>other!==item&&other.from<=item.from&&
         other.to>=item.to&&(other.to-other.from)>=(item.to-item.from)))continue;
      all.push(Object.freeze(item));
    }
  }
  return all;
}
function bodyCandidates(mdRows,contexts,config,blockById){
  const bodies=[],rules=enabledRules(config,'body');
  for(let i=0;i<mdRows.length;i++){
    const row=mdRows[i],ctx=contexts[i];
    if(ctx.excluded||ctx.heading||ctx.bibliography)continue;
    const results=[];
    for(const {id:ruleId,rule:def,custom} of rules){
      const m=def.rx.exec(row.text);
      if(!m)continue;
      const id=noteNumber(custom?m.groups?.id:m[1]);
      if(!id||isSuppressed(m.index,ctx.protected))continue;
      const content=custom?m.groups?.content??'':m[2]??'';
      if(!content.trim()&&ruleId!=='body.md-footnote')continue;
      results.push({ruleId,strength:def.strength,number:id,raw:m[0],
        from:m.index,to:m.index+m[0].length,content});
    }
    const first=results[0];
    if(!first)continue;
    const lineIds=[row.line_id],blockIds=new Set([row.block_id]);
    const lines=[first.content];
    for(let j=i+1;j<mdRows.length&&j<=i+100;j++){
      const next=mdRows[j],nextCtx=contexts[j];
      if(nextCtx.heading||nextCtx.excluded||nextCtx.bibliography||
         nextCtx.chapterKey!==ctx.chapterKey)break;
      if(config.continuation==='same-block'&&next.block_id!==row.block_id)break;
      if(config.continuation==='notes-section'&&(!ctx.notesSection||!nextCtx.notesSection))break;
      if(rules.some(({rule})=>rule.rx.test(next.text)))break;
      // A new footnote marker or a heading under an unrelated rule still
      // blocks continuation; never swallow another note by disabling a rule.
      if(isBodyLikeLine(next.text))break;
      lineIds.push(next.line_id);blockIds.add(next.block_id);
      lines.push(next.text);
    }
    const summary=lines.join('\n');
    bodies.push(Object.freeze({candidate_id:`body:${row.line_id}:${first.from}:${first.ruleId}`,
      kind:'body',number:first.number,raw:first.raw,from:first.from,to:first.to,
      content:summary,body_line_ids:Object.freeze(lineIds),
      body_block_ids:Object.freeze([...blockIds]),
      ...asLocation(row,blockById),evidence:evidence(first.ruleId,
        ctx.notesSection&&first.strength==='contextual'?'strong':first.strength,ctx)}));
    if(bodies.length>=MAX_CANDIDATES)throw Error('注文候选数量超过上限');
  }
  return bodies;
}

/** Single public query for the future AG View. Input is CM6's current state.
 * Output is a fresh immutable evidence projection; no persistent shadow rows.
 */
export function projectNoteMatchIndex(mdRows,blockRows=[],configuration=DEFAULT_NOTE_MATCH_CONFIG){
  const config=validateNoteMatchConfig(configuration);
  if(!Array.isArray(mdRows)||!Array.isArray(blockRows)||mdRows.length>40000)
    throw Error('注释扫描输入无效');
  const lineIds=new Set();
  for(let i=0;i<mdRows.length;i++){
    const row=mdRows[i];
    if(!row||typeof row.line_id!=='string'||!row.line_id||lineIds.has(row.line_id)||
       !Number.isInteger(row.line_no)||row.line_no!==i+1||
       typeof row.text!=='string'||/[\r\n]/u.test(row.text))
      throw Error('注释扫描 MD 行来源无效（第 '+(i+1)+' 行）');
    lineIds.add(row.line_id);
  }
  const byBlock=blockInfo(blockRows),contexts=contextualize(mdRows,byBlock,config);
  const references=refCandidates(mdRows,contexts,config,byBlock);
  const bodies=bodyCandidates(mdRows,contexts,config,byBlock);
  const bodyMap=new Map();
  for(const body of bodies){
    const key=body.evidence.scope+'\u001f'+body.number;
    const list=bodyMap.get(key)??[];list.push(body);bodyMap.set(key,list);
  }
  const linkedBodies=new Set();
  const pairs=references.map(ref=>{
    const key=ref.evidence.scope+'\u001f'+ref.number;
    const eligible=bodyMap.get(key)??[];
    eligible.forEach(item=>linkedBodies.add(item.candidate_id));
    const accepted=eligible.length===1&&(
      config.weakAutoMatch||
      (ref.evidence.strength==='strong'&&
       ['strong','contextual'].includes(eligible[0].evidence.strength)));
    const status=eligible.length>1?'编号冲突':!eligible.length?'缺注文':
      accepted?'已匹配':'待核实';
    return Object.freeze({pair_id:`pair:${ref.candidate_id}`,number:ref.number,
      reference_id:ref.candidate_id,
      body_id:accepted?eligible[0].candidate_id:null,
      candidate_body_ids:Object.freeze(eligible.map(item=>item.candidate_id)),
      status,reason:eligible.length>1?'同一范围存在多个同号注文':
        !eligible.length?'该范围未找到同号注文':
        accepted?'编号唯一且识别证据达到配置阈值':'编号匹配但格式有歧义，需人工核对'});
  });
  const orphanBodies=bodies.filter(body=>!linkedBodies.has(body.candidate_id));
  return Object.freeze({configuration:config,
    references:Object.freeze(references),bodies:Object.freeze(bodies),
    pairs:Object.freeze(pairs),orphan_bodies:Object.freeze(orphanBodies),
    stats:Object.freeze({references:references.length,bodies:bodies.length,
      matched:pairs.filter(row=>row.status==='已匹配').length,
      need_review:pairs.filter(row=>row.status==='待核实').length,
      conflict:pairs.filter(row=>row.status==='编号冲突').length,
      missing_body:pairs.filter(row=>row.status==='缺注文').length,
      orphan_bodies:orphanBodies.length})});
}
