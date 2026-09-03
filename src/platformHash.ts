import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/** Browser/Node-compatible synchronous SHA-256 used for stable review identities. */
export function sha256Hex(value: string): string {
  return bytesToHex(sha256(utf8ToBytes(value)));
}

export function shortSha256(value: string, length: number): string {
  return sha256Hex(value).slice(0, length);
}

/** Browser/Node-compatible UUID for manual review rows. */
export function randomUuid(): string {
  const cryptoApi = (globalThis as typeof globalThis & {
    crypto?: { randomUUID?: () => string; getRandomValues?: (values: Uint8Array) => Uint8Array };
  }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
