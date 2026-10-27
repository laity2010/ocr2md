/** Build graph proof: a Lab with same commit must ship the same business modules.
 * Generated only from Vite/Rollup's *actually bundled* source graph, not a
 * hand-maintained list or a comparison of unrelated build configurations.
 */
import {existsSync,readFileSync,statSync} from 'node:fs';
import {relative,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';

export function moduleParityPlugin(root,lab){
  const project=resolve(root);
  return {
    name:'ocr2md-verified-module-graph',
    generateBundle(){
      const entries=[];
      const prefix=project+sep;
      for(const id of this.getModuleIds()){
        const bare=id.split('?')[0];
        if(!bare.startsWith(prefix)||!existsSync(bare)||!statSync(bare).isFile())continue;
        const key=relative(project,bare).split(sep).join('/');
        if(!/^(ui|node_modules|packages)\//.test(key))
          throw Error('LAB_MODULE_GRAPH_ESCAPE: '+key);
        const digest=createHash('sha256').update(readFileSync(bare)).digest('hex');
        entries.push([key,digest]);
      }
      entries.sort((a,b)=>a[0].localeCompare(b[0],'en'));
      if(!entries.length)throw Error('Empty module graph: refusing to certify Lab/Main parity');
      const digest=createHash('sha256').update(JSON.stringify(entries)).digest('hex');
      this.emitFile({type:'asset',fileName:'module-graph.json',source:JSON.stringify({
        schema:1,moduleGraphSha256:digest,moduleCount:entries.length,modules:entries
      })+'\n'});
    }
  };
}
