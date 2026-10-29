/** Markdown preview only: a deliberately small, explicit highlight.js language
 * registry. No runtime execution, autodetection, external requests or CMD edits.
 */
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import diff from 'highlight.js/lib/languages/diff';

const languages={python,javascript,typescript,json,xml,css,bash,sql,yaml,markdown,diff};
for(const [name,parser] of Object.entries(languages))hljs.registerLanguage(name,parser);

const escapeHTML=value=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/** Return complete safe pre/code HTML for MarkdownIt's highlight option.
 * Unknown/absent language stays escaped plaintext; math/latex/tex are handled
 * separately by the existing KaTeX fence renderer before this is used.
 */
export function highlightCodeFence(source,language=''){
  const lang=String(language||'').trim().toLowerCase();
  const safeLanguage=/^[a-z0-9_+#.-]{1,32}$/.test(lang)?lang:'';
  let code=escapeHTML(source);
  if(safeLanguage&&hljs.getLanguage(safeLanguage)){
    try{code=hljs.highlight(source,{language:safeLanguage,ignoreIllegals:true}).value;}
    catch{code=escapeHTML(source);}
  }
  return '<pre class="ocr-code-fence"><code class="hljs'+
    (safeLanguage?' language-'+safeLanguage:'')+'">'+code+'</code></pre>';
}
