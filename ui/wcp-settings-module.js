/** Settings adapter: only the Settings-owned JSON editor and font registration.
 * Shell, never Settings, is responsible for mounting AG/navigation modules.
 */
import {createSettingsModule as createMainlineSettingsModule} from './settings-module.js';
import {registerNavigationFontSetting} from './wcp-navigation-select.js';

export function createSettingsModule(...args){
  const original=createMainlineSettingsModule(...args);
  registerNavigationFontSetting(original);
  original.register({module:'S',key:'workspace.files.rootPath',
    category:['工作区','文件与目录'],label:'工作根目录',
    comment:'书籍目录的上一级根目录；首层文件夹分别是书籍工作目录，内部须有 mineru json/ 与 pdf/',
    type:'path',control:'directory',defaultValue:'',message:'settings.changed'});
  original.register({module:'S',key:'workspace.files.bookName',
    category:['工作区','文件与目录'],label:'当前书籍工作目录',
    comment:'从工作根目录下选择一个首层书籍文件夹；保存时将验证/生成符合 CMD 章节定界基础格式的 .minerujson.md，不覆盖原文件',
    type:'path',control:'directory',defaultValue:'',message:'settings.changed'});
  // Settings owns only its JSON/settings facade. Shell mounts AG and source
  // navigation independently; neither business module is created by Settings.
  return original;
}
