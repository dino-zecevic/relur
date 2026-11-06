import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { CHECKSUMS_FILE } from '@shared/brand';

/**
 * A release's `SHA256SUMS` (spec §15.4), as `sha256sum` writes it: a hex
 * digest, a space, a space or `*`, and the file name. Other lines are ignored.
 */
export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim());
    if (m?.[1] && m[2]) sums.set(m[2].trim(), m[1].toLowerCase());
  }
  return sums;
}

/** The file's SHA-256, in hex. */
export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** Throws unless `digest` is what `SHA256SUMS` lists for `name` (spec §15.7). */
export function checkDigest(sums: Map<string, string>, name: string, digest: string): void {
  const expected = sums.get(name);
  if (!expected) throw new Error(`${CHECKSUMS_FILE} doesn't list ${name}`);
  if (expected !== digest.toLowerCase()) {
    throw new Error(`${name} doesn't match its checksum in ${CHECKSUMS_FILE}`);
  }
}
