import './styles.css';
import {EditorView, basicSetup} from 'codemirror';
import {markdown, markdownLanguage} from '@codemirror/lang-markdown';
import {ensureSyntaxTree} from '@codemirror/language';
import {undo, redo, undoDepth, redoDepth} from '@codemirror/commands';

const $ = (id) => document.getElementById(id);
const buttons = {undo: $('undo'),redo:$('redo'),save:$('save'),extract:$('extract')};
let view;
// Only a save-revision marker, never a second copy of the Markdown document.
let savedRevision = 0;
let revision = 0;

function status(text) { $('status').textContent = text; }
function refreshToolbar() {
  buttons.undo.disabled = !undoDepth(view.state);
  buttons.redo.disabled = !redoDepth(view.state);
  $('count').textContent = view.state.doc.lines.toLocaleString() + ' 行 · ' + view.state.doc.length.toLocaleString() + ' 字符';
  if (revision !== savedRevision) status('● 未保存');
}
function extract() {
  const last = view.state.doc.length;
  const tree = ensureSyntaxTree(view.state,last,2500);
  if (!tree) { $('summary').textContent = '全文尚未解析完成，稍后重试。';return; }
  const count = {headings:0,images:0,tables:0,comments:0,formulas:0};
  tree.iterate({enter(node) {
    const type = node.type.name;
    if (/^ATXHeading\d|^SetextHeading/.test(type)) count.headings++;
    if (type === 'Image') count.images++;
    if (type === 'Table') count.tables++;
    if (type === 'HTMLBlock' || type === 'HTMLComment') count.comments++;
    if (type === 'FencedCode') {
      const code = view.state.doc.sliceString(node.from, Math.min(node.to,node.from+80));
      if (code.startsWith('```math')) count.formulas++;
    }
  }});
  $('summary').textContent = `CM6 全文语法树：标题 ${count.headings} · 图片 ${count.images} · GFM 表格 ${count.tables} · HTML 节点 ${count.comments} · math 代码块 ${count.formulas}`;
  return count;
}
async function save() {
  if (!view) return;
  const snapshot = view.state.doc.toString(); // CM6 is the single source of document text
  const atRevision = revision;
  buttons.save.disabled = true;
  status('正在保存');
  try {
    const res = await fetch('/api/document',{method:'PUT',headers:{'Content-Type':'text/plain; charset=utf-8'},body:snapshot});
    if (!res.ok) throw Error(await res.text());
    savedRevision = atRevision;
    status(revision === atRevision ? '✓ 已保存' : '● 保存期间有新修改');
    // Deliberately no new EditorState, no view.dispatch, no reloading of document.
  } catch (error) {status('保存失败：'+error.message);}
  finally {buttons.save.disabled = false;}
}

async function main() {
  const response = await fetch('/api/document',{cache:'no-store'});
  if (!response.ok) throw Error('文档读取失败 '+response.status);
  const markdownText = await response.text();
  view = new EditorView({
    parent:$('editor'), doc:markdownText,
    extensions:[
      basicSetup,
      markdown({base:markdownLanguage}),
      EditorView.updateListener.of(update=>{
        if (update.docChanged) revision++;
        if (update.docChanged || update.transactions.some(tx=>tx.selection)) refreshToolbar();
      })
    ]
  });
  buttons.undo.addEventListener('click',()=>{undo(view);refreshToolbar();view.focus();});
  buttons.redo.addEventListener('click',()=>{redo(view);refreshToolbar();view.focus();});
  buttons.extract.addEventListener('click',extract);
  buttons.save.addEventListener('click',save);
  window.addEventListener('beforeunload',event=>{
    if (revision !== savedRevision) {event.preventDefault(); event.returnValue='';}
  });
  refreshToolbar();
  status('✓ 已加载');
  // Read-only test seam for verifying *CM6 public APIs*, not an app document cache.
  if (import.meta.env.DEV) window.__v6cm6 = {get view(){return view;},extract};
}
main().catch(error=>{status('加载失败');$('summary').textContent=error.stack||String(error);});
