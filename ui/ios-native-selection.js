/** The codemirror package's basicSetup minus drawSelection().
 * drawSelection() hides the browser's caret and selection under painted
 * CM layers, including imitation iOS handles. Keep all other CM6 extensions
 * identical so text, history, completion and language editing stay intact.
 * Only used on iOS/iPadOS; the ordinary Mac setup remains unchanged.
 */
import {EditorState} from '@codemirror/state';
import {
  lineNumbers,highlightActiveLineGutter,highlightSpecialChars,dropCursor,
  rectangularSelection,crosshairCursor,highlightActiveLine,keymap,
} from '@codemirror/view';
import {
  foldGutter,indentOnInput,syntaxHighlighting,defaultHighlightStyle,
  bracketMatching,foldKeymap,
} from '@codemirror/language';
import {history,defaultKeymap,historyKeymap} from '@codemirror/commands';
import {highlightSelectionMatches,searchKeymap} from '@codemirror/search';
import {
  closeBrackets,autocompletion,closeBracketsKeymap,completionKeymap,
} from '@codemirror/autocomplete';
import {lintKeymap} from '@codemirror/lint';

export function isIOSWebKit(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
}

export const nativeIOSBasicSetup=[
  lineNumbers(),highlightActiveLineGutter(),highlightSpecialChars(),
  history(),foldGutter(),dropCursor(),
  EditorState.allowMultipleSelections.of(true),indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle,{fallback:true}),
  bracketMatching(),closeBrackets(),autocompletion(),
  rectangularSelection(),crosshairCursor(),highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,...defaultKeymap,...searchKeymap,
    ...historyKeymap,...foldKeymap,...completionKeymap,...lintKeymap,
  ]),
];
