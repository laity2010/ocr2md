/** OCR2MD-owned, Alpha-only document authority. Never opens Mac Vault or writes files. */
const chapter='alpha/chapters/01.md';
const state={chapter,revision:1,editing:true,
 text:'# OCR2MD 媒体模块独立通信验收\n\n'+
      '![第一张图片](https://assets.example.invalid/a.png)\n\n'+
      '![第二张图片](https://assets.example.invalid/b.png)\n\n'+
      '没有图片下载网络访问：仅以真实 OCR 扫描算法定位媒体引用，并在内存里模拟采用路径。'};
export const documentService={
 id:'ocr2md:document',name:'文档数据服务',version:'1.0.0',presentation:'service',
 description:'唯一文档权威源：仅 Alpha 内存数据，禁止文件读写',
 setup(bus){
  const offQuery=bus.handle('document.snapshot',({chapter:requested})=>{
    if(requested!==state.chapter)throw Error('DOCUMENT_NOT_FOUND');
    return {...state};
  });
  const offCommand=bus.handle('document.media.apply',async ({chapter:requested,revision,image})=>{
    if(requested!==state.chapter||revision!==state.revision)throw Error('DOCUMENT_CONFLICT');
    if(!state.editing||!/^https:\/\/assets\.example\.invalid\/[ab]\.png$/.test(image)||!state.text.includes(image))
      throw Error('MEDIA_NOT_AVAILABLE');
    const localPath='assets/'+image.split('/').at(-1);
    state.text=state.text.replace(image,localPath);
    state.revision++;
    await bus.publish('document.updated',{chapter:state.chapter,revision:state.revision,reason:'media-replaced'});
    return {ok:true,revision:state.revision,localPath};
  });
  return ()=>{offQuery();offCommand()};
 }
};
