/** OCR2MD owns these CQE contracts. The WCP router knows no Vault/IR business. */
const s=(maxLength=2000)=>({type:'string',maxLength});
const int={type:'integer'};
const o=(properties)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const req=(name,kind,fields,response)=>({name,version:1,kind,senders:['ocr2md:chapter-boundary'],receivers:['ocr2md:filesystem'],payload:o(fields),response:o(response)});
export const boundaryContracts=[
 {name:'workbench.chapter-selected',version:1,kind:'event',senders:['ocr2md:chapter-boundary'],receivers:['ocr2md:chapter-cleaning'],payload:o({book:s(),path:s()})},
 {name:'workbench.can-navigate',version:1,kind:'query',senders:['ocr2md:chapter-boundary'],receivers:['ocr2md:chapter-cleaning'],payload:o({}),response:o({ok:{type:'boolean'},error:s(500)})},
 {...req('boundary.fs.fetch','query',{op:s(20),path:s(),cursor:s(),nodeId:s(128),revision:s(256),offset:int,length:int},{data:s(113000),error:s(500)}),senders:['ocr2md:chapter-boundary','ocr2md:chapter-cleaning']},
 req('boundary.ir.load','query',{book:s()},{meta:s(64000),size:int,error:s(500)}),
 req('boundary.ir.chunk','query',{book:s(),offset:int},{data:s(62000),error:s(500)}),
 req('boundary.ir.markings.read','query',{book:s()},{data:s(64000),error:s(500)}),
 req('boundary.ir.markings.save','command',{book:s(),expectedGeneration:s(64),expectedRevision:s(256),requestId:s(100),markings:s(48000),overwrite:{type:'boolean'}},{data:s(6000),error:s(500)}),
 req('boundary.ir.begin','command',{book:s(),requestId:s(100),expectedGeneration:s(256),expectedMarkingsRevision:s(256)},{ok:{type:'boolean'},error:s(500)}),
 req('boundary.ir.append','command',{requestId:s(100),data:s(60000)},{ok:{type:'boolean'},error:s(500)}),
 req('boundary.ir.commit','command',{requestId:s(100)},{data:s(6000),error:s(500)}),
 req('boundary.ir.publish','command',{book:s(),expectedGeneration:s(256),expectedIrSha256:s(64),expectedMarkingsRevision:s(256)},{data:s(6000),error:s(500)}),
];
