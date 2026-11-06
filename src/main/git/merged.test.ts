import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from '../test-support/git-fixtures';
import { Git } from './git';

let fx: Fixture;
let git: Git;

beforeAll(() => {
  fx = createFixture();
  git = new Git({ gitPath: 'git', env: fx.env });
});
afterAll(() => fx.cleanup());

/**
 * A clone with a workspace branch `feature` in its own worktree, started
 * from main; returns the folders and the start commit.
 */
function workspace(name: string, { remote = true } = {}) {
  const repo = remote ? fx.cloneWithRemote(name).clone : fx.localRepo(name);
  const worktree = path.join(fx.root, `${name}-wt`);
  fx.git(repo, 'worktree', 'add', '-q', '-b', 'feature', worktree, 'main');
  const start = fx.git(repo, 'rev-parse', 'main').trim();
  return { repo, worktree, start };
}

function commit(dir: string, file: string, text = `${file}\n`) {
  fs.writeFileSync(path.join(dir, file), text);
  fx.git(dir, 'add', file);
  fx.git(dir, 'commit', '-q', '-m', `add ${file}`);
}

const check = (repo: string, start: string | null, remote: string | null = 'origin') =>
  git.mergedInto(repo, { branch: 'feature', start, base: 'main', remote });

describe('Git.mergedInto (spec §14.2)', () => {
  it('a new workspace without commits is never merged', async () => {
    const { repo, start } = workspace('no-commits');
    expect(await check(repo, start)).toBeNull();
    // Even once main moves on and so contains its tip.
    commit(repo, 'other');
    fx.git(repo, 'push', '-q', 'origin', 'main');
    expect(await check(repo, start)).toBeNull();
    // Nor without a known start commit.
    expect(await check(repo, null)).toBeNull();
  });

  it('a branch with commits not in the base is not merged', async () => {
    const { repo, worktree, start } = workspace('unmerged');
    commit(worktree, 'a');
    expect(await check(repo, start)).toBeNull();
  });

  it('a fast-forward merge: only in the local base, then pushed', async () => {
    const { repo, worktree, start } = workspace('ff');
    commit(worktree, 'a');
    commit(worktree, 'b');
    fx.git(repo, 'merge', '-q', '--ff-only', 'feature');
    expect(await check(repo, start)).toBe('local');
    fx.git(repo, 'push', '-q', 'origin', 'main');
    expect(await check(repo, start)).toBe('base');
  });

  it('a merge commit', async () => {
    const { repo, worktree, start } = workspace('merge-commit');
    commit(worktree, 'a');
    commit(repo, 'other');
    fx.git(repo, 'merge', '-q', '--no-ff', '--no-edit', 'feature');
    expect(await check(repo, start)).toBe('local');
    fx.git(repo, 'push', '-q', 'origin', 'main');
    expect(await check(repo, start)).toBe('base');
  });

  it('a rebased branch: its commits applied to the base with new ids', async () => {
    const { repo, worktree, start } = workspace('rebased');
    commit(worktree, 'a');
    commit(worktree, 'b');
    commit(repo, 'other');
    // As "rebase and merge" does: the same changes, new commits on main.
    fx.git(repo, 'cherry-pick', `${start}..feature`);
    expect(await check(repo, start)).toBe('local');
    // Part of it only: not merged.
    commit(worktree, 'c');
    expect(await check(repo, start)).toBeNull();
  });

  it('merged only on the remote counts as merged into the base', async () => {
    const { repo, worktree, start } = workspace('remote-only');
    commit(worktree, 'a');
    fx.git(worktree, 'push', '-q', 'origin', 'feature:main');
    fx.git(repo, 'fetch', '-q', 'origin');
    expect(await check(repo, start)).toBe('base');
  });

  it('without a remote, the local base is the base', async () => {
    const { repo, worktree, start } = workspace('local-only', { remote: false });
    commit(worktree, 'a');
    expect(await check(repo, start, null)).toBeNull();
    fx.git(repo, 'merge', '-q', '--ff-only', 'feature');
    expect(await check(repo, start, null)).toBe('base');
  });

  it('a deleted branch is not merged', async () => {
    const { repo, start } = workspace('deleted');
    fx.git(repo, 'worktree', 'remove', path.join(fx.root, 'deleted-wt'));
    fx.git(repo, 'branch', '-D', 'feature');
    expect(await check(repo, start)).toBeNull();
  });
});
