import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { wasShown } from '../notices';
import { SuspendDefaultNotice } from './notice';

describe('SuspendDefaultNotice (spec §9.8)', () => {
  const dirs: string[] = [];
  const tempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suspend-notice-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });
  const work = { id: 'work', name: 'Work' };
  const personal = { id: 'personal', name: 'Personal' };

  it('shows once for the profiles the start changed, and never again', () => {
    const dir = tempDir();
    const notice = new SuspendDefaultNotice(dir, { created: false, defaulted: [work, personal] });
    expect(notice.get()).toEqual([work, personal]);
    expect(wasShown(dir, 'suspend-default')).toBe(true);
    notice.dismiss();
    expect(notice.get()).toBeNull();
    // Another start that changes a profile, one added by hand: no notice.
    expect(new SuspendDefaultNotice(dir, { created: false, defaulted: [work] }).get()).toBeNull();
  });

  it('is never shown on a new install, also not later', () => {
    const dir = tempDir();
    expect(new SuspendDefaultNotice(dir, { created: true, defaulted: [] }).get()).toBeNull();
    expect(new SuspendDefaultNotice(dir, { created: false, defaulted: [work] }).get()).toBeNull();
  });

  it('waits while no profile was changed', () => {
    const dir = tempDir();
    expect(new SuspendDefaultNotice(dir, { created: false, defaulted: [] }).get()).toBeNull();
    expect(wasShown(dir, 'suspend-default')).toBe(false);
    expect(new SuspendDefaultNotice(dir, { created: false, defaulted: [work] }).get()).toEqual([
      work,
    ]);
  });
});
