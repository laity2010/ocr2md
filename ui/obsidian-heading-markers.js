/** Display-only source-line decorations: Everforest headings and hard returns. */
import {Decoration, ViewPlugin, WidgetType} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';

const headingPattern = /^(#{1,6})(?=\s|$)/;
class HardReturnMarker extends WidgetType {
  eq(other) { return other instanceof HardReturnMarker; }
  toDOM() {
    const span=document.createElement('span');
    span.className='cm-ob-hard-return';
    // Render the glyph with CSS ::before: WebKit must not include a
    // display-only hard-return symbol in native text selections.
    span.setAttribute('aria-hidden','true');
    span.title='硬回车（真实换行）';
    return span;
  }
  ignoreEvent() { return true; }
}
const hardReturnMarker = new HardReturnMarker();

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
    const tree = syntaxTree(view.state);
    for (const {from, to} of view.visibleRanges) {
      for (let n = doc.lineAt(from).number, last = doc.lineAt(to).number; n <= last; n++) {
        if (visited.has(n)) continue;
        visited.add(n);
        const line = doc.line(n);
        const match = headingPattern.exec(line.text);
        if (match) {
          // Don't style '# ' in fenced code as a Markdown heading.
          const at=line.from;
          // The Lezer tree may not yet cover every visible line on first
          // paint. Accept ordinary ATX lines immediately; exclude fenced
          // code only when its node is actually available.
          let node=tree.resolveInner(at,1);
          let codeFence=false;
          for (;node;node=node.parent) {
            if (node.name==='FencedCode') {codeFence=true;break;}
          }
          if (!codeFence) {
            const level=match[1].length;
            markers.push(Decoration.line({attributes:{class:`cm-ob-heading-line-${level}`}}).range(at));
            markers.push(Decoration.mark({class:`cm-ob-heading-marker-${level}`})
              .range(at,at+level));
          }
        }
        // Only a literal newline in the CM6 document gets a glyph; soft-wrap
        // continuations get none. Zero-width presentation never edits Markdown.
        if (line.to < doc.length) {
          markers.push(Decoration.widget({widget:hardReturnMarker,side:1}).range(line.to));
        }
      }
    }
    return Decoration.set(markers,true);
  }
}, {decorations: instance => instance.decorations});
