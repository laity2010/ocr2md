/** Every app plugin is module-local. CI fitness function, not a JS sandbox. */
import {resolve,dirname,relative,sep,join} from 'node:path';
import {readdir,readFile} from 'node:fs/promises';
import ts from '../../../../web-component-platform/node_modules/typescript/lib/typescript.js';
const root=resolve(process.env.V4_PLUGIN_ROOT||'ui-spikes/v4-directory/plugins');
const ui=resolve('ui-spikes/v4-directory');
let visited=0;const errors=[];
const allowedShared=new Set(['components/tripane.js','components/resident.js']);
const boundaryPureShared=new Set([
 'src/dirSourceEditing','src/v3HttpWorkspaceFs','src/documentIrArchive',
 'src/documentIrMarkdown','src/documentIrImport','src/documentIrReconstruction',
 'src/documentIrChapters','src/documentIrV1','src/mineruMappingSidecar',
 'src/pdfMdRegionGeometry','src/chapterFileAssign','src/workspaceFsV3',
 'ui-spikes/v2/node_modules/ag-grid-community',
 'ui-spikes/v2/node_modules/@codemirror/state',
 'ui-spikes/v2/node_modules/@codemirror/view',
 'ui-spikes/v2/node_modules/pdfjs-dist/build/pdf.mjs',
 'ui-spikes/v2/node_modules/pdfjs-dist/web/pdf_viewer.mjs',
 'ui-spikes/v2/node_modules/pdfjs-dist/web/pdf_viewer.css',
 'ui-spikes/v2/src/calibrationTheme','ui-spikes/v2/src/tableConfigurationGrid',
 'ui-spikes/v2/src/workingEditor','ui-spikes/v2/src/basicMarkdownPreview',
]);
const cleaningShared=new Set([...boundaryPureShared,
 'src/types','src/textBlocks','src/chapterElementCatalog','src/pdfMdBidirectional',
 'src/mineruMappingSidecarStore','src/normalizeMineruChapter',
 'ui-spikes/v2/src/calibrationGrid','ui-spikes/v2/node_modules/dompurify',
 'ui-spikes/v2/node_modules/katex',
]);
const legacyDeps=new Set([
  'workspace/workspace-grid.ts=>ui-spikes/v2/node_modules/ag-grid-community',
  'workspace/workspace-grid.ts=>ui-spikes/v2/src/tableConfigurationGrid',
  'filesystem/workspace-fs.ts=>src/v3DirectoryController',
  'chapter-boundary/legacy.ts=>src/v3HttpWorkspaceFs',
]);
async function examine(dir,owner){
 for(const ent of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,ent.name);
  if(ent.isDirectory()){await examine(path,owner);continue}
  if(!/\.(js|ts)$/.test(ent.name)||ent.name==='registry.generated.js'||
    ent.name==='workspace-grid.js'||ent.name==='workspace-fs.js')continue;
  const contents=await readFile(path,'utf8');visited++;
  const source=ts.createSourceFile(path,contents,ts.ScriptTarget.Latest,true);
  const site=relative(root,path);
  const fail=msg=>errors.push(site+': '+msg);
  function visit(node){
    let imp;
    if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){
      if(node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))imp=node.moduleSpecifier.text;
    }else if(ts.isCallExpression(node)&&node.arguments.length&&ts.isStringLiteral(node.arguments[0])&&
      (node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require')))imp=node.arguments[0].text;
    if(imp?.startsWith('.')){
      const target=resolve(dirname(path),imp);
      if(target===root||target.startsWith(root+sep)){
        const targetOwner=relative(root,target).split(sep)[0];
        if(targetOwner!==owner)fail('cross-plugin import: '+imp);
      }else{
        const relUI=relative(ui,target),relSource=relative(resolve(ui,'../..'),target);
        if(!allowedShared.has(relUI)&&!(owner==='chapter-boundary'&&boundaryPureShared.has(relSource))&&
          !(owner==='chapter-cleaning'&&cleaningShared.has(relSource))&&
          !legacyDeps.has(owner+'/'+relative(join(root,owner),path)+'=>'+relSource))
          fail('non-contract external dependency: '+imp);
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
  if(owner==='workspace'&&/\bfetch\s*\(|\blocalStorage\b/.test(contents))fail('workspace UI bypasses scoped filesystem CQE');
 }
}
for(const name of (await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name))await examine(join(root,name),name);
if(root===resolve('ui-spikes/v4-directory/plugins')){
 const entry=await readFile(join(ui,'app.js'),'utf8');
 if(!entry.includes("from './plugins/registry.generated.js")||/from\s*['"]\.\/modules\//.test(entry)||/ocr2md:(?:settings|workspace|filesystem|media)/.test(entry))
  errors.push('app.js: module-specific import, role or special-case detected');
}
if(errors.length){console.error('V4_PLUGIN_BOUNDARY_FAILED\n'+errors.join('\n'));process.exitCode=1}
else console.log('V4_PLUGIN_BOUNDARY_PASS',JSON.stringify({scanned:visited,pluginIsolation:true}));
