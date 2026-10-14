import {cleaningModule} from './cleaning.js';
export const modules=[cleaningModule];
const s=(n=2000)=>({type:'string',maxLength:n});
const o=p=>({type:'object',properties:p,required:Object.keys(p),additionalProperties:false});
const cmd=(name,fields,response)=>({name,version:1,kind:'command',senders:['ocr2md:chapter-cleaning'],receivers:['ocr2md:filesystem'],payload:o(fields),response:o(response)});
export const contracts=[
 cmd('clean.chapter.begin',{book:s(),filename:s(500),nodeId:s(128),expectedRevision:s(256),requestId:s(100)},{ok:{type:'boolean'},error:s(500)}),
 cmd('clean.chapter.append',{requestId:s(100),data:s(60000)},{ok:{type:'boolean'},error:s(500)}),
 cmd('clean.chapter.commit',{requestId:s(100)},{data:s(6000),error:s(500)}),
 cmd('clean.media.download',{book:s(),filename:s(500),nodeId:s(128),expectedRevision:s(256),sourceUrl:s(2048)},{data:s(6000),error:s(500)}),
];
