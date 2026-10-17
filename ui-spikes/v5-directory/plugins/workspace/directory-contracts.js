/** Workspace-only CQE v1. No DIRjson, OCR, chapter or general file mutation APIs. */
const s=(maxLength=8192)=>({type:'string',maxLength});
const b={type:'boolean'},n={type:'integer'};
const o=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const empty=o({});
const entry=o({nodeId:s(128),path:s(2000),name:s(512),kind:s(24),size:n,revision:s(256),modifiedAt:s(96)});
const messages=[
 ['workspace.status','query',empty,o({authorized:b,canPairLocally:b,rootLabel:s(200),error:s(500)})],
 ['workspace.authorize','command',o({key:s(256),pairOnMac:b}),o({authorized:b,canPairLocally:b,rootLabel:s(200),error:s(500)})],
 ['workspace.reuse-v3','command',empty,o({authorized:b,canPairLocally:b,rootLabel:s(200),error:s(500)})],
 ['workspace.list','query',o({path:s(2000),cursor:s(2000)}),o({path:s(2000),entries:{type:'array',items:entry},cursor:s(2000),error:s(500),truncated:b})],
 ['workspace.preview','query',o({path:s(2000),nodeId:s(128),revision:s(256)}),o({text:s(24576),truncated:b,error:s(500)})],
 ['workspace.activate','command',o({path:s(2000)}),o({selected:b,path:s(2000),pdfCount:n,error:s(500)})],
 ['workspace.current','query',empty,o({path:s(2000),selected:b})],
];
export const directoryContracts=Object.freeze([
 ...messages.map(([name,kind,payload,response])=>Object.freeze({
  name,version:1,kind,payload,response,
  senders:['ocr2md:workspace'],receivers:['ocr2md:directory'],
 })),
 {name:'workspace.selected',version:1,kind:'event',senders:['ocr2md:directory'],
  receivers:['ocr2md:workspace'],payload:o({path:s(2000),pdfCount:n})},
]);
