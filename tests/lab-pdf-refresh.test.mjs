import assert from 'node:assert/strict';
import {shouldReload} from '../ui/frame/refresh.js';
assert.equal(shouldReload('v1',{schema:'ocr2md-frame/v1',name:'lab-pdf',version:'v2'},'lab-pdf'),true);
assert.equal(shouldReload('v1',{schema:'ocr2md-frame/v1',name:'lab-frame',version:'v2'},'lab-pdf'),false);
assert.equal(shouldReload('v1',{schema:'ocr2md-frame/v1',name:'lab-pdf',version:'v1'},'lab-pdf'),false);
assert.equal(shouldReload('v1',{schema:'ocr2md-frame/v1',name:'lab-pdf',version:'v2'}),false);
console.log('LAB_PDF_RELEASE_IDENTITY_PASS');
