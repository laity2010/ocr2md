/** Permanent AG + source composition used across all V3 workflows.
 * The pair owns common presentation and grid->source focus policy, not any
 * domain document or persistence authority. A scene can change without
 * destroying either AG Grid or CodeMirror (critical for iOS caret stability).
 */
import type {DirectorySettings,AgSourceScene,AgSourceStyle} from "./settings";

export interface SourcePresentation {
  setShowHardReturns(show:boolean):void;
  setHardReturnColor(color:string):void;
}
export type PairActivation = "inspect"|"source";
export type PairActivation = "inspect"|"source";
/** Optional for each business scene, mandatory as a capability of every pair.
 * Adapters use domain row IDs and source anchors, not DOM scraping.
 * Keeping it in the pair prevents every scene inventing its own feedback loop.
 */
export interface AgSourceGridAnchor {
  highlightKey(key:string|null,reveal?:boolean):void;
}
export interface AgSourceTextAnchor {
  revealKey(key:string):void;
  highlightKey(key:string|null):void;
  onActiveKeyChanged(callback:(key:string|null)=>void):()=>void;
}


export class AgSourcePair {
  readonly layout:HTMLElement;
  readonly gridHost:HTMLElement;
  readonly sourceHost:HTMLElement;
  readonly availableScenes:readonly AgSourceScene[];
  private scene:AgSourceScene;
  private presentation?:DirectorySettings;
  private focusSerial=0;
  private linkedKey:string|null=null;
  private linking=false;
  private linkedEnabled=true;
  private disposeSourceSelection?:()=>void;
  private linkedGrid?:AgSourceGridAnchor;
  private linkedSource?:AgSourceTextAnchor;

  constructor(layout:HTMLElement,gridHost:HTMLElement,sourceHost:HTMLElement,
    scenes:readonly AgSourceScene[],private readonly editor?:SourcePresentation){
    if(!scenes.length)throw Error("AG/source pair needs a scene");
    if(!layout.contains(gridHost)||!layout.contains(sourceHost))
      throw Error("AG/source hosts must belong to one composition");
    this.layout=layout;this.gridHost=gridHost;this.sourceHost=sourceHost;
    this.scene=scenes[0];this.availableScenes=scenes;
    layout.classList.add("v3-ag-source-pair");
    gridHost.classList.add("v3-ag-source-grid");
    sourceHost.classList.add("v3-ag-source-editor");
    layout.dataset.agSourceScenes=scenes.join(",");
    this.setScene(this.scene);
  }

  setScene(scene:AgSourceScene):void{
    if(!this.availableScenes.includes(scene))throw Error("Unregistered AG/source scene: "+scene);
    this.scene=scene;
    this.layout.dataset.agSourceScene=scene;
    this.gridHost.dataset.agSourceScene=scene;
    for(const host of this.layout.querySelectorAll<HTMLElement>(".v3-ag-source-editor"))
      host.dataset.agSourceScene=scene;
    if(this.presentation)this.apply(this.presentation);
  }

  bindSourceHost(host:HTMLElement):void{
    if(!this.layout.contains(host))throw Error("Additional source host must belong to the pair");
    host.classList.add("v3-ag-source-editor");
    host.dataset.agSourceScene=this.scene;
  }
  get activeScene():AgSourceScene{return this.scene;}

  /** The standard capability always exists; scenes may opt out explicitly. */
  setLinkEnabled(enabled:boolean):void{
    if(this.linkedEnabled===enabled)return;
    this.linkedEnabled=enabled;
    this.layout.dataset.agSourceLinked=String(enabled);
    if(!enabled){
      this.disposeSourceSelection?.();
      this.disposeSourceSelection=undefined;
      this.linkedKey=null;
      this.linkedGrid?.highlightKey(null);
      this.linkedSource?.highlightKey(null);
    }else if(this.linkedGrid&&this.linkedSource){
      this.subscribeSelection(this.linkedGrid,this.linkedSource);
    }
  }

  /** Connect once; enabled state is scene-controlled and never removes API. */
  bindSelection(grid:AgSourceGridAnchor,source:AgSourceTextAnchor):()=>void{
    this.disposeSourceSelection?.();
    this.linkedGrid=grid;this.linkedSource=source;
    this.layout.dataset.agSourceLinkAvailable="true";
    this.layout.dataset.agSourceLinked=String(this.linkedEnabled);
    if(this.linkedEnabled)this.subscribeSelection(grid,source);
    return ()=>{
      this.disposeSourceSelection?.();this.disposeSourceSelection=undefined;
      this.linkedGrid=undefined;this.linkedSource=undefined;
      this.layout.dataset.agSourceLinkAvailable="false";
      this.linkedKey=null;
      grid.highlightKey(null);source.highlightKey(null);
    };
  }

  private subscribeSelection(grid:AgSourceGridAnchor,source:AgSourceTextAnchor):void{
    this.disposeSourceSelection=source.onActiveKeyChanged(key=>{
      if(!this.linkedEnabled||this.linking||key===this.linkedKey)return;
      this.linking=true;
      try{
        this.linkedKey=key;
        grid.highlightKey(key,true);
        source.highlightKey(key);
      }finally{this.linking=false;}
    });
  }

  /** AG -> source: mark both ends before focusing source; callback is guarded. */
  selectFromGrid(key:string,grid:AgSourceGridAnchor,
    source:AgSourceTextAnchor,focus=true):void{
    if(!this.linkedEnabled)return;
    this.linking=true;
    try{
      this.linkedKey=key;
      grid.highlightKey(key,false);
      source.highlightKey(key);
    }finally{this.linking=false;}
    if(focus)this.activateGridRow(()=>source.revealKey(key),"source");
  }


  resolved(settings:DirectorySettings,scene:AgSourceScene=this.scene):AgSourceStyle{
    const local=settings.agSourceScenes[scene];
    return {
      gridFontSize:local.gridFontSize??(scene==="directory"?settings.gridFontSize:settings.workbenchGridFontSize),
      sourceFontSize:local.sourceFontSize??settings.mdSourceFontSize,
      sourceLineHeight:local.sourceLineHeight??settings.mdSourceLineHeight,
      hardReturns:local.hardReturns??settings.mdShowHardReturns,
      hardReturnColor:local.hardReturnColor??settings.mdHardReturnColor,
    };
  }

  apply(settings:DirectorySettings):AgSourceStyle{
    this.presentation=settings;
    const style=this.resolved(settings);
    this.layout.style.setProperty("--ag-source-grid-font-size",`${style.gridFontSize}px`);
    this.layout.style.setProperty("--ag-source-font-size",`${style.sourceFontSize}px`);
    this.layout.style.setProperty("--ag-source-line-height",String(style.sourceLineHeight));
    this.layout.style.setProperty("--ag-source-hard-return-color",style.hardReturnColor);
    // AG heading cells use absolute sizes while CodeMirror headings use em.
    // Scope the same computed H1–H6 pixel sizes to the pair so per-scene
    // source typography cannot silently diverge from the AG heading rows.
    settings.mdHeadingSizes.forEach((scale,index)=>this.layout.style.setProperty(
      `--v3-heading-${index+1}-absolute-size`,`${style.sourceFontSize*scale}px`));
    this.editor?.setShowHardReturns(style.hardReturns);
    this.editor?.setHardReturnColor(style.hardReturnColor);
    return style;
  }

  /** Uniform grid activation with explicitly chosen focus behavior.
   * inspect: navigation/highlight only, never steals the source insertion caret.
   * source: AG focuses CodeMirror after its own row-click focus bookkeeping.
   */
  activateGridRow(action:()=>void,policy:PairActivation="inspect"):void{
    const serial=++this.focusSerial;
    action();
    if(policy==="source"){
      requestAnimationFrame(()=>{
        if(this.focusSerial===serial)action();
      });
    }
  }
}

export function pairAsSettings(settings:DirectorySettings,style:AgSourceStyle):DirectorySettings{
  return {...settings,mdSourceFontSize:style.sourceFontSize,
    mdSourceLineHeight:style.sourceLineHeight,
    workbenchGridFontSize:style.gridFontSize,
    mdShowHardReturns:style.hardReturns,
    mdHardReturnColor:style.hardReturnColor};
}
