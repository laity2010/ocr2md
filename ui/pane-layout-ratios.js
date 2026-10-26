/** Portable Dockview split proportions. No persistence and no DOM mutation.
 * A caller chooses when to share its current geometry with another module.
 */
const validRatio=value=>Number.isFinite(value)&&value>=0.10&&value<=0.90;
const api=(view,id)=>view?.getPanel(id)?.group?.api;
export function readPaneRatios(view,leftId,sourceId,previewId){
  const left=api(view,leftId),source=api(view,sourceId),preview=api(view,previewId);
  if(!left||!source||!preview)return null;
  const width=left.width+source.width, height=source.height+preview.height;
  if(width<=0||height<=0)return null;
  const agRatio=left.width/width,sourceRatio=source.height/height;
  return validRatio(agRatio)&&validRatio(sourceRatio)?{agRatio,sourceRatio}:null;
}
export function applyPaneRatios(view,leftId,sourceId,previewId,ratios){
  if(!ratios||!validRatio(ratios.agRatio)||!validRatio(ratios.sourceRatio))return false;
  const left=api(view,leftId),source=api(view,sourceId),preview=api(view,previewId);
  if(!left||!source||!preview)return false;
  const width=left.width+source.width,height=source.height+preview.height;
  if(width<=0||height<=0)return false;
  left.setSize({width:Math.round(ratios.agRatio*width)});
  // Horizontal resizing can alter the viewport's available dimensions.
  const sourceNow=api(view,sourceId),previewNow=api(view,previewId);
  sourceNow.setSize({height:Math.round(ratios.sourceRatio*(sourceNow.height+previewNow.height))});
  return true;
}
