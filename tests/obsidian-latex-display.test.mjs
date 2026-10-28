import assert from 'node:assert/strict';
import {findLatex} from '../ui/latex-scan.js';
import {findReviewMarkers,planReviewAnnotations,planNormalizeReviewedInline}
  from '../ui/latex-review-markers.js';

// Obsidian display math: literal $$ must occupy column zero of separate lines.
const fenced='\`\`\`math\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n\`\`\`';
const row=findLatex(fenced)[0];
const marked=planReviewAnnotations(fenced,{...row,raw:fenced.slice(row.from,row.to)},
  'latex','0123456789abcdef');
assert.equal(marked[0].action,'insert');
assert.equal(marked[0].suffix,'\n');
const change=marked.find(op=>op.action==='text');
assert(change);
assert.equal(change.insert,'$$\n'+row.content+'\n$$');
assert(change.insert.split('\n').filter(line=>line==='$$').length===2);
assert(change.insert.includes('\na &= b \\\\\nc &= d\n'),'original multiline TeX must remain multiline');

// An inline legacy display expression is turned into a display block, while
// neighboring prose remains unchanged in the CMD transaction.
const prose='Before $$x^2 + y^2$$ after';
const piece=findLatex(prose).find(item=>item.kind==='独立');
assert(piece);
const changes=planReviewAnnotations(prose,{...piece,raw:prose.slice(piece.from,piece.to)},
  'latex','fedcba9876543210');
assert(changes.some(op=>op.action==='text'&&
  op.insert==='$$\nx^2 + y^2\n$$\n'));
assert(changes.some(op=>op.action==='insert'&&op.suffix==='\n'));

// A normalized Obsidian display block must be idempotent.
const canonical='<!-- ocr2md:latex id="0123456789abcdef" review="latex" -->\n$$\na &= b\nc &= d\n$$\n';
const reviewed=findReviewMarkers(canonical,findLatex(canonical).map(item=>({
  ...item,raw:canonical.slice(item.from,item.to)
})));
assert.equal(reviewed[0].status,'latex');
assert.equal(planNormalizeReviewedInline(canonical,reviewed).length,0);
console.log('OBSIDIAN_LATEX_DISPLAY_PASS',{display:'standalone delimiters',multiline:'preserved',idempotent:true});
