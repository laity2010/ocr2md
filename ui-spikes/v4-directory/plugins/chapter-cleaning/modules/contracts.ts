/** Stable chapter workflow module contract. Root delimitation works on DIRjson;
 * cleaning modules are read-only AG projections over a published chapter MD.
 * All editing/save ownership remains with the shared workbench/IR controllers.
 */
import type {Candidate} from "../../../../../src/types";
import type {WorkspaceFSV3,WorkspaceNode} from "../../../../../src/workspaceFsV3";
import type {ColDef} from "../../../../v2/node_modules/ag-grid-community";
export type CleaningModuleId="章节标题"|"媒体"|"表格"|"LaTeX";
/** A small, reusable, module-neutral document transaction port.
 * Modules do not receive Workbench, editors, AG instances or DOM handles.
 */
export interface ChapterDocumentPort {
  chapter():{book:string;path:string;text:string;editing:boolean;dirty:boolean;saving:boolean};
  transaction<T>(book:string,execute:(fs:WorkspaceFSV3,current:WorkspaceNode)=>
    Promise<{saved:true;path:string;file:WorkspaceNode;workingText:string;sha256:string;result:T}>):Promise<T>;
  revalidateUnchanged(book:string,path:string):Promise<boolean>;
  refreshGrid():void;
}
export interface ChapterGridView {
  readonly module:CleaningModuleId;
  readonly afterColId?:string;
  readonly columns:readonly ColDef<Candidate>[];
  /** Business-owned display order for base + injected columns. */
  readonly columnOrder?:readonly string[];
  project(rows:Candidate[],path:string):Candidate[];
}
export interface ChapterModuleDefinition {
  readonly id:"章节定界"|CleaningModuleId;
  readonly stage:"boundary"|"cleaning";
  readonly toolIds:readonly string[];
  readonly scan?:(md:string,path:string)=>Candidate[];
}
