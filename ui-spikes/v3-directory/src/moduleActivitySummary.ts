/** One passive, event-driven status strip for the five V3 background modules.
 * No polling, no new network requests and no storage or editing side effects.
 */
export type ActivityModule="settings"|"workspace"|"workbench"|"dirjson"|"pdf";
export type ActivityLevel="idle"|"busy"|"ready"|"dirty"|"error";
export const ACTIVITY_MODULES=[
  ["settings","设置"],["workspace","工作目录"],
  ["workbench","工作台"],["dirjson","DIRjson"],["pdf","PDF"],
] as const satisfies readonly (readonly [ActivityModule,string])[];
export interface ModuleActivity{level:ActivityLevel;message:string;detail:string;}
const initial:Record<ActivityModule,ModuleActivity>={
  settings:{level:"busy",message:"等待空闲加载",detail:"工作目录优先；后台加载后开放设置"},
  workspace:{level:"busy",message:"正在连接",detail:"正在检查 Obsidian 工作目录访问"},
  workbench:{level:"idle",message:"未选择书籍",detail:"选择书籍后扫描 Markdown、PDF 与 OCR"},
  dirjson:{level:"idle",message:"等待书籍",detail:"书籍加载后读取已有 DIRjson 或初始化草稿"},
  pdf:{level:"idle",message:"未加载",detail:"选择书籍后按需加载 PDF 原文"},
};
export function activityLevel(message:string):ActivityLevel{
  if(/失败|错误|拒绝|异常|不可用|超时|未授权|尚未同步|需要授权|需在设置中授权|来源不一致|已变化|请修正/.test(message))return "error";
  if(/正在|读取中|加载中|扫描中|保存中|发布中|解析中|同步中|等待源码|等待字体|初始化中|渲染第|准备中|连接中/.test(message))return "busy";
  if(/待保存|尚未保存|未保存修改|已暂存/.test(message))return "dirty";
  if(/已连接|已加载|已就绪|已保存|已恢复|已发布|初始化完成|已生成|目录已就绪|完成|PDF 原文.*第 \d+\s*\/\s*\d+ 页/.test(message))return "ready";
  return "idle";
}
export class ModuleActivitySummary{
  readonly state:Record<ActivityModule,ModuleActivity>=structuredClone(initial);
  private readonly retainedReady=new Set<ActivityModule>();
  constructor(private readonly root:HTMLElement){
    this.root.setAttribute("aria-label","模块后台活动摘要");
    for(const [id] of ACTIVITY_MODULES)this.paint(id);
    this.updateVisibility();
  }
  /** Keep an explicit completed task visible until its owning view changes. */
  retainCompleted(id:ActivityModule,enabled:boolean):void{
    if(enabled)this.retainedReady.add(id);else this.retainedReady.delete(id);
    this.paint(id);this.updateVisibility();
  }
  /** A completed or not-yet-started module is absent from the visual strip.
   * Unresolved errors and unsaved drafts remain actionable. Never poll. */
  private updateVisibility():void{
    this.root.hidden=!ACTIVITY_MODULES.some(([id])=>
      this.state[id].level==="busy"||this.state[id].level==="dirty"||
      this.state[id].level==="error"||
      (this.state[id].level==="ready"&&this.retainedReady.has(id)));
  }
  update(id:ActivityModule,message:string,level:ActivityLevel=activityLevel(message),detail=message):void{
    const trimmed=message.replace(/\s+/g," ").trim();
    if(!trimmed)return;
    const next={message:trimmed,level,detail:detail.trim()||trimmed};
    const prev=this.state[id];
    if(prev.message===next.message&&prev.level===next.level&&prev.detail===next.detail)return;
    this.state[id]=next;
    this.paint(id);
    this.updateVisibility();
  }
  private paint(id:ActivityModule):void{
    const slot=this.root.querySelector<HTMLElement>(`[data-module-status="${id}"]`);
    if(!slot)return;
    const state=this.state[id];
    slot.dataset.level=state.level;
    slot.dataset.summary=state.message;
    slot.hidden=state.level==="idle"||
      (state.level==="ready"&&!this.retainedReady.has(id));
    slot.title=`${ACTIVITY_MODULES.find(entry=>entry[0]===id)![1]} · ${state.detail}`;
    const value=slot.querySelector<HTMLElement>("[data-activity-value]");
    if(value)value.textContent=state.message;
  }
}
