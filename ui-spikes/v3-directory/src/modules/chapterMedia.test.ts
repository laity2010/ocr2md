import {strict as assert} from "node:assert";
import {ChapterMediaController,chapterMediaColumns} from "./chapterMedia";
import type {ChapterDocumentPort} from "./contracts";

const urls=["good.png","missing.png","conflict.png","after.png"].map(
  name=>"https://example.com/"+name);
const book="/ocr2md/Book",path=book+"/chapters/01.md";
const source=(values:string[])=>values.map((url,i)=>
  `[图片来源 ${i+1}（仅链接，不自动载入）](${url})`).join("\n");
function fixture(mode:"normal"|"resume"|"changed"|"auth"){
  const doc:{book:string;path:string;text:string;editing:boolean;dirty:boolean;saving:boolean}={
    book,path,text:source(urls),editing:true,dirty:false,saving:false,
  };
  const attempted:string[]=[];
  let rendered=0;
  const port:ChapterDocumentPort={
    chapter:()=>({...doc}),
    refreshGrid:()=>{rendered++},
    revalidateUnchanged:async()=>mode==="resume",
    transaction:async(_book,execute)=>{
      // Only this mock port owns transaction, the media module cannot edit doc directly.
      const index=attempted.length;
      const url=urls[index];attempted.push(url);
      if(index===1)throw {code:"EOFFLINE",message:"HTTP 404"};
      if(index===2)throw {code:"ESTALE",message:"CAS revision changed"};
      if(mode==="auth"&&index===0)throw {code:"EACCES",status:403,message:"Access denied"};
      const local="imgs/"+url.split("/").at(-1);
      doc.text=doc.text.replace(url,local);
      return local as Awaited<ReturnType<typeof execute>>["result"];
    },
  };
  return {doc,port,attempted,get rendered(){return rendered}};
}

async function main():Promise<void>{
for(const mode of ["normal","resume","changed"] as const){
  const data=fixture(mode);
  const media=new ChapterMediaController(data.port,()=>{});
  assert.equal(media.gridView.module,"媒体");
  assert.deepEqual(media.gridView.columnOrder,[
    "mediaGroup","mediaTaskStatus","mediaTaskReason",
    "mediaThumbnail","mediaFileName","mediaSize"]);
  assert.deepEqual(chapterMediaColumns.map(column=>column.colId),["mediaTaskStatus","mediaTaskReason"]);
  assert.equal(media.pending().length,4);
  const form=media.toolState();
  assert.equal(form.disabled,false);
  await media.download(book);
  assert.equal(media.running,false);
  assert.equal(media.task?.phase,"done");
  assert.ok(data.rendered>0);
  const originals=urls.map((url,i)=>({id:String(i),range:{line:i,from:0,to:0},raw:url,
    mediaSourceUrl:url}));
  const rows=media.gridView.project(originals,path);
  assert.equal(rows.length,4);
  if(mode==="resume"){
    assert.deepEqual(data.attempted,urls);
    assert.equal(media.task?.succeeded,2);
    assert.equal(media.task?.failed,2);
    assert.equal(media.task?.total-media.task!.processed,0);
    assert.equal(rows[2].mediaTaskStatus,"失败");
    assert.match(rows[2].mediaTaskReason??"",/章节正文未变/);
  }else{
    assert.deepEqual(data.attempted,urls.slice(0,3));
    assert.equal(media.task?.succeeded,1);
    assert.equal(media.task?.failed,2);
    assert.equal(rows[3].mediaTaskStatus,"未处理");
    assert.match(media.task?.stopReason??"",/版本冲突/);
  }
  // Switching chapter must never leak prior AG status into another chapter.
  assert.ok(media.gridView.project(originals,book+"/chapters/02.md")
    .every(row=>row.mediaTaskStatus===undefined));
}
console.log("V3_MEDIA_MODULE_INDEPENDENT_CORE_PASS");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
