/** Bridge v3 directory settings into v2's shared TableConfigurationGrid contract.
 * Config rendering and filtering live in v2; no duplicate settings table here.
 */
import { configurationValuePreview, type TableConfigurationRow } from "../../v2/src/tableConfigurationGrid";
import type { TablePresentationSettingDescriptor } from "../../v2/src/tablePresentationConfig";
import type { DirectorySettings } from "./settings";

interface SettingDetail {
  group: string;
  description: string;
}
const DETAILS: Record<keyof DirectorySettings, SettingDetail> = {
  gridFontSize: {group: "表格外观", description: "目录表格字体字号（12–20 px）"},
  gridDensity: {group: "表格外观", description: "行高：compact / standard / comfortable"},
  showTypeColumn: {group: "表格列", description: "显示类型列"},
  showSizeColumn: {group: "表格列", description: "显示文件大小列"},
  showModifiedColumn: {group: "表格列", description: "显示文件修改时间列"},
  showRevisionColumn: {group: "表格列", description: "显示文件版本列"},
  foldersFirst: {group: "目录浏览", description: "目录在文件前显示"},
  autoRefreshSeconds: {group: "目录浏览", description: "自动刷新（0 / 30 / 60 / 300 秒）"},
  showFileOperations: {group: "文件交互", description: "显示下方文件操作区"},
  clickFileReads: {group: "文件交互", description: "点选文件时同步将完整正文填入文件操作框（源码窗始终显示限量预览）"},
  workbenchGridFontSize: {group:"AG 表样式 · V2",description:"章节定界、逻辑块和旧版审核 AG 字号（11–22 px）"},
  workbenchGridRowHeight: {group:"AG 表样式 · V2",description:"正文 AG 行高基准（28–74 px）；标题行按 H1–H6 自动增高"},
  mdSourceFontSize: {group:"MD 源码 · V2",description:"CodeMirror 源码基础字号（11–24 px）"},
  mdPreviewFontSize: {group:"MD 预览 · V2",description:"Markdown 预览基础字号（11–26 px）"},
  mdPreviewLineHeight: {group:"MD 预览 · V2",description:"Markdown 预览行距倍率（1–2.5）"},
  mdSourceLineHeight: {group:"MD 源码 · V2",description:"CodeMirror 源码行距倍率（1–2.5）"},
  mdCodeColors: {group:"MD 源码 · V2",description:"V2 同款 Markdown / LaTeX 十一种代码高亮颜色（#RRGGBB）"},
  mdFontFamily: {group:"MD 源码/预览 · V2",description:"字体类型：sarasa（默认，更纱等宽中文）或 system（可选系统字体）"},
  mdShowHardReturns: {group:"统一源码样式 · V3",description:"所有源码窗默认显示 ↵ 硬回车标记，可关闭（不改正文）"},
  mdHardReturnColor: {group:"统一源码样式 · V3",description:"所有源码窗 ↵ 硬回车标记颜色 #RRGGBB（在右侧配置源码编辑）"},
  agSourceScenes: {group:"AG＋源码 · 共用组件",description:"directory/boundary/cleaning/settings 四场景的字号、行距、↵ 开关和颜色覆写；null 继承通用设置。只调整展示，不改变编辑权限与保存规则"},
  pdfTheme: {group:"PDF 阅读",description:"PDF.js 页面主题 dark / light，默认深色；只修改显示，不修改原 PDF"},
  mdHeadingSizes: {group:"MD 六级标题 · V2",description:"H1–H6 六个字号倍率（对 AG、源码和预览共用），例如 [2.125,1.625,1.375,1.25,1.125,1.125]"},
  mdHeadingColors: {group:"MD 六级标题 · V2",description:"H1–H6 六个 #RRGGBB 颜色（AG、源码和预览共用）"},
};

/** V2 standard: AG rows list structured settings; JSON is the sole editor.
 * This deliberately retains each object/array as one JSON setting row. */
export function v3DirectoryConfigRows(settings:DirectorySettings):TableConfigurationRow[]{
  return (Object.keys(DETAILS) as (keyof DirectorySettings)[]).map(key=>{
    const value=settings[key],detail=DETAILS[key];
    const kind=typeof value==="boolean"?"boolean":"json";
    const descriptor:TablePresentationSettingDescriptor={
      id:"v3-dir:"+key,
      control:detail.group.includes("MD ")||detail.group.includes("AG 表")||
        detail.group.includes("PDF ")||detail.group.includes("统一源码")||detail.group.includes("AG＋源码")?"工作台":"工作目录",
      functionGroup:detail.group,key,description:detail.description,
      legacyPath:[key],kind,keywords:[key,detail.group,detail.description],
    };
    return {id:descriptor.id,control:descriptor.control,
      functionGroup:detail.group,key,kind,description:detail.description,
      valuePreview:configurationValuePreview(value),
      booleanValue:kind==="boolean"?value===true:undefined,descriptor};
  });
}
