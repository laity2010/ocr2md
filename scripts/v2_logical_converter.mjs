/** V2 WP02: call the pre-existing, independently tested MinerU -> CMD API.
 * No copy of its parsing or Markdown conversion algorithm is permitted here.
 */
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
let chunks=[];for await (const part of process.stdin) chunks.push(part);
process.stdout.write(toMarkdown(Buffer.concat(chunks).toString('utf8')));
