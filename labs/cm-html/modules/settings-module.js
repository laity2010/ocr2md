/** An experimental settings-module adapter, not a second Settings editor.
 * The production Settings module owns JSON, AG, source and saved state.
 * The optional file navigation only switches among existing CM sources.
 */
import {createSettingsModule as createMainlineSettingsModule} from '../../../ui/settings-module.js';
import {createSourceFileNavigation} from './source-file-navigation.js';

export function createSettingsModule(...args){
  const original=createMainlineSettingsModule(...args);
  const navigation=createSourceFileNavigation();
  // Mainline Settings returns a frozen object. Proxying a frozen `load`
  // violates JS invariants; copy the public descriptors into a new adapter
  // instead, retaining live getters such as history/invalid.
  const descriptors=Object.getOwnPropertyDescriptors(original);
  descriptors.load={
    enumerable:true,
    configurable:false,
    writable:false,
    value:async()=>{
      await original.load();
      navigation.mountSettings();
    },
  };
  return Object.freeze(Object.defineProperties({},descriptors));
}
