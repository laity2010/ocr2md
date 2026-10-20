/**
 * Visible Mac Chrome with real-iPad-sized page viewport for manual V6 UI acceptance.
 * The 1032x642 default came from physical iPad Safari DeviceDebug, not the device's
 * 1194x834 full-panel resolution. Browser chrome stays outside the test viewport.
 * Does not share a browser profile with the user's ordinary Chrome or previous test.
 *
 * Run: node scripts/v6_ipad_chrome.mjs
 * Override when a newer physical device report is available: V6_IPAD_VIEWPORT=1032x642 node ...
 */
import {chromium, devices} from 'playwright';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.env.V6_IPAD_VIEWPORT || '1032x642';
const match = /^(\d{3,4})x(\d{3,4})$/.exec(input);
if (!match) throw Error('V6_IPAD_VIEWPORT must be WIDTHxHEIGHT');
const viewport = {width:Number(match[1]), height:Number(match[2])};
const profile = resolve(root, '.v6/manual-ipad-realviewport-profile');
const device = {...devices['iPad Pro 11 landscape'], viewport};
const browser = await chromium.launchPersistentContext(profile, {
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:false,
  ...device,
  args:[`--window-size=${viewport.width+78},${viewport.height+138}`, '--window-position=65,55', '--no-first-run'],
});
try {
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://192.168.1.10:4443/', {waitUntil:'domcontentloaded', timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#count')?.textContent.includes('行'), {timeout:30000});
  await page.evaluate(()=>document.fonts.ready);
  const state = await page.evaluate(()=>({
    viewport:[innerWidth,innerHeight],
    editorSize:getComputedStyle(document.querySelector('.cm-content')).fontSize,
    editorFont:getComputedStyle(document.querySelector('.cm-content')).fontFamily,
    uiFont:getComputedStyle(document.querySelector('.brand')).fontFamily,
    touch:'ontouchstart' in window,
    pixelRatio:devicePixelRatio,
    version:document.querySelector('#build-version').textContent,
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
  }));
  console.log('V6_VISIBLE_IPAD_CHROME_READY',JSON.stringify({url:page.url(), ...state}));
  await new Promise(resolve=>browser.on('close',resolve));
} finally {
  await browser.close().catch(()=>{});
}
