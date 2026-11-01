// Test-isolation helper: every consumer of the reinitialized Buffett CMD sample
// materializes it from the committed MinerU fixture instead of depending on
// tests/cmd-text-blocks.test.mjs having run first. Writes are atomic and
// byte-exact, so concurrent suites never observe a partial file.
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {toMarkdown,toMineruJSON} from '../../packages/minerujson-md/dist/index.js';
export const TEXT_BLOCK_SAMPLE=resolve('.v6/tests/text-blocks/buffett-reinitialized.minerujson.md');
export function ensureTextBlockSample(){
  const source=readFileSync(resolve('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'),'utf8');
  const expected=toMarkdown(source);
  if(toMineruJSON(expected)!==source)throw Error('reinitialized sample must be byte-exact');
  if(existsSync(TEXT_BLOCK_SAMPLE)&&readFileSync(TEXT_BLOCK_SAMPLE,'utf8')===expected)return TEXT_BLOCK_SAMPLE;
  mkdirSync(dirname(TEXT_BLOCK_SAMPLE),{recursive:true});
  const tmp=`${TEXT_BLOCK_SAMPLE}.${process.pid}.tmp`;
  writeFileSync(tmp,expected);renameSync(tmp,TEXT_BLOCK_SAMPLE);
  return TEXT_BLOCK_SAMPLE;
}
