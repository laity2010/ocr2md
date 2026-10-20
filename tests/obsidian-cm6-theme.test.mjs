import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {chromium, webkit, devices} from 'playwright';
import {homedir} from 'node:os';

// Isolated Vite service and document: never open or save the real V6 workspace.
const doc = '.v6/tests/obsidian-theme-probe.md';
mkdirSync('.v6/tests', {recursive:true});
mkdirSync('.v6/evidence', {recursive:true});
writeFileSync(doc, [
  '# First heading', '## Second heading', '### Third heading',
  '#### Fourth heading', '##### Fifth heading', '###### Sixth heading',
  'Ordinary text **strong** *emphasis* [link](https://example.com).',
  '> A quotation', '- A list item', '<!-- minerujson:block:v1:1:2 -->',
  '`inline code`', '',
].join('\n'));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js',
  '--host','127.0.0.1','--port','5198','--strictPort'], {
  env:{...process.env, V6_DOCUMENT_PATH:process.cwd()+'/'+doc},
  stdio:'ignore',
});

try {
  let ready = false;
  for(let i=0;i<120;i++) {
    try {ready=(await fetch('http://127.0.0.1:5198/')).ok; if(ready)break;} catch {}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert(ready,'V6 style test server did not start');

  const variants = [
    ['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
    ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}],
  ];
  for(const [name,engine,launchOptions] of variants) {
    const browser = await engine.launch({headless:true,...launchOptions});
    try {
      const page = await browser.newPage({
        ...devices['iPad Pro 11 landscape'],
        viewport:{width:1032,height:642},
      });
      await page.goto('http://127.0.0.1:5198/',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#count')?.textContent.includes('行'));
      await page.evaluate(()=>document.fonts.ready);
      const result=await page.evaluate(()=>{
        const css=el=>getComputedStyle(el);
        const editor=document.querySelector('#editor .cm-editor');
        const scroller=document.querySelector('#editor .cm-scroller');
        const content=document.querySelector('#editor .cm-content');
        const lines=[...document.querySelectorAll('#editor .cm-line')];
        const headings=lines.slice(0,6).map(line=>({
          text:line.textContent,
          colors:[...line.querySelectorAll('span')].filter(el=>/heading/i.test(el.textContent) || el.textContent.startsWith('#')).map(el=>css(el).color),
        }));
        return {
          viewport:[innerWidth,innerHeight],
          fontSize:css(editor).fontSize,
          fontFamily:css(scroller).fontFamily,
          editorBackground:css(editor).backgroundColor,
          editorText:css(editor).color,
          headings,
          fullText:content.textContent,
          docRows:document.querySelector('#count').textContent,
        };
      });
      assert.deepEqual(result.viewport,[1032,642]);
      assert.equal(result.fontSize,'16px');
      assert.match(result.fontFamily,/OCR2MD Sarasa/);
      assert.equal(result.editorBackground,'rgb(47, 56, 62)');
      assert.equal(result.editorText,'rgb(211, 198, 170)');
      const expected=['rgb(218, 99, 98)','rgb(215, 127, 72)','rgb(191, 152, 61)',
        'rgb(137, 156, 64)','rgb(86, 157, 121)','rgb(184, 123, 157)'];
      for(let i=0;i<6;i++) {
        assert(result.headings[i].colors.length > 0 && result.headings[i].colors.every(c=>c===expected[i]),
          name+' H'+(i+1)+' marker/text colors differ: '+JSON.stringify(result.headings[i]));
      }
      assert(result.fullText.includes('minerujson:block:v1:1:2'));
      await page.screenshot({path:`.v6/evidence/obsidian-everforest-${name.toLowerCase()}.png`});
      console.log('OBSIDIAN_CM6_STYLE_PASS',name,JSON.stringify({
        viewport:result.viewport,fontSize:result.fontSize,
        colors:expected,sourcePreserved:true,documentRows:result.docRows,
      }));
    } finally {await browser.close();}
  }
} finally {
  server.kill('SIGTERM');
}
