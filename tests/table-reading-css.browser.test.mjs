/** Native HTML/CSS reading smoke: no grid, runtime JS or source transform.
 * Check iPad-width scroll containment and merged-cell layout in both engines.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const css=readFileSync('ui/markdown-preview.css','utf8');
const columns=Array.from({length:12},(_,i)=>`<th>Measure ${i+1}</th>`).join('');
const cells=Array.from({length:11},(_,i)=>`<td align="right">${(i+1)*12345}.67</td>`).join('');
const table=`<table><thead><tr><th rowspan="2">Fund</th><th colspan="11">Sample Distribution of Sharpe Ratios</th></tr><tr>${columns.slice(0,columns.lastIndexOf('<th>'))}</tr></thead><tbody><tr><td>Buffett</td>${cells}</tr><tr><td>Other fund</td>${cells}</tr></tbody></table>`;
const content=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body{margin:0;max-width:100%;} ${css}
  </style></head><body><main class="ocr-markdown">
  <p>Before table</p><figure class="table-block"><figcaption>【待填写：表格标题】</figcaption>
  ${table}
  <div class="table-notes"><p>【待填写：表格注释及来源】</p></div>
  </figure><p>After table</p>${table}</main></body></html>`;
for(const [name,engine] of [['Chrome',chromium],['iPad WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   for(const viewportWidth of [390,820]){
    const page=await browser.newPage({viewport:{width:viewportWidth,height:760},
      hasTouch:name.includes('iPad'),isMobile:name.includes('iPad')});
    await page.setContent(content,{waitUntil:'load'});
    const values=await page.evaluate(()=>{
      const figure=document.querySelector('figure.table-block');
      const table=figure.querySelector('table');
      const notes=figure.querySelector('.table-notes');
      const caption=figure.querySelector('figcaption');
      return {
        pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        tableClient:table.clientWidth,tableScroll:table.scrollWidth,
        figureClient:figure.clientWidth,tableDisplay:getComputedStyle(table).display,
        notesTop:notes.getBoundingClientRect().top,
        tableBottom:table.getBoundingClientRect().bottom,
        titleTop:caption.getBoundingClientRect().top,
        tableTop:table.getBoundingClientRect().top,
        mergedRows:table.querySelector('th[rowspan]').rowSpan,
        mergedCols:table.querySelector('th[colspan]').colSpan,
        shade:getComputedStyle(table.querySelector('th')).backgroundColor,
        figureBorder:getComputedStyle(figure).borderTopStyle,
        scripts:document.querySelectorAll('script').length,
      };
    });
    assert(values.pageOverflow<=2,'whole reading page overflowed horizontally: '+JSON.stringify(values));
    assert(values.tableScroll>values.tableClient+30,'wide native table must scroll inside itself');
    assert(values.tableClient<=values.figureClient,'table should stay within figure');
    assert(values.titleTop<values.tableTop&&values.tableBottom<values.notesTop,
      'three-part order must remain title > data > notes');
    assert.equal(values.tableDisplay,'block');
    assert.equal(values.mergedRows,2);assert.equal(values.mergedCols,11);
    assert.notEqual(values.shade,'rgba(0, 0, 0, 0)');
    assert.equal(values.figureBorder,'solid');assert.equal(values.scripts,0);
    // Scroll the table without scrolling the whole document horizontally.
    await page.locator('figure.table-block table').evaluate(node=>node.scrollLeft=200);
    assert(await page.locator('figure.table-block table').evaluate(node=>node.scrollLeft)>=30);
    console.log('TABLE_CSS_BROWSER_PASS',name,viewportWidth,JSON.stringify(values));
    await page.close();
   }
  }finally{await browser.close();}
}
