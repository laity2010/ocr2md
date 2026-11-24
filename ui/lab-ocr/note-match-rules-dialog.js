/** Book-scoped Note Match rules: two explicit built-in format choices.
 * No competing settings storage or alternate note detection engine.
 * Old multi-format configurations are retained unchanged until replaced.
 */
import {NOTE_REFERENCE_RULES,NOTE_BODY_RULES,NOTE_RULE_PRESETS,
  validateNoteMatchConfig} from './note-match-index.js';

const PRESERVE='__existing__';
const STANDARD_REF='ref.md-footnote',STANDARD_BODY='body.md-footnote';

function currentPreset(rules,custom,standard){
  if(custom.length)return PRESERVE;
  const explicit=rules.filter(rule=>rule!==standard);
  // Automatically retain standard Markdown syntax for already-converted
  // Obsidian footnotes, even when source recognition is set to one style.
  if(explicit.length===1&&rules.includes(standard))return explicit[0];
  if(explicit.length===0&&rules.includes(standard))return standard;
  // Legacy configurations with a single, non-Markdown rule also round-trip.
  if(rules.length===1)return rules[0];
  return PRESERVE;
}

export function createNoteMatchRulesDialog({onSave}={}){
  if(typeof onSave!=='function')throw Error('缺少注释规则保存回调');
  const dialog=document.createElement('dialog');
  dialog.className='ocr-note-match-rules-dialog';
  dialog.setAttribute('aria-label','当前书籍 · 注释识别规则');
  const heading=document.createElement('h2');heading.textContent='当前书籍 · 注释格式';
  const intro=document.createElement('p');
  intro.textContent='分别选择一种注引格式和一种注文格式。示例及正则会随选择更新。';
  const form=document.createElement('form');form.method='dialog';
  const choices=new Map();
  for(const [kind,label,ids] of [
    ['referenceRules','注号格式',NOTE_REFERENCE_RULES],
    ['bodyRules','注文格式',NOTE_BODY_RULES],
  ]){
    const group=document.createElement('section');group.className='ocr-note-rule-choice';
    const control=document.createElement('label');control.textContent=label;
    const select=document.createElement('select');
    select.setAttribute('aria-label',label);
    for(const id of ids){
      const rule=NOTE_RULE_PRESETS[id];
      select.add(new Option(`${rule.label} · ${rule.example}`,id));
    }
    control.append(select);
    const sample=document.createElement('div');sample.className='ocr-note-rule-sample';
    const regex=document.createElement('code');regex.className='ocr-note-rule-regex';
    const show=()=>{
      const rule=NOTE_RULE_PRESETS[select.value];
      sample.textContent=rule?`样例：${rule.example}`:
        '保留当前书籍已设置的多格式识别规则';
      regex.textContent=rule?`正则：${rule.pattern}`:'正则：当前书籍原有规则（保持不变）';
    };
    select.addEventListener('change',show);
    group.append(control,sample,regex);form.append(group);
    choices.set(kind,{select,show});
  }
  const hint=document.createElement('p');hint.className='ocr-note-rule-hint';
  hint.textContent='正则负责识别候选，配对仍检查注号和章节。已转换的 [^7]、[^7]: 正文仍可识别；其他设置保留不变。';
  form.append(hint);
  const feedback=document.createElement('p');feedback.className='ocr-note-rule-feedback';
  feedback.setAttribute('role','status');form.append(feedback);
  const actions=document.createElement('div');actions.className='ocr-note-rule-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
  const save=document.createElement('button');save.type='submit';save.textContent='保存并重新识别';
  actions.append(cancel,save);form.append(actions);
  dialog.append(heading,intro,form);document.body.append(dialog);
  cancel.addEventListener('click',()=>dialog.close());
  let disposed=false,busy=false,original=null;
  const resolveRules=(key,selected,standard)=>{
    if(selected===PRESERVE)return original[key];
    return selected===standard?[standard]:[selected,standard];
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||disposed)return;
    try{
      const ref=choices.get('referenceRules').select.value;
      const body=choices.get('bodyRules').select.value;
      const config=validateNoteMatchConfig({...original,
        referenceRules:resolveRules('referenceRules',ref,STANDARD_REF),
        bodyRules:resolveRules('bodyRules',body,STANDARD_BODY),
        // Preserve custom rules independently on any unchanged side; a
        // deliberate new selection replaces only that side's recognition.
        customRules:original.customRules.filter(rule=>
          rule.kind==='reference'?ref===PRESERVE:body===PRESERVE),
      });
      busy=true;save.disabled=true;feedback.textContent='正在保存当前书籍格式…';
      await onSave(config);
      if(!disposed)dialog.close();
    }catch(error){feedback.textContent='格式保存失败：'+error.message;}
    finally{busy=false;save.disabled=false;}
  });
  return Object.freeze({
    open(config){
      if(disposed)throw Error('规则编辑器已销毁');
      original=validateNoteMatchConfig(config);
      for(const [key,standard,kind] of [
        ['referenceRules',STANDARD_REF,'reference'],
        ['bodyRules',STANDARD_BODY,'body'],
      ]){
        const {select,show}=choices.get(key);
        const custom=original.customRules.filter(x=>x.kind===kind);
        const selected=currentPreset(original[key],custom,standard);
        select.querySelector(`option[value="${PRESERVE}"]`)?.remove();
        if(selected===PRESERVE)
          select.add(new Option('当前书籍的原有多格式组合（保留不变）',PRESERVE),0);
        select.value=selected;show();
      }
      feedback.textContent='';
      if(!dialog.open)dialog.showModal();
    },
    dispose(){disposed=true;dialog.remove();},
  });
}
