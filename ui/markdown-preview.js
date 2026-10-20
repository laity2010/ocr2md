/**
 * Read-only projection of CM6 Markdown. Markdown is never cached here.
 * Source: markdown-it; HTML tables sanitized with DOMPurify; math fences
 * rendered by KaTeX. Other extensions can be added independently.
 */
import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './markdown-preview.css';

const md = new MarkdownIt({
  html:true, linkify:true, breaks:false, typographer:false,
}).use(footnote).use(taskLists, {enabled:false});

const oldFence = md.renderer.rules.fence;
const oldImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('loading','lazy');
  tokens[idx].attrSet('decoding','async');
  return oldImage(tokens,idx,options,env,self);
};
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const language = token.info.trim().split(/\s+/)[0].toLowerCase();
  if (language === 'math' || language === 'latex' || language === 'tex') {
    try {
      return '<div class="ocr-math">' + katex.renderToString(token.content, {
        displayMode:true, throwOnError:false, trust:false, maxExpand:1000,
      }) + '</div>\n';
    } catch {
      return '<pre class="ocr-math-fallback">' + md.utils.escapeHtml(token.content) + '</pre>\n';
    }
  }
  return oldFence(tokens,idx,options,env,self);
};

// Obsidian-reading projection. MinerU preservation comments are deliberately
// present in the source but invisible here; the sanitizer strips comments.
export function renderMarkdown(source) {
  return DOMPurify.sanitize(md.render(source), {
    USE_PROFILES:{html:true},
    ADD_ATTR:['class','colspan','rowspan','align'],
  });
}
