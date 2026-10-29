/** CM6 read-only source decorations. Markdown/HTML uses the existing Lezer
 * parser and Obsidian CSS; LaTeX uses CodeMirror's official sTeX lexer and
 * One Dark token theme within already-recognized formula ranges. Visible
 * neighborhoods only: no new Markdown state, writer or business API.
 */
import {Decoration,ViewPlugin} from '@codemirror/view';
import {markdownLanguage} from '@codemirror/lang-markdown';
import {StreamLanguage} from '@codemirror/language';
import {htmlLanguage} from '@codemirror/lang-html';
import {stexMath} from '@codemirror/legacy-modes/mode/stex';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {highlightTree} from '@lezer/highlight';
import {findLatex} from './latex-scan.js';

const classMark=name=>Decoration.mark({class:'cm-ob-syntax-'+name});
const htmlKinds=Object.freeze({
  StartTag:'html-punct',StartCloseTag:'html-punct',EndTag:'html-punct',
  TagName:'html-tag',AttributeName:'html-attr',
  AttributeValue:'html-value',Is:'html-punct',SelfCloseEndTag:'html-punct',
});
// Official CodeMirror sTeX math mode provides tokens. The CMD scanner only
// selects LaTeX source spans; no independent handwritten TeX lexer remains.
const stexParser=StreamLanguage.define(stexMath).parser;

function append(marks,decoration,from,to,visible){
  if(from>=to)return;
  for(const range of visible){
    const start=Math.max(from,range.from),end=Math.min(to,range.to);
    if(start<end)marks.push(decoration.range(start,end));
  }
}
function htmlMarks(view,visible,marks){
  const doc=view.state.doc;
  // CM6 may initialize the viewport before its background Markdown parse
  // reaches these tags. Synchronously parse only the visible neighborhood,
  // never the entire document (or invent an HTML lexer).
  const from=lineBegin(doc,Math.max(0,visible[0].from-4096));
  const to=Math.min(doc.length,visible.at(-1).to+4096);
  const tree=markdownLanguage.parser.parse(doc.sliceString(from,to));
  tree.iterate({enter(node){
      const absoluteFrom=from+node.from,absoluteTo=from+node.to;
      if(!visible.some(range=>range.from<absoluteTo&&absoluteFrom<range.to))
        return false;
      if(node.name==='HTMLTag'||node.name==='HTMLBlock'){
        if(node.to-node.from>40000)return false;
        const snippet=doc.sliceString(absoluteFrom,absoluteTo);
        // HTML is parsed by Lezer, not by an ad-hoc tag regex.
        htmlLanguage.parser.parse(snippet).iterate({enter(part){
          const type=htmlKinds[part.name];
          if(type)append(marks,classMark(type),
            absoluteFrom+part.from,absoluteFrom+part.to,visible);
        }});
        return false;
      }
      if(node.name==='CommentBlock'){
        // Existing CMD evidence stays immutable and folded as before.
        // Avoid high-cost giant spans for embedded provenance payloads.
        if(node.to-node.from<=512)append(marks,classMark('html-comment'),
          absoluteFrom,absoluteTo,visible);
        return false;
      }
  }});
}
function lineBegin(doc,offset){
  return doc.lineAt(Math.max(0,Math.min(offset,doc.length))).from;
}
function mathMarks(view,visible,marks){
  const doc=view.state.doc;
  // A bounded margin catches multiline formulas while keeping keystrokes
  // near-constant-time even in 300 KB+ books.
  const from=lineBegin(doc,Math.max(0,visible[0].from-4096));
  const to=Math.min(doc.length,visible.at(-1).to+4096);
  const source=doc.sliceString(from,to);
  const formulas=findLatex(source);
  const markdownTree=markdownLanguage.parser.parse(source);
  for(const formula of formulas){
    if(formula.syntax==='未定界')continue; // Unconfirmed OCR is still prose.
    const a=from+formula.from,b=from+formula.to;
    if(!visible.some(range=>range.from<b&&range.to>a))continue;
    let parent=markdownTree.resolveInner(formula.from,1);
    let excluded=false;
    for(;parent;parent=parent.parent){
      if(['HTMLTag','HTMLBlock','CommentBlock'].includes(parent.name)){
        excluded=true;break;
      }
      // Explicit math code fences are legitimate TeX, other code is not.
      if(parent.name==='FencedCode'&&!formula.syntax.startsWith('```')){
        excluded=true;break;
      }
    }
    if(excluded)continue;
    let bodyFrom=a,bodyTo=b;
    if(formula.syntax==='$$'){
      append(marks,classMark('math-fence'),a,a+2,visible);
      append(marks,classMark('math-fence'),b-2,b,visible);
      bodyFrom=a+2;bodyTo=b-2;
    }else if(formula.syntax==='$'||formula.syntax==='\\('||formula.syntax==='\\['){
      const n=formula.syntax.length;
      append(marks,classMark('math-fence'),a,a+n,visible);
      append(marks,classMark('math-fence'),b-n,b,visible);
      bodyFrom=a+n;bodyTo=b-n;
    }else if(formula.syntax.startsWith('```')){
      const beginning=doc.lineAt(a);
      const ending=doc.lineAt(Math.max(a,b-1));
      append(marks,classMark('math-fence'),beginning.from,beginning.to,visible);
      if(ending.from>beginning.from)
        append(marks,classMark('math-fence'),ending.from,ending.to,visible);
      bodyFrom=Math.min(b,beginning.to+1);
      bodyTo=Math.max(bodyFrom,ending.from-1);
    }
    if(bodyTo<=bodyFrom)continue;
    // Official sTeX parser AND official One Dark semantic style: neither
    // token boundaries nor token colors are hand-maintained by OCR2MD.
    // Only non-token whitespace/text gets a subdued math-body mark.
    const body=doc.sliceString(bodyFrom,bodyTo);
    const tokens=[];
    highlightTree(stexParser.parse(body),[oneDarkHighlightStyle],(start,end,style)=>{
      if(start<end&&style)tokens.push({from:start,to:end,style});
    });
    let last=0;
    for(const token of tokens){
      if(token.from<last)continue;
      if(token.from>last)append(marks,classMark('math-body'),
        bodyFrom+last,bodyFrom+token.from,visible);
      append(marks,Decoration.mark({class:token.style}),
        bodyFrom+token.from,bodyFrom+token.to,visible);
      last=token.to;
    }
    if(last<body.length)
      append(marks,classMark('math-body'),bodyFrom+last,bodyTo,visible);
  }
}
export const obsidianSourceSyntax=ViewPlugin.fromClass(class {
  constructor(view){this.decorations=this.scan(view);}
  update(update){
    if(update.docChanged||update.viewportChanged)
      this.decorations=this.scan(update.view);
  }
  scan(view){
    const visible=view.visibleRanges;
    if(!visible.length)return Decoration.none;
    const marks=[];
    // Folded provenance/comments can make visibleRanges non-contiguous.
    // Never stretch a scan from the first visible range across a hidden
    // multi-hundred-KB source block to the last visible range.
    for(const range of visible){
      htmlMarks(view,[range],marks);
      mathMarks(view,[range],marks);
    }
    return Decoration.set(marks,true);
  }
},{decorations:plugin=>plugin.decorations});
