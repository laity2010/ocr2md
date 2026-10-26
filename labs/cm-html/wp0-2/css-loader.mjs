// Node-only test adapter for existing CSS-importing browser business modules.
// Production and Vite import their normal CSS; scanner code is unchanged.
export async function load(url,context,nextLoad){
  if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};
  return nextLoad(url,context);
}
