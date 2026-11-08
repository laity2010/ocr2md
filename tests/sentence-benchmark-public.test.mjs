import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {split, rebuild} from '../ui/sentence-benchmark-core.js';
import {engineCatalog} from '../ui/sentence-benchmark-engines.js';

const fence = String.fromCharCode(96).repeat(3);
const buffett = readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md', 'utf8');
const samples = [
  '',
  'Dr. Smith came at 3 p.m. He said hello! Mr. Jones agreed.',
  'First sentence. Second sentence? Third sentence!',
  '# Heading\n\nHello! A $x+y$ formula. Still fine.\n\n<!-- cmd:block:v1 id="p1b2" -->\nThe next line has a note[^1].\n\n[^1]: Documentation.\n',
  '这是一句话。第二句话！第三句话？\n\n**强调** 保持不变。\n',
  'Emoji 🙂 are here. Another line with spaces.  \n\n' + fence + 'python\nprint("keep it!")\n' + fence + '\n',
  buffett
];

test('public surface exposes exactly the two intended operations', async () => {
  const api = await import('../ui/sentence-benchmark-core.js');
  assert.deepEqual(Object.keys(api).sort(), ['rebuild', 'split']);
  assert.deepEqual(engineCatalog.map(v => v.id), ['intl', 'sentence-splitter', 'wink-nlp']);
});

for (const engine of engineCatalog) {
  test(engine.id + ' faithfully rebuilds each Markdown sample and source mapping', () => {
    for (const md of samples) {
      const result = split(md, engine.id);
      assert.equal(rebuild(result), md);
      assert.deepEqual(Buffer.from(rebuild(result)), Buffer.from(md));
      assert.equal(result.pieces.map(p => p.text).join(''), md);
      assert.equal(result.sourceLength, md.length);
      assert(result.sentences.every(s => s.fragments.every(f =>
        md.slice(f.from, f.to) === f.text)));
      assert(result.pieces.every((p,i) =>
        i === 0 ? p.from === 0 : p.from === result.pieces[i-1].to));
    }
  });
}

test('rebuild rejects lost raw text and tampered sentence maps', () => {
  const value = split('A complete sentence. Another complete sentence.', 'intl');
  assert(value.sentences.length >= 2);
  const missing = structuredClone(value);
  missing.pieces.pop();
  assert.throws(() => rebuild(missing), /SENTENCE_LOSSLESS/);
  const tampered = structuredClone(value);
  tampered.pieces.find(p => p.kind === 'sentence').text = 'bad';
  assert.throws(() => rebuild(tampered), /SENTENCE_LOSSLESS/);
  const orphan = structuredClone(value);
  orphan.sentences.pop();
  assert.throws(() => rebuild(orphan), /SENTENCE_LOSSLESS/);
});

test('original CMD, protected formula, fenced code and annotations remain untouched', () => {
  const md = '<!-- cmd:block:v1 id="p2b3" -->\n' +
    'He saw $E=mc^2$, and was surprised. Next.\n' +
    '<!-- ocr2md:media v="1" -->\n![image](fig01.png)\n\n' +
    fence + 'js\nconst x = "Never edit."; \n' + fence + '\n';
  for (const engine of engineCatalog) {
    const result = split(md, engine.id);
    assert.equal(rebuild(result), md);
    assert(result.pieces.some(p => p.kind === 'raw' && p.text.includes('media')));
  }
});
