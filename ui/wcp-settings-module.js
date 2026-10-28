/** Settings adapter: only the Settings-owned JSON editor and font registration.
 * Shell, never Settings, is responsible for mounting AG/navigation modules.
 */
import {createSettingsModule as createMainlineSettingsModule} from './settings-module.js';
import {registerNavigationFontSetting} from './wcp-navigation-select.js';

export function createSettingsModule(...args){
  const original=createMainlineSettingsModule(...args);
  registerNavigationFontSetting(original);
  // Settings owns only its JSON/settings facade. Shell mounts AG and source
  // navigation independently; neither business module is created by Settings.
  return original;
}
