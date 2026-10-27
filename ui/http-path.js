/** Shared HTTP path transport for Main and explicitly isolated Lab base paths.
 * No text rewriting or access to another module's internal state.
 */
export function appPath(path){
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))
    throw Error('Expected same-origin absolute app path');
  const base=import.meta.env.BASE_URL || '/';
  return base==='/'?path:base.replace(/\/$/,'')+path;
}
