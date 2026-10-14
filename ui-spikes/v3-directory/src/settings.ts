/** Only presentation/interaction settings. Never serialize the Vault access key. */
export type Density = "compact" | "standard" | "comfortable";
/** Per-scene presentation overrides; null means inherit the common style.
 * Editing permissions, document lifecycle, and save authority are NOT settings. */
export type AgSourceScene="directory"|"boundary"|"cleaning"|"settings";
export interface AgSourceStyle {
  gridFontSize:number;sourceFontSize:number;sourceLineHeight:number;
  hardReturns:boolean;hardReturnColor:string;
}
export type AgSourceStyleOverride={
  [K in keyof AgSourceStyle]:AgSourceStyle[K]|null;
};
export type AgSourceSceneSettings=Record<AgSourceScene,AgSourceStyleOverride>;
export const AG_SOURCE_SCENES:readonly AgSourceScene[]=["directory","boundary","cleaning","settings"];
const inheritedStyle=():AgSourceStyleOverride=>({gridFontSize:null,sourceFontSize:null,
  sourceLineHeight:null,hardReturns:null,hardReturnColor:null});
export const DEFAULT_AG_SOURCE_SCENES:AgSourceSceneSettings={
  directory:inheritedStyle(),boundary:inheritedStyle(),
  cleaning:inheritedStyle(),settings:inheritedStyle(),
};

export interface DirectorySettings {
  gridFontSize: number;
  gridDensity: Density;
  showTypeColumn: boolean;
  showSizeColumn: boolean;
  showModifiedColumn: boolean;
  showRevisionColumn: boolean;
  foldersFirst: boolean;
  autoRefreshSeconds: 0 | 30 | 60 | 300;
  showFileOperations: boolean;
  clickFileReads: boolean;
  /** Shared V2-inspired AG, CodeMirror and Markdown projection typography. */
  workbenchGridFontSize: number;
  workbenchGridRowHeight: number;
  mdSourceFontSize: number;
  mdPreviewFontSize: number;
  mdPreviewLineHeight: number;
  mdSourceLineHeight: number;
  mdCodeColors: Record<string,string>;
  mdFontFamily: "sarasa" | "system";
  mdShowHardReturns: boolean;
  mdHardReturnColor: string;
  agSourceScenes: AgSourceSceneSettings;
  /** Presentation-only PDF.js canvas color theme; never changes PDF source bytes. */
  pdfTheme: "dark" | "light";
  mdHeadingSizes: number[];
  mdHeadingColors: string[];
}
export const DIRECTORY_SETTINGS_KEY = "ocr2md-v3-directory-settings-v1";
export const DEFAULT_DIRECTORY_SETTINGS: DirectorySettings = {
  gridFontSize: 14,
  gridDensity: "standard",
  showTypeColumn: true,
  showSizeColumn: true,
  showModifiedColumn: true,
  showRevisionColumn: false,
  foldersFirst: true,
  autoRefreshSeconds: 0,
  showFileOperations: true,
  clickFileReads: false,
  workbenchGridFontSize: 13,
  workbenchGridRowHeight: 38,
  mdSourceFontSize: 13,
  mdPreviewFontSize: 14,
  mdPreviewLineHeight: 1.65,
  mdSourceLineHeight: 1.5,
  mdCodeColors: {comment:"#859289",link:"#83c092",url:"#7fbbb3",function:"#7fbbb3",
    keyword:"#d699b6",operator:"#83c092",property:"#a7c080",string:"#a7c080",
    tag:"#da6362",value:"#dbbc7f",punctuation:"#9aa79d"},
  mdFontFamily: "sarasa",
  mdShowHardReturns: true,
  mdHardReturnColor: "#839ab5",
  agSourceScenes:DEFAULT_AG_SOURCE_SCENES,
  pdfTheme: "dark",
  mdHeadingSizes: [2.125,1.625,1.375,1.25,1.125,1.125],
  mdHeadingColors: ["#da6362","#d77f48","#bf983d","#899c40","#569d79","#b87b9d"],
};
export function parseDirectorySettings(value: unknown): DirectorySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("配置必须是 JSON 对象");
  const v = value as Record<string, unknown>;
  const keys = Object.keys(DEFAULT_DIRECTORY_SETTINGS);
  const unknown = Object.keys(v).filter(k => !keys.includes(k));
  if (unknown.length) throw new Error("未知配置项：" + unknown.join("、"));
  const merged = { ...DEFAULT_DIRECTORY_SETTINGS, ...v };
  // Older V3 wrote `monospace` even when the UI was already rendering Sarasa.
  // Canonicalize that old *label* on read; preserve explicitly chosen system.
  if((v as Record<string,unknown>).mdFontFamily==="monospace")merged.mdFontFamily="sarasa";
  // V1 persisted the former OFF-by-default hard-return setting even for users
  // who never touched it. New color field marks a one-time opt-in migration;
  // subsequent explicit false values are preserved exactly.
  if (!("mdHardReturnColor" in v)) merged.mdShowHardReturns = true;
  if (!Number.isInteger(merged.gridFontSize) || merged.gridFontSize < 12 || merged.gridFontSize > 20) {
    throw new Error("gridFontSize 必须在 12–20 之间");
  }
  if (!["compact", "standard", "comfortable"].includes(merged.gridDensity)) throw new Error("gridDensity 值不正确");
  for (const [key,min,max] of [
    ["workbenchGridFontSize",11,22],["workbenchGridRowHeight",28,74],
    ["mdSourceFontSize",11,24],["mdPreviewFontSize",11,26],
  ] as const){
    const size=merged[key];
    if(!Number.isInteger(size)||size<min||size>max)throw new Error(`${key} 必须在 ${min}–${max} 之间`);
  }
  for (const key of ["mdPreviewLineHeight","mdSourceLineHeight"] as const) {
    if(typeof merged[key]!=="number"||!Number.isFinite(merged[key])||merged[key]<1||merged[key]>2.5)
      throw new Error(`${key} 必须在 1–2.5 之间`);
  }
  if(!merged.mdCodeColors||typeof merged.mdCodeColors!=="object"||Array.isArray(merged.mdCodeColors)||
    Object.keys(merged.mdCodeColors).sort().join("|")!==Object.keys(DEFAULT_DIRECTORY_SETTINGS.mdCodeColors).sort().join("|")||
    Object.values(merged.mdCodeColors).some(x=>typeof x!=="string"||!/^#[0-9a-fA-F]{6}$/.test(x)))
    throw new Error("mdCodeColors 必须包含 V2 的全部代码高亮颜色，并使用 #RRGGBB");
  if(typeof merged.mdHardReturnColor!=="string"||
    !/^#[0-9a-fA-F]{6}$/.test(merged.mdHardReturnColor))
    throw new Error("mdHardReturnColor 必须为 #RRGGBB 颜色");
  // Legacy stored V3 preferences did not include the scene matrix.
  const rawScenes=merged.agSourceScenes;
  if(!rawScenes||typeof rawScenes!=="object"||Array.isArray(rawScenes)||
    Object.keys(rawScenes).sort().join("|")!==[...AG_SOURCE_SCENES].sort().join("|"))
    throw Error("agSourceScenes 必须包含 directory/boundary/cleaning/settings 四个场景");
  const normalized={} as AgSourceSceneSettings;
  for(const scene of AG_SOURCE_SCENES){
    const raw=rawScenes[scene] as AgSourceStyleOverride;
    if(!raw||typeof raw!=="object"||Array.isArray(raw)||
      Object.keys(raw).sort().join("|")!==Object.keys(inheritedStyle()).sort().join("|"))
      throw Error(`agSourceScenes.${scene} 配置属性不完整`);
    const sizeChecks:[[keyof AgSourceStyleOverride,number,number],
      [keyof AgSourceStyleOverride,number,number],
      [keyof AgSourceStyleOverride,number,number]]=[
      ["gridFontSize",11,22],["sourceFontSize",11,24],["sourceLineHeight",1,2.5]];
    for(const [key,min,max] of sizeChecks){
      const value=raw[key];
      if(value!==null&&(typeof value!=="number"||!Number.isFinite(value)||value<min||value>max||
        (key!=="sourceLineHeight"&&!Number.isInteger(value))))
        throw Error(`agSourceScenes.${scene}.${key} 必须为空或 ${min}–${max}`);
    }
    if(raw.hardReturns!==null&&typeof raw.hardReturns!=="boolean")
      throw Error(`agSourceScenes.${scene}.hardReturns 必须为空或布尔值`);
    if(raw.hardReturnColor!==null&&(typeof raw.hardReturnColor!=="string"||
      !/^#[0-9a-fA-F]{6}$/.test(raw.hardReturnColor)))
      throw Error(`agSourceScenes.${scene}.hardReturnColor 必须为空或 #RRGGBB`);
    normalized[scene]={...raw};
  }
  merged.agSourceScenes=normalized;
  if(!["dark","light"].includes(merged.pdfTheme))
    throw new Error("pdfTheme 必须是 dark 或 light");
  if(!["sarasa","system"].includes(merged.mdFontFamily))
    throw new Error("mdFontFamily 必须为 sarasa 或 system");
  if(!Array.isArray(merged.mdHeadingSizes)||merged.mdHeadingSizes.length!==6||
    merged.mdHeadingSizes.some(x=>typeof x!=="number"||!Number.isFinite(x)||x<0.85||x>3.5))
    throw new Error("mdHeadingSizes 必须是六个 0.85–3.5 的字号倍率");
  if(!Array.isArray(merged.mdHeadingColors)||merged.mdHeadingColors.length!==6||
    merged.mdHeadingColors.some(x=>typeof x!=="string"||!/^#[0-9a-fA-F]{6}$/.test(x)))
    throw new Error("mdHeadingColors 必须是六个 #RRGGBB 颜色");
  // Never retain mutable array references from the defaults or user input.
  merged.mdHeadingSizes=[...merged.mdHeadingSizes];
  merged.mdHeadingColors=[...merged.mdHeadingColors];
  merged.mdCodeColors={...merged.mdCodeColors};
  if (![0, 30, 60, 300].includes(merged.autoRefreshSeconds)) throw new Error("autoRefreshSeconds 必须为 0、30、60 或 300");
  for (const key of keys.filter(k => typeof DEFAULT_DIRECTORY_SETTINGS[k as keyof DirectorySettings] === "boolean")) {
    if (typeof merged[key as keyof DirectorySettings] !== "boolean") throw new Error("配置 " + key + " 必须是布尔值");
  }
  return merged;
}
export function loadDirectorySettings(storage: Pick<Storage,"getItem">): DirectorySettings {
  try {
    const raw = storage.getItem(DIRECTORY_SETTINGS_KEY);
    return raw ? parseDirectorySettings(JSON.parse(raw)) : { ...DEFAULT_DIRECTORY_SETTINGS };
  } catch { return { ...DEFAULT_DIRECTORY_SETTINGS }; }
}
