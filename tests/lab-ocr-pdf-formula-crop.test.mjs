import assert from 'node:assert/strict';
import {planFormulaCrop} from '../ui/lab-ocr/pdf-formula-crop.js';
const crop=planFormulaCrop([100,200,200,240],[595,842],{width:595,height:842});
assert(crop);assert.deepEqual(crop.clip,[94,194,206,246]);
assert(crop.scale<=2&&crop.width<=520&&crop.height<=250);
assert.equal(crop.translateX,-94*crop.scale);
assert.equal(crop.translateY,-194*crop.scale);
assert.equal(planFormulaCrop([0,0,90,20],[595,842],{width:842,height:595}),null,
  'Wrong PDF page aspect must fail closed');
assert.equal(planFormulaCrop([10,20,600,40],[595,842],{width:595,height:842}),null);
assert.equal(planFormulaCrop([-1,10,20,40],[595,842],{width:595,height:842}),null);
console.log('LAB_OCR_PDF_FORMULA_CROP_PLAN_PASS');
