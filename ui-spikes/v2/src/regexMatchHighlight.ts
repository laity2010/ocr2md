import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type DecorationSet,
} from "@codemirror/view";
import type { SourceRegexMatch } from "./sourceRegexSearch";

type RegexHighlightState = {
  matches: readonly SourceRegexMatch[];
  currentIndex: number;
};

export const setRegexHighlights =
  StateEffect.define<RegexHighlightState>();

function buildDecorations(
  docLength: number,
  matches: readonly SourceRegexMatch[],
  currentIndex: number,
): DecorationSet {
  const ranges = matches
    .map((match, index) => ({
      from: Math.max(0, Math.min(match.from, docLength)),
      to: Math.max(0, Math.min(match.to, docLength)),
      index,
    }))
    .filter((match) => match.to > match.from)
    .sort((left, right) => left.from - right.from || left.to - right.to)
    .map((match) =>
      Decoration.mark({
        class: match.index === currentIndex
          ? "cm-regex-match cm-regex-match-current"
          : "cm-regex-match",
      }).range(match.from, match.to)
    );

  return Decoration.set(ranges, true);
}

export const regexHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setRegexHighlights)) continue;
      next = buildDecorations(
        transaction.state.doc.length,
        effect.value.matches,
        effect.value.currentIndex,
      );
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function regexHighlightEffect(
  matches: readonly SourceRegexMatch[],
  currentIndex: number,
) {
  return setRegexHighlights.of({ matches, currentIndex });
}
