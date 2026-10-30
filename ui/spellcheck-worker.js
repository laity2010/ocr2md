/** Isolated offline dictionary worker, no network or CMD/editor access. */
import nspell from 'nspell';

import {spellcheckIssues} from './spellcheck-scan.js';
let spell;
async function getSpell(){
  if(spell)return spell;
  const [aff,dic]=await Promise.all([
    fetch(new URL('./spellcheck-dictionary/index.aff',import.meta.url)).then(r=>{if(!r.ok)throw Error('词典 aff 读取失败');return r.text();}),
    fetch(new URL('./spellcheck-dictionary/index.dic',import.meta.url)).then(r=>{if(!r.ok)throw Error('词典 dic 读取失败');return r.text();}),
  ]);
  spell=nspell(aff,dic);
  for(const word of ['OCR2MD','Obsidian','MinerU','Markdown','CodeMirror','KaTeX','AG','CMD','WebKit','LaTeX'])spell.add(word);
  return spell;
}
self.onmessage=async event=>{
  const {id,source}=event.data||{};
  try{
    if(typeof source!=='string'||source.length>2_000_000)
      throw Error('文档超过 200 万字符，暂不执行全文拼写扫描');
    self.postMessage({id,...spellcheckIssues(source,await getSpell())});
  }catch(error){self.postMessage({id,error:String(error.message||error)});}
};
