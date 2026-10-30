/** JS mirror of scripts/v6_auth.py for tests that type the unlock code. */
import {createHmac} from 'node:crypto';
const mac=(key,label)=>createHmac('sha256',key).update(label).digest('base64url');
export const unlockCode=key=>mac(String(key).trim(),'ocr2md-v6-unlock-v1').slice(0,12);
export const sessionToken=(key,cookie='v6edit')=>mac(String(key).trim(),'ocr2md-v6-session-v1|'+cookie);

/** Main marks its session cookie Secure. Chromium treats http://127.0.0.1 as a
 * secure context and keeps it; WebKit does not, so the page never sends it.
 * Re-add the exact server-issued value for this loopback test origin without
 * the Secure attribute. Test harness only; server cookie flags are unchanged. */
export async function adoptLoopbackSessionCookie(context,response,url){
 const header=response.headers()['set-cookie'];
 if(!header)throw Error('unlock response carried no session cookie');
 const [pair]=header.split(';');const i=pair.indexOf('=');
 await context.addCookies([{name:pair.slice(0,i),value:pair.slice(i+1),url,httpOnly:true,sameSite:'Lax'}]);
}
