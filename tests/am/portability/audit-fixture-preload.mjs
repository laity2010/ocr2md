/** Transparent, audit-only data staging for a historical live-mother test.
 * The frozen test mineru-start-only-ui-browser.test.mjs expects the reviewed
 * 14-chapter mother; the frozen run-grok-audit.sh initializes the raw 0-chapter
 * mother. This adapter supplies a tracked reviewed fixture only for that one
 * test. No tracked source/test is changed and the workspace is restored.
 */
import {readFileSync,writeFileSync,existsSync,unlinkSync,cpSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const script=basename(process.argv[1] || '');
if(script.endsWith('.test.mjs')){
  const root=process.cwd();
  const mother=resolve(root,'.v6/workspace/buffetts-alpha.minerujson.md');
  const fixture=resolve(root,'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
  const marker=resolve(root,'.v6/audit-reports/.review-fixture-active');
  const pristine=readFileSync(fixture);
  const digest=b=>createHash('sha256').update(b).digest('hex');
  if(script==='mineru-start-only-ui-browser.test.mjs'){
    const reviewed=gunzipSync(readFileSync(resolve(root,'tests/fixtures/buffetts-alpha-four-view-reviewed.md.gz')));
    if(digest(reviewed)!=='c998da7aeea5410f1d7be10975c05e59efb5cdf6bfcf750595b27a048c5e3e19')
      throw new Error('AUDIT_REVIEW_FIXTURE_HASH_MISMATCH');
    if(!existsSync(mother)||digest(readFileSync(mother))!==digest(pristine))
      throw new Error('AUDIT_REVIEW_FIXTURE_UNEXPECTED_MOTHER');
    writeFileSync(mother,reviewed);
    writeFileSync(marker,'test-only reviewed fixture\n');
    console.log('AUDIT_TEST_FIXTURE_STAGE reviewed-mother 14 chapters sha256='+digest(reviewed));
    process.on('exit',()=>{
      writeFileSync(mother,pristine);
      if(existsSync(marker))unlinkSync(marker);
    });
  }else if(script==='promoted-chapters-browser.test.mjs'){
    // The historical integration test requires the published index snapshot;
    // the frozen audit runner builds dist/ but does not publish. Provide a
    // full release snapshot inside this ignored, disposable audit workspace.
    const release=resolve(root,'.v6/release');
    if(!existsSync(resolve(release,'index.html'))){
      if(existsSync(release)||!existsSync(resolve(root,'dist/index.html')))
        throw new Error('AUDIT_RELEASE_FIXTURE_INCOMPLETE');
      cpSync(resolve(root,'dist'),release,{recursive:true});
      console.log('AUDIT_TEST_FIXTURE_STAGE isolated release snapshot from built dist');
    }
  }else if(existsSync(marker)){
    // Crash/timeout recovery before the next independent test; never run in
    // Vite child processes, because their argv does not end in .test.mjs.
    writeFileSync(mother,pristine);
    unlinkSync(marker);
    console.log('AUDIT_TEST_FIXTURE_RESTORED_FROM_CRASH');
  }
}
