import * as plugin0 from './workspace/index.js';
import * as plugin1 from './settings/index.js';
import * as plugin2 from './chapter-boundary/index.js';
import * as plugin3 from './chapter-cleaning/index.js';
import * as plugin4 from './filesystem/index.js';
export const plugins=[
  Object.freeze({...plugin0,manifest:Object.freeze({"directory":"workspace","id":"ocr2md:workspace","kind":"ui","tab":"工作目录","home":true,"prewarm":false,"order":10,"actions":[],"activateOn":"","tabGroup":"","hiddenTab":false})}),
  Object.freeze({...plugin1,manifest:Object.freeze({"directory":"settings","id":"ocr2md:settings","kind":"ui","tab":"设置","home":false,"prewarm":true,"order":20,"actions":[{"id":"settings-undo","label":"撤销","title":"撤销设置修改（⌘/Ctrl+Z）","globalRole":"undo"},{"id":"settings-redo","label":"重做","title":"重做设置修改（⌘/Ctrl+Shift+Z）","globalRole":"redo"},{"id":"settings-reset","label":"恢复默认"},{"id":"settings-save","label":"保存配置","globalRole":"save"},{"id":"settings-publish","label":"发布","alwaysDisabled":true}],"activateOn":"","tabGroup":"","hiddenTab":false})}),
  Object.freeze({...plugin2,manifest:Object.freeze({"directory":"chapter-boundary","id":"ocr2md:chapter-boundary","kind":"ui","tab":"工作台","home":false,"prewarm":false,"order":30,"actions":[{"id":"ir-undo","label":"撤销","title":"撤销上一项 DIRjson 修改","globalRole":"undo"},{"id":"ir-redo","label":"重做","title":"重做已撤销的 DIRjson 修改","globalRole":"redo"},{"id":"ir-save","label":"保存标定","title":"提交 DIRjson 快照并读回校验","globalRole":"save"},{"id":"ir-publish-chapters","label":"发布章节","title":"根据已保存 DIRjson 生成 Obsidian 兼容章节 MD"}],"activateOn":"workspace.selected","tabGroup":"workbench","hiddenTab":false})}),
  Object.freeze({...plugin3,manifest:Object.freeze({"directory":"chapter-cleaning","id":"ocr2md:chapter-cleaning","kind":"ui","tab":"章节清洗","home":false,"prewarm":false,"order":31,"actions":[{"id":"chapter-clean-undo","label":"撤销","globalRole":"undo"},{"id":"chapter-clean-redo","label":"重做","globalRole":"redo"},{"id":"chapter-clean-save","label":"保存章节","globalRole":"save"}],"activateOn":"workbench.cleaning","tabGroup":"workbench","hiddenTab":true})}),
  Object.freeze({...plugin4,manifest:Object.freeze({"directory":"filesystem","id":"ocr2md:filesystem","kind":"service","home":false,"prewarm":false,"order":100,"actions":[],"activateOn":"","tabGroup":"","hiddenTab":false})})
];
