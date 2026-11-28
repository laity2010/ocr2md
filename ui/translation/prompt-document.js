/** WP04 browser-local draft only. WP05 owns trans export. */
import {inputJSONPath} from './export-json.js';
import {sha256} from './original-sentences.js';
export const PROMPT_KEY='ocr2md.lab-translation.prompt.md.v1';
const LEGACY_DEFAULT_PROMPT=`# OCR2MD · 独立校译任务书 V1

通过 AgentDock 连接 Mac，按文末「本次任务参数」读取 input_json 指定的文件，核对任务身份与 target_language 后再执行。确定自己的唯一 AI_ID，例如 gpt、grok、muse。

## 任务要求

1. 以完整 MDLine 为上下文，理解其中所有句子的语义、术语及相互关系。
2. 对每个 Sentence 进行原文拼写检查，修正明确的拼写错误及 OCR 识别错误。
3. 基于校正后的原文，生成 target_language 指定语言的译文。
4. 严格遵守已有分句，不得重新分句、合并或拆分句记录。
5. 不得润色、改写或改变作者原意。
6. 完整保留所有保护占位符，不得删除、复制、修改或跨句移动。
7. 原文无错误时，仍须返回完整的 corrected。
8. 逐句返回 corrected 和 translated，并保留 source_line、sentence_index。
9. 原样返回输入任务的 task_id、source_sha256、sentence_sha256 和 target_language。
10. 将校译结果以 UTF-8 JSON 保存为任务目录下的 AI_ID.json。

不得修改 sentences.json、prompt.md、SQLite、Markdown 或其他 AI 的结果。
允许分批完成任务。尚未完成的句子不得伪造结果，最终报告实际覆盖率。
所有 AI 必须独立完成校译。
`;
export const DEFAULT_PROMPT=LEGACY_DEFAULT_PROMPT
  .replace("通过 AgentDock 连接 Mac，按文末「本次任务参数」读取 input_json 指定的文件，核对任务身份与 target_language 后再执行。确定自己的唯一 AI_ID，例如 gpt、grok、muse。","## 任务领取\n\n按文末「本次任务参数」指定的交接方式领取完整 input_json。Google Drive 任务通过已授权的 Drive 连接器、MCP 或其他 Drive 工具直接读取，不需要连接 Mac 或 AgentDock；本机任务才通过 AgentDock。核对 schema、task_id、source_sha256、sentence_sha256、target_language 和 sentence_count。确定自己的唯一 AI_ID，例如 gpt、grok、muse、gemini。")
  .replace("9. 原样返回输入任务的 task_id、","9. 原样返回输入任务的 schema、task_id、")
  .replace("10. 将校译结果以 UTF-8 JSON 保存为任务目录下的 AI_ID.json。","10. 所有 AI 必须独立完成校译，不得读取或参考其他 AI 的结果。\n\n## 输出结构\n\n输出 UTF-8 标准 JSON，顶层字段为 schema、task_id、source_sha256、sentence_sha256、target_language、AI_ID、results。results 是按原句序排列的数组，每项仅包含 source_line、sentence_index、corrected、translated；不得遗漏或重复。\n\n## 任务交付\n\nGoogle Drive 任务：将完整校译结果以 AI_ID.json 上传到 output_directory（输入文件所在原目录）；必须是真正的 JSON 文件，不得转成 Google Docs/Sheets。本机任务：写入 result_json 指定路径。只写自己的结果，上传后回读核对任务身份、句数、占位符及 JSON 格式；报告实际覆盖率、文件大小及结果文件链接（Drive 任务）。无法领取或上传时如实报告具体阻塞，不得冒称完成。");
export function createPromptStorage(storage){
  return Object.freeze({
    read(){
      const stored=storage.getItem(PROMPT_KEY);
      return Object.freeze({stored,text:stored===LEGACY_DEFAULT_PROMPT?DEFAULT_PROMPT:stored??DEFAULT_PROMPT});
    },
    save(text,expected){
      if(typeof text!=='string')throw Error('Prompt 必须为文本');
      if(storage.getItem(PROMPT_KEY)!==expected)throw Error('其他页面已更新 Prompt，请先备份当前草稿再重新加载');
      storage.setItem(PROMPT_KEY,text);
      return Object.freeze({stored:text,text});
    }
  });
}


/** Read the optional task handoff through the existing authorized F02 port.
 * No user links in shared releases or in exported JSON bytes. */
export async function loadDriveHandoff(artifact,workspace,io){
  if(!artifact||!workspace)return null;
  try{
    const file=await io.readFile(workspace,'trans/drive-handoff.json');
    if(file.path!=='trans/drive-handoff.json'||typeof file.contentBase64!=='string'||file.contentBase64.length>16384)return null;
    const bytes=Uint8Array.from(atob(file.contentBase64),c=>c.charCodeAt(0));
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(bytes.length!==file.size||await sha256(text)!==file.sha256)return null;
    const value=JSON.parse(text),task=JSON.parse(artifact.text);
    if(value.schema!=='ocr2md-drive-handoff/v1'||value.task_id!==task.task_id||
       value.input_sha256!==await sha256(artifact.text)||
       typeof value.input_json!=='string'||typeof value.output_directory!=='string'||
       !/^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view(?:\?usp=drivesdk)?$/.test(value.input_json)||
       !/^https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+$/.test(value.output_directory))return null;
    return Object.freeze({input_json:value.input_json,output_directory:value.output_directory,task_id:value.task_id});
  }catch{return null;}
}

/** Runtime parameters are derived from the verified export, never a second
 * language/task authority. No filesystem existence or write is implied. */
export function createPromptParameters(artifact,workspace,exportVerified=false){
  const head='\n\n## 本次任务参数（自动生成）\n\n';
  if(!artifact||!workspace)return head+'- 状态：尚无有效译句表，不能执行校译任务。\n';
  const task=JSON.parse(artifact.text);
  const directory=workspace.replace(/\/+$/,'')+'/trans';
  const handoff=artifact.driveHandoff?.task_id===task.task_id?artifact.driveHandoff:null;
  const fields={
    ...(handoff?{handoff:'Google Drive（仅使用下列 Drive 链接，不连接 Mac/AgentDock；本参数优先于旧版正文中的交接方式）',input_json:handoff.input_json,input_status:'登记时已核对 Drive JSON 与本地任务字节一致；执行前仍须读取完整文件核对任务身份。',output_directory:handoff.output_directory,result_filename:'AI_ID.json'}:{
    input_json:inputJSONPath(workspace),
    input_status:exportVerified?'本次导出已写入或复用，并回读验证一致；执行前仍核对 task_id。':'尚未核验当前文件；请先在 JSON 窗点击「导出 JSON」，直接保存至 input_json。',result_json:directory+'/AI_ID.json'}),
    target_language:task.target_language,
    task_id:task.task_id,
    source_sha256:task.source_sha256,
    sentence_sha256:task.sentence_sha256,
    schema:task.schema,
    sentence_count:artifact.count,
    AI_ID:'执行者自行确定唯一标识'
  };
  return head+Object.entries(fields).map(([key,value])=>'- '+key+': '+JSON.stringify(value)).join('\n')+'\n';
}


/** User-gesture clipboard write; no selection, persistence, or server IO. */
export async function copyPromptText(text,clipboard=globalThis.navigator?.clipboard){
  if(typeof text!=='string'||!text)throw Error('没有可复制的 Prompt');
  if(typeof clipboard?.writeText!=='function')throw Error('当前浏览器剪贴板不可用，请使用 HTTPS 或手动复制');
  await clipboard.writeText(text);
}
