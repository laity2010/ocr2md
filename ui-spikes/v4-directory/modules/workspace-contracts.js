/** OCR2MD-owned CQE v1 messages. WCP has zero knowledge of Vault paths. */
const s=(maxLength=8192)=>({type:'string',maxLength});
const b={type:'boolean'},n={type:'integer'};
const o=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const entry=o({nodeId:s(128),path:s(2000),name:s(512),kind:s(24),size:n,revision:s(256),modifiedAt:s(96)});
const empty=o({});
export const workspaceContracts=[
 {name:'workspace.status',version:1,kind:'query',senders:['ocr2md:workspace'],receivers:['ocr2md:filesystem'],payload:empty,
  response:o({authorized:b,canPairLocally:b,rootLabel:s(200),error:s(500)})},
 {name:'workspace.authorize',version:1,kind:'command',senders:['ocr2md:workspace'],receivers:['ocr2md:filesystem'],
  payload:o({key:s(256),pairOnMac:b}),response:o({authorized:b,canPairLocally:b,rootLabel:s(200),error:s(500)})},
 // Explicit handoff: credential remains within filesystem service, never crosses WCP bus.
 {name:'workspace.reuse-v3',version:1,kind:'command',senders:['ocr2md:workspace'],receivers:['ocr2md:filesystem'],
  payload:empty,response:o({authorized:b,canPairLocally:b,rootLabel:s(200),error:s(500)})},
 {name:'workspace.list',version:1,kind:'query',senders:['ocr2md:workspace'],receivers:['ocr2md:filesystem'],
  payload:o({path:s(2000),cursor:s(2000)}),response:o({path:s(2000),entries:{type:'array',items:entry},cursor:s(2000),error:s(500),truncated:b})},
 {name:'workspace.preview',version:1,kind:'query',senders:['ocr2md:workspace'],receivers:['ocr2md:filesystem'],
  payload:o({path:s(2000),nodeId:s(128),revision:s(256)}),response:o({text:s(24576),truncated:b,error:s(500)})},
 {name:'workspace.activate',version:1,kind:'command',senders:['ocr2md:workspace'],receivers:['ocr2md:filesystem'],
  payload:o({path:s(2000)}),response:o({selected:b,path:s(2000),pdfCount:n,error:s(500)})},
 {name:'workspace.current',version:1,kind:'query',senders:['ocr2md:workspace'],receivers:['ocr2md:filesystem'],
  payload:empty,response:o({path:s(2000),selected:b})},
 {name:'workspace.selected',version:1,kind:'event',senders:['ocr2md:filesystem'],receivers:['ocr2md:workspace'],
  payload:o({path:s(2000),pdfCount:n})},
];
