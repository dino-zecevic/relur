import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { E2E_SUITES, suiteFile } from './lib/e2e-suites';

const root = path.resolve(import.meta.dirname, '..');

// spec §15.6: one list of suites, so a new one can't be left out of a run.
describe('e2e-suites.json', () => {
  it('lists every scripts/e2e-*.ts', () => {
    const files = fs
      .readdirSync(path.join(root, 'scripts'))
      .filter((f) => /^e2e-.+\.ts$/.test(f) && !f.endsWith('.test.ts'))
      .map((f) => `scripts/${f}`)
      .sort();
    expect([...E2E_SUITES].map(suiteFile).sort()).toEqual(files);
  });

  it('lists each suite once', () => {
    expect(new Set(E2E_SUITES).size).toBe(E2E_SUITES.length);
  });
});
