/** Experiment-only CMDocument adapter: one EditorView, one EditorState per file.
 * All source changes still flow through the original CMD capability surface.
 */
import {EditorState} from '@codemirror/state';
import {CMDocument as MainlineCMDocument} from './cm-document.js';
export class CMDocument extends MainlineCMDocument {
  constructor(options){
    super(options);
    this.fileExtensions=options.extensions;
  }
  createFileState(markdown){
    if(typeof markdown!=='string')throw Error('Invalid file source');
    return EditorState.create({doc:markdown,extensions:this.fileExtensions});
  }
  activateFileState(state){
    if(!(state instanceof EditorState))throw Error('Invalid file editor state');
    this.view.setState(state);
    this.view.requestMeasure();
  }
}
