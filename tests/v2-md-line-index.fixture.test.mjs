/** WP25A actual MinerU fixture -> WP24 production import -> SQLite v3
 * snapshot -> real CM6 Text/EditorView. No user workspace or UI mutation.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {EditorState} from '@codemirror/state';
import {build} from 'esbuild';
import {chromium,webkit} from 'playwright';
import {composeBlockSource} from '../ui/v2-block-source.js';
import {createMdLineIndex} from '../ui/v2-md-line-index.js';

const py=String.raw`
import json,tempfile,sys,shutil,sqlite3,hashlib
from pathlib import Path
from contextlib import closing
sys.path.insert(0,'tests')
from test_v2_owned_lf import FIXTURE,Stub
from test_v2_owned_edit import prepare_owned_book
import v2_mineru_base as base
def record(folder):
    path=folder/base.DB_NAME
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    snapshot=base.existing_markdown(folder)
    with closing(sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True)) as db:
        rows=db.execute('SELECT logical_id,base_blockid,p,b,s,block_type,md_block FROM logical_block ORDER BY logical_order').fetchall()
        assert db.execute('PRAGMA user_version').fetchone()[0]==2303
        assert set(r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'"))=={'mineru_base','logical_block'}
    assert hashlib.sha256(path.read_bytes()).hexdigest()==digest
    return dict(snapshot=snapshot,rows=rows)
with tempfile.TemporaryDirectory(prefix='wp25a-fresh-') as fresh, tempfile.TemporaryDirectory(prefix='wp25a-edited-') as edited:
    folder=Path(fresh);(folder/'minerujson').mkdir()
    shutil.copyfile(FIXTURE,folder/'minerujson'/FIXTURE.name)
    base.dispatch('import','POST',folder,dict(workspace=str(folder),confirm='import-mineru-base'),{},Stub())
    prepare_owned_book(Path(edited))
    print(json.dumps(dict(fresh=record(folder),edited=record(Path(edited))),ensure_ascii=False))
`;
const fixtures=JSON.parse(execFileSync('python3',['-c',py],{encoding:'utf8',maxBuffer:16*1024*1024}));

function verifyFixture(createIndex,doc,blocks,sqlRows,mdLines){
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const index=createIndex(doc,blocks);
  let cursor=0,blank=0,title=0,children=0,lookups=0;
  const pieces=[];
  for(const [i,sql] of sqlRows.entries()){
    const [id,base,p,b,s,type,body]=sql,block=blocks[i],lines=index.forBlock(id);
    check(block.logicalId===id&&block.baseBlockId===base&&block.from===cursor,'block identity / offset '+id);
    check(lines.length>0,'empty owner '+id);
    if(s>0)children++;
    const strings=[];
    for(const [offset,row] of lines.entries()){
      const actual=doc.line(row.source_line);
      check(row.source_line===pieces.length+1&&row.line_offset===offset&&
        row.logical_id===id&&row.base_blockid===base&&row.p===p&&row.b===b&&row.s===s&&
        row.pbs===('p'+p+'b'+b+'s'+s)&&row.block_type===type&&row.type===type,'row identity '+id+'/'+offset);
      const remote=mdLines[row.source_line-1];
      check(remote&&['source_line','logical_id','base_blockid','line_offset','from','to','textTo','type'].every(k=>remote[k]===row[k]),'public MDLine metadata parity '+row.source_line);
      check(row.from===cursor&&row.from===actual.from&&row.textTo===actual.to&&
        row.to===actual.to+1&&row.md_line===actual.text&&
        doc.sliceString(row.from,row.to)===row.md_line+'\n','actual CM6 line '+row.source_line);
      check(index.atSourceLine(row.source_line)===row&&index.atBlockLine(id,offset)===row&&
        index.resolve(index.makeRef(row.source_line))===row,'reverse lookup');
      // Check EVERY UTF-16 code unit including LF, not just block boundaries.
      for(let pos=row.from;pos<row.to;pos++){
        check(index.atOffset(pos)===row,'offset lookup '+pos);
        lookups++;
      }
      strings.push(row.md_line+'\n');pieces.push(row.md_line+'\n');cursor=row.to;
      if(row.line_type==='blank')blank++;
      if(row.line_type==='title')title++;
    }
    check(strings.join('')===body&&block.to===cursor,'exact SQL MD Block '+id);
  }
  check(cursor===doc.length&&pieces.join('')===doc.toString(),'whole document roundtrip');
  check(mdLines.length===index.rows.length,'public MDLine coverage');
  const types=new Set(mdLines.map(row=>row.type));
  for(const type of ['table_caption','table_body','table_footnote','image_body'])check(types.has(type),'missing original type '+type);
  check(index.rows.length===doc.lines-1&&index.atSourceLine(doc.lines)===null&&
    index.atOffset(doc.length)===null&&index.eofOwner===sqlRows.at(-1)[0],'EOF ownership');
  check(index.forBlock(sqlRows[0][0]).length>0&&blank>0&&title>0&&children>0,'fixture coverage');
  return {blocks:blocks.length,rows:index.rows.length,physicalLines:doc.lines,
    utf16:doc.length,lookups,blank,title,children};
}

const expected={};
for(const [name,fixture] of Object.entries(fixtures)){
 const {source,blocks}=composeBlockSource(fixture.snapshot);
 assert.equal(blocks.length,267);
 const doc=EditorState.create({doc:source}).doc;
 expected[name]=verifyFixture(createMdLineIndex,doc,blocks,fixture.rows,fixture.snapshot.mdLines);
 console.log('WP25A_REAL_SQL_CM6_INDEX_PASS',name,JSON.stringify(expected[name]));
}

const bundle=await build({stdin:{contents:`
import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {composeBlockSource} from './ui/v2-block-source.js';
import {createMdLineIndex} from './ui/v2-md-line-index.js';
${verifyFixture.toString()}
window.verifyMDLine=(fixture)=>{
 const {source,blocks}=composeBlockSource(fixture.snapshot);
 const editor=new EditorView({state:EditorState.create({doc:source,extensions:[
  EditorState.readOnly.of(true),EditorView.editable.of(false),EditorView.lineWrapping]}),
  parent:document.querySelector('#editor')});
 try{
   if(!editor.contentDOM.isConnected)throw Error('CM6 not mounted');
   return verifyFixture(createMdLineIndex,editor.state.doc,blocks,fixture.rows,fixture.snapshot.mdLines);
 }finally{editor.destroy();}
};
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'});
for(const [name,type] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
 const browser=await type.launch({headless:true});
 try{
   const page=await browser.newPage({viewport:{width:834,height:1112},hasTouch:true,
     ...(name==='iPad-WebKit'?{userAgent:'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'}:{})});
   await page.setContent('<div id="editor" style="width:320px"></div>');
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   for(const [key,fixture] of Object.entries(fixtures)){
     const result=await page.evaluate(f=>window.verifyMDLine(f),fixture);
     assert.deepEqual(result,expected[key]);
     console.log('WP25A_REAL_CM6_BROWSER_PASS',name,key,JSON.stringify(result));
   }
 }finally{await browser.close();}
}
