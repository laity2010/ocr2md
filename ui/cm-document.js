/** Lab-only thin CM6 document facade.
 * CM6 EditorState is the only editable Markdown; this class holds no copy.
 * MinerU conversion is injected, so the Node-only existing converter stays
 * outside the browser bundle. Business plugins own their HTML semantics.
 */
import {EditorView} from '@codemirror/view';
import {ensureSyntaxTree,syntaxTree} from '@codemirror/language';

function requireMarkup(html){
  if(typeof html!=='string'||!html.trim().startsWith('<'))
    throw Error('Expected an HTML fragment or HTML comment');
  // Only HTML may be passed here: reject obviously unclosed declarations.
  if(html.includes('\0'))throw Error('Invalid HTML NUL character');
  return html.trim();
}

export class CMDocument {
  constructor({view, parent, markdown='', extensions=[], convertMineruJson}={}){
    if(view){
      if(!(view instanceof EditorView))throw Error('Expected an EditorView');
      this.view=view;
    }else{
      if(!parent)throw Error('CMDocument requires a parent or EditorView');
      this.view=new EditorView({parent,doc:markdown,extensions});
    }
    this.convertMineruJson=convertMineruJson;
  }
  get markdown(){return this.view.state.doc.toString();}
  get doc(){return this.view.state.doc;}

  /** Read-only Markdown projection. Raw CM6 document is always authoritative.
   * Optional MinerU end-marker filtering is strictly output-only: no dispatch,
   * editor state changes, undo history edits, or filesystem writes.
   */
  static withoutMineruEnds(markdown){
    if(typeof markdown!=='string')throw Error('Markdown must be a string');
    // Strict complete-line filter, shared by CMD's read-only projection and
    // the SHA-guarded one-time disk migration. Never touches editor state.
    return markdown.replace(/^<!-- minerujson:end:v1:\d+:\d+ -->[ \t]*(?:\r?\n(?:\r?\n)?|$)/gm,'');
  }
  getMarkdown({omitMineruEnd=false}={}){
    const source=this.markdown;
    return omitMineruEnd ? CMDocument.withoutMineruEnds(source) : source;
  }

  loadMarkdown(markdown){
    if(typeof markdown!=='string')throw Error('Markdown must be a string');
    const doc=this.doc;
    this.view.dispatch({changes:{from:0,to:doc.length,insert:markdown},
      selection:{anchor:0},userEvent:'input'});
    return this.doc;
  }
  async loadMineruJson(input){
    if(typeof this.convertMineruJson!=='function')
      throw Error('MinerU converter adapter is not configured');
    // Convert first: a failure must leave the CM6 document unchanged.
    const markdown=await this.convertMineruJson(input);
    if(typeof markdown!=='string'||!markdown.startsWith('<!-- minerujson:block:v1:'))
      throw Error('MinerU converter returned an invalid Markdown document');
    this.loadMarkdown(markdown);
    return this.doc;
  }

  /** Insert HTML immediately before a 1-based document line, or replace the
   * content of an existing HTML line. No marker namespace is hard-coded.
   * Changes always go through CM6 transactions (undo/redo compatible).
   */
  writeHtml({html,beforeLine,replaceLine=null}){
    const markup=requireMarkup(html),doc=this.doc;
    if(!Number.isInteger(beforeLine)||beforeLine<1||beforeLine>doc.lines)
      throw Error('Invalid target line');
    const target=doc.line(beforeLine);
    if(replaceLine!==null){
      if(!Number.isInteger(replaceLine)||replaceLine<1||replaceLine>=beforeLine)
        throw Error('Invalid HTML replacement line');
      const old=doc.line(replaceLine);
      if(!old.text.trim().startsWith('<'))
        throw Error('Refusing to replace a non-HTML line');
      this.view.dispatch({changes:{from:old.from,to:old.to,insert:markup},userEvent:'input'});
      return {line:replaceLine,sourceLine:beforeLine};
    }
    const prefix=markup+'\n';
    this.view.dispatch({changes:{from:target.from,to:target.from,insert:prefix},userEvent:'input'});
    return {line:beforeLine,sourceLine:beforeLine+prefix.split('\n').length-1};
  }
  /** HTML comments are the default control annotation. */
  writeComment({text,...location}){
    if(typeof text!=='string'||!text.trim()||text.includes('--')||text.includes('-->'))
      throw Error('Invalid HTML comment content');
    return this.writeHtml({html:`<!-- ${text.trim()} -->`,...location});
  }
  /** Read the exact CM6 source and its actual Lezer syntax; no local HTML
   * shadow storage or business-specific parsing is created.
   */
  readHtml(lineNumber){
    if(!Number.isInteger(lineNumber)||lineNumber<1||lineNumber>this.doc.lines)
      throw Error('Invalid HTML line');
    const line=this.doc.line(lineNumber);
    if(!line.text.trim().startsWith('<'))return null;
    const tree=ensureSyntaxTree(this.view.state,line.to,500)||syntaxTree(this.view.state);
    const nodes=[];
    tree.iterate({from:line.from,to:line.to,
      enter(node){if(!nodes.includes(node.name))nodes.push(node.name);}});
    return {html:line.text,from:line.from,to:line.to,line:line.number,syntax:nodes};
  }
  destroy(){this.view.destroy();}
}
