/** WP05 双浏览器（Chromium + iPad-WebKit）回归：
 * 验证默认三窗（右侧 PDF 2/3）、切分四窗与恢复不重建同一 PDF 实例、
 * 焦点行号菜单（引用 >+）以及局部 ChangeSpec 拖拽触发 850ms structure-commit 与 Undo 同步恢复。
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

function makeFixtureSnapshot() {
  const b1 = '# Title A\n\n';
  const b2 = 'Paragraph B\n\n';
  const b3 = 'Paragraph C\n\n';
  const markdown = b1 + b2 + b3;
  return {
    schema: 'v3-logical-md/v1',
    markdown,
    sha256: sha256(markdown),
    structureSha256: 'e'.repeat(64),
    rowCount: 3,
    lengthUtf16: markdown.length,
    segments: [
      {logicalId: 1, baseBlockId: 1, parentId: null, logicalOrder: 1, blockType: 'title', p: 0, b: 0, s: 0, rawPath: '$', startChar: 0, endChar: b1.length, startUtf16: 0, endUtf16: b1.length, fragmentSha256: sha256(b1)},
      {logicalId: 2, baseBlockId: 2, parentId: null, logicalOrder: 2, blockType: 'text', p: 0, b: 1, s: 0, rawPath: '$', startChar: b1.length, endChar: b1.length + b2.length, startUtf16: b1.length, endUtf16: b1.length + b2.length, fragmentSha256: sha256(b2)},
      {logicalId: 3, baseBlockId: 3, parentId: null, logicalOrder: 3, blockType: 'text', p: 0, b: 2, s: 0, rawPath: '$', startChar: b1.length + b2.length, endChar: markdown.length, startUtf16: b1.length + b2.length, endUtf16: markdown.length, fragmentSha256: sha256(b3)},
    ],
  };
}

let structurePayloads = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (url.pathname.startsWith('/labs/lab-frame/api/workspace-io/')) {
    res.writeHead(403, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({error: 'isolated test mode'}));
    return;
  }
  if (url.pathname === '/labs/lab-ocr-v3/api/mineru-base/structure-commit' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      const payload = JSON.parse(raw);
      structurePayloads.push(payload);
      const updatedHashes = {};
      for (const t of payload.textChanges || []) {
        updatedHashes[String(t.logicalId)] = sha256(t.after);
      }
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(
        JSON.stringify({
          saved: true,
          changedRows: payload.changes.length,
          textChangedRows: (payload.textChanges || []).length,
          structureSha256: 'f'.repeat(64),
          updatedHashes,
        }),
      );
    });
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
    structurePayloads = [];
    const browser = await engine.launch({headless: true});
    try {
      const page = await browser.newPage({viewport: {width: 1032, height: 642}, hasTouch: true});
      const errors = [];
      page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push('console: ' + msg.text());
      });

      await page.goto(baseUrl, {waitUntil: 'networkidle'});
      const snapshot = makeFixtureSnapshot();

      await page.evaluate(async (snap) => {
        document.dispatchEvent(new Event('v3-show-frame'));
        const editorHost = document.querySelector('#workspace #editor');
        await editorHost.v3SourcePort.loadSnapshot(snap, {workspace: '/tmp/v3-wp05-book'});
      }, snapshot);

      await page.waitForSelector('#workspace:not([hidden]) #editor .cm-editor');

      // 1) 验证默认三窗布局：3 个 Dockview 面板、默认 pdf 模式、右侧 Preview 约 2/3 高度
      const layoutInfo = await page.evaluate(() => {
        const panels = document.querySelectorAll('#workspace .dv-view-container > .dv-view, #workspace .dv-groupview').length;
        const previewPane = document.querySelector('#workspace .ocr-preview-pane');
        const sourcePane = document.querySelector('#workspace .ocr-source-pane');
        const previewRect = previewPane?.getBoundingClientRect();
        const sourceRect = sourcePane?.getBoundingClientRect();
        const ratio = previewRect && sourceRect ? previewRect.height / (previewRect.height + sourceRect.height) : 0;
        const pdfSurface = document.querySelector('#workspace .ocr-preview-pdf-host');
        window.__wp05PdfSurface = pdfSurface;
        return {
          groups: panels,
          mode: previewPane?.dataset.previewMode,
          splitChecked: Boolean(document.querySelector('#workspace .ocr-preview-split-toggle input')?.checked),
          ratio,
        };
      });
      assert.equal(layoutInfo.mode, 'pdf', `${name}: default preview mode should be pdf`);
      assert.equal(layoutInfo.splitChecked, false, `${name}: default split should be unchecked`);
      assert.ok(layoutInfo.ratio > 0.58 && layoutInfo.ratio < 0.75, `${name}: preview ratio ${layoutInfo.ratio}`);

      // 2) 切分四窗与恢复：同一个 .ocr-preview-pdf-host 实例搬移而不重建
      await page.locator('#workspace .ocr-preview-split-toggle input').click();
      await page.waitForSelector('#workspace .ocr-detached-pdf-pane');
      const sameOnSplit = await page.evaluate(() =>
        document.querySelector('#workspace .ocr-detached-pdf-pane .ocr-preview-pdf-host') === window.__wp05PdfSurface,
      );
      assert.equal(sameOnSplit, true, `${name}: split should move same PDF host`);

      await page.locator('#workspace .ocr-preview-split-toggle input').click();
      const sameOnRestore = await page.evaluate(() =>
        document.querySelector('#workspace .ocr-preview-pane .ocr-preview-pdf-host') === window.__wp05PdfSurface,
      );
      assert.equal(sameOnRestore, true, `${name}: unsplit should restore same PDF host`);

      // 3) 触发局部 ChangeSpec 结构归组（块 3 归入块 2 为 child），核对 850ms 空闲 structure-commit
      await page.evaluate(() => {
        const port = document.querySelector('#workspace #editor').v3SourcePort;
        port.applyStructureMove({sourceBlockId: 3, targetBlockId: 2, placement: 'child'});
      });

      await page.waitForFunction(() => {
        const port = document.querySelector('#workspace #editor')?.v3SourcePort;
        return port && port.getState().dirty === false;
      }, {timeout: 5000});

      assert.equal(structurePayloads.length, 1, `${name}: expected 1 structure-commit`);
      assert.equal(structurePayloads[0].confirm, 'commit-v3-structure');
      assert.equal(structurePayloads[0].structureSha256, 'e'.repeat(64));
      assert.equal(structurePayloads[0].boundaryChecks.length, 1);
      assert.equal(structurePayloads[0].boundaryChecks[0].logicalId, 2);

      // 4) 点击 #undo 同步撤销结构与正文
      await page.locator('#workspace #undo').click();
      const afterUndo = await page.evaluate(() => {
        const port = document.querySelector('#workspace #editor').v3SourcePort;
        return {
          doc: port.getDoc().toString(),
          b3Parent: port.getStructure().blocks[2].parentId,
        };
      });
      assert.equal(afterUndo.doc, snapshot.markdown, `${name}: undo did not restore doc`);
      assert.equal(afterUndo.b3Parent, null, `${name}: undo did not restore structure parentId`);

      // 5) 焦点行号菜单（引用 >+）
      await page.evaluate(() => {
        const view = document.querySelector('#workspace #editor').v3SourcePort.getView();
        view.dispatch({selection: {anchor: 0}});
        view.focus();
      });
      const lineBtn = page.locator('#workspace #editor .ocr-cm-line-action-btn').first();
      await lineBtn.click();
      await page.waitForSelector('.ocr-cm-line-menu');
      await page.locator('.ocr-cm-line-menu-item', {hasText: '引用 >+'}).click();
      const quotedDoc = await page.evaluate(() =>
        document.querySelector('#workspace #editor').v3SourcePort.getDoc().toString(),
      );
      assert.ok(quotedDoc.startsWith('># Title A'), `${name}: quote >+ failed`);

      assert.deepEqual(errors, [], `${name}: unexpected console/page errors: ${errors.join('; ')}`);
      console.log('V3_WP05_LAYOUT_AND_DRAG_BROWSER_PASS', name);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
