/** Deterministic server-side projection of a SAVED Document IR snapshot.
 * Reads one validated DIRjson from stdin, emits one stored ZIP to stdout.
 * This CLI is invoked by the authenticated Mac Vault publication endpoint;
 * no user browser ever uploads the large ZIP and no FS paths are accepted.
 */
import {readFileSync,writeSync} from 'node:fs';
import {validateDocumentIrV1,type DocumentIrV1} from './documentIrV1';
import {generateIrMarkdownBundle,isIrChapterFileLayoutReady} from './documentIrMarkdown';
import {buildIrMarkdownArchive} from './documentIrArchive';
try{
  const source=readFileSync(0);
  if(source.byteLength>10*1024*1024)throw Error('DIRjson input exceeds 10MB');
  const doc=JSON.parse(source.toString('utf8')) as DocumentIrV1;
  validateDocumentIrV1(doc);
  if(!isIrChapterFileLayoutReady(doc))throw Error('Named chapter file boundaries incomplete');
  const output=buildIrMarkdownArchive(doc,generateIrMarkdownBundle(doc,{obCompatible:true}));
  if(output.bytes.byteLength>16*1024*1024)throw Error('Projected archive exceeds 16MB');
  writeSync(1,output.bytes);
}catch(error){
  process.stderr.write('IR chapter projection rejected: '+String(error)+'\n');
  process.exitCode=2;
}
