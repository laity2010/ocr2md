/** V5 module boundary fitness function: TypeScript AST, not regex.
 * Audit all literal static/dynamic imports and reject runtime sibling/source escapes.
 * The compiler is a pinned *dev tool*; runtime uses only published WCP assets.
 */
import ts from 'typescript';
import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,dirname,relative,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pluginRoot=join(root,'plugins');
const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const declared=new Set([...Object.keys(manifest.dependencies??{}),...Object.keys(manifest.devDependencies??{})]);
const allowedShellImports=new Set(['vendor/wcp/components/v1/loader.js','plugins/registry.generated.js',
]);
const shared=new Set(['components/tripane.js','components/resident.js',
 'vendor/shared-settings/v1/settings-panel.js',
 'vendor/shared-settings/v1/releases/0.1.18/settings-panel.js']);
const errors=[];let scanned=0,imports=0;
const inside=(dir,path)=>path===dir||path.startsWith(dir+sep);
function audit(raw,site,owner){
 const ast=ts.createSourceFile(site,raw,ts.ScriptTarget.Latest,true,site.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
 for(const diagnostic of ast.parseDiagnostics)errors.push(site+': TS parse error '+diagnostic.messageText);
 function check(spec){
  imports++;
  if(typeof spec!=='string')return errors.push(site+': nonliteral import');
  if(!spec.startsWith('.')){
   const packageName=spec.startsWith('@')?spec.split('/').slice(0,2).join('/'):spec.split('/')[0];
   if(!declared.has(packageName))errors.push(site+': undeclared package '+spec);
   return;
  }
  const dest=resolve(dirname(site),spec);
  const rel=relative(root,dest).split(sep).join('/');
  if(owner==='shell'){
   if(!allowedShellImports.has(rel))errors.push(site+': Shell import not on public allowlist '+spec);
  }else if(!inside(join(pluginRoot,owner),dest)&&!shared.has(rel)){
   errors.push(site+': cross-plugin/private-source import '+spec);
  }
 }
 function visit(n){
  if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))check(n.moduleSpecifier.text);
  if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||
    (ts.isIdentifier(n.expression)&&n.expression.text==='require'))){
   if(n.arguments.length===1&&ts.isStringLiteral(n.arguments[0]))check(n.arguments[0].text);
   else errors.push(site+': nonliteral import/require');
  }
  ts.forEachChild(n,visit);
 }
 visit(ast);
 if(owner!=='filesystem'&&/\bfetch\s*\(\s*['"]|\bXMLHttpRequest\b/.test(raw))
  errors.push(site+': direct network I/O outside authorized file service');
}
async function walk(dir,owner){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const f=join(dir,entry.name);
  if(entry.isSymbolicLink()){errors.push('forbidden symlink: '+f);continue}
  if(entry.isDirectory()){if(entry.name==='tests')continue;await walk(f,owner);continue}
  if(!/\.(?:ts|tsx|js|mjs)$/.test(entry.name)||entry.name.endsWith('.generated.js'))continue;
  scanned++;audit(await readFile(f,'utf8'),f,owner);
 }
}
for(const entry of await readdir(pluginRoot,{withFileTypes:true}))
 if(entry.isDirectory())await walk(join(pluginRoot,entry.name),entry.name);
scanned++;audit(await readFile(join(root,'app.js'),'utf8'),join(root,'app.js'),'shell');
if(errors.length){console.error('V5_BOUNDARY_FAILED',JSON.stringify(errors));process.exitCode=1}
else console.log('V5_BOUNDARY_PASS',JSON.stringify({scanned,imports,violations:0,
 policy:'TypeScript AST + explicit published components + no private cross-plugin imports'}));
