/**
 * Mac visible iPad layout acceptance: ordinary GPU-accelerated Google Chrome.
 * Playwright does NOT launch or own the browser. A tiny CDP connection only
 * holds the emulated viewport while Chrome stays independently usable.
 *
 * Run: node scripts/v6_ipad_chrome.mjs
 * Optional: V6_IPAD_VIEWPORT=1032x642 node scripts/v6_ipad_chrome.mjs
 * For screenshots, other tools may attach to 127.0.0.1:19396 without replacing
 * this controller. Do not change the emulation settings from screenshot tools.
 */
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.env.V6_IPAD_VIEWPORT || '1032x642';
const match = /^(\d{3,4})x(\d{3,4})$/.exec(input);
if (!match) throw Error('V6_IPAD_VIEWPORT must be WIDTHxHEIGHT');
const viewport = {width: Number(match[1]), height: Number(match[2])};
const profile = resolve(root, '.v6/native-ipad-comparison-profile');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 19396;
const origin = 'https://192.168.1.10:4443/';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function targets() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) return response.json();
  } catch { /* Browser not running yet. */ }
  return null;
}

// Reuse the already-open native Chrome, including its font cache and tabs.
const existing = await targets();
if (!existing) {
  const child = spawn(chrome, [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    '--no-first-run', '--no-default-browser-check',
    `--window-size=${viewport.width + 78},${viewport.height + 138}`,
    '--window-position=180,95', origin,
  ], {stdio: 'ignore', detached: true});
  child.unref(); // Chrome outlives command and automation sessions.
}
let pages = existing;
for (let attempt = 0; !pages && attempt < 150; attempt++) {
  await delay(200);
  pages = await targets();
}
if (!pages) throw Error('Native Chrome CDP did not become ready');
let page = pages.find(item => item.type === 'page' && item.url.startsWith(origin));
if (!page) {
  // Existing browser has no V6 tab; add one without changing existing tabs.
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`, {
    method: 'PUT', signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Error(`Cannot open V6 tab: HTTP ${response.status}`);
  page = await response.json();
}
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener('open', resolveOpen, {once:true});
  socket.addEventListener('error', rejectOpen, {once:true});
});
const pending = new Map();
let nextId = 1;
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  const promise = pending.get(message.id);
  if (!promise) return;
  pending.delete(message.id);
  if (message.error) promise.reject(Error(message.error.message));
  else promise.resolve(message.result);
});
function send(method, params = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const id = nextId++;
    pending.set(id, {resolve: resolveCommand, reject: rejectCommand});
    socket.send(JSON.stringify({id, method, params}));
  });
}
await send('Emulation.setDeviceMetricsOverride', {
  ...viewport, deviceScaleFactor:2, mobile:true,
  screenWidth:viewport.width, screenHeight:viewport.height,
  screenOrientation:{type:'landscapePrimary', angle:90},
});
await send('Emulation.setTouchEmulationEnabled', {enabled:true, maxTouchPoints:5});
await send('Emulation.setUserAgentOverride', {
  userAgent:'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  platform:'iPad',
});
// Cold launch: reload once after emulation is enabled. Reattach: never reload
// an already-open page, since it may have unsaved edits.
if (!existing) await send('Page.reload', {ignoreCache:false});
let state = null;
for (let attempt = 0; attempt < 100; attempt++) {
  try {
    const result = await send('Runtime.evaluate', {
      expression:'JSON.stringify({ready:!!document.querySelector(".cm-content"),width:innerWidth,height:innerHeight,dpr:devicePixelRatio,touch:("ontouchstart" in window),touchPoints:navigator.maxTouchPoints,version:document.querySelector("#build-version")?.textContent,fonts:document.fonts.status})',
      returnByValue:true,
    });
    state = JSON.parse(result.result.value);
    if (state.ready && state.fonts === 'loaded') break;
  } catch { /* Page is still navigating. */ }
  await delay(200);
}
// Chrome 155 may omit window.ontouchstart even with CDP touch emulation
// correctly reporting navigator.maxTouchPoints=5.
if (!state?.ready || state.width !== viewport.width || state.height !== viewport.height || !(state.touch || state.touchPoints>0)) {
  throw Error('Native Chrome iPad emulation failed: ' + JSON.stringify(state));
}
console.log('V6_NATIVE_IPAD_CHROME_READY', JSON.stringify({url:page.url, ...state}));
// Keeping this small socket open preserves device emulation without Playwright.
// Chrome and its profile/cache are independent of screenshot/automation tools.
await new Promise(resolveClose => socket.addEventListener('close', resolveClose, {once:true}));
