/** Node-only isolated adapter: read the public saved V2 snapshot on stdin,
 * run the existing WP04B engines and emit the normalized persistence plans.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {importSnapshot} from '../ui/sentence/snapshot.js';
import {splitSnapshot} from '../ui/sentence/split.js';
import {initializationPlans} from '../ui/sentence/initialize.js';
const dir=new URL('../ui/sentence/',import.meta.url);
const hash=createHash('sha256');
for(const name of ['package-lock.json','engines.js','split.js','initialize.js']){
 hash.update(name);hash.update(readFileSync(new URL(name,dir)));
}
const lock=JSON.parse(readFileSync(new URL('package-lock.json',dir),'utf8'));
for(const [name,pkg] of Object.entries(lock.packages)){
 if(!name)continue;
 const installed=JSON.parse(readFileSync(new URL(name+'/package.json',dir),'utf8'));
 if(installed.version!==pkg.version)throw Error('Engine dependency lock mismatch: '+name);
}
const config=hash.digest('hex');
const runtime='node='+process.versions.node+';icu='+process.versions.icu+';unicode='+process.versions.unicode+';locale=en;config='+config;
const versions={
 intl:'Intl.Segmenter;'+runtime,
 'sentence-splitter':'sentence-splitter='+lock.packages['node_modules/sentence-splitter'].version+';'+runtime,
 'wink-nlp':'wink-nlp='+lock.packages['node_modules/wink-nlp'].version+';model='+lock.packages['node_modules/wink-eng-lite-web-model'].version+';'+runtime
};
const snapshot=await importSnapshot(JSON.parse(readFileSync(0,'utf8')));
const plans=initializationPlans(snapshot,splitSnapshot(snapshot),versions);
process.stdout.write(JSON.stringify({source_document_hash:snapshot.sourceSha256,plans,line_types:snapshot.lines.map(line=>line.type)}));
