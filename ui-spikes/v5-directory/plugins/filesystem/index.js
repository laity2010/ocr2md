/** V5 migration boundary: register only the CQE routes whose contracts have
 * migrated. V4's published service bundle retains future chapter handlers,
 * but their handlers stay inactive until the owning consumers/contracts land.
 * WCP core is unchanged and unregistered routes stay unavailable by design.
 */
import {filesystemModule as inheritedFilesystem} from './workspace-fs.js';
import {workspaceContracts} from './workspace-contracts.js';

const availableRoutes=new Set(workspaceContracts.filter(c=>c.kind!=='event').map(c=>c.name));
export const filesystemModule={
 ...inheritedFilesystem,
 id:'ocr2md:filesystem',
 setup(bus){
  const scopedBus={
   handle(name,handler){
    if(!availableRoutes.has(name))return ()=>{};
    return bus.handle(name,handler);
   },
   publish(...args){return bus.publish(...args);},
  };
  return inheritedFilesystem.setup(scopedBus);
 }
};
export const modules=[filesystemModule];
export const contracts=workspaceContracts;
