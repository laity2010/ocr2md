import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? utf8ToBytes(value) : value;
}

export function createHash(algorithm: string) {
  if (algorithm.toLowerCase() !== "sha256") throw new Error(`Unsupported browser hash: ${algorithm}`);
  const chunks: Uint8Array[] = [];
  const api = {
    update(value: string | Uint8Array) {
      chunks.push(toBytes(value));
      return api;
    },
    digest(encoding?: string) {
      const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const all = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
      }
      const result = sha256(all);
      if (encoding === "hex") return bytesToHex(result);
      return result;
    },
  };
  return api;
}

export function randomUUID(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (item) => item.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
