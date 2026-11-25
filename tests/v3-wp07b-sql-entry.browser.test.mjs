/** WP07B 双浏览器回归（Chromium + iPad-WebKit）：
 * 验证真实页面入口路径：Settings 页 ->「进入 V3 工作台」-> 显性「生成 V3 SQL」按钮 ->
 * 点击导入 MinerUJSON -> 基础表 -> 逻辑表 -> 自动加载进 CM6、AG 视图与顶部状态栏反馈。
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

function makeBookSnapshot() {
  const b1 = '# Real Book Heading\n\n';
  const b2 = 'Body with $$E=mc^2$$ and [^1].\n\n';
  const markdown = b1 + b2;
  return {
    schema: 'v3-logical-md/v1',
    markdown,
    sha256: sha256(markdown),
    structureSha256: 'c'.repeat(64),
    rowCount: 2,
    lengthUtf16: markdown.length,
    segments: [
      {logicalId: 1, baseBlockId: 1, parentId: null, logicalOrder: 1, blockType: 'title', p: 0, b: 0, s: 0, rawPath: '$', startChar: 0, endChar: b1.length, startUtf16: 0, endUtf16: b1.length, fragmentSha256: sha256(b1)},
      {logicalId: 2, baseBlockId: 2, parentId: null, logicalOrder: 2, blockType: 'text', p: 0, b: 1, s: 0, rawPath: '$', startChar: b1.length, endChar: markdown.length, startUtf16: b1.length, endUtf16: markdown.length, fragmentSha256: sha256(b2)},
    ],
  };
}

let dbInitialized = false;
const bookSnap = makeBookSnapshot();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (url.pathname.startsWith('/labs/lab-frame/api/workspace-io/')) {
    res.writeHead(403, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({error: 'isolated test mode'}));
    return;
  }
  if (url.pathname === '/labs/lab-ocr-v3/api/mineru-base/state') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({exists: dbInitialized}));
    return;
  }
  if (url.pathname === '/labs/lab-ocr-v3/api/mineru-base/import' && req.method === 'POST') {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(body.confirm, 'import-v3-mineru-base');
    dbInitialized = true;
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({ok: true, rowCount: bookSnap.rowCount}));
    return;
  }
  if (url.pathname === '/labs/lab-ocr-v3/api/mineru-base/markdown') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(bookSnap));
    return;
  }
  if (url.pathname === '/labs/lab-ocr-v3/api/mineru-base/pdf-map') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({pages: [], totalPages: 0}));
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
    dbInitialized = false;
    const browser = await engine.launch({headless: true});
    try {
      const page = await browser.newPage({viewport: {width: 1032, height: 642}, hasTouch: true});
      const errors = [];
      page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push('console: ' + msg.text());
      });

      await page.goto(baseUrl, {waitUntil: 'networkidle'});
      // 模拟用户选中 F02 目录触发 v3-workspace-verified
      await page.evaluate(() => {
        document.dispatchEvent(new CustomEvent('v3-workspace-verified', {detail: {path: '/tmp/real-book-dir'}}));
      });

      // 1) 在 settings 页即可看到「进入 V3 工作台」按钮并点击进入
      const enterBtn = page.locator('#settings-workspace .ocr-v3-enter-workspace-btn');
      await enterBtn.waitFor({state: 'visible'});
      await enterBtn.click();

      // 2) 进入工作台后可立即看到「生成 V3 SQL」按钮
      const sqlBtn = page.locator('#workspace .ocr-v3-import-btn');
      await sqlBtn.waitFor({state: 'visible'});
      assert.equal(await sqlBtn.textContent(), '生成 V3 SQL');

      // 3) 点击「生成 V3 SQL」触发导入并在 CM6 与 AG 中加载真实书籍
      await sqlBtn.click();
      await page.waitForFunction(
        () => document.querySelector('#workspace .ocr-v3-import-btn')?.textContent === '已连 V3 SQL',
      );
      await page.waitForSelector('#workspace:not([hidden]) .ocr-outline-grid .ag-row');

      const docText = await page.evaluate(() =>
        document.querySelector('#workspace #editor').v3SourcePort.getDoc().toString(),
      );
      assert.equal(docText, bookSnap.markdown, `${name}: CM6 doc did not load imported SQL markdown`);

      assert.deepEqual(errors, [], `${name}: unexpected console/page errors: ${errors.join('; ')}`);
      console.log('V3_WP07B_SQL_ENTRY_BROWSER_PASS', name);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
