/** Immutable release resolver. Selects the URL's pinned ?v= version. */
const requested=new URL(import.meta.url).searchParams.get('v');
const manifestUrl=new URL('./manifest.json',import.meta.url);
const response=await fetch(manifestUrl,{cache:'no-store'});
if(!response.ok)throw Error('SHARED_SETTINGS_MANIFEST_HTTP_'+response.status);
const manifest=await response.json();
const stable=manifest.stable||manifest.version;
const version=requested||stable;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('INVALID_COMPONENT_VERSION');
const registered=(manifest.releases||[]).some(r=>r.version===version);
if(!registered)throw Error('UNKNOWN_COMPONENT_RELEASE_'+version);
const mod=await import('./releases/'+version+'/settings-panel.js');
export const LaitySettingsPanel=mod.LaitySettingsPanel;
export const SHARED_SETTINGS_VERSION=mod.SHARED_SETTINGS_VERSION;
export const normalizeCandidate=mod.normalizeCandidate;
export const normalizeSchema=mod.normalizeSchema;
export const preloadSettingsGrid=mod.preloadSettingsGrid;
