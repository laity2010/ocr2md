/** Small dependency-free ZIP (stored entries only) for IR-WP6 export.
 * Deterministic local bytes; no server, filesystem or external API calls.
 */
import {encodeDocumentIrV1,type DocumentIrV1} from "./documentIrV1";
import {validateIrMarkdownBundle,generateIrWholeBookMarkdown,
  isIrChapterDelimitationConfirmed,isIrChapterFileLayoutReady,
  type IrMarkdownBundleV1} from "./documentIrMarkdown";
const enc=new TextEncoder();
const u16=(v:DataView,n:number,o:number)=>v.setUint16(o,n,true);
const u32=(v:DataView,n:number,o:number)=>v.setUint32(o,n>>>0,true);
function crc32(bytes:Uint8Array):number{
  let c=0xffffffff;
  for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}
  return (c^0xffffffff)>>>0;
}
export interface IrArchive {readonly bytes:Uint8Array;readonly count:number;readonly size:number;}
export function buildIrMarkdownArchive(doc:DocumentIrV1,bundle:IrMarkdownBundleV1):IrArchive{
  validateIrMarkdownBundle(doc,bundle);
  // A user can explicitly publish file boundaries before reviewing each OCR
  // heading; never falsely change individual candidates to 'confirmed'.
  const approved=isIrChapterDelimitationConfirmed(doc);
  const fileReady=isIrChapterFileLayoutReady(doc);
  const files=fileReady?[...bundle.files]:[generateIrWholeBookMarkdown(doc,bundle)];
  const manifest={...bundle,projectionState:approved?"confirmed-chapters":
    fileReady?"chapter-files-for-cleaning":"whole-book-unreviewed",
    files:files.map(({content,...meta})=>meta)};
  const members=[{name:"document-ir.v1.json",bytes:encodeDocumentIrV1(doc)},
    {name:"document-ir.markdown-manifest.v1.json",bytes:enc.encode(JSON.stringify(manifest,null,2)+"\n")},
    ...files.map(f=>({name:"chapters/"+f.path.split("/").at(-1),bytes:enc.encode(f.content)}))];
  const unique=new Set<string>();
  for(const file of members){
    if(unique.has(file.name)||file.name.startsWith("/")||file.name.includes("..")||
       file.name.includes("\\")||file.name.includes("\u0000"))throw Error("Unsafe ZIP member");
    unique.add(file.name);
  }
  const locals:Uint8Array[]=[],centrals:Uint8Array[]=[];let offset=0;
  for(const file of members){
    const name=enc.encode(file.name),data=file.bytes;
    if(data.length>0xffffffff||name.length>65535)throw Error("IR ZIP member too large");
    const crc=crc32(data);
    const local=new Uint8Array(30+name.length+data.length),lv=new DataView(local.buffer);
    u32(lv,0x04034b50,0);u16(lv,20,4);u16(lv,0x0800,6); // UTF-8
    u32(lv,crc,14);u32(lv,data.length,18);u32(lv,data.length,22);u16(lv,name.length,26);
    local.set(name,30);local.set(data,30+name.length);locals.push(local);
    const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);
    u32(cv,0x02014b50,0);u16(cv,20,4);u16(cv,20,6);u16(cv,0x0800,8);
    u32(cv,crc,16);u32(cv,data.length,20);u32(cv,data.length,24);u16(cv,name.length,28);
    u32(cv,offset,42);central.set(name,46);centrals.push(central);
    offset+=local.length;
  }
  const centralSize=centrals.reduce((n,c)=>n+c.length,0);
  const end=new Uint8Array(22),dv=new DataView(end.buffer);
  u32(dv,0x06054b50,0);u16(dv,members.length,8);u16(dv,members.length,10);
  u32(dv,centralSize,12);u32(dv,offset,16);
  const all=[...locals,...centrals,end];const result=new Uint8Array(all.reduce((n,b)=>n+b.length,0));
  let pos=0;for(const item of all){result.set(item,pos);pos+=item.length;}
  return {bytes:result,count:members.length,size:result.length};
}
