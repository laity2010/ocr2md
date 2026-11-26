/** CM6 native effect-only history. The visual source editor is strictly read-only
 * and its filtered document can change identity; use a document-independent
 * CM6 EditorState, not a second undo stack. Commit prepared native transactions
 * only after SQLite acknowledges the corresponding arbitration.
 */
import {EditorState,StateEffect} from '@codemirror/state';
import {history,invertedEffects,isolateHistory,undo,redo,undoDepth,redoDepth} from '@codemirror/commands';
const choiceEffect=StateEffect.define();
const inverse=c=>({...c,previousEngine:c.adoptedEngine,adoptedEngine:c.previousEngine});
const makeState=()=>EditorState.create({doc:'',extensions:[
 history(),invertedEffects.of(tr=>tr.effects.filter(e=>e.is(choiceEffect)).map(e=>choiceEffect.of(inverse(e.value))))
]});
export function createReviewHistory(){
 let state=makeState();
 function stage(tr){
  if(!tr)return null;
  const effect=tr.effects.find(e=>e.is(choiceEffect));
  if(!effect)throw Error('Missing CM6 review history effect');
  return {change:effect.value,commit(){
   if(state!==tr.startState)throw Error('Review history changed before commit');
   state=tr.state;
  }};
 }
 return {
  prepare(change){return stage(state.update({effects:choiceEffect.of(Object.freeze({...change})),annotations:isolateHistory.of('full')}));},
  prepareHistory(direction){let tr;const command=direction==='undo'?undo:redo;command({state,dispatch:t=>{tr=t;}});return stage(tr);},
  depth(){return {undo:undoDepth(state),redo:redoDepth(state)};},
  reset(){state=makeState();}
 };
}
