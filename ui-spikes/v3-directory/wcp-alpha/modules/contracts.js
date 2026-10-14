/** OCR2MD's own wire contract; WCP does not import this file or interpret media data. */
const str={type:'string',maxLength:5000};
const num={type:'integer'};
const bool={type:'boolean'};
const record=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
export const contracts=[
 {name:'document.snapshot',version:1,kind:'query',
  senders:['ocr2md:media','ocr2md:review'],receivers:['ocr2md:document'],
  payload:record({chapter:str}),response:record({chapter:str,text:{type:'string',maxLength:30000},revision:num,editing:bool})},
 {name:'document.media.apply',version:1,kind:'command',
  senders:['ocr2md:media'],receivers:['ocr2md:document'],
  payload:record({chapter:str,revision:num,image:str}),response:record({ok:bool,revision:num,localPath:str})},
 {name:'document.updated',version:1,kind:'event',
  senders:['ocr2md:document'],receivers:['ocr2md:media','ocr2md:review'],
  payload:record({chapter:str,revision:num,reason:str})},
];
