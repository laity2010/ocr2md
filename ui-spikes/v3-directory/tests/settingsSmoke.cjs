const assert=require('node:assert/strict');
const fs=require('node:fs');
const {transformSync}=require('../../v2/node_modules/esbuild');
const source=fs.readFileSync('src/settings.ts','utf8');
const js=transformSync(source,{loader:'ts',format:'cjs'}).code;
const mod={exports:{}};
new Function('module','exports',js)(mod,mod.exports);
const s=mod.exports;
assert.equal(s.DEFAULT_DIRECTORY_SETTINGS.gridDensity,'standard');
assert.equal(s.DEFAULT_DIRECTORY_SETTINGS.showRevisionColumn,false);
assert.deepEqual(s.parseDirectorySettings({}),s.DEFAULT_DIRECTORY_SETTINGS);
assert.equal(s.parseDirectorySettings({gridDensity:'compact'}).gridDensity,'compact');
assert.throws(()=>s.parseDirectorySettings({unknownKey:true}),/未知配置项/);
assert.throws(()=>s.parseDirectorySettings({gridFontSize:40}),/gridFontSize/);
assert.throws(()=>s.parseDirectorySettings({showTypeColumn:'false'}),/布尔值/);
assert.throws(()=>s.parseDirectorySettings({autoRefreshSeconds:10}),/autoRefreshSeconds/);
assert.equal('accessKey' in s.DEFAULT_DIRECTORY_SETTINGS,false);
assert.deepEqual(s.AG_SOURCE_SCENES,['directory','boundary','cleaning','settings']);
const legacy=s.parseDirectorySettings({gridDensity:'compact'});
for(const name of s.AG_SOURCE_SCENES){
 assert.deepEqual(legacy.agSourceScenes[name],{
   gridFontSize:null,sourceFontSize:null,sourceLineHeight:null,
   hardReturns:null,hardReturnColor:null,
 });
}
const scoped=structuredClone(s.DEFAULT_DIRECTORY_SETTINGS);
scoped.agSourceScenes.cleaning.sourceFontSize=20;
scoped.agSourceScenes.boundary.hardReturnColor='#4a5b6c';
assert.equal(s.parseDirectorySettings(scoped).agSourceScenes.cleaning.sourceFontSize,20);
assert.equal(s.parseDirectorySettings(scoped).agSourceScenes.boundary.hardReturnColor,'#4a5b6c');
for(const [key,bad] of [['sourceFontSize',40],['sourceLineHeight',0],
  ['hardReturns','yes'],['hardReturnColor','red']]){
 const config=structuredClone(s.DEFAULT_DIRECTORY_SETTINGS);
 config.agSourceScenes.cleaning[key]=bad;
 assert.throws(()=>s.parseDirectorySettings(config),/agSourceScenes/);
}
const injected=structuredClone(s.DEFAULT_DIRECTORY_SETTINGS);
injected.agSourceScenes.settings.editorEditable=true;
assert.throws(()=>s.parseDirectorySettings(injected),/agSourceScenes/,
 'settings may not grant write permissions to read-only components');
const cleanClone=s.parseDirectorySettings(scoped);
cleanClone.agSourceScenes.cleaning.sourceFontSize=12;
assert.equal(s.DEFAULT_DIRECTORY_SETTINGS.agSourceScenes.cleaning.sourceFontSize,null);
assert.deepEqual(s.DEFAULT_DIRECTORY_SETTINGS.mdHeadingSizes,[2.125,1.625,1.375,1.25,1.125,1.125]);
assert.deepEqual(s.DEFAULT_DIRECTORY_SETTINGS.mdHeadingColors,["#da6362","#d77f48","#bf983d","#899c40","#569d79","#b87b9d"]);
assert.equal(s.parseDirectorySettings({mdSourceFontSize:18}).mdSourceFontSize,18);
assert.equal(s.parseDirectorySettings({workbenchGridRowHeight:47}).workbenchGridRowHeight,47);
assert.equal(s.parseDirectorySettings({mdShowHardReturns:true}).mdShowHardReturns,true);
assert.throws(()=>s.parseDirectorySettings({mdHeadingSizes:[1,2]}),/mdHeadingSizes/);
assert.throws(()=>s.parseDirectorySettings({mdHeadingColors:['red']}),/mdHeadingColors/);
assert.throws(()=>s.parseDirectorySettings({mdHeadingColors:["url(x)","#ff0000","#ff0000","#ff0000","#ff0000","#ff0000"]}),/mdHeadingColors/);
assert.throws(()=>s.parseDirectorySettings({mdFontFamily:'evil(font)'}),/mdFontFamily/);
assert.throws(()=>s.parseDirectorySettings({mdSourceFontSize:100}),/mdSourceFontSize/);
assert.throws(()=>s.parseDirectorySettings({mdCodeColors:{comment:"red"}}),/mdCodeColors/);
assert.throws(()=>s.parseDirectorySettings({mdSourceLineHeight:6}),/mdSourceLineHeight/);
const oldConfig=s.parseDirectorySettings({gridDensity:'compact'});
assert.equal(oldConfig.mdFontFamily,'sarasa');
assert.equal(s.parseDirectorySettings({mdFontFamily:'monospace'}).mdFontFamily,'sarasa');
assert.equal(s.parseDirectorySettings({mdFontFamily:'system'}).mdFontFamily,'system');
oldConfig.mdHeadingSizes[0]=1;
assert.equal(s.DEFAULT_DIRECTORY_SETTINGS.mdHeadingSizes[0],2.125);

console.log('V3_DIRECTORY_SETTINGS_CONTRACT_PASS');
