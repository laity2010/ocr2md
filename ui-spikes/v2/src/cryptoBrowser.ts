import { sha256 } from "@noble/hashes/sha2.js";

type HashInput = string | Uint8Array;

export function createHash(algorithm: string): {
  update(value: HashInput): ReturnType<typeof createHash>;
  digest(encoding: "hex"): string;
} {
  if (algorithm !== "sha256") {
    throw new Error(`Unsupported browser hash algorithm: ${algorithm}`);
  }

  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();

  const api = {
    update(value: HashInput) {
      chunks.push(typeof value === "string" ? encoder.encode(value) : value);
      return api;
    },
    digest(encoding: "hex") {
      if (encoding !== "hex") {
        throw new Error(`Unsupported browser hash encoding: ${encoding}`);
      }
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const input = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        input.set(chunk, offset);
        offset += chunk.length;
      }
      return Array.from(sha256(input), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
    },
  };

  return api;
}
