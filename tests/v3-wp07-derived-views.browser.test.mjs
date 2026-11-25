/** WP07 双浏览器（Chromium + iPad-WebKit）端到端回归：
 * 验证独立语法派生层 + 标题 View（严格 MD Line、source_line、PBS 前三列顺序并清除 pinned）
 * + 跨页注释配对 View + 原生 EnumCheckboxFilter 筛选 + AG -> CM6 点击跳转。
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

function makeDerivedSnapshot() {
  const b1 = '# Chapter 1\n\n'; // L1-L2
  const b2 = 'Body with [^1] and [^lost].\n\n'; // L3-L4
  const b3 = '```md\n# Fence Heading\n```\n\n'; // L5-L8
  const b4 = '## Section 1.1\n[^1]: Footnote one\n\n'; // L9-L11
  const markdown = b1 + b2 + b3 + b4;
  let cursor = 0;
  const raw = [
    {logicalId: 1, p: 0, b: 0, blockType: 'title', text: b1},
    {logicalId: 2, p: 0, b: 1, blockType: 'text', text: b2},
    {logicalId: 3, p: 1, b: 0, blockType: 'code', text: b3},
    {logicalId: 4, p: 1, b: 1, blockType: 'text', text: b4},
  ];
  const segments = raw.map((item, idx) => {
    const startChar = cursor;
    cursor += item.text.length;
    return {
      logicalId: item.logicalId,
      baseBlockId: item.logicalId,
      parentId: null,
      logicalOrder: idx + 1,
      blockType: item.blockType,
      p: item.p,
      b: item.b,
      s: 0,
      rawPath: '$',
      startChar,
      endChar: cursor,
      startUtf16: startChar,
      endUtf16: cursor,
      fragmentSha256: sha256(item.text),
    };
  });
  return {
    schema: 'v3-logical-md/v1',
    markdown,
    sha256: sha256(markdown),
    structureSha256: 'b'.repeat(64),
    rowCount: segments.length,
    lengthUtf16: markdown.length,
    segments,
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
      await page.evaluate(async (snap) => {
        document.dispatchEvent(new Event('v3-show-frame'));
        const editorHost = document.querySelector('#workspace #editor');
        await editorHost.v3SourcePort.loadSnapshot(snap, {workspace: '/tmp/v3-wp07-book'});
      }, makeDerivedSnapshot());

      await page.waitForSelector('#workspace:not([hidden]) .ocr-outline-grid .ag-row');
      await page.locator('#workspace .ocr-v3-ag-all-toggle input').click();

      // 1) 确认 logical 初始状态下 pbs 为左固定
      const logicalColState = await page.evaluate(() =>
        document.querySelector('#workspace .ocr-outline-grid').v3GridPort.getColumnState().slice(0, 3),
      );
      assert.equal(logicalColState[0].colId, 'pbs');
      assert.equal(logicalColState[0].pinned, 'left');

      // 2) 切换至标题 View：核查 DOM 表头顺序与 ColumnState 均严格为 [mdLine, source_line, pbs]，且 pinned 全为 null
      await page.locator('#workspace .ocr-v3-ag-view-select').selectOption('headings');
      const headingAudit = await page.evaluate(() => {
        const gridHost = document.querySelector('#workspace .ocr-outline-grid');
        const headers = Array.from(gridHost.querySelectorAll('.ag-header-cell'))
          .map((el) => ({colId: el.getAttribute('col-id'), left: el.getBoundingClientRect().left}))
          .sort((a, b) => a.left - b.left)
          .map((h) => h.colId);
        const colState = gridHost.v3GridPort.getColumnState().map((c) => ({colId: c.colId, pinned: c.pinned}));
        const rows = gridHost.v3GridPort.getDisplayedRows().map((r) => ({
          mdLine: r.mdLine,
          source_line: r.source_line,
          pbs: r.pbs,
        }));
        return {headers, colState, rows};
      });
      assert.deepEqual(
        headingAudit.headers.slice(0, 3),
        ['mdLine', 'source_line', 'pbs'],
        `${name}: headings DOM header order mismatch`,
      );
      assert.deepEqual(
        headingAudit.colState.slice(0, 3),
        [
          {colId: 'mdLine', pinned: null},
          {colId: 'source_line', pinned: null},
          {colId: 'pbs', pinned: null},
        ],
        `${name}: headings ColumnState did not clear pinned or order`,
      );
      assert.deepEqual(
        headingAudit.rows,
        [
          {mdLine: '# Chapter 1', source_line: 1, pbs: 'p0b0s0'},
          {mdLine: '## Section 1.1', source_line: 9, pbs: 'p1b1s0'},
        ],
        `${name}: headings rows mismatch (fence should be ignored)`,
      );

      // 3) 点击第 2 条标题行，联动 CM6 光标跳转至第 9 行
      await page.locator('#workspace .ocr-outline-grid .ag-row[row-index="1"]').click();
      const headingJumpLine = await page.evaluate(() => {
        const view = document.querySelector('#workspace #editor').v3SourcePort.getView();
        return view.state.doc.lineAt(view.state.selection.main.head).number;
      });
      assert.equal(headingJumpLine, 9, `${name}: heading click did not move CM6 to line 9`);

      // 4) 切换至注释配对 View：核查跨页配对与点击跳转
      await page.locator('#workspace .ocr-v3-ag-view-select').selectOption('footnotes');
      const footnoteRows = await page.evaluate(() =>
        document.querySelector('#workspace .ocr-outline-grid').v3GridPort.getDisplayedRows().map((r) => ({
          noteId: r.noteId,
          role: r.role,
          pairStatus: r.pairStatus,
          peerSummary: r.peerSummary,
          source_line: r.source_line,
        })),
      );
      assert.deepEqual(footnoteRows, [
        {noteId: '[^1]', role: 'ref', pairStatus: 'matched', peerSummary: 'L10', source_line: 3},
        {noteId: '[^lost]', role: 'ref', pairStatus: 'orphan_ref', peerSummary: '缺失', source_line: 3},
        {noteId: '[^1]', role: 'def', pairStatus: 'matched', peerSummary: 'L3', source_line: 10},
      ]);

      // 使用原生 EnumCheckboxFilter 过滤 pairStatus === 'orphan_ref'
      await page.evaluate(async () => {
        const port = document.querySelector('#workspace .ocr-outline-grid').v3GridPort;
        await port.setFilterModel({pairStatus: {values: ['orphan_ref']}});
      });
      const filteredNotes = await page.evaluate(() =>
        document.querySelector('#workspace .ocr-outline-grid').v3GridPort.getDisplayedRows().map((r) => r.noteId),
      );
      assert.deepEqual(filteredNotes, ['[^lost]'], `${name}: EnumCheckboxFilter on pairStatus failed`);

      await page.locator('#workspace .ocr-outline-grid .ag-row[row-index="0"]:not(.ag-opacity-zero)').click();
      const noteJumpLine = await page.evaluate(() => {
        const view = document.querySelector('#workspace #editor').v3SourcePort.getView();
        return view.state.doc.lineAt(view.state.selection.main.head).number;
      });
      assert.equal(noteJumpLine, 3, `${name}: footnote click did not move CM6 to line 3`);

      assert.deepEqual(errors, [], `${name}: unexpected console/page errors: ${errors.join('; ')}`);
      console.log('V3_WP07_DERIVED_VIEWS_BROWSER_PASS', name);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
