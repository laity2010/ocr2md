/** Sentence engine adapters. Private to the Sentence Benchmark module.
 * All offsets are UTF-16 half-open indices in the SAME unmodified prose run.
 * To add an engine, register one ID, name and segment(text) implementation here.
 */
import {split as splitBySentenceSplitter} from 'sentence-splitter';
import winkNLP from 'wink-nlp';
import winkModel from 'wink-eng-lite-web-model';

let winkInstance;
const wink = () => (winkInstance ||= winkNLP(winkModel));

const registry = Object.freeze({
  intl: Object.freeze({
    name: 'Intl.Segmenter',
    segment(text, {locale = 'en'} = {}) {
      const scanner = new Intl.Segmenter(locale, {granularity: 'sentence'});
      return [...scanner.segment(text)].map(item => ({
        start: item.index, end: item.index + item.segment.length
      }));
    }
  }),
  'sentence-splitter': Object.freeze({
    name: 'sentence-splitter',
    segment(text) {
      return splitBySentenceSplitter(text)
        .filter(item => item.type === 'Sentence')
        .map(item => ({start: item.range[0], end: item.range[1]}));
    }
  }),
  'wink-nlp': Object.freeze({
    name: 'winkNLP',
    segment(text) {
      // Wink's its.span gives token IDs, NOT source character offsets.
      // Use the actual sentence text with monotonic exact-source matching.
      const results = [];
      let cursor = 0;
      wink().readDoc(text).sentences().each(sentence => {
        const literal = sentence.out();
        const start = text.indexOf(literal, cursor);
        if (start < 0) throw Error('WINK_SOURCE_POSITION_NOT_FOUND');
        const end = start + literal.length;
        results.push({start, end});
        cursor = end;
      });
      return results;
    }
  })
});

export const engineCatalog = Object.freeze(Object.entries(registry)
  .map(([id, engine]) => Object.freeze({id, name: engine.name})));

export function engineAdapter(id) {
  const engine = registry[id];
  if (!engine) throw Error('UNKNOWN_SENTENCE_ENGINE: ' + id);
  return engine;
}
