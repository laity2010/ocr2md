/** CM6-only Markdown preview feasibility experiment (NOT production reader).
 *
 * EditorState.doc retains every byte of its input. Main's existing
 * renderMarkdown() supplies trusted, sanitized HTML for CM6 block widgets.
 * CM6 owns scrolling, source positions, gutters and heading fold ranges.
 * This prototype intentionally reports unsupported / unmapped nodes instead
 * of inventing a second DOM-position coordinator.
 */
import {Compartment,RangeSetBuilder,StateEffect,StateField,Text} from '@codemirror/state';
import {Decoration,EditorView,WidgetType,GutterMarker,gutter,lineNumbers} from '@codemirror/view';
import {codeFolding,foldGutter,foldService,foldEffect,unfoldEffect,foldedRanges} from '@codemirror/language';
import {renderMarkdown} from './markdown-preview.js';
import {mainMediaURL} from './translation-review-reading.js';

class MarkdownBlockWidget extends WidgetType {
  constructor(item){super();this.item=item;}
  eq(other){return other.item===this.item;}
  get estimatedHeight(){return this.item.height||50;}
  toDOM(){
    const div=document.createElement('div');
    div.className='ocr-cm-preview-rendered ocr-markdown';
    div.dataset.sourceStart=String(this.item.start);
    div.dataset.blockTag=this.item.tag;
    const html=this.item.element.cloneNode(true);
    for(const img of html.querySelectorAll('img[src]')){
      const target=mainMediaURL(img.getAttribute('src'));
      if(target)img.setAttribute('src',target);
    }
    if(html.matches('img[src]')){
      const target=mainMediaURL(html.getAttribute('src'));
      if(target)html.setAttribute('src',target);
    }
    div.append(html);
    return div;
  }
  ignoreEvent(){return false;}
}

class SentenceIDMarker extends GutterMarker {
  constructor(id){super();this.id=id;}
  eq(other){return this.id===other.id;}
  toDOM(){
    const node=document.createElement('span');
    node.className='ocr-cm-preview-unit-id';
    node.textContent=this.id;
    return node;
  }
}

const togglePreviewEffect=StateEffect.define();

function sourceHeadingRanges(doc){
  const headings=[];
  for(let n=1;n<=doc.lines;n++){
    const line=doc.line(n),match=/^ {0,3}(#{1,6})[ \t]+/.exec(line.text);
    if(match)headings.push({line:n,level:match[1].length,from:line.from,to:line.to});
  }
  return headings.map((heading,i)=>{
    // Preview's "fold to headings" must leave ALL heading levels visible.
    // Non-overlapping native CM6 ranges fold each heading to the next one;
    // a nested H2 should not be swallowed by a folded H1.
    const next=headings[i+1];
    const to=next?doc.line(next.line).from-1:doc.length;
    return {...heading,fold:{from:heading.to,to}};
  });
}

function rangeFor(doc,start,end){
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||
      end<=start||start>doc.lines)return null;
  const last=Math.min(doc.lines,end-1);
  return {from:doc.line(start).from,to:doc.line(last).to};
}

/** Returns a source-positioned CM6 extension and its tiny public controller.
 * The parsing / HTML / KaTeX / Obsidian styles come from Main's renderer.
 */
export function createCMMarkdownPreviewSpike(text,anchors=[]){
  // <template> keeps the Main renderer's images completely inert until CM6
  // actually mounts a viewport widget; a detached <div> can still trigger
  // premature relative /labs/.../media/* network requests in Chromium.
  const sandbox=document.createElement('template');
  sandbox.innerHTML=renderMarkdown(text);
  const content=sandbox.content;
  // This source document is authoritative for CM6; all links are relative
  // to its UTF-16 positions, not an independent Markdown HTML scrollport.
  const doc=Text.of(text.split('\n'));
  const blocks=[],skipped=[];
  let priorEnd=0;
  for(const element of content.children){
    const token=element.hasAttribute('data-source-start')?element:
      element.querySelector('[data-source-start]');
    const start=Number(token?.getAttribute('data-source-start'));
    const end=Number(token?.getAttribute('data-source-end'));
    const range=rangeFor(doc,start,end);
    if(!range||range.from<priorEnd||range.to<=range.from){
      skipped.push({tag:element.tagName,start,end,reason:range?'overlap':'unmapped'});
      continue;
    }
    const item={tag:element.tagName,start,end,range,element};
    blocks.push(item);
    priorEnd=range.to;
  }
  const rendered=Decoration.set(blocks.map(item=>
    Decoration.replace({block:true,widget:new MarkdownBlockWidget(item)}).
      range(item.range.from,item.range.to)),true);
  const headings=sourceHeadingRanges(doc);
  const headingMap=new Map(headings.map(h=>[h.from,h.fold]));
  const markers=new RangeSetBuilder();
  const byLine=new Map();
  for(const anchor of anchors){
    if(Number.isInteger(anchor.line)&&anchor.line>0&&anchor.line<=doc.lines)
      byLine.set(anchor.line,anchor.id);
  }
  for(const [line,id] of [...byLine].sort((a,b)=>a[0]-b[0]))
    markers.add(doc.line(line).from,doc.line(line).from,new SentenceIDMarker(id));
  const markerSet=markers.finish();
  const idCompartment=new Compartment();
  const idGutter=gutter({class:'ocr-cm-preview-ids-gutter',markers:()=>markerSet});
  const previewField=StateField.define({
    create:()=>true,
    update(value,tr){
      for(const effect of tr.effects)if(effect.is(togglePreviewEffect))return effect.value;
      return value;
    },
    provide:field=>EditorView.decorations.compute([field],state=>
      state.field(field)?rendered:Decoration.none),
  });
  const extensions=[
    previewField,lineNumbers(),idCompartment.of([]),
    codeFolding(),foldGutter(),
    foldService.of((_state,lineStart)=>headingMap.get(lineStart)??null),
    EditorView.lineWrapping,
  ];
  const metrics={sourceBytes:text.length,sourceLines:doc.lines,
    renderedBlocks:blocks.length,skippedBlocks:skipped.length,
    htmlNodes:content.children.length,
    mainRenderer:{
      images:content.querySelectorAll('img').length,
      katex:content.querySelectorAll('.katex').length,
      tables:content.querySelectorAll('table').length,
      callouts:content.querySelectorAll('.ocr-callout').length,
      footnoteRefs:content.querySelectorAll('sup.footnote-ref').length,
      footnoteDefinitions:content.querySelectorAll('.footnotes-list li').length,
    },
    skipped,headingRanges:headings.length,sentenceMarkers:byLine.size};
  const controls={
    extensions,metrics,
    setRendered(view,enabled){
      view.dispatch({effects:togglePreviewEffect.of(Boolean(enabled))});
    },
    setSentenceIDs(view,enabled){
      view.dispatch({effects:idCompartment.reconfigure(enabled?[idGutter]:[])});
    },
    foldHeadings(view){
      const effects=headings.filter(h=>h.fold.to>h.fold.from)
        .map(h=>foldEffect.of(h.fold));
      if(effects.length)view.dispatch({effects});
      return effects.length;
    },
    unfoldHeadings(view){
      const effects=[];
      foldedRanges(view.state).between(0,view.state.doc.length,(from,to)=>
        effects.push(unfoldEffect.of({from,to})));
      if(effects.length)view.dispatch({effects});
      return effects.length;
    },
    reveal(view,pos){
      const effects=[];
      foldedRanges(view.state).between(Math.max(0,pos-1),
        Math.min(view.state.doc.length,pos+1),(from,to)=>{
          if(from<=pos&&pos<=to)effects.push(unfoldEffect.of({from,to}));
        });
      view.dispatch({effects,selection:{anchor:pos},
        scrollIntoView:true});
      return effects.length;
    },
  };
  return controls;
}
