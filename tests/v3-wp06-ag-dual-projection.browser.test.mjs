/** WP06 双浏览器（Chromium + iPad-WebKit）端到端回归：
 * 验证统一 AG Grid 双投影（逻辑块审阅 + MD Line 行级投影）、全部/单页过滤、
 * V1 原生 EnumCheckboxFilter、纯焦点切换不重设 rowData 护栏及 AG -> CM6 点击定位。
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {existsSync, readFileSync, statSync} from 'node:fs';
import http from 'node:http';
import {extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, webkit} from 'playwright';

const DIST = resolve(fileURLToPath(new URL('../labs/lab-ocr-v3/dist', import.meta.url)));
assert.equal(existsSync(join(DIST, 'index.html')), true, 'Build labs/lab-ocr-v3/dist first');

const HOST = '127.0.0.1';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.mjs': 'application/javascript; charset=utf-8',
};

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function makeTwoPageSnapshot() {
  const b1 = '# Page 0 Title\n\n';
  const b2 = 'Page 0 body.\n\n';
  const b3 = 'Page 1 line A\nPage 1 line B\n\n';
  const markdown = b1 + b2 + b3;
  return {
    schema: 'v3-logical-md/v1',
    markdown,
    sha256: sha256(markdown),
    structureSha256: 'a'.repeat(64),
    rowCount: 3,
    lengthUtf16: markdown.length,
    segments: [
      {logicalId: 1, baseBlockId: 1, parentId: null, logicalOrder: 1, blockType: 'title', p: 0, b: 0, s: 0, rawPath: '$', startChar: 0, endChar: b1.length, startUtf16: 0, endUtf16: b1.length, fragmentSha256: sha256(b1)},
      {logicalId: 2, baseBlockId: 2, parentId: null, logicalOrder: 2, blockType: 'text', p: 0, b: 1, s: 0, rawPath: '$', startChar: b1.length, endChar: b1.length + b2.length, startUtf16: b1.length, endUtf16: b1.length + b2.length, fragmentSha256: sha256(b2)},
      {logicalId: 3, baseBlockId: 3, parentId: null, logicalOrder: 3, blockType: 'text', p: 1, b: 0, s: 0, rawPath: '$', startChar: b1.length + b2.length, endChar: markdown.length, startUtf16: b1.length + b2.length, endUtf16: markdown.length, fragmentSha256: sha256(b3)},
    ],
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (url.pathname.startsWith('/labs/lab-frame/api/workspace-io/')) {
    res.writeHead(403, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({error: 'isolated test mode'}));
    return;
  }
  if (!url.pathname.startsWith('/labs/lab-ocr-v3/')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const rel = url.pathname.slice('/labs/lab-ocr-v3/'.length) || 'index.html';
  const file = resolve(DIST, rel);
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end('Missing asset');
    return;
  }
  const type = MIME[extname(file)] || 'application/octet-stream';
  res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-store'});
  res.end(readFileSync(file));
});

await new Promise((done) => server.listen(0, HOST, done));
const {port} = server.address();
const baseUrl = `http://${HOST}:${port}/labs/lab-ocr-v3/`;

try {
  for (const [name, engine] of [['Chromium', chromium], ['iPad-WebKit', webkit]]) {
    const browser = await engine.launch({headless: true});
    try {
      const page = await browser.newPage({viewport: {width: 1032, height: 642}, hasTouch: true});
      const errors = [];
      page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push('console: ' + msg.text());
      });

      await page.goto(baseUrl, {waitUntil: 'networkidle'});
      const snapshot = makeTwoPageSnapshot();

      await page.evaluate(async (snap) => {
        document.dispatchEvent(new Event('v3-show-frame'));
        const editorHost = document.querySelector('#workspace #editor');
        await editorHost.v3SourcePort.loadSnapshot(snap, {workspace: '/tmp/v3-wp06-book'});
      }, snapshot);

      await page.waitForSelector('#workspace:not([hidden]) .ocr-outline-grid .ag-row');

      // 1) 默认按焦点页 p=0 过滤：仅显示 2 行（p0b0s0, p0b1s0）
      const page0Rows = await page.evaluate(() =>
        document.querySelector('#workspace .ocr-outline-grid').v3GridPort.getDisplayedRows().map((r) => r.pbs),
      );
      assert.deepEqual(page0Rows, ['p0b0s0', 'p0b1s0'], `${name}: default p=0 filter failed`);

      // 2) 纯焦点切换护栏：同页内 CM6 光标移到第 2 块，AG 不重设 rowData 且正确选中第 2 行
      const focusGuard = await page.evaluate(() => {
        const gridHost = document.querySelector('#workspace .ocr-outline-grid');
        let setRowsCalls = 0;
        const origSetRows = gridHost.v3GridPort.setRows;
        // 通过监听 AG DOM row-id 是否重建来验证未重绘整表
        const firstRowEl = gridHost.querySelector('.ag-row[row-index="0"]');
        const view = document.querySelector('#workspace #editor').v3SourcePort.getView();
        const pos2 = view.state.doc.toString().indexOf('Page 0 body.');
        view.dispatch({selection: {anchor: pos2}});
        const selected = Array.from(gridHost.querySelectorAll('.ag-row-selected')).map((el) =>
          el.getAttribute('row-index'),
        );
        const sameRowDom = gridHost.querySelector('.ag-row[row-index="0"]') === firstRowEl;
        return {selected, sameRowDom, setRowsCalls, orig: typeof origSetRows};
      });
      assert.equal(focusGuard.sameRowDom, true, `${name}: AG rows recreated on same-page focus`);
      assert.deepEqual(focusGuard.selected, ['1'], `${name}: AG did not select focused row 1`);

      // 3) 勾选「全部」显示全书 3 个逻辑块
      await page.locator('#workspace .ocr-v3-ag-all-toggle input').click();
      const allBlockRows = await page.evaluate(() =>
        document.querySelector('#workspace .ocr-outline-grid').v3GridPort.getDisplayedRows().map((r) => r.pbs),
      );
      assert.deepEqual(allBlockRows, ['p0b0s0', 'p0b1s0', 'p1b0s0'], `${name}: show all failed`);

      // 4) 切换至通用 MD Line 行级投影：3 个块分别含 2 + 2 + 3 = 7 条真实 LF 行
      await page.locator('#workspace .ocr-v3-ag-view-select').selectOption('mdline');
      const mdLineRows = await page.evaluate(() =>
        document.querySelector('#workspace .ocr-outline-grid').v3GridPort.getDisplayedRows().map((r) => ({
          line: r.sourceLine,
          pbs: r.pbs,
          mdLine: r.mdLine,
        })),
      );
      assert.equal(mdLineRows.length, 7, `${name}: expected 7 MD lines`);
      assert.equal(mdLineRows[4].mdLine, 'Page 1 line A');
      assert.equal(mdLineRows[5].mdLine, 'Page 1 line B');

      // 5) 点击 MD Line 第 6 行，联动移动 CM6 光标到第 6 行（'Page 1 line B'）
      await page.locator('#workspace .ocr-outline-grid .ag-row[row-index="5"]').click();
      const cmAnchorLine = await page.evaluate(() => {
        const view = document.querySelector('#workspace #editor').v3SourcePort.getView();
        return view.state.doc.lineAt(view.state.selection.main.head).number;
      });
      assert.equal(cmAnchorLine, 6, `${name}: AG click did not move CM6 selection to line 6`);

      assert.deepEqual(errors, [], `${name}: unexpected console/page errors: ${errors.join('; ')}`);
      console.log('V3_WP06_AG_DUAL_PROJECTION_BROWSER_PASS', name);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
