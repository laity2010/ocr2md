/** Independent event subscriber. No import/reference to the media module. */
let mountedSummary=null;
export const review={
 id:'ocr2md:review',name:'变更审计',version:'1.0.0',order:65,presentation:'dock',
 description:'只订阅 document.updated；不引用媒体模块',
 setup(bus){
  const changes=[];
  const off=bus.subscribe('document.updated',payload=>{
    changes.push(payload);
    const el=mountedSummary;
    if(el?.isConnected)el.textContent='已收到 '+changes.length+' 次 document.updated；最新修订 r'+payload.revision;
  });
  review.changes=changes;
  return off;
 },
 mount(host){
   const article=document.createElement('article');article.style.padding='20px';
   const heading=document.createElement('h3');heading.textContent='文档变更审计（独立订阅组件）';
   const summary=document.createElement('p');summary.id='wcp-review-count';
   summary.textContent='已收到 '+(review.changes?.length||0)+' 次 document.updated';
   mountedSummary=summary;
   article.append(heading,summary);host.replaceChildren(article);
 },
 unmount(host){mountedSummary=null;host.replaceChildren()}
};
