import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const scripts=fileURLToPath(new URL('../scripts',import.meta.url));
/** Real Python protection implementation, with a fixture snapshot and no SQL write. */
export function preparedFixture(original,state='created'){
  const rows=JSON.parse(execFileSync('python3',['-c','import json,sys; from lab_backend.protection import build_rows; print(json.dumps(build_rows(json.load(sys.stdin)),ensure_ascii=False))'],{env:{...process.env,PYTHONPATH:scripts},input:JSON.stringify(original),encoding:'utf8'}));
  return {schema:'ocr2md-translation-preparation/v1',state,source_document_hash:original.source_document_hash,sentence_sha256:original.sentence_sha256,rows};
}
