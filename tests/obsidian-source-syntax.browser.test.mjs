import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
/** CMD source syntax: Obsidian Markdown; official CodeMirror sTeX + One Dark.
 * Both browsers inspect computed syntax colors; never alter CM6 source bytes.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {chromium,webkit,devices} from 'playwright';
import {StreamLanguage} from '@codemirror/language';
import {stexMath} from '@codemirror/legacy-modes/mode/stex';
const officialNodes=[];
StreamLanguage.define(stexMath).parser
  .parse(String.raw`\mathsf{T A}_t^2 = \frac{x}{3}`)
  .iterate({enter:n=>officialNodes.push(n.name)});
assert(officialNodes.includes('tagName') &&
  officialNodes.includes('variableName.special') &&
  officialNodes.includes('bracket') &&
  officialNodes.includes('number'),
  'sTeX must parse commands, variables, brackets and numbers');
const folder=mkdtempSync(join(tmpdir(),'ocr2md-syntax-'));
const doc=join(folder,'probe.md');
const source=[
  '# Syntax highlighting',
  'Inline <span class="accent" data-count="42">Hello</span>!',
  '<div class="box" title="shown">',
  'HTML block content',
  '</div>',
  '', // CommonMark HTMLBlock terminates at a blank line.
  '<!-- ocr2md:latex id="0123456789abcdef" review="latex" -->',
  '$$',
  String.raw`\frac{\alpha_1}{2} = \mathsf{T A} + \beta`,
  '$$',
  String.raw`Inline $E=mc^2$ formula.`,
  '',
  '```math',
  String.raw`\sqrt{a_2 + b^2} = c`,
  '```',
  '',
  '```html',
  '<span class="fake">Should stay code</span>',
  '```',
  '',
  '<!-- minerujson:block:v1:0:2 -->',
  ''
].join('\n');
writeFileSync(doc,source);
const port=5199,origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js',
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{
    env:{...process.env,V6_DOCUMENT_PATH:doc},stdio:'ignore'});
let ready=false;
for(let n=0;n<110;n++){
  try{if((await fetch(origin)).ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,110));
}
try{
  assert(ready,'isolated Vite unavailable');
  for(const [name,engine,options] of [
    ['Chrome',chromium,{executablePath:chromeExecutable()}],
    ['WebKit',webkit,{executablePath:webkitExecutable()}]
  ]){
    let browser;
    try{
      browser=await engine.launch({headless:true,...options});
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1032,height:642}});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('行'),
        null,{timeout:30000});
      const inspect=async (anchor,classes)=>{
        await page.evaluate(anchor=>{
          const view=window.__v6cm6.view,at=view.state.doc.toString().indexOf(anchor);
          if(at<0)throw Error('missing source fixture '+anchor);
          view.dispatch({selection:{anchor:at},scrollIntoView:true});
          view.requestMeasure();
        },anchor);
        await page.waitForFunction(classes=>classes.every(cls=>
          document.querySelector('#editor .'+cls)),classes,{timeout:13000}).catch(async error=>{
            const details=await page.evaluate(()=>({status:document.querySelector('#status')?.textContent,
              visible:[...document.querySelectorAll('#editor .cm-line')].map(n=>({text:n.textContent?.slice(0,90),
                highlighted:[...n.querySelectorAll('[class*=cm-ob-syntax]')].map(x=>x.className).slice(0,15)}))}));
            console.log('SYNTAX_DIAG',name,anchor,JSON.stringify(details));throw error;
          });
        return page.evaluate(classes=>Object.fromEntries(classes.map(cls=>{
          const node=document.querySelector('#editor .'+cls);
          return [cls,{text:node.textContent,color:getComputedStyle(node).color}];
        })),classes);
      };
      const html=await inspect('class="accent"',['cm-ob-syntax-html-tag',
        'cm-ob-syntax-html-attr','cm-ob-syntax-html-value','cm-ob-syntax-html-punct']);
      // Obsidian 1.14.5 app.css maps .cm-tag, .cm-attribute and
      // .cm-string to Everforest --code-tag/function/string, respectively.
      assert.equal(html['cm-ob-syntax-html-tag'].color,'rgb(218, 99, 98)');
      assert.equal(html['cm-ob-syntax-html-attr'].color,'rgb(127, 187, 179)');
      assert.equal(html['cm-ob-syntax-html-value'].color,'rgb(167, 192, 128)');
      assert.equal(html['cm-ob-syntax-html-punct'].color,'rgb(154, 167, 157)');
      const block=await inspect('class="box"',['cm-ob-syntax-html-tag',
        'cm-ob-syntax-html-attr']);
      assert.equal(block['cm-ob-syntax-html-tag'].color,'rgb(218, 99, 98)');
      const comment=await inspect('ocr2md:latex',['cm-ob-syntax-html-comment']);
      assert.equal(comment['cm-ob-syntax-html-comment'].color,'rgb(133, 146, 137)');
      const math=await inspect('\\frac{',['cm-ob-syntax-math-fence',
        'cm-ob-syntax-math-body']);
      assert.equal(math['cm-ob-syntax-math-fence'].color,'rgb(90, 147, 162)');
      const tokenSamples=await page.evaluate(()=>[...document.querySelectorAll('#editor .cm-line')]
        .filter(el=>el.textContent.includes('\\frac{'))
        .flatMap(line=>[...line.querySelectorAll('span[class]')].map(span=>({
          text:span.textContent,cls:span.className,color:getComputedStyle(span).color})))
        .filter(span=>['\\frac','\\alpha','\\mathsf','T','A','1','2'].includes(span.text)));
      for(const cmd of ['\\frac','\\alpha','\\mathsf'])
        assert(tokenSamples.some(t=>t.text===cmd && t.color==='rgb(229, 192, 123)'),
          name+' official One Dark sTeX command '+cmd);
      assert(tokenSamples.some(t=>t.text==='2'&&t.color==='rgb(209, 154, 102)'),
        name+' official One Dark sTeX numeric token');
      // Official sTeX emits variableName.special for identifiers; CM6 may
      // merge adjacent rendered spans, so do not assert a literal DOM span T.
      assert(!tokenSamples.some(t=>t.cls.includes('cm-ob-syntax-math-command')),
        'handwritten TeX token styles must not return');
      const inline=await inspect('E=mc^2',['cm-ob-syntax-math-fence']);
      assert(inline['cm-ob-syntax-math-fence'].text.includes('$'));
      await page.evaluate(()=>{
        const view=window.__v6cm6.view,at=view.state.doc.toString().indexOf('\\sqrt{');
        view.dispatch({selection:{anchor:at},scrollIntoView:true});
      });
      await page.waitForFunction(()=>[...document.querySelectorAll('#editor .cm-line')]
        .some(line=>line.textContent.includes('\\sqrt{')),null,{timeout:13000});
      const fenceLines=await page.locator('#editor .cm-line').filter({hasText:'```math'})
        .locator('.cm-ob-syntax-math-fence').allTextContents();
      assert(fenceLines.some(text=>text.includes('math')),name+' fenced math delimiter should be colored');
      await page.evaluate(()=>{
        const view=window.__v6cm6.view,at=view.state.doc.toString().indexOf('Should stay code');
        view.dispatch({selection:{anchor:at},scrollIntoView:true});
      });
      const fenced=await page.locator('#editor .cm-line').filter({hasText:'Should stay code'}).first()
        .evaluate(line=>line.querySelectorAll('[class*="cm-ob-syntax-html-"]').length);
      assert.equal(fenced,0,'HTML source highlight must not enter fenced code');
      await page.evaluate(()=>window.__v6cm6.view.dispatch({selection:{anchor:0},scrollIntoView:true}));
      assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.toString()),source);
      assert.deepEqual(errors,[]);
      console.log('OBSIDIAN_SOURCE_SYNTAX_PASS',name,JSON.stringify({htmlTag:true,
        htmlAttributes:true,htmlBlock:true,mathTokens:true,inlineMath:true,
        fencedMath:true,fencedCodeExcluded:true,sourceUnchanged:true}));
    }finally{await browser?.close();}
  }
}finally{server.kill('SIGTERM');rmSync(folder,{recursive:true,force:true});}
