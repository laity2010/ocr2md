/** Read-only unless --output explicitly names a NEW file.
 * Never touches source/legacy inputs or deletes old chapter files.
 *
 * Usage: node .../legacy-reconcile.cli.mjs MOTHER_MD CHAPTER_DIR
 * Usage: node .../legacy-reconcile.cli.mjs MOTHER_MD CHAPTER_DIR --output NEW.md
 */
import {readFileSync,writeFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {reconcilePhysicalChapters} from './legacy-reconcile.js';
const [motherPath,chapterDir,option,output]=process.argv.slice(2);
if(!motherPath||!chapterDir||(option!==undefined&&option!=='--output')||
   (option==='--output'&&!output))
  throw Error('Supply source, legacy folder, and optional --output NEW FILE');
const actualMother=resolve(motherPath),actualChapters=resolve(chapterDir);
if(lstatSync(actualMother).isSymbolicLink()||lstatSync(actualChapters).isSymbolicLink())
  throw Error('Refusing symlinked source or legacy chapter directory');
const source=readFileSync(actualMother,'utf8');
const manifest=JSON.parse(readFileSync(join(actualChapters,'manifest.json'),'utf8'));
const legacy=manifest.files.map(entry=>{
  if(!/^[0-9]{1,6}-[\w-]{1,110}\.cmd\.chapter\.md$/.test(entry.name))
    throw Error('Untrusted chapter filename');
  const file=join(actualChapters,entry.name);
  if(lstatSync(file).isSymbolicLink())throw Error('Refusing symlinked legacy chapter');
  return readFileSync(file,'utf8');
});
const {merged,report}=reconcilePhysicalChapters(source,manifest,legacy);
if(output!==undefined){
  const target=resolve(output);
  const parent=realpathSync(dirname(target));
  if(target===actualMother||target.startsWith(actualChapters+'/')||
     parent===realpathSync(dirname(actualMother))&&target===actualMother)
    throw Error('Output must not overwrite source or legacy chapter');
  // Creation-only: existing targets (including symlinks) are refused.
  writeFileSync(target,merged,{flag:'wx',mode:0o600});
}
console.log(JSON.stringify({state:'WP7_RECONCILED',savedCandidate:Boolean(output),...report},null,2));
