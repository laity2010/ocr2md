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
    comment:'Mac 服务器上含现有母 Markdown 的工作目录；仅允许授权目录，保存后切换，旧文件不迁移',
    type:'path',control:'directory',defaultValue:'',message:'settings.changed'});
  // Settings owns only its JSON/settings facade. Shell mounts AG and source
  // navigation independently; neither business module is created by Settings.
  return original;
}
