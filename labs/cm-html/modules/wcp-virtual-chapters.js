/** Only the explicit WCP contract wires WP3–WP6 into reusable V6 components.
 * No duplicate EditorState, source scanner, Markdown renderer or Grid owner.
 */
import {EditorView} from '@codemirror/view';
import {createCMDTransactionPort} from '../wp0-2/cmd-element-transactions.js';
import {virtualChapterExtensions,setVirtualChapter,currentVirtualChapter} from '../wp0-2/cm-virtual-view.js';
import {renderVirtualMarkdown} from '../wp0-2/md-virtual-preview.js';

export function createWCPRuntime(){
  let activeView=null,reportStatus=()=>{};
  let detachCM=()=>{};
  const editorExtensions=[...virtualChapterExtensions,
    EditorView.updateListener.of(update=>{
      if(!update.docChanged)return;
      document.dispatchEvent(new CustomEvent('ocr2md:wp4-virtual-scope',{
        detail:{scope:currentVirtualChapter(update.state),reason:'edit'},
      }));
    }),
  ];
  return Object.freeze({
    editorExtensions,
    wrapCMD:cm=>createCMDTransactionPort(cm),
    onCMReady({view,status}){
      activeView=view;reportStatus=status;
      const onScope=event=>{
        try{setVirtualChapter(activeView,event.detail?.scope??null);}
        catch(error){reportStatus('章节视图失败：'+error.message,'error');}
      };
      document.addEventListener('ocr2md:wp4-virtual-scope',onScope);
      detachCM=()=>document.removeEventListener('ocr2md:wp4-virtual-scope',onScope);
    },
    onAGReady({views,getMarkdown,getCMD}){
      // Event published by the stable Workspace module contract, not injected
      // into source through Vite. Consumers look up the live CMD on demand.
      document.dispatchEvent(new CustomEvent('ocr2md:wp3-ag-ready',{
        detail:{views,getMarkdown,getCMD},
      }));
    },
    onPreviewInit(previewPort){
      // A review annotation changes source offsets even when the SAME chapter
      // remains selected. It must not be treated as a navigation: repaint()
      // intentionally scrolls to chapter start and caused the reported jump.
      let previousChapterId=null;
      const onScope=event=>{
        const nextScope=event.detail?.scope??null;
        const nextChapterId=nextScope?.id??null;
        const chapterChanged=previousChapterId!==nextChapterId;
        previousChapterId=nextChapterId;
        previewPort.setScope(nextScope);
        if(event.detail?.reason==='edit'||!chapterChanged)return;
        requestAnimationFrame(()=>{
          if(!previewPort.isDisposed())previewPort.repaint();
        });
      };
      document.addEventListener('ocr2md:wp4-virtual-scope',onScope);
      return ()=>document.removeEventListener('ocr2md:wp4-virtual-scope',onScope);
    },
    renderPreview:(source,{scope})=>renderVirtualMarkdown(source,scope),
    dispose(){detachCM();activeView=null;},
  });
}
