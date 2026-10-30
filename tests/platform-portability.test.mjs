/** Portable Playwright path policy: explicit override, Mac fallback, bundled Linux. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
test('browser paths do not assume developer Mac on Linux and accept explicit env',()=>{
  const names=['OCR2MD_CHROME_PATH','OCR2MD_WEBKIT_PATH','OCR2MD_AUDIT_CHROME_PATH','OCR2MD_AUDIT_WEBKIT_PATH'];
  const prior=Object.fromEntries(names.map(x=>[x,process.env[x]]));
  const platform=Object.getOwnPropertyDescriptor(process,'platform');
  try{
    for(const name of names)delete process.env[name];
    Object.defineProperty(process,'platform',{configurable:true,value:'linux'});
    assert.equal(chromeExecutable(),undefined,'Linux must use Playwright-managed Chrome');
    assert.equal(webkitExecutable(),undefined,'Linux must use Playwright-managed WebKit');
    process.env.OCR2MD_AUDIT_CHROME_PATH='/test/chrome';
    process.env.OCR2MD_AUDIT_WEBKIT_PATH='/test/webkit';
    assert.equal(chromeExecutable(),'/test/chrome');
    assert.equal(webkitExecutable(),'/test/webkit');
    process.env.OCR2MD_CHROME_PATH='/preferred/chrome';
    process.env.OCR2MD_WEBKIT_PATH='/preferred/webkit';
    assert.equal(chromeExecutable(),'/preferred/chrome');
    assert.equal(webkitExecutable(),'/preferred/webkit');
  }finally{
    Object.defineProperty(process,'platform',platform);
    for(const name of names){
      if(prior[name]===undefined)delete process.env[name];
      else process.env[name]=prior[name];
    }
  }
});
