/** V2 Markdown preview is the sole source of truth for visual element rules.
 * V3 keeps only its container geometry, font preferences and global reset.
 * Fail the build if the V2 style landmarks move: never silently drift. */
import {readFileSync,writeFileSync} from 'node:fs';
const v2=readFileSync('../v2/index.html','utf8');
const start=v2.indexOf('    #markdown-preview {\n      min-width: 0;');
const end=v2.indexOf('    #markdown-preview.ocr2md-reading-preview {',start);
if(start<0||end<=start)throw Error('V2 preview CSS landmarks changed: inspect original CSS before syncing');
const source=v2.slice(start,end);
for(const fragment of ['blockquote.ocr2md-callout','.ocr2md-footnote-ref','.ocr2md-footnote-popover','table {','.katex-display','blockquote.ocr2md-embed-block']){
  if(!source.includes(fragment))throw Error('V2 Markdown feature CSS missing: '+fragment);
}
const transformed=source
  .replaceAll('#markdown-preview',':is(#workbench-preview,#ir-markdown-preview)')
  .replace('font-size: var(--right-font-size);','font-size: var(--v3-preview-font-size,14px);')
  .replace('line-height: 1.65;\n      background:', 'line-height: var(--v3-preview-line-height,1.65);\n      background:')
  .replaceAll('font-family: ui-monospace, SFMono-Regular, Menlo, monospace;', 'font-family: var(--v3-ui-font);');
const css=`/* GENERATED from ui-spikes/v2/index.html #markdown-preview.\n * Source-of-truth: V2; run syncV2PreviewStyles.mjs through npm run build.\n * Keep V3 overrides restricted to its layout and configured Sarasa typography. */\n`+transformed+`
/* V3 has global h1/h2/h3/p rules for its navigation and settings, unlike V2.
 * Restore UA spacing inside the actual markdown text before applying V2 styles;
 * otherwise V3's 5px paragraph and 0px title margins win. */
:is(#workbench-preview,#ir-markdown-preview) :is(h1,h2,h3,h4,h5,h6){
  margin-block-start:revert;
  margin-block-end:revert;
  letter-spacing:normal;
}
:is(#workbench-preview,#ir-markdown-preview) p{
  margin-block-start:revert;
  margin-block-end:revert;
  color:inherit;
}
:is(#workbench-preview,#ir-markdown-preview) code{overflow-wrap:normal}
:is(#workbench-preview,#ir-markdown-preview){
  --footnote-ref-size:1.25em;
  font-family:var(--v3-md-font-family,var(--v3-ui-font));
}
`;
const mathFenceCss=`
/* V3-only MinerU math-fence preview. Display wide KaTeX without clipping. */
:is(#workbench-preview,#ir-markdown-preview) .ocr2md-fenced-math{
  max-width:100%;overflow-x:auto;overflow-y:hidden;margin:1em 0;padding:.3em .15em;
  -webkit-overflow-scrolling:touch;
}
:is(#workbench-preview,#ir-markdown-preview) .ocr2md-fenced-math .katex-display{
  margin:.35em 0;min-width:max-content;
}
:is(#workbench-preview,#ir-markdown-preview) .ocr2md-fenced-math-error{
  max-width:100%;margin:1em 0;padding:.55em .7em;
  border:1px solid #b77555;border-radius:5px;color:#edb69a;
}
:is(#workbench-preview,#ir-markdown-preview) .ocr2md-fenced-math-error pre{
  white-space:pre-wrap;overflow-wrap:anywhere;
}
`;
writeFileSync('src/v2MarkdownPreview.css',css+mathFenceCss);
console.log('V2_PREVIEW_CSS_SYNC',JSON.stringify({originalBytes:source.length,outputBytes:css.length}));
