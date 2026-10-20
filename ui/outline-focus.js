/** A single nonpersistent CM6 line decoration for three-pane navigation. */
import {StateEffect,StateField} from '@codemirror/state';
import {Decoration,EditorView} from '@codemirror/view';

export const markOutlineLine=StateEffect.define();

export const outlineLineHighlight=StateField.define({
  create(){return Decoration.none;},
  update(value,transaction){
    value=value.map(transaction.changes);
    for(const effect of transaction.effects) {
      if(!effect.is(markOutlineLine))continue;
      const line=Math.max(1,Math.min(transaction.state.doc.lines,effect.value));
      value=Decoration.set([Decoration.line({
        attributes:{class:'cm-outline-focused-line'},
      }).range(transaction.state.doc.line(line).from)]);
    }
    return value;
  },
  provide:field=>EditorView.decorations.from(field),
});
