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
  'A deliberately long paragraph to test automatic soft wrapping: '+ 'Sarasa Fixed SC with English words and 中文等宽文字。 '.repeat(35),
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
    if(process.env.V6_ONLY_WEBKIT&&name!=='WebKit')continue;
    const browser = await engine.launch({headless:true,...launchOptions});
    try {
      const page = await browser.newPage({
        ...devices['iPad Pro 11 landscape'],
        viewport:{width:1032,height:642},
      });
      const pageErrors=[];
      page.on('pageerror',error=>pageErrors.push(error.message));
      await page.goto('http://127.0.0.1:5198/',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('行'));
      await page.evaluate(()=>document.fonts.ready);
      const result=await page.evaluate(()=>{
        const css=el=>getComputedStyle(el);
        const editor=document.querySelector('#editor .cm-editor');
        const scroller=document.querySelector('#editor .cm-scroller');
        const content=document.querySelector('#editor .cm-content');
        const lines=[...document.querySelectorAll('#editor .cm-line')];
        const headings=lines.slice(0,6).map(line=>({
          text:line.textContent,
          fontSize:css(line).fontSize,
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
          docSource:window.__v6cm6.view.state.doc.toString(),
          softWrap:css(content).whiteSpace,
          hardReturnMarkers:document.querySelectorAll('.cm-ob-hard-return').length,
          docRows:document.querySelector('#status').textContent,
        };
      });
      assert.deepEqual(result.viewport,[1032,642]);
      assert.equal(result.fontSize,'16px');
      assert.match(result.fontFamily,/OCR2MD Sarasa/);
      assert.equal(result.editorBackground,'rgb(47, 56, 62)');
      assert.equal(result.editorText,'rgb(211, 198, 170)');
      const expected=['rgb(218, 99, 98)','rgb(215, 127, 72)','rgb(191, 152, 61)',
        'rgb(137, 156, 64)','rgb(86, 157, 121)','rgb(184, 123, 157)'];
      const expectedSizes=['34px','26px','22px','20px','18px','18px'];
      for(let i=0;i<6;i++) {
        assert(result.headings[i].colors.length > 0 && result.headings[i].colors.every(c=>c===expected[i]),
          name+' H'+(i+1)+' marker/text colors differ: '+JSON.stringify(result.headings[i]));
        assert.equal(result.headings[i].fontSize,expectedSizes[i],name+' H'+(i+1)+' font size');
      }
      // CM6 virtualizes off-screen DOM lines; source is authoritative.
      assert(result.docSource.includes('minerujson:block:v1:1:2'));
      assert.match(result.softWrap,/pre-wrap|break-spaces/);
      assert(result.hardReturnMarkers>=6,'physical line breaks must show markers');
      assert(result.docSource.includes('A deliberately long paragraph'));
      assert(!result.docSource.includes('↵'),'hard-return glyph must never enter Markdown source');
      const wrapTest=await page.evaluate(()=>{
        const view=window.__v6cm6.view;
        const offset=view.state.doc.toString().indexOf('A deliberately long paragraph');
        view.dispatch({selection:{anchor:offset},scrollIntoView:true});
        const line=[...document.querySelectorAll('.cm-line')].find(el=>el.textContent.includes('A deliberately long paragraph'));
        return {height:line?.getBoundingClientRect().height,hardMarkers:line?.querySelectorAll('.cm-ob-hard-return').length,docLength:view.state.doc.length};
      });
      assert(wrapTest.height>45,name+' long line should wrap in wide viewport');
      assert.equal(wrapTest.hardMarkers,1,'a wrapped logical line needs one real EOL marker');
      await page.setViewportSize({width:760,height:642});
      await page.evaluate(()=>window.__v6cm6.view.requestMeasure());
      // CM6 remeasures wrapped lines asynchronously after Dockview resizing.
      // Wait for actual geometry rather than racing WebKit's next layout frame.
      await page.waitForFunction(previous=>{
        const line=[...document.querySelectorAll('.cm-line')]
          .find(el=>el.textContent.includes('A deliberately long paragraph'));
        return line?.getBoundingClientRect().height>previous+1;
      },wrapTest.height,{timeout:16000});
      const narrow=await page.evaluate(()=>{
        const el=[...document.querySelectorAll('.cm-line')].find(el=>el.textContent.includes('A deliberately long paragraph'));
        return {height:el?.getBoundingClientRect().height,hardMarkers:el?.querySelectorAll('.cm-ob-hard-return').length,source:window.__v6cm6.view.state.doc.toString(),width:document.querySelector('#editor .cm-scroller').getBoundingClientRect().width,viewport:innerWidth};
      });
      console.log('THEME_WRAP_MEASURE',name,JSON.stringify({wide:wrapTest.height,narrow:narrow.height,width:narrow.width,viewport:narrow.viewport}));
      assert(narrow.height>wrapTest.height,name+' narrow window should cause more soft wrapping');
      assert.equal(narrow.hardMarkers,1,'soft line wrapping must not create extra hard-return markers');
      assert.equal(narrow.source,result.docSource,'resizing window must never rewrite Markdown');
      assert.deepEqual(pageErrors,[],name+' browser JS errors');
      await page.setViewportSize({width:1032,height:642});
      await page.screenshot({path:`.v6/evidence/obsidian-everforest-${name.toLowerCase()}.png`});
      console.log('OBSIDIAN_CM6_STYLE_PASS',name,JSON.stringify({
        viewport:result.viewport,fontSize:result.fontSize,headingSizes:expectedSizes,
        colors:expected,sourcePreserved:true,documentRows:result.docRows,
        wideLineHeight:wrapTest.height,narrowLineHeight:narrow.height,
        hardReturnMarkers:result.hardReturnMarkers,
      }));
    } finally {await browser.close();}
  }
} finally {
  server.kill('SIGTERM');
}
