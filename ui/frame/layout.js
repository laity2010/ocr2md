/** Lab-Sentence: one source pane and three independent read-only CM6 panes. */
import {createDockview,themeAbyss} from 'dockview';
import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {basicSetup} from 'codemirror';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {nativeIOSBasicSetup,isIOSWebKit} from '../ios-native-selection.js';
import {obsidianMarkdown} from '../obsidian-markdown.js';
import {obsidianSourceSyntax} from '../obsidian-source-syntax.js';
import {obsidianHeadingMarkers} from '../obsidian-heading-markers.js';
import 'dockview/dist/styles/dockview.css';
import '../workspace.css';
import '../outline-grid.css';
import '../settings-module.css';
import '../sentence/layout.css';
const names={source:'原文',intl:'Intl',splitter:'Sentence Splitter',wink:'Wink NLP'};
function pane(name,onModuleChange){
  const element=document.createElement('div');
  element.className='ocr-source-pane ocr-source-file-source sentence-pane';
  element.dataset.sentencePane=name;
  const bar=document.createElement('div');bar.className='ocr-source-file-toolbar';
  if(name==='source'){
    const select=document.createElement('select');select.className='ocr-source-file-select';
    select.setAttribute('aria-label','源码文件导航');
    for(const [label,text,value] of [['SQL','逻辑表 · logical_block','frame'],['全局设置','settings.json','settings']]){
      const group=document.createElement('optgroup');group.label=label;group.append(new Option(text,value));select.append(group);
    }
    select.value='frame';select.addEventListener('change',()=>{if(select.value==='settings')onModuleChange('settings');});
    const actions=document.createElement('div');actions.className='ocr-source-undo-redo';
    for(const [id,text,label] of [['undo','↶','撤销'],['redo','↷','重做']]){
      const b=document.createElement('button');b.type='button';b.id=id;b.textContent=text;b.title='只读源码';b.disabled=true;b.setAttribute('aria-label',label);actions.append(b);
    }
    bar.append(select,actions);
  }else{
    const title=document.createElement('span');title.className='sentence-engine-label';title.textContent=names[name];bar.append(title);
  }
  const host=document.createElement('div');const ios=isIOSWebKit();
  host.className='ocr-cm-source frame-editor v2-source-session'+(ios?' ocr-ios-native-selection':'');
  host.id=name==='source'?'editor':'sentence-editor-'+name;
  element.append(bar,host);
  let view;
  const extensions=[
      ios?nativeIOSBasicSetup:basicSetup,
      EditorState.lineSeparator.of('\n'),EditorState.readOnly.of(true),EditorView.editable.of(false),
      EditorState.transactionFilter.of(tr=>tr.docChanged?[]:tr),
      EditorView.contentAttributes.of({tabindex:'0',spellcheck:'false','aria-label':names[name]+' · 只读源码'}),
      EditorView.lineWrapping,markdown({base:markdownLanguage}),obsidianMarkdown,
      syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),obsidianSourceSyntax,obsidianHeadingMarkers
    ];
  const stateFor=doc=>EditorState.create({doc,extensions});
  return {element,init(){view=new EditorView({parent:host,state:stateFor('')});},
    setMarkdown(text){
      if(view.state.doc.toString()===text)return;
      const state=stateFor(text);
      if(state.doc.toString()!==text)throw Error('Markdown changed during CM6 import');
      view.setState(state);
    },layout(){view?.requestMeasure();},dispose(){view?.destroy();}};
}
export function createFrameWorkspace(container,{onModuleChange=()=>{}}={}){
  let sourcePane;
  const dockview=createDockview(container,{theme:themeAbyss,createComponent:({name})=>{
    const component=pane(name,onModuleChange);
    if(name==='source')sourcePane=component;
    return component;
  }});
  function add(name,position){
    const p=dockview.addPanel({id:name,component:name,title:names[name],...(position?{position}:{})});
    p.group.header.hidden=true;p.group.relayout();return p;
  }
  const source=add('source');
  const intl=add('intl',{referencePanel:source,direction:'right'});
  const splitter=add('splitter',{referencePanel:intl,direction:'below'});
  const wink=add('wink',{referencePanel:splitter,direction:'below'});
  let sized=false;
  return Object.freeze({setSourceMarkdown(text){sourcePane.setMarkdown(text);},activate(){
    const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
    dockview.layout(w,h);
    if(!sized){
      source.api.setSize({width:Math.round(w*.4)});
      wink.api.setSize({height:Math.round(h/3)});
      intl.api.setSize({height:Math.round(h/3)});
      sized=true;
    }
  },dispose(){dockview.dispose();}});
}
