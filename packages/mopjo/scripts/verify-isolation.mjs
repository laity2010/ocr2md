/** WP06 boundary guard: reject imports that escape the standalone MOPJO package.
 * Checks TS AST (including type imports, re-exports, require(), import()) instead of grep.
 */
import {readFileSync,readdirSync,statSync,realpathSync,existsSync} from 'node:fs';
import {resolve,relative,dirname,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {builtinModules} from 'node:module';
import ts from 'typescript';

const root=realpathSync(resolve(import.meta.dirname,'..'));
const manifest=JSON.parse(readFileSync(resolve(root,'WP06_BASELINE.json'),'utf8'));
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const allowed=new Set([...builtinModules,...builtinModules.map(x=>'node:'+x)]);
const declared=new Set([...Object.keys(pkg.dependencies??{}),...Object.keys(pkg.devDependencies??{})]);
const errors=[];
const migrationStrict=process.argv.includes('--migration-parity');
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const inside=p=>p===root||p.startsWith(root+sep);
let sources=0,imports=0,foreign=0;
function walk(p){
  for(const item of readdirSync(p)){
    if(item==='node_modules'||item==='dist'||item==='.runtime')continue;
    const f=resolve(p,item),stats=statSync(f);
    if(stats.isDirectory()){walk(f);continue}
    if(!f.endsWith('.ts'))continue;
    sources++;
    const src=readFileSync(f,'utf8');
    const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    const sourcePath=relative(root,f);
    function check(value,node){
      imports++;
      if(value.startsWith('.')){
        const target=resolve(dirname(f),value);
        if(!inside(target)){foreign++;errors.push(sourcePath+': import outside package '+value);return;}
        const tries=[target,target+'.ts',target+'.tsx',target+'.js',target+'.json',resolve(target,'index.ts')];
        const exists=tries.some(existsSync);
        if(!exists)errors.push(sourcePath+': unresolved '+value);
      }else if(!allowed.has(value)){
        const name=value.startsWith('@')?value.split('/').slice(0,2).join('/'):value.split('/')[0];
        if(!declared.has(name))errors.push(sourcePath+': undeclared external '+value);
      }
    }
    function visit(node){
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)) check(node.moduleSpecifier.text,node);
      if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||
        (ts.isIdentifier(node.expression)&&node.expression.text==='require'))){
        if(node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]))check(node.arguments[0].text,node);
        else errors.push(sourcePath+': nonliteral import/require cannot be audited');
      }
      ts.forEachChild(node,visit);
    }
    visit(sf);
  }
}
walk(resolve(root,'src'));walk(resolve(root,'tests'));
let algorithmParity=true;
for(const [name,expected] of Object.entries(manifest.importedSharedModules)){
  const p=resolve(root,'src/ir',name+'.ts');
  if(!existsSync(p)||sha(p)!==expected){
    algorithmParity=false;
    if(migrationStrict)
    errors.push('migration changed original shared algorithm '+name);
  }
}
for(const [name,script] of Object.entries(pkg.scripts)){
  if(String(script).includes('../../node_modules')||String(script).includes('../../../src/'))
    errors.push('script '+name+' invokes tools or sources outside the package');
}
if(errors.length) { console.error('MOPJO_WP06_BOUNDARY_FAILED',JSON.stringify({errors,imports,sources,foreign}));process.exitCode=1; }
else console.log('MOPJO_WP06_BOUNDARY_PASS',JSON.stringify({sources,imports,foreignPrivateImports:foreign,
  migratedIrFiles:Object.keys(manifest.importedSharedModules).length,
  originalAlgorithmShaIntact:algorithmParity,declaredDevTools:Object.keys(pkg.devDependencies??{}).length}));
