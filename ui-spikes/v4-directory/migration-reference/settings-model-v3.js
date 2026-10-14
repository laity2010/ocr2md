// ui-spikes/v4-directory/modules/settings-model.ts
var AG_SOURCE_SCENES = ["directory", "boundary", "cleaning", "settings"];
var inheritedStyle = () => ({
  gridFontSize: null,
  sourceFontSize: null,
  sourceLineHeight: null,
  hardReturns: null,
  hardReturnColor: null
});
var DEFAULT_AG_SOURCE_SCENES = {
  directory: inheritedStyle(),
  boundary: inheritedStyle(),
  cleaning: inheritedStyle(),
  settings: inheritedStyle()
};
var DIRECTORY_SETTINGS_KEY = "ocr2md-v3-directory-settings-v1";
var DEFAULT_DIRECTORY_SETTINGS = {
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
  mdCodeColors: {
    comment: "#859289",
    link: "#83c092",
    url: "#7fbbb3",
    function: "#7fbbb3",
    keyword: "#d699b6",
    operator: "#83c092",
    property: "#a7c080",
    string: "#a7c080",
    tag: "#da6362",
    value: "#dbbc7f",
    punctuation: "#9aa79d"
  },
  mdFontFamily: "sarasa",
  mdShowHardReturns: true,
  mdHardReturnColor: "#839ab5",
  agSourceScenes: DEFAULT_AG_SOURCE_SCENES,
  pdfTheme: "dark",
  mdHeadingSizes: [2.125, 1.625, 1.375, 1.25, 1.125, 1.125],
  mdHeadingColors: ["#da6362", "#d77f48", "#bf983d", "#899c40", "#569d79", "#b87b9d"]
};
function parseDirectorySettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("\u914D\u7F6E\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  const v = value;
  const keys = Object.keys(DEFAULT_DIRECTORY_SETTINGS);
  const unknown = Object.keys(v).filter((k) => !keys.includes(k));
  if (unknown.length) throw new Error("\u672A\u77E5\u914D\u7F6E\u9879\uFF1A" + unknown.join("\u3001"));
  const merged = { ...DEFAULT_DIRECTORY_SETTINGS, ...v };
  if (v.mdFontFamily === "monospace") merged.mdFontFamily = "sarasa";
  if (!("mdHardReturnColor" in v)) merged.mdShowHardReturns = true;
  if (!Number.isInteger(merged.gridFontSize) || merged.gridFontSize < 12 || merged.gridFontSize > 20) {
    throw new Error("gridFontSize \u5FC5\u987B\u5728 12\u201320 \u4E4B\u95F4");
  }
  if (!["compact", "standard", "comfortable"].includes(merged.gridDensity)) throw new Error("gridDensity \u503C\u4E0D\u6B63\u786E");
  for (const [key, min, max] of [
    ["workbenchGridFontSize", 11, 22],
    ["workbenchGridRowHeight", 28, 74],
    ["mdSourceFontSize", 11, 24],
    ["mdPreviewFontSize", 11, 26]
  ]) {
    const size = merged[key];
    if (!Number.isInteger(size) || size < min || size > max) throw new Error(`${key} \u5FC5\u987B\u5728 ${min}\u2013${max} \u4E4B\u95F4`);
  }
  for (const key of ["mdPreviewLineHeight", "mdSourceLineHeight"]) {
    if (typeof merged[key] !== "number" || !Number.isFinite(merged[key]) || merged[key] < 1 || merged[key] > 2.5)
      throw new Error(`${key} \u5FC5\u987B\u5728 1\u20132.5 \u4E4B\u95F4`);
  }
  if (!merged.mdCodeColors || typeof merged.mdCodeColors !== "object" || Array.isArray(merged.mdCodeColors) || Object.keys(merged.mdCodeColors).sort().join("|") !== Object.keys(DEFAULT_DIRECTORY_SETTINGS.mdCodeColors).sort().join("|") || Object.values(merged.mdCodeColors).some((x) => typeof x !== "string" || !/^#[0-9a-fA-F]{6}$/.test(x)))
    throw new Error("mdCodeColors \u5FC5\u987B\u5305\u542B V2 \u7684\u5168\u90E8\u4EE3\u7801\u9AD8\u4EAE\u989C\u8272\uFF0C\u5E76\u4F7F\u7528 #RRGGBB");
  if (typeof merged.mdHardReturnColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(merged.mdHardReturnColor))
    throw new Error("mdHardReturnColor \u5FC5\u987B\u4E3A #RRGGBB \u989C\u8272");
  const rawScenes = merged.agSourceScenes;
  if (!rawScenes || typeof rawScenes !== "object" || Array.isArray(rawScenes) || Object.keys(rawScenes).sort().join("|") !== [...AG_SOURCE_SCENES].sort().join("|"))
    throw Error("agSourceScenes \u5FC5\u987B\u5305\u542B directory/boundary/cleaning/settings \u56DB\u4E2A\u573A\u666F");
  const normalized = {};
  for (const scene of AG_SOURCE_SCENES) {
    const raw = rawScenes[scene];
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).sort().join("|") !== Object.keys(inheritedStyle()).sort().join("|"))
      throw Error(`agSourceScenes.${scene} \u914D\u7F6E\u5C5E\u6027\u4E0D\u5B8C\u6574`);
    const sizeChecks = [
      ["gridFontSize", 11, 22],
      ["sourceFontSize", 11, 24],
      ["sourceLineHeight", 1, 2.5]
    ];
    for (const [key, min, max] of sizeChecks) {
      const value2 = raw[key];
      if (value2 !== null && (typeof value2 !== "number" || !Number.isFinite(value2) || value2 < min || value2 > max || key !== "sourceLineHeight" && !Number.isInteger(value2)))
        throw Error(`agSourceScenes.${scene}.${key} \u5FC5\u987B\u4E3A\u7A7A\u6216 ${min}\u2013${max}`);
    }
    if (raw.hardReturns !== null && typeof raw.hardReturns !== "boolean")
      throw Error(`agSourceScenes.${scene}.hardReturns \u5FC5\u987B\u4E3A\u7A7A\u6216\u5E03\u5C14\u503C`);
    if (raw.hardReturnColor !== null && (typeof raw.hardReturnColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(raw.hardReturnColor)))
      throw Error(`agSourceScenes.${scene}.hardReturnColor \u5FC5\u987B\u4E3A\u7A7A\u6216 #RRGGBB`);
    normalized[scene] = { ...raw };
  }
  merged.agSourceScenes = normalized;
  if (!["dark", "light"].includes(merged.pdfTheme))
    throw new Error("pdfTheme \u5FC5\u987B\u662F dark \u6216 light");
  if (!["sarasa", "system"].includes(merged.mdFontFamily))
    throw new Error("mdFontFamily \u5FC5\u987B\u4E3A sarasa \u6216 system");
  if (!Array.isArray(merged.mdHeadingSizes) || merged.mdHeadingSizes.length !== 6 || merged.mdHeadingSizes.some((x) => typeof x !== "number" || !Number.isFinite(x) || x < 0.85 || x > 3.5))
    throw new Error("mdHeadingSizes \u5FC5\u987B\u662F\u516D\u4E2A 0.85\u20133.5 \u7684\u5B57\u53F7\u500D\u7387");
  if (!Array.isArray(merged.mdHeadingColors) || merged.mdHeadingColors.length !== 6 || merged.mdHeadingColors.some((x) => typeof x !== "string" || !/^#[0-9a-fA-F]{6}$/.test(x)))
    throw new Error("mdHeadingColors \u5FC5\u987B\u662F\u516D\u4E2A #RRGGBB \u989C\u8272");
  merged.mdHeadingSizes = [...merged.mdHeadingSizes];
  merged.mdHeadingColors = [...merged.mdHeadingColors];
  merged.mdCodeColors = { ...merged.mdCodeColors };
  if (![0, 30, 60, 300].includes(merged.autoRefreshSeconds)) throw new Error("autoRefreshSeconds \u5FC5\u987B\u4E3A 0\u300130\u300160 \u6216 300");
  for (const key of keys.filter((k) => typeof DEFAULT_DIRECTORY_SETTINGS[k] === "boolean")) {
    if (typeof merged[key] !== "boolean") throw new Error("\u914D\u7F6E " + key + " \u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  }
  return merged;
}
function loadDirectorySettings(storage) {
  try {
    const raw = storage.getItem(DIRECTORY_SETTINGS_KEY);
    return raw ? parseDirectorySettings(JSON.parse(raw)) : { ...DEFAULT_DIRECTORY_SETTINGS };
  } catch {
    return { ...DEFAULT_DIRECTORY_SETTINGS };
  }
}
export {
  AG_SOURCE_SCENES,
  DEFAULT_AG_SOURCE_SCENES,
  DEFAULT_DIRECTORY_SETTINGS,
  DIRECTORY_SETTINGS_KEY,
  loadDirectorySettings,
  parseDirectorySettings
};
