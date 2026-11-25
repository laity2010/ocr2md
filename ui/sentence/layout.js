/** Lab-Sentence F01 adapter: one full-height source and three stacked CM6 readers.
 * Frame Settings, status, Tom Select and workspace authorization are unchanged.
 */
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
import './layout.css';

const labels=Object.freeze({source:'原文',intl:'Intl',splitter:'Sentence Splitter',wink:'Wink NLP'});
export function createFrameWorkspace(container,{onStatus=()=>{},onModuleChange=()=>{}}={}){
  const editors=new Map();
  const native=isIOSWebKit();
  function pane(name){
    const element=document.createElement('div');
    element.className='ocr-source-pane ocr-source-file-source sentence-pane';
    element.dataset.sentencePane=name;
    const bar=document.createElement('div');
    bar.className='ocr-source-file-toolbar';
    if(name==='source'){
      const nav=document.createElement('select');nav.className='ocr-source-file-select';
      nav.setAttribute('aria-label','源码文件导航');
      const work=document.createElement('optgroup');work.label='工作台';
      work.append(new Option('分句工作台','frame'));
      const settings=document.createElement('optgroup');settings.label='全局设置';
      settings.append(new Option('settings.json','settings'));
      nav.append(work,settings);nav.value='frame';
      nav.addEventListener('change',()=>{if(nav.value==='settings')onModuleChange('settings');});
      const actions=document.createElement('div');actions.className='ocr-source-undo-redo';
      for(const [id,text,label] of [['undo','↶','撤销'],['redo','↷','重做']]){
        const button=document.createElement('button');button.type='button';button.id=id;
        button.textContent=text;button.setAttribute('aria-label',label);button.title='只读源码';button.disabled=true;
        actions.append(button);
      }
      bar.append(nav,actions);
    }else{
      const title=document.createElement('span');title.className='sentence-engine-label';
      title.textContent=labels[name];bar.append(title);
    }
    const host=document.createElement('div');
    host.className='ocr-cm-source frame-editor v2-source-session'+(native?' ocr-ios-native-selection':'');
    host.id=name==='source'?'editor':'sentence-editor-'+name;
    host.dataset.sentenceEditor=name;
    element.append(bar,host);
    let editor=null;
    return {element,init(){
      editor=new EditorView({parent:host,state:EditorState.create({doc:'',extensions:[
        ...(native?nativeIOSBasicSetup:[basicSetup]),
        EditorState.readOnly.of(true),EditorView.editable.of(false),
        EditorState.transactionFilter.of(tr=>tr.docChanged?[]:tr),
        EditorView.contentAttributes.of({tabindex:'0',spellcheck:'false','aria-label':labels[name]+' · 只读源码'}),
        EditorView.lineWrapping,markdown({base:markdownLanguage}),obsidianMarkdown,
        syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),obsidianSourceSyntax,obsidianHeadingMarkers
      ]})});
      editors.set(name,editor);
    },layout(){editor?.requestMeasure();},dispose(){editors.delete(name);editor?.destroy();}};
  }
  const dockview=createDockview(container,{theme:themeAbyss,createComponent:({name})=>pane(name)});
  function add(name,position){
    const panel=dockview.addPanel({id:name,component:name,title:labels[name],...(position?{position}:{})});
    panel.group.header.hidden=true;panel.group.relayout();return panel;
  }
  const source=add('source');
  const intl=add('intl',{referencePanel:source,direction:'right'});
  const splitter=add('splitter',{referencePanel:intl,direction:'below'});
  const wink=add('wink',{referencePanel:splitter,direction:'below'});
  let sized=false;
  const activate=()=>{
    const w=container.clientWidth,h=container.clientHeight;
    if(!w||!h)return;
    dockview.layout(w,h);
    if(!sized){
      source.api.setSize({width:Math.round(w*.4)});
      intl.api.setSize({height:Math.round(h/3)});
      splitter.api.setSize({height:Math.round(h/3)});
      sized=true;
    }
  };
  return Object.freeze({activate,dispose:()=>dockview.dispose()});
}
