/** Browser-only SHA-256 adapter for v2's synchronous row identity helpers.
 * Only `createHash('sha256').update(text).digest('hex')` is supported.
 * This cannot be used for secrets or as a replacement for Node crypto APIs.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
export function createHash(algorithm: string) {
  if(algorithm!=="sha256")throw Error("Only SHA-256 row IDs are supported in the browser");
  const chunks: Uint8Array[]=[];
  const hash={
    update(input: string | Uint8Array){chunks.push(typeof input==="string"?new TextEncoder().encode(input):input);return hash;},
    digest(encoding?: string){
      if(encoding!=="hex")throw Error("Expected hex digest");
      const size=chunks.reduce((sum,c)=>sum+c.length,0);
      const payload=new Uint8Array(size);let offset=0;
      for(const c of chunks){payload.set(c,offset);offset+=c.length;}
      return bytesToHex(sha256(payload));
    },
  };
  return hash;
}
