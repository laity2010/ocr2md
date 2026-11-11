/** Frame-owned global status API.
 * Business modules publish message/severity; only Shell owns its DOM and colors.
 *
 * Public API: createFrameStatus(node).publish(message, severity='info')
 */
const LEVELS=new Set(['info','ok','warning','error']);
export function createFrameStatus(node){
  if(!node)throw Error('Global status host required');
  node.setAttribute('role','status');
  node.setAttribute('aria-live','polite');
  function publish(message,severity='info'){
    const level=LEVELS.has(severity)?severity:'info';
    node.dataset.kind=level;
    node.textContent=String(message);
  }
  return Object.freeze({publish});
}
