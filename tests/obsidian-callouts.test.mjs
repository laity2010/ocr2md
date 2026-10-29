/** Native Obsidian callouts stay a Markdown-it preview projection. */
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import {installObsidianCallouts} from '../ui/obsidian-callouts.js';
const md=new MarkdownIt({html:true});installObsidianCallouts(md);
const source=[
  '# Callouts', '',
  '> [!note]- Collapsed **title**',
  '> hidden **bold** line',
  '> another line', '',
  '> [!faq]+ Expanded',
  '>',
  '> - listed item',
  '> - another item','',
  '> [!tip] Always visible','> explanatory text','',
  '> [!warning]- Outer',
  '> > [!quote]+ Inner',
  '> > nested content','',
  '> [! ds]- Legacy spaced marker',
  '> A private translation','',
  '> Ordinary *blockquote*','',
  '```markdown','> [!bug]- inside code','```','',
  '`> [!note]- inline code`','',
  '> [!hint]-','> **no title supplied**', '',
  '> [!custom]- User style','> arbitrary type','',
  '> [!note] Only a title','',
].join('\n');
const html=md.render(source);
assert.equal((html.match(/class="ocr-callout /g)||[]).length,9);
assert.equal((html.match(/<details class=/g)||[]).length,7);
assert.equal((html.match(/<aside class=/g)||[]).length,2);
assert.equal((html.match(/<details[^>]* open>/g)||[]).length,2);
assert.match(html,/<summary class="ocr-callout-title">Collapsed <strong>title<\/strong><\/summary>/);
assert.match(html,/<p>hidden <strong>bold<\/strong> line\s+another line<\/p>/);
assert.match(html,/<summary class="ocr-callout-title">Expanded<\/summary>/);
assert.match(html,/<li>listed item<\/li>/);
assert.match(html,/class="ocr-callout ocr-callout--question ocr-callout-foldable" data-callout="faq"/);
assert.match(html,/class="ocr-callout ocr-callout--tip ocr-callout-foldable" data-callout="hint"/);
assert.match(html,/<summary class="ocr-callout-title">Hint<\/summary>/);
assert.match(html,/class="ocr-callout ocr-callout--note ocr-callout-foldable" data-callout="ds"/);
assert.match(html,/class="ocr-callout ocr-callout--note ocr-callout-foldable" data-callout="custom"/);
assert.match(html,/<blockquote>\s*<p>Ordinary <em>blockquote<\/em><\/p>\s*<\/blockquote>/);
assert.match(html,/<code class="language-markdown">&gt; \[!bug\]- inside code/);
assert.match(html,/\[!note\]- inline code/);
assert(!html.includes('[!faq]+ Expanded'),'callout marker leaked into body');
assert.match(html,/data-source-start="3" data-source-end="6"/);
assert.equal(md.render(source),html,'same Markdown must render deterministically');
console.log('OB_CALLOUTS_PARSE_PASS',JSON.stringify({callouts:9,collapsed:5,expanded:2,always:2,nested:true,legacySpaced:true}));
