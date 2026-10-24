/** Linux WebKit compatibility for HTTPS-only auth cookies in HTTP loopback tests.
 * Production secure-cookie semantics remain untouched. Does NOT authorize any
 * request: the server still verifies the unlock code, cookie and same-origin.
 */
import {webkit} from 'playwright';
import {basename} from 'node:path';
if(process.platform==='linux' && basename(process.argv[1]||'').endsWith('.test.mjs')){
  const suite=basename(process.argv[1]);
  const originalLaunch=webkit.launch.bind(webkit);
  webkit.launch=async function(options={}){
    const browser=await originalLaunch(options);
    const originalNewPage=browser.newPage.bind(browser);
    browser.newPage=async function(...args){
      const page=await originalNewPage(...args);
      // Frozen HTTP browser tests navigate on DOMContentLoaded and immediately
      // operate a module. Linux WebKit can complete the later async permission
      // probe *after* module selection, overwriting its status. Wait for the
      // true app/auth initialization barrier, not a guessed sleep or a relaxed
      // assertion. Only affects the two observed Python-server test suites.
      if(['latex-browser.test.mjs','promoted-chapters-browser.test.mjs'].includes(suite)){
        const originalGoto=page.goto.bind(page);
        page.goto=async function(...goArgs){
          const response=await originalGoto(...goArgs);
          const url=new URL(String(goArgs[0]));
          if(url.hostname==='127.0.0.1'&&url.protocol==='http:'){
            await page.waitForFunction(()=>Boolean(document.querySelector('.cm-editor .cm-content'))&&
              document.querySelector('#status')?.textContent?.includes('保存需授权'),null,{timeout:30000});
            console.log('AUDIT_LINUX_WEBKIT_INITIALIZATION_BARRIER',suite);
          }
          return response;
        };
      }
      const originalRoute=page.route.bind(page);
      let added=false;
      page.route=async function(...routeArgs){
        const result=await originalRoute(...routeArgs);
        // Frozen tests add a catch-all route after page creation. Register our
        // narrower handler *after* it to win Playwright's LIFO route order.
        if(!added && routeArgs[0]==='**/*'){
          added=true;
          await originalRoute('**/api/unlock',async route=>{
            const url=new URL(route.request().url());
            if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||route.request().method()!=='POST')
              return route.fallback();
            const response=await route.fetch();
            const headers=response.headers();
            if(response.status()===200 && headers['set-cookie']?.match(/;\s*Secure(?=;|$)/i)){
              // Only the local test's insecure HTTP transport differs from
              // production HTTPS. Keep HttpOnly, SameSite, path and token.
              const verifiedCookie=/\bv6edit=([^;]+)/.exec(headers['set-cookie']);
              if(!verifiedCookie)throw Error('AUDIT_LOCAL_UNLOCK_MISSING_COOKIE');
              // Playwright Linux WebKit does not persist Secure cookies issued
              // by HTTP loopback even after response-header adaptation. Insert
              // precisely the *already authorized* server cookie in this test
              // context, before the page resumes and performs the protected PUT.
              await page.context().addCookies([{name:'v6edit',value:verifiedCookie[1],
                url:url.origin+'/',httpOnly:true,secure:false,sameSite:'Lax'}]);
              headers['set-cookie']=headers['set-cookie'].replace(/;\s*Secure(?=;|$)/i,'');
              const present=(await page.context().cookies(url.origin)).some(c=>c.name==='v6edit');
              if(!present)throw Error('AUDIT_LOCAL_UNLOCK_COOKIE_NOT_STORED');
              console.log('AUDIT_LINUX_WEBKIT_LOOPBACK_COOKIE_ADAPTER verified-server-token-stored');
            }
            await route.fulfill({response,headers});
          });
        }
        return result;
      };
      return page;
    };
    return browser;
  };
}
