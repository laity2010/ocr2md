/** JS mirror of scripts/v6_auth.py for tests that type the unlock code. */
import {createHmac} from 'node:crypto';
const mac=(key,label)=>createHmac('sha256',key).update(label).digest('base64url');
export const unlockCode=key=>mac(String(key).trim(),'ocr2md-v6-unlock-v1').slice(0,12);
export const sessionToken=(key,cookie='v6edit')=>mac(String(key).trim(),'ocr2md-v6-session-v1|'+cookie);
