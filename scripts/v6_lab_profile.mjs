/** Lab is a complete Main worktree mirror: environment-only build identity. */
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

const NAME=/^[a-z][a-z0-9-]{0,31}$/;
export function labProfile(root,name=process.env.V6_LAB_ID||''){
  if(!name)return null;
  if(!NAME.test(name))throw Error('Invalid V6_LAB_ID: use lowercase letters, digits and hyphens');
  const dir=join(root,'labs',name);
  const path=join(dir,'lab.json');
  const config=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{};
  if(!config||typeof config!=='object'||Array.isArray(config))
    throw Error('Lab config must be a JSON object');
  if(Object.keys(config).some(key=>key!=='modules')||
     (config.modules!==undefined&&(!config.modules||typeof config.modules!=='object'||Array.isArray(config.modules))))
    throw Error('Lab config may contain only a legacy empty modules object');
  if(Object.keys(config.modules||{}).length)
    throw Error('LAB_MODULE_OVERRIDE_FORBIDDEN: Lab must use the identical Main module graph');
  return {name,dir,base:`/labs/${name}/`};
}
