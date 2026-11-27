/** WP04 browser-local draft only. WP05 owns trans export. */
import {inputJSONPath} from './export-json.js';
export const PROMPT_KEY='ocr2md.lab-translation.prompt.md.v1';
export const DEFAULT_PROMPT=`# OCR2MD · 独立校译任务书 V1

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
export function createPromptStorage(storage){
  return Object.freeze({
    read(){
      const stored=storage.getItem(PROMPT_KEY);
      return Object.freeze({stored,text:stored??DEFAULT_PROMPT});
    },
    save(text,expected){
      if(typeof text!=='string')throw Error('Prompt 必须为文本');
      if(storage.getItem(PROMPT_KEY)!==expected)throw Error('其他页面已更新 Prompt，请先备份当前草稿再重新加载');
      storage.setItem(PROMPT_KEY,text);
      return Object.freeze({stored:text,text});
    }
  });
}


/** Runtime parameters are derived from the verified export, never a second
 * language/task authority. No filesystem existence or write is implied. */
export function createPromptParameters(artifact,workspace,exportVerified=false){
  const head='\n\n## 本次任务参数（自动生成）\n\n';
  if(!artifact||!workspace)return head+'- 状态：尚无有效译句表，不能执行校译任务。\n';
  const task=JSON.parse(artifact.text);
  const directory=workspace.replace(/\/+$/,'')+'/trans';
  const fields={
    input_json:inputJSONPath(workspace),
    input_status:exportVerified?'本次导出已写入或复用，并回读验证一致；执行前仍核对 task_id。':'尚未核验当前文件；请先在 JSON 窗点击「导出 JSON」，直接保存至 input_json。',
    target_language:task.target_language,
    task_id:task.task_id,
    source_sha256:task.source_sha256,
    sentence_sha256:task.sentence_sha256,
    schema:task.schema,
    sentence_count:artifact.count,
    AI_ID:'执行者自行确定唯一标识',
    result_json:directory+'/AI_ID.json'
  };
  return head+Object.entries(fields).map(([key,value])=>'- '+key+': '+JSON.stringify(value)).join('\n')+'\n';
}
