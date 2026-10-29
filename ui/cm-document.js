/** CMD: one CM6 editor state for Markdown and embedded HTML source.
 * Standard HTML elements, custom elements and HTML comments all use the same
 * readHtml()/writeHtml() transactions; business modules interpret semantics.
 * No separate HTML document or marker-format-specific state is maintained.
 * MinerU conversion is injected, keeping Node-only tools out of the bundle.
 */
import {EditorView} from '@codemirror/view';
import {ensureSyntaxTree,syntaxTree} from '@codemirror/language';
import {unquotePrefix} from './mineru-anchors.js';
import {isolateHistory} from '@codemirror/commands';
import {scanAnnotations,formatAnnotation} from './cmd-annotations.js';
import {scanHtmlElements} from './cmd-html-elements.js';

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

  /** Read the only authoritative Markdown source, without a legacy output mode. */
  getMarkdown(){return this.markdown;}
  /** Stable, read-only CMD boundary for heading and marker consumers. */
  readLine(number){
    if(!Number.isInteger(number)||number<1||number>this.doc.lines)
      throw Error('Invalid document line');
    const line=this.doc.line(number);
    return {number:line.number,text:line.text,from:line.from,to:line.to};
  }
  lineAtOffset(offset){
    if(!Number.isInteger(offset)||offset<0||offset>this.doc.length)
      throw Error('Invalid source offset');
    return this.doc.lineAt(offset).number;
  }
  matchesSnapshot(token){return Boolean(token)&&this.doc.eq(token);}
  requestMeasure(){this.view.requestMeasure();}

  /** Increase/decrease one Markdown blockquote level for every selected line.
   * One CM6 transaction = one undo step; selection maps through the changes.
   * The original MinerU JSON/evidence payload is never eligible for editing.
   */
  adjustQuoteIndent(direction){
    if(direction!==1&&direction!==-1)throw Error('Quote indent direction must be +1 or -1');
    const state=this.view.state,doc=state.doc,lines=new Set();
    for(const range of state.selection.ranges){
      const start=doc.lineAt(range.from).number;
      const end=doc.lineAt(range.empty?range.to:Math.max(range.from,range.to-1)).number;
      for(let n=start;n<=end;n++)lines.add(n);
    }
    // Whole evidence comments, including their payload lines, are read-only;
    // block identity anchors are short independent comments and ARE editable.
    const forbidden=new Set();let inEvidence=false;
    for(let n=1;n<=doc.lines;n++){
      const value=doc.line(n).text;
      if(!inEvidence && /^\s*<!-- minerujson:(?!block:v1:)/.test(value)){
        inEvidence=!value.includes('-->');forbidden.add(n);
      }else if(inEvidence){
        forbidden.add(n);
        if(value.includes('-->'))inEvidence=false;
      }
    }
    if([...lines].some(n=>forbidden.has(n)))
      throw Error('原始 MinerU JSON／PDF 证据注释不能修改引用层级');
    const changes=[];
    for(const n of [...lines].sort((a,b)=>a-b)){
      const line=doc.line(n);
      if(direction===1){changes.push({from:line.from,insert:'>'});continue;}
      if(line.text.startsWith('>'))changes.push({from:line.from,to:line.from+1});
    }
    if(changes.length)this.view.dispatch({changes,userEvent:'input',
      annotations:isolateHistory.of('full')});
    return {changed:changes.length,lines:lines.size};
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

  /** Capture a source insertion location before asynchronous attachment I/O.
   * An immutable CM6 Text snapshot guarantees no intervening edits; moving
   * the caret alone must not redirect the original paste.
   */
  capturePasteTarget(){
    const selection=this.view.state.selection.main;
    return Object.freeze({snapshot:this.doc,from:selection.from,to:selection.to,
      expected:this.doc.sliceString(selection.from,selection.to)});
  }
  pasteAt(target,text){
    if(!target||!this.matchesSnapshot(target.snapshot))
      throw Error('图片上传期间文档已改变，请重新选择位置粘贴');
    if(typeof text!=='string'||!/^!\[[^\]\n]*\]\(media\/[a-f0-9]{24}\.(?:jpg|jpeg|png|gif|webp)\)$/.test(text))
      throw Error('Invalid local image reference');
    this.replaceRanges([{from:target.from,to:target.to,
      expected:target.expected,insert:text}],target.from+text.length);
  }

  /** Business-neutral optimistic text edits. All ranges must still contain the
   * expected source, so an asynchronous download cannot overwrite later edits.
   * One transaction / Undo step; no edits inside immutable MinerU evidence.
   */
  replaceRanges(edits,cursorAfter=null,annotations=[]){
    if(!Array.isArray(edits)||!edits.length)throw Error('No source edits');
    if(!Array.isArray(annotations))throw Error('Invalid CMD annotations');
    const source=this.markdown;
    const sorted=[...edits].sort((a,b)=>a.from-b.from);
    let previousEnd=-1;
    for(const item of sorted){
      if(!Number.isInteger(item.from)||!Number.isInteger(item.to)||
         item.from<0||item.to<item.from||item.to>source.length||
         item.from<previousEnd||typeof item.expected!=='string'||
         typeof item.insert!=='string'||item.insert.includes('\0')||
         source.slice(item.from,item.to)!==item.expected)
        throw Error('Source changed; rescan before replacing');
      previousEnd=item.to;
    }
    // Reserve original JSON + other MinerU provenance comments as evidence.
    const evidence=/<!--\s*minerujson:(?!block:v1:)[\s\S]*?-->/g;
    for(const match of source.matchAll(evidence)){
      const from=match.index,to=from+match[0].length;
      if(sorted.some(edit=>edit.from===edit.to
        ?edit.from>=from&&edit.from<to
        :edit.from<to&&edit.to>from))
        throw Error('Original MinerU evidence is read-only');
    }
    this.view.dispatch({changes:sorted.map(({from,to,insert})=>({from,to,insert})),
      ...(cursorAfter===null?{}:{selection:{anchor:cursorAfter}}),
      userEvent:'input',annotations:[isolateHistory.of('full'),...annotations]});
    return {changed:sorted.length};
  }

  /** Read CMD-owned syntax records from the live CM6 source, with exact
   * source ranges. No nesting, type schema, or Markdown preview semantics.
   * Optional tag/attributes select records without interpreting their values.
   */
  readAnnotations({tag=null,attributes={}}={}){
    if(tag!==null&&typeof tag!=='string')throw Error('Invalid annotation tag filter');
    if(!attributes||typeof attributes!=='object'||Array.isArray(attributes))
      throw Error('Invalid annotation attribute filter');
    const snapshot=this.doc;
    return scanAnnotations(this.markdown)
      .filter(item=>(tag===null||item.tag===tag)&&Object.entries(attributes)
        .every(([key,value])=>item.attributes[key]===String(value)))
      .map(item=>Object.freeze({...item,attributes:Object.freeze(item.attributes),
        line:snapshot.lineAt(item.from).number,snapshot}));
  }
  /** Apply annotations and accompanying generic source edits in ONE undo step.
   * Annotation actions insert/update/remove; 'text' accepts an optimistic
   * from/to/expected/insert edit. CMD never interprets the inserted text.
   * The caller owns Markdown semantics; CMD owns syntax and transactions.
   * Only optional single hard returns and Markdown quote prefixes are allowed
   * around standalone markers. All unrelated text is left byte-for-byte.
   */
  editAnnotations(operations,{expectedSource=null,annotations=[]}={}){
    if(!Array.isArray(operations)||!operations.length)throw Error('No annotation changes');
    const source=this.markdown;
    if(expectedSource!==null&&source!==expectedSource)
      throw Error('Annotation source changed; rescan before editing');
    const edits=[];
    for(const operation of operations){
      if(!operation||!['insert','update','remove','text'].includes(operation.action))
        throw Error('Invalid annotation operation');
      const {action,target,at,tag,attributes={},prefix='',suffix='',spaced=false,removeBefore=false,removeAfter=false}=operation;
      if(action==='text'){
        const {from,to,expected,insert}=operation;
        if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>source.length||
           typeof expected!=='string'||source.slice(from,to)!==expected||typeof insert!=='string')
          throw Error('Invalid annotation companion text edit');
        edits.push({from,to,expected,insert});
        continue;
      }
      if(!['','\n'].includes(suffix)||
        (prefix!==''&&prefix!=='\n'&&!/^(?: {0,3}>[ \t]?)+$/.test(prefix)))
        throw Error('Invalid annotation surrounding syntax');
      if(action==='insert'){
        const markup=formatAnnotation(tag,attributes,{spaced});
        if(!Number.isInteger(at)||at<0||at>source.length)throw Error('Invalid annotation insertion offset');
        edits.push({from:at,to:at,expected:'',insert:prefix+markup+suffix});
      }else{
        if(prefix||suffix)throw Error('Surrounding syntax is only for inserted annotations');
        this._requireAnnotationTarget(target);
        let from=target.from,to=target.to,insert='';
        if(action==='update'){
          if(removeBefore||removeAfter)throw Error('Update cannot remove surrounding text');
          insert=formatAnnotation(tag,attributes,{spaced});
        }else{
          if(removeBefore){
            if(source[from-1]!=='\n')throw Error('Annotation has no preceding newline');
            from--;
          }
          if(removeAfter){
            if(source[to]!=='\n')throw Error('Annotation has no following newline');
            to++;
          }
        }
        edits.push({from,to,expected:source.slice(from,to),insert});
      }
    }
    return this.replaceRanges(edits,null,annotations);
  }
  /** Backward-compatible single-comment interface backed by the batch API. */
  writeAnnotation({tag,attributes={},at=null,target=null,snapshot=null,prefix='',suffix='',spaced=false}={}){
    if(snapshot!==null&&!this.matchesSnapshot(snapshot))throw Error('Annotation source changed');
    const markup=formatAnnotation(tag,attributes,{spaced});
    const action=target===null?'insert':'update';
    this.editAnnotations([{action,at,target,tag,attributes,prefix,suffix,spaced}]);
    const from=target===null?at+prefix.length:target.from;
    return this.readAnnotations().find(item=>item.from===from&&item.raw===markup);
  }
  /** Remove annotation syntax only; never delete its associated element. */
  removeAnnotation(target){
    this.editAnnotations([{action:'remove',target}]);
    return {removed:true};
  }
  _requireAnnotationTarget(target){
    if(!target||!this.matchesSnapshot(target.snapshot)||
       !Number.isInteger(target.from)||!Number.isInteger(target.to)||
       this.markdown.slice(target.from,target.to)!==target.raw||
       !scanAnnotations(target.raw).some(item=>item.from===0&&item.to===target.raw.length))
      throw Error('Annotation source changed; read current annotations again');
  }

  /** Full-document read-only HTML query; source offsets are CM6 coordinates.
   * Includes inline/block tags and comments, never code-fence literals.
   * The list contains only data, no editor state or DOM ownership.
   */
  readHtmlElements(){
    return Object.freeze(scanHtmlElements(this.markdown).map(item=>Object.freeze({
      ...item,line:this.doc.lineAt(item.from).number,
    })));
  }

  /** Insert HTML immediately before a 1-based document line, or replace the
   * content of an existing HTML line. No marker namespace is hard-coded.
   * Changes always go through CM6 transactions (undo/redo compatible).
   */
  writeHtml({html,beforeLine,replaceLine=null,quotePrefix=''}){
    if(quotePrefix && !/^(?: {0,3}>[ \t]?)+$/.test(quotePrefix))
      throw Error('Invalid Markdown quote prefix');
    const markup=quotePrefix+requireMarkup(html),doc=this.doc;
    if(!Number.isInteger(beforeLine)||beforeLine<1||beforeLine>doc.lines)
      throw Error('Invalid target line');
    const target=doc.line(beforeLine);
    if(replaceLine!==null){
      if(!Number.isInteger(replaceLine)||replaceLine<1||replaceLine>=beforeLine)
        throw Error('Invalid HTML replacement line');
      const old=doc.line(replaceLine);
      if(!unquotePrefix(old.text).trim().startsWith('<'))
        throw Error('Refusing to replace a non-HTML line');
      this.view.dispatch({changes:{from:old.from,to:old.to,insert:markup},userEvent:'input'});
      return {line:replaceLine,sourceLine:beforeLine};
    }
    const prefix=markup+'\n';
    this.view.dispatch({changes:{from:target.from,to:target.from,insert:prefix},userEvent:'input'});
    return {line:beforeLine,sourceLine:beforeLine+prefix.split('\n').length-1};
  }
  /** Convenience for callers constructing comments; delegates to writeHtml. */
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
    if(!unquotePrefix(line.text).trim().startsWith('<'))return null;
    const tree=ensureSyntaxTree(this.view.state,line.to,500)||syntaxTree(this.view.state);
    const nodes=[];
    tree.iterate({from:line.from,to:line.to,
      enter(node){if(!nodes.includes(node.name))nodes.push(node.name);}});
    return {html:line.text,from:line.from,to:line.to,line:line.number,syntax:nodes};
  }
  destroy(){this.view.destroy();}
}
