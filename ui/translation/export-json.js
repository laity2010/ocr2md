/** Deterministic AI input from the verified, immutable translation table.
 *  Recovery values stay local. Exporting is not a second data authority.
 */
import {sha256} from './original-sentences.js';
import {template,refill} from './refill.js';
export const TRANSLATION_JSON_FILENAME='sentences.json';
export async function createTranslationJSON(table,{targetLanguage='zh-CN'}={}){
  if(!table)return null;
  if(table.schema!=='ocr2md-translation-preparation/v2'||!Array.isArray(table.rows)||
    !/^[a-f0-9]{64}$/.test(table.source_document_hash)||! /^[a-f0-9]{64}$/.test(table.sentence_sha256)||
    typeof targetLanguage!=='string'||!targetLanguage.trim())throw Error('待译 JSON 来源无效');
  const mdlines=[];let line=null,last=null,count=0;
  for(const r of table.rows){
    if(r.source_document_hash!==table.source_document_hash||r.sentence_sha256!==table.sentence_sha256||
      !Number.isSafeInteger(r.source_line)||r.source_line<1||!Number.isSafeInteger(r.sentence_index)||r.sentence_index<0||
      typeof r.translatable!=='boolean'||typeof r.text!=='string'||typeof r.raw!=='string'||
      !Array.isArray(r.protected)||template(r.raw,r.protected)!==r.text||refill(r.text,r.raw,r.protected)!==r.raw)
      throw Error('待译句来源或回填无效');
    if(last&&(r.source_line<last.source_line||(r.source_line===last.source_line&&
      (r.sentence_index!==last.sentence_index+1||r.type!==last.type||r.level!==last.level))))throw Error('待译句身份或顺序无效');
    if((!last||r.source_line!==last.source_line)&&r.sentence_index!==0)throw Error('待译句序无效');
    last=r;
    if(!r.translatable)continue;
    if(line?.source_line!==r.source_line){
      line={source_line:r.source_line,type:r.type,level:r.level,sentences:[]};
      mdlines.push(line);
    }
    line.sentences.push({sentence_index:r.sentence_index,text:r.text});count++;
  }
  if(await sha256(table.rows.map(r=>r.raw).join(''))!==table.source_document_hash)throw Error('待译 JSON 原文摘要不一致');
  const input={schema:'ocr2md-trans/v1',source_sha256:table.source_document_hash,sentence_sha256:table.sentence_sha256,target_language:targetLanguage,mdlines};
  const task_id=await sha256(JSON.stringify(input));
  const {schema,...rest}=input;
  return Object.freeze({text:JSON.stringify({schema,task_id,...rest},null,2)+'\n',count});
}


/** Display-only index into the exact pretty-printed artifact. JSON.stringify
 * escapes embedded LF and quotes; only structural lines at these indents
 * can match. Identity is MDLine + sentence_index, never the sentence text. */
export function indexJSONSentences(text){
  const result=new Map();let source=null,index=null;
  for(const [i,line] of text.split('\n').entries()){
    const md=line.match(/^ {6}"source_line": (\d+),$/);
    if(md){source=Number(md[1]);index=null;continue;}
    const sentence=line.match(/^ {10}"sentence_index": (\d+),$/);
    if(sentence){index=Number(sentence[1]);continue;}
    if(source!==null&&index!==null&&/^ {10}"text": "/.test(line)){
      const key=source+':'+index;
      if(result.has(key))throw Error('JSON 句身份重复');
      result.set(key,i+1);index=null;
    }
  }
  return result;
}
