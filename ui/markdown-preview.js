/**
 * Read-only projection of CM6 Markdown. Markdown is never cached here.
 * Source: markdown-it; HTML tables sanitized with DOMPurify; math fences
 * rendered by KaTeX. Other extensions can be added independently.
 */
import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import DOMPurify from 'dompurify';
import {installObsidianImages} from './obsidian-images.js';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './markdown-preview.css';

const md = new MarkdownIt({
  html:true, linkify:true, breaks:false, typographer:false,
}).use(footnote).use(taskLists, {enabled:false});

// Markdown-it maps block tokens back to 0-based, half-open source line ranges.
// Attach those locations to the rendered element without altering the MD
// source. The scroll coordinator consumes them after sanitization.
const mappedTags = new Set([
  'heading_open', 'paragraph_open', 'list_item_open', 'table_open',
]);
const sourceAttrs = token => token.map
  ? ` data-source-start="${token.map[0]+1}" data-source-end="${token.map[1]+1}"`
  : '';

installObsidianImages(md);
const oldFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const language = token.info.trim().split(/\s+/)[0].toLowerCase();
  if (language === 'math' || language === 'latex' || language === 'tex') {
    try {
      return '<div class="ocr-math ocr-source-block"'+sourceAttrs(token)+'>' + katex.renderToString(token.content, {
        displayMode:true, throwOnError:false, trust:false, maxExpand:1000,
      }) + '</div>\n';
    } catch {
      return '<pre class="ocr-math-fallback ocr-source-block"'+sourceAttrs(token)+'>' + md.utils.escapeHtml(token.content) + '</pre>\n';
    }
  }
  return '<div class="ocr-source-block"'+sourceAttrs(token)+'>' +
    oldFence(tokens,idx,options,env,self) + '</div>\n';
};
const oldCode = md.renderer.rules.code_block;
md.renderer.rules.code_block = (tokens,idx,options,env,self) =>
  '<div class="ocr-source-block"'+sourceAttrs(tokens[idx])+'>' +
  (oldCode ? oldCode(tokens,idx,options,env,self)
    : '<pre><code>'+md.utils.escapeHtml(tokens[idx].content)+'</code></pre>') +
  '</div>\n';
const oldHTML = md.renderer.rules.html_block;
md.renderer.rules.html_block = (tokens,idx,options,env,self) => {
  const token=tokens[idx];
  // These comments are the no-loss MinerU evidence and must remain invisible.
  // Do not create thousands of invisible sync anchors for them.
  if (/^\s*<!--[\s\S]*-->\s*$/.test(token.content))
    return oldHTML ? oldHTML(tokens,idx,options,env,self) : token.content;
  return '<div class="ocr-source-block"'+sourceAttrs(token)+'>' +
    (oldHTML ? oldHTML(tokens,idx,options,env,self) : token.content) + '</div>\n';
};

// Obsidian-reading projection. MinerU preservation comments are deliberately
// present in the source but invisible here; the sanitizer strips comments.
export function renderMarkdown(source) {
  // LaTeX review comments are CMD-owned metadata. Remove them ONLY from the
  // read-only projection before Markdown parsing: an inline HTML comment may
  // otherwise cause DOMPurify to drop the whole enclosing paragraph.
  // Neither marker contains a newline; line-to-PDF anchors remain intact.
  const projected=source.replace(/<!--(?:\/)?ocr2md:latex id=[a-f0-9]{16}(?: review=(?:latex|忽略))?-->/g,'');
  const env={};
  const tokens=md.parse(projected,env);
  for(const token of tokens) {
    if (token.map && mappedTags.has(token.type)) {
      token.attrSet('data-source-start',String(token.map[0]+1));
      token.attrSet('data-source-end',String(token.map[1]+1));
    }
  }
  return DOMPurify.sanitize(md.renderer.render(tokens,md.options,env), {
    USE_PROFILES:{html:true},
    ADD_ATTR:['class','colspan','rowspan','align'],
  });
}
