/** WP04 双浏览器（Chromium + iPad-WebKit）真实工作台回归：
 * 验证单源 CM6 键盘输入、850ms 空闲增量 md-commit（structureSha256 + beforeSha256）、
 * 跨块编辑拦截视觉反馈（cm-v3-boundary-blocked-line）、原生 Undo/Redo 及 409 冲突保内存。
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
};

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function makeFixtureSnapshot() {
  const b1 = '# Heading One\n\n';
  const b2 = 'Second block text.\n\n';
  const markdown = b1 + b2;
  return {
    schema: 'v3-logical-md/v1',
    markdown,
    sha256: sha256(markdown),
    structureSha256: 'c'.repeat(64),
    rowCount: 2,
    lengthUtf16: markdown.length,
    segments: [
      {
        logicalId: 101,
        baseBlockId: 101,
        parentId: null,
        logicalOrder: 1,
        blockType: 'title',
        p: 0,
        b: 0,
        s: 0,
        rawPath: '$',
        startChar: 0,
        endChar: b1.length,
        startUtf16: 0,
        endUtf16: b1.length,
        fragmentSha256: sha256(b1),
      },
      {
        logicalId: 102,
        baseBlockId: 102,
        parentId: null,
        logicalOrder: 2,
        blockType: 'text',
        p: 0,
        b: 1,
        s: 0,
        rawPath: '$',
        startChar: b1.length,
        endChar: markdown.length,
        startUtf16: b1.length,
        endUtf16: markdown.length,
        fragmentSha256: sha256(b2),
      },
    ],
  };
}

let commitPayloads = [];
let conflictMode = false;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (url.pathname.startsWith('/labs/lab-frame/api/workspace-io/')) {
    res.writeHead(403, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({error: 'isolated test mode'}));
    return;
  }
  if (url.pathname === '/labs/lab-ocr-v3/api/mineru-base/md-commit' && req.method === 'POST') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const payload = JSON.parse(raw);
      commitPayloads.push(payload);
      if (conflictMode) {
        res.writeHead(409, {'Content-Type': 'application/json; charset=utf-8'});
        res.end(JSON.stringify({error: '模拟并发冲突'}));
        return;
      }
      const updatedHashes = {};
      for (const ch of payload.changes) {
        updatedHashes[String(ch.logicalId)] = sha256(ch.after);
      }
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(
        JSON.stringify({
          saved: true,
          changedRows: payload.changes.length,
          baseChanged: false,
          structureSha256: payload.structureSha256,
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
    commitPayloads = [];
    conflictMode = false;
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
        await editorHost.v3SourcePort.loadSnapshot(snap, {workspace: '/tmp/v3-test-book'});
      }, snapshot);

      await page.waitForSelector('#workspace:not([hidden]) #editor .cm-editor');

      // 1) 真实键盘输入修改块 1，等待 850ms 空闲增量 md-commit
      const content = page.locator('#workspace #editor .cm-content');
      await content.click();
      await page.evaluate(() => {
        const view = document.querySelector('#workspace #editor').v3SourcePort.getView();
        view.dispatch({selection: {anchor: '# Heading One'.length}});
        view.focus();
      });
      await page.keyboard.type(' Edited');

      await page.waitForFunction(() => {
        const port = document.querySelector('#workspace #editor')?.v3SourcePort;
        return port && port.getState().dirty === false;
      }, {timeout: 5000});

      assert.equal(commitPayloads.length, 1, `${name}: expected 1 idle md-commit`);
      assert.equal(commitPayloads[0].confirm, 'commit-v3-md');
      assert.equal(commitPayloads[0].structureSha256, 'c'.repeat(64));
      assert.equal(commitPayloads[0].changes[0].logicalId, 101);
      assert.equal(commitPayloads[0].changes[0].beforeSha256, sha256('# Heading One\n\n'));
      assert.equal(commitPayloads[0].changes[0].after, '# Heading One Edited\n\n');

      // 2) 跨块删除拦截与轻量闪烁视觉反馈
      await page.evaluate(() => {
        const view = document.querySelector('#workspace #editor').v3SourcePort.getView();
        const b1 = view.state.doc.toString().indexOf('Second block');
        view.dispatch({selection: {anchor: b1 - 1, head: b1 + 2}});
        view.focus();
      });
      await page.keyboard.press('Backspace');

      const blockedUi = await page.evaluate(() => ({
        hasFlash: Boolean(document.querySelector('#workspace #editor .cm-v3-boundary-blocked-line')),
        text: document.querySelector('#workspace #editor').v3SourcePort.getDoc().toString(),
      }));
      assert.equal(blockedUi.hasFlash, true, `${name}: boundary flash class missing`);
      assert.ok(blockedUi.text.includes('Second block text.'), `${name}: cross-block delete was not blocked`);

      // 3) 409 冲突时保留 CM6 当前正文与 dirty=true，不丢失用户输入
      conflictMode = true;
      await page.evaluate(() => {
        const view = document.querySelector('#workspace #editor').v3SourcePort.getView();
        const pos = view.state.doc.toString().indexOf('Second block') + 'Second block'.length;
        view.dispatch({selection: {anchor: pos}});
        view.focus();
      });
      await page.keyboard.type(' Kept');
      await page.waitForTimeout(1150);

      const conflictState = await page.evaluate(() => {
        const port = document.querySelector('#workspace #editor').v3SourcePort;
        return {
          dirty: port.getState().dirty,
          text: port.getDoc().toString(),
        };
      });
      assert.equal(conflictState.dirty, true, `${name}: dirty should stay true after 409 conflict`);
      assert.ok(conflictState.text.includes('Second block Kept'), `${name}: text lost on 409 conflict`);

      // 4) 点击工具栏 #undo 按钮恢复并验证原生历史有效
      await page.locator('#workspace #undo').click();
      const afterUndoText = await page.evaluate(() =>
        document.querySelector('#workspace #editor').v3SourcePort.getDoc().toString(),
      );
      assert.equal(afterUndoText.includes('Second block Kept'), false, `${name}: undo button failed`);

      assert.deepEqual(errors, [], `${name}: unexpected console/page errors: ${errors.join('; ')}`);
      console.log('V3_WP04_SOURCE_SESSION_BROWSER_PASS', name);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
