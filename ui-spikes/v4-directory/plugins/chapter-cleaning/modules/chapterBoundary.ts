/** DIRjson chapter delimitation stage. Source of truth stays in IrWorkbenchPanel.
 * Chapter-directory enumeration belongs to this stage, not the generic app.
 */
import {location,type WorkspaceFSV3,type WorkspaceNode} from "../../../../../src/workspaceFsV3";
import type {ChapterModuleDefinition} from "./contracts";

export const chapterBoundaryModule:ChapterModuleDefinition={
  id:"章节定界",stage:"boundary",toolIds:[],
};

export async function listPublishedChapterFiles(fs:WorkspaceFSV3,book:string):Promise<WorkspaceNode[]>{
  const dir=await fs.stat(location("obsidian-ocr2md",book+"/chapters"));
  if(dir.kind!=="directory")throw Error("章节路径不是目录");
  const files:WorkspaceNode[]=[];
  let cursor:string|undefined;
  do{
    const page=await fs.list(location("obsidian-ocr2md",book+"/chapters"),cursor);
    for(const item of page.entries)
      if(item.kind==="file"&&/\.md$/i.test(item.path)&&item.size<=512*1024)
        files.push(item);
    cursor=page.nextCursor;
  }while(cursor&&files.length<200);
  files.sort((a,b)=>a.path.localeCompare(b.path,"zh-CN"));
  return files;
}
