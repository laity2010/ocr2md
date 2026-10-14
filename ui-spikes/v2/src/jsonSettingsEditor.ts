/** Shared source editor shell for tabular settings consumers (v2/v3).
 * v2 TablePresentationEditor keeps its own project-specific persistence/validation.
 * This editor is intentionally generic; caller owns schema and save authority.
 */
import { defaultKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
import { hardReturnField } from "./workingEditor";
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
import {jsonKeyAtOffset,jsonTopLevelAnchors} from "./jsonTopLevelAnchors";

const linkedAnchorEffect=StateEffect.define<{from:number;to:number}|null>();
const linkedAnchorField=StateField.define<DecorationSet>({
  create:()=>Decoration.none,
  update(decorations,transaction){
    let next=decorations.map(transaction.changes);
    for(const effect of transaction.effects){
      if(effect.is(linkedAnchorEffect)){
        const span=effect.value;
        next=span&&span.to<=transaction.state.doc.length
          ?Decoration.set([
            Decoration.line({class:"cm-ag-source-linked-line"}).range(
              transaction.state.doc.lineAt(span.from).from),
            Decoration.mark({class:"cm-ag-source-linked-key"}).range(span.from,span.to),
          ],true):Decoration.none;
      }
    }
    return next;
  },
  provide:field=>EditorView.decorations.from(field),
});

export class JsonSettingsEditor {
  private readonly view: EditorView;
  private readonly hardReturnCompartment=new Compartment();
  private readonly linkedListeners=new Set<(key:string|null)=>void>();
  private currentLinked:string|null=null;
  constructor(host: HTMLElement, initialSource: string, private readonly onChange: (source: string) => void) {
    this.view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialSource,
        extensions: [
          lineNumbers(), json(), EditorView.lineWrapping,
          this.hardReturnCompartment.of([]),linkedAnchorField,
          keymap.of(defaultKeymap),
          EditorView.updateListener.of(update => {
            if(update.docChanged)this.onChange(update.state.doc.toString());
            if((update.selectionSet||update.docChanged)&&this.linkedListeners.size){
              const key=jsonKeyAtOffset(update.state.doc.toString(),update.state.selection.main.head);
              if(key!==this.currentLinked){
                this.currentLinked=key;
                for(const callback of this.linkedListeners)callback(key);
              }
              this.highlightKey(key);
            }
          }),
        ],
      }),
    });
  }
  setShowHardReturns(show:boolean):void{
    this.view.dispatch({effects:this.hardReturnCompartment.reconfigure(show?hardReturnField:[])});
  }
  setHardReturnColor(color:string):void{
    this.view.dom.style.setProperty("--ocr2md-hard-return-color",color);
  }
  /** Text->AG active row: invoked on cursor movement, selection or editing.
   * The caller decides whether a source-centric workflow wants to subscribe. */
  onActiveKeyChanged(callback:(key:string|null)=>void):()=>void{
    this.linkedListeners.add(callback);
    return ()=>this.linkedListeners.delete(callback);
  }
  highlightKey(key:string|null):void{
    const span=key===null?undefined:jsonTopLevelAnchors(this.source()).find(a=>a.key===key);
    this.view.dispatch({effects:linkedAnchorEffect.of(span?{from:span.from,to:span.to}:null)});
    if(span)this.view.dom.dataset.agSourceLinkedKey=span.key;
    else delete this.view.dom.dataset.agSourceLinkedKey;
  }
  source(): string { return this.view.state.doc.toString(); }
  setSource(text: string): void {
    this.view.dispatch({changes:{from:0,to:this.view.state.doc.length,insert:text}});
  }
  revealKey(key:string):void{
    const span=jsonTopLevelAnchors(this.source()).find(a=>a.key===key);
    if(!span)return;
    this.highlightKey(key);
    this.view.dispatch({selection:{anchor:span.from,head:span.to},scrollIntoView:true});
    this.view.focus();
  }
  refresh(): void { this.view.requestMeasure(); }
  destroy(): void { this.view.destroy(); }
}
