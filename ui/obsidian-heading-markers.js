/** Obsidian daisor snippet: '#' heading markers use the heading's color. */
import {Decoration, ViewPlugin} from '@codemirror/view';

const headingPattern = /^(#{1,6})(?=\s|$)/;
export const obsidianHeadingMarkers = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.scan(view);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.scan(update.view);
    }
  }
  scan(view) {
    const doc = view.state.doc;
    const markers = [];
    const visited = new Set();
    for (const {from, to} of view.visibleRanges) {
      for (let n = doc.lineAt(from).number, last = doc.lineAt(to).number; n <= last; n++) {
        if (visited.has(n)) continue;
        visited.add(n);
        const line = doc.line(n);
        const match = headingPattern.exec(line.text);
        if (!match) continue;
        markers.push(Decoration.mark({class: `cm-ob-heading-marker-${match[1].length}`})
          .range(line.from, line.from + match[1].length));
      }
    }
    return Decoration.set(markers.sort((a,b) => a.from - b.from), true);
  }
}, {decorations: instance => instance.decorations});
