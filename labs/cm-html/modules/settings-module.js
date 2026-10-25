/** An experimental settings-module adapter, not a second Settings editor.
 * The production Settings module owns JSON, AG, source and saved state.
 * The optional file navigation only switches among existing CM sources.
 */
import {createSettingsModule as createMainlineSettingsModule} from '../../../ui/settings-module.js';
import {createSourceFileNavigation} from './source-file-navigation.js';

export function createSettingsModule(...args){
  const original=createMainlineSettingsModule(...args);
  const navigation=createSourceFileNavigation();
  return new Proxy(original,{
    get(target,property,receiver){
      if(property==='load')return async()=>{
        await target.load();
        navigation.mountSettings();
      };
      return Reflect.get(target,property,receiver);
    },
  });
}
