/** Highlight.js fenced-code rendering is escaped, deterministic, and no-op for unknown formats. */
import assert from 'node:assert/strict';
import {highlightCodeFence} from '../ui/code-fence-highlight.js';
const python=highlightCodeFence('def greet():\n    return 42\n','python');
assert.match(python,/class="hljs language-python"/);
assert.match(python,/class="hljs-keyword">def<\/span>/);
assert.match(python,/class="hljs-keyword">return<\/span>/);
assert.match(highlightCodeFence('{"answer":42}\n','json'),/hljs-(?:attr|number)/);
assert.match(highlightCodeFence('<div class="foo">x</div>\n','html'),/hljs-tag/);
assert.match(highlightCodeFence('const x = 3;\n','javascript'),/hljs-keyword/);
for(const lang of ['','unknown-format']){
  const plain=highlightCodeFence('<script>alert("x")</script> & test',lang);
  assert.match(plain,/&lt;script&gt;/);
  assert.doesNotMatch(plain,/<script>/);
  assert.doesNotMatch(plain,/class="hljs-keyword"/);
}
assert.doesNotMatch(highlightCodeFence('print(1)', '<img onerror=alert(1)>'),/<img/);
assert.equal(highlightCodeFence('def foo(): return 1','python'),
  highlightCodeFence('def foo(): return 1','python'));
console.log('CODE_FENCE_HIGHLIGHT_PASS');
