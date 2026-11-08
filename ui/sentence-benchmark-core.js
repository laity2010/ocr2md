/** OCR2MD Sentence module — exactly TWO public operations: split and rebuild.
 * Engine adapters, source partitioning and integrity checks are private internals.
 * A result is a lossless ordered sequence of raw and sentence fragments,
 * not a cached copy of the original Markdown.
 */
import {extractTextBlocks, segmentSentences} from './cmd-sentences.js';
import {engineAdapter} from './sentence-benchmark-engines.js';

function checksum(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++)
    value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0).toString(16).padStart(8, '0');
}

function requireValid(value, message) {
  if (!value) throw Error('SENTENCE_LOSSLESS_' + message);
}

function partsFor(md, sentences) {
  const fragments = sentences.flatMap(sentence =>
    sentence.fragments.map((fragment, fragmentIndex) => ({
      ...fragment, id: sentence.id, fragmentIndex
    }))).sort((a, b) => a.from - b.from || a.to - b.to);
  const pieces = [];
  let pos = 0;
  for (const frag of fragments) {
    requireValid(Number.isInteger(frag.from) && Number.isInteger(frag.to) &&
      frag.from >= pos && frag.to <= md.length && frag.to > frag.from,
      'FRAGMENT_OVERLAP_OR_RANGE');
    requireValid(md.slice(frag.from, frag.to) === frag.text,
      'SOURCE_FRAGMENT_CHANGED');
    if (frag.from > pos) pieces.push({
      kind: 'raw', from: pos, to: frag.from, text: md.slice(pos, frag.from)
    });
    pieces.push({
      kind: 'sentence', from: frag.from, to: frag.to, text: frag.text,
      id: frag.id, fragmentIndex: frag.fragmentIndex
    });
    pos = frag.to;
  }
  if (pos < md.length) pieces.push({
    kind: 'raw', from: pos, to: md.length, text: md.slice(pos)
  });
  return pieces;
}

/**
 * Public 1: Markdown -> lossless sentence result.
 * The engine ID is the only required configuration; adapters cannot mutate md.
 */
export function split(md, engine = 'intl') {
  if (typeof md !== 'string') throw TypeError('split() expects Markdown text');
  if (typeof engine !== 'string') throw TypeError('split() expects an engine ID');
  const adapter = engineAdapter(engine);
  const projection = extractTextBlocks(md);
  const sentences = segmentSentences(projection, {
    engine: text => adapter.segment(text)
  });
  const result = {
    schema: 'ocr2md-sentences/v1',
    engine, sourceLength: md.length,
    sourceChecksum: checksum(md),
    sentences,
    pieces: partsFor(md, sentences),
    stats: {runs: projection.runs.length, sentences: sentences.length}
  };
  requireValid(rebuild(result) === md, 'ROUNDTRIP_MISMATCH');
  return result;
}

/**
 * Public 2: lossless sentence result -> the identical original Markdown.
 * Checks complete piece coverage AND every returned sentence's fragments.
 * Inserting/removing or mutating a sentence without a corresponding source
 * transaction cannot silently produce an apparently valid reconstruction.
 */
export function rebuild(result) {
  requireValid(result?.schema === 'ocr2md-sentences/v1' &&
    Number.isInteger(result.sourceLength) && result.sourceLength >= 0 &&
    Array.isArray(result.pieces) && Array.isArray(result.sentences),
  'INVALID_RESULT');

  const expected = new Map();
  for (const sentence of result.sentences) {
    requireValid(typeof sentence.id === 'string' &&
      !expected.has(sentence.id) && Array.isArray(sentence.fragments),
    'DUPLICATE_SENTENCE');
    for (let index = 0; index < sentence.fragments.length; index++) {
      const frag = sentence.fragments[index];
      const key = sentence.id + ':' + index;
      expected.set(key, frag);
    }
  }
  const seen = new Set();
  let cursor = 0, md = '';
  for (const piece of result.pieces) {
    requireValid(piece && (piece.kind === 'sentence' || piece.kind === 'raw') &&
      Number.isInteger(piece.from) && Number.isInteger(piece.to) &&
      piece.from === cursor && piece.to > piece.from &&
      piece.to <= result.sourceLength && typeof piece.text === 'string' &&
      piece.text.length === piece.to - piece.from,
    'PIECE_COVERAGE');
    if (piece.kind === 'sentence') {
      const key = piece.id + ':' + piece.fragmentIndex;
      const frag = expected.get(key);
      requireValid(frag && !seen.has(key) &&
        frag.from === piece.from && frag.to === piece.to &&
        frag.text === piece.text, 'SENTENCE_MAPPING');
      seen.add(key);
    }
    md += piece.text;
    cursor = piece.to;
  }
  requireValid(cursor === result.sourceLength && seen.size === expected.size,
    'INCOMPLETE_SOURCE');
  requireValid(checksum(md) === result.sourceChecksum, 'SOURCE_CHECKSUM');
  return md;
}
