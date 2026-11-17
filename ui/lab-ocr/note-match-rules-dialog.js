/** WP2 book-rule editor; framework owns AG toolbar, module owns its one dialog.
 * No localStorage, SQL or network API; caller performs guarded book CAS save.
 */
import {NOTE_REFERENCE_RULES,NOTE_BODY_RULES,
  validateNoteMatchConfig} from './note-match-index.js';

export function createNoteMatchRulesDialog({onSave}={}){
  if(typeof onSave!=='function')throw Error('缺少注释规则保存回调');
  const dialog=document.createElement('dialog');
  dialog.className='ocr-note-match-rules-dialog';
  dialog.setAttribute('aria-label','当前书籍 · 注释识别规则');
  const heading=document.createElement('h2');heading.textContent='当前书籍 · 注释匹配规则';
  const intro=document.createElement('p');intro.textContent=
    '规则只改变注引/注文候选识别；按书籍保存，不修改 Markdown。方括号、括号和符号可能是普通正文，默认不会自动认定配对。';
  const form=document.createElement('form');form.method='dialog';
  const noteRules=[['referenceRules','注引格式',NOTE_REFERENCE_RULES],
    ['bodyRules','注文格式',NOTE_BODY_RULES]];
  const groups=new Map();
  for(const [name,label,values] of noteRules){
    const fieldset=document.createElement('fieldset');fieldset.className='ocr-note-rule-set';
    const legend=document.createElement('legend');legend.textContent=label;fieldset.append(legend);
    const checks=[];
    for(const id of values){
      const item=document.createElement('label');
      const input=document.createElement('input');input.type='checkbox';input.value=id;
      item.append(input,document.createTextNode(id));fieldset.append(item);checks.push(input);
    }
    groups.set(name,checks);form.append(fieldset);
  }
  const choices=document.createElement('div');choices.className='ocr-note-rule-choices';
  const createSelect=(label,values)=>{
    const wrap=document.createElement('label');wrap.textContent=label;
    const select=document.createElement('select');
    for(const [value,text] of values)select.add(new Option(text,value));
    wrap.append(select);choices.append(wrap);return select;
  };
  const scope=createSelect('编号范围',[["book","全书"],["chapter","按章节"]]);
  const chapter=createSelect('章节级别',Array.from({length:6},(_,i)=>[String(i+1),'H'+(i+1)]));
  const continuation=createSelect('注文多行范围',[
    ['same-block','仅同一 Block'],['notes-section','明确 Notes 区内可跨 Block']]);
  const weak=document.createElement('label');weak.className='ocr-note-rule-weak';
  const weakInput=document.createElement('input');weakInput.type='checkbox';
  weak.append(weakInput,document.createTextNode('允许弱格式唯一候选自动标为已匹配（只读）'));
  choices.append(weak);form.append(choices);
  const advanced=document.createElement('details');
  const summary=document.createElement('summary');summary.textContent='书籍专用正则 · 高级';
  advanced.append(summary);
  const advancedHelp=document.createElement('p');advancedHelp.textContent=
    'JSON 数组，每项含 id（book.ref.* 或 book.body.*）、kind、pattern、strength。表达式包含 (?<id>...)，注文还须 (?<content>...) 并以 ^ 开头。';
  const custom=document.createElement('textarea');custom.rows=5;
  custom.setAttribute('aria-label','书籍自定义规则 JSON');custom.spellcheck=false;
  advanced.append(advancedHelp,custom);form.append(advanced);
  const feedback=document.createElement('p');feedback.className='ocr-note-rule-feedback';
  feedback.setAttribute('role','status');form.append(feedback);
  const actions=document.createElement('div');actions.className='ocr-note-rule-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
  const save=document.createElement('button');save.type='submit';save.textContent='应用并保存规则';
  actions.append(cancel,save);form.append(actions);
  dialog.append(heading,intro,form);document.body.append(dialog);
  cancel.addEventListener('click',()=>dialog.close());
  let disposed=false,busy=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||disposed)return;
    try{
      const config=validateNoteMatchConfig({
        referenceRules:groups.get('referenceRules').filter(n=>n.checked).map(n=>n.value),
        bodyRules:groups.get('bodyRules').filter(n=>n.checked).map(n=>n.value),
        scope:scope.value,chapterLevel:Number(chapter.value),
        continuation:continuation.value,weakAutoMatch:weakInput.checked,
        customRules:JSON.parse(custom.value),
      });
      busy=true;save.disabled=true;feedback.textContent='正在保存当前书籍规则…';
      await onSave(config);
      if(!disposed)dialog.close();
    }catch(error){feedback.textContent='规则保存失败：'+error.message;}
    finally{busy=false;save.disabled=false;}
  });
  return Object.freeze({
    open(config){
      if(disposed)throw Error('规则编辑器已销毁');
      const value=validateNoteMatchConfig(config);
      for(const [name,checks] of groups)for(const input of checks)
        input.checked=value[name].includes(input.value);
      scope.value=value.scope;chapter.value=String(value.chapterLevel);
      continuation.value=value.continuation;weakInput.checked=value.weakAutoMatch;
      custom.value=JSON.stringify(value.customRules,null,2);
      feedback.textContent='';
      if(!dialog.open)dialog.showModal();
    },
    dispose(){disposed=true;dialog.remove();},
  });
}
