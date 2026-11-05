/**
 * End-to-end test of Add project's New repository and Clone from URL (spec
 * §6.1, §7.5): the folder checks, the first commit with the profile's
 * identity, a workspace right after, a remote picked up later and Remote ›
 * Change… (§6.10), a clone from a local bare repository in the dialog's
 * terminal, a failed clone that adds nothing, and the command line's `--new`
 * and `--clone`. Runs with a throwaway HOME and a fake `claude`.
 *
 *   tsx scripts/e2e-repositories.ts [--dev] [--screenshots=<dir>] [extra Electron args…]
 */
import './lib/clean-env';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { appConfigDir } from '../src/main/paths';
import { createFixture } from '../src/main/test-support/git-fixtures';
import { SEED_CONFIG } from '../src/main/test-support/seed-config';
import { BRAND } from '../src/shared/brand';
import {
  type Cdp,
  CMD,
  clickButtonText,
  clickLabel,
  dialogText,
  hasButton,
  launchApp,
  MOD,
  pressKey,
  type RunningApp,
  screenshot,
  sleep,
  submitDialog,
  typeInField,
  waitForFile,
  withDisplayEnv,
} from './lib/app-driver';

const args = process.argv.slice(2);
const screenshotDir = args.find((a) => a.startsWith('--screenshots='))?.split('=')[1];
const devMode = args.includes('--dev');
const electronArgs = args.filter((a) => !a.startsWith('--screenshots=') && a !== '--dev');

const openAddProject = async (page: Cdp, mode: 'existing' | 'new' | 'clone') => {
  await clickLabel(page, 'Add project to Work');
  await page.waitFor(`!!document.querySelector('dialog[open]')`, 'the Add project dialog');
  await page.eval(`document.querySelector('input[name=add-mode][value=${mode}]').click()`);
  await page.waitFor(
    `document.querySelector('[data-add-mode]')?.dataset.addMode === '${mode}'`,
    `the ${mode} mode`,
  );
};

const fieldValue = (selector: string) =>
  `document.querySelector(${JSON.stringify(selector)})?.value`;
const shown = (selector: string) => `document.querySelector(${JSON.stringify(selector)})`;
const textOf = (selector: string) =>
  `(document.querySelector(${JSON.stringify(selector)})?.textContent ?? '')`;

async function main() {
  const fx = createFixture();
  let app: RunningApp | undefined;
  try {
    fs.writeFileSync(path.join(fx.root, '.zshrc'), '');
    // A stand-in for Claude: passes the setup check, otherwise records that it
    // started and waits. Scripted tests never start the real one.
    const fakeClaude = path.join(fx.root, 'bin', 'fake-claude');
    fs.mkdirSync(path.dirname(fakeClaude));
    fs.writeFileSync(
      fakeClaude,
      `#!/bin/sh
case "$1" in
  --version) echo '9.9.9 (Claude Code)'; exit 0 ;;
  auth) printf '{"loggedIn":true,"email":"test@example.com","configDirectory":"%s"}\\n' "\${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; exit 0 ;;
esac
pwd > "$HOME/claude-started.txt"
exec sleep 600
`,
      { mode: 0o755 },
    );
    fs.writeFileSync(path.join(fx.root, '.claude.json'), '{}');
    fs.mkdirSync(path.join(fx.root, '.claude-personal'));
    fs.writeFileSync(path.join(fx.root, '.claude-personal', '.claude.json'), '{}');
    const configDir = appConfigDir({ platform: process.platform, env: {}, homeDir: fx.root });
    const configFile = path.join(configDir, 'config.json');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      configFile,
      JSON.stringify({
        ...SEED_CONFIG,
        profiles: SEED_CONFIG.profiles.map((p) => ({
          ...p,
          claude: { command: fakeClaude, args: [] },
          ...(p.id === 'work'
            ? {
                defaults: { baseBranch: 'trunk' },
                git: { commitName: 'Casey Example', commitEmail: 'casey@example.com' },
              }
            : {}),
        })),
      }),
    );
    const projects = () =>
      JSON.parse(fs.readFileSync(configFile, 'utf8')).projects as {
        id: string;
        repoPath: string;
        remote: string | null;
        baseBranch?: string;
      }[];
    const project = (id: string) => projects().find((p) => p.id === id);

    const code = path.join(fx.root, 'code');
    fs.mkdirSync(path.join(code, 'taken'), { recursive: true });
    fs.writeFileSync(path.join(code, 'taken', 'file'), '');
    const outer = fx.localRepo('outer');

    app = await launchApp({ env: withDisplayEnv(fx.env), dev: devMode, electronArgs });
    const { page, main: mainProcess } = app;
    // Only the native folder panel is replaced.
    await mainProcess.eval(`(() => {
      const { dialog } = process.mainModule.require('electron');
      globalThis.__folderPanel = { answer: null };
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [globalThis.__folderPanel.answer] });
    })()`);
    const answerFolderPanel = (folder: string) =>
      mainProcess.eval(`globalThis.__folderPanel.answer = ${JSON.stringify(folder)}`);
    await page.waitFor(`!!document.querySelector('[aria-label="Add project to Work"]')`, 'the app');

    // New repository (spec §6.1): the parent starts at ~ in a profile without
    // projects; the name and folder are checked as they're typed.
    await openAddProject(page, 'new');
    assert.equal(await page.eval(fieldValue('#new-repository-parent')), '~');
    await typeInField(page, '#new-repository-name', '-oops', false);
    await page.waitFor(
      `${textOf('[data-folder-problem]')}.includes('can\\'t start with "-"')`,
      'the name refused',
    );
    await answerFolderPanel(code);
    await clickButtonText(page, 'Browse…', `document.querySelector('dialog[open]')`);
    await page.waitFor(`${fieldValue('#new-repository-parent')} === '~/code'`, 'Browse… fills it');
    await typeInField(page, '#new-repository-name', 'taken', false);
    await page.waitFor(
      `${textOf('[data-folder-problem]')}.includes("already exists and isn't empty")`,
      'a folder that is not empty refused',
    );
    assert.equal(
      await page.eval(`document.querySelector('dialog[open] button[type=submit]').disabled`),
      true,
    );
    // Inside another repository: a warning, not a refusal.
    await typeInField(page, '#new-repository-parent', outer, false);
    await typeInField(page, '#new-repository-name', 'nested', false);
    await page.waitFor(
      `${textOf('[data-inside-repository]')}.includes(${JSON.stringify(outer)}) && !!${shown('[data-new-target]')}`,
      'the warning, with the target',
    );
    await typeInField(page, '#new-repository-parent', '~/code', false);
    await typeInField(page, '#new-repository-name', 'fresh-app', false);
    await page.waitFor(
      `${textOf('[data-new-target]')}.includes(${JSON.stringify(path.join(code, 'fresh-app'))}) && !${shown('[data-inside-repository]')}`,
      'the target',
    );
    assert.match(await page.eval<string>(dialogText), /Casey Example <casey@example\.com>/);
    await screenshot(page, screenshotDir, 'repo-1-new.png');
    await submitDialog(page);
    await page.waitFor(`!document.querySelector('dialog[open]')`, 'the dialog to close');
    await page.waitFor(`document.querySelector('h1')?.textContent === 'fresh-app'`, 'its view');
    const fresh = path.join(code, 'fresh-app');
    assert.deepEqual(project('fresh-app'), {
      id: 'fresh-app',
      profileId: 'work',
      name: 'fresh-app',
      repoPath: '~/code/fresh-app',
      remote: null,
      baseBranch: 'trunk',
    });
    assert.equal(fx.git(fresh, 'symbolic-ref', '--short', 'HEAD').trim(), 'trunk');
    assert.equal(
      fx.git(fresh, 'log', '--format=%s|%an <%ae>').trim(),
      'Initial commit|Casey Example <casey@example.com>',
    );
    assert.equal(fs.readFileSync(path.join(fresh, 'README.md'), 'utf8'), '# fresh-app\n');
    assert.ok(fs.existsSync(path.join(fresh, '.gitignore')));
    assert.equal(fx.git(fresh, 'status', '--porcelain'), '', 'nothing left uncommitted');

    // A workspace right after: it branches from the local base branch.
    await clickLabel(page, 'New workspace in fresh-app');
    await page.waitFor(`!!document.querySelector('dialog[open] #ws-task')`, 'New workspace');
    await typeInField(page, '#ws-task', 'NEW-1 First feature', false);
    await sleep(600);
    await submitDialog(page);
    await page.waitFor(`!document.querySelector('dialog[open]')`, 'the workspace');
    const started = await waitForFile(path.join(fx.root, 'claude-started.txt'));
    assert.match(started, /NEW-1-first-feature/);
    assert.match(fx.git(fresh, 'worktree', 'list'), /\[NEW-1-first-feature\]/);
    // Changes compares with the local base branch, and explains what Push and Create PR need.
    fs.writeFileSync(path.join(started.trim(), 'feature.txt'), 'new\n');
    await pressKey(page, 'KeyD', CMD | MOD.shift);
    await page.waitFor(`!!document.querySelector('[data-no-remote]')`, 'the no-remote note');
    assert.match(await page.eval<string>(textOf('[data-no-remote]')), /git remote add origin/);
    assert.equal(await page.eval(hasButton('Create PR')), false);
    await page.waitFor(
      `document.querySelector('[data-changes-panel]')?.innerText.includes('feature.txt')`,
      'the new file against trunk',
    );
    await pressKey(page, 'KeyD', CMD | MOD.shift);
    await page.waitFor(`!document.querySelector('[data-changes-panel]')`, 'Changes closed');

    // An origin added later, here outside the app, is picked up with a notice (spec §6.10).
    const freshOrigin = path.join(fx.root, 'fresh-origin.git');
    fx.git(fx.root, 'init', '-q', '--bare', freshOrigin);
    fx.git(fresh, 'remote', 'add', 'origin', freshOrigin);
    await page.waitFor(
      `document.body.innerText.includes('fresh-app now uses the remote origin')`,
      'the notice',
    );
    assert.equal(project('fresh-app')?.remote, 'origin');

    // Remote › Change… in the project view: none, then origin again.
    await page.eval(
      `[...document.querySelectorAll('nav li button')].find((b) => b.textContent === 'fresh-app').click()`,
    );
    await page.waitFor(`document.querySelector('h1')?.textContent === 'fresh-app'`, 'its view');
    const chooseRemote = async (value: string) => {
      await page.eval(`document.querySelector('[data-change-remote]').click()`);
      await page.waitFor(
        `!!document.querySelector('[data-detail=Remote] select:not(:disabled)')`,
        'the remotes',
      );
      await page.eval(`(() => {
        const select = document.querySelector('[data-detail=Remote] select');
        const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        set.call(select, ${JSON.stringify(value)});
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      for (let i = 0; i < 100 && project('fresh-app')?.remote !== (value || null); i++) {
        await sleep(50);
      }
      await page.waitFor(`!!document.querySelector('[data-change-remote]')`, 'Change… again');
    };
    await chooseRemote('');
    assert.equal(project('fresh-app')?.remote, null);
    await page.waitFor(
      `document.querySelector('[data-detail=Remote] dd')?.textContent === 'none'`,
      'none shown',
    );
    // Chosen on purpose: the origin already there isn't picked up again. The
    // focus comes from the event loop, as a real one does: the debugger's eval
    // can run in the middle of other code, such as a state.db query.
    await mainProcess.eval(
      `setImmediate(() => process.mainModule.require('electron').app.emit('browser-window-focus'))`,
    );
    await sleep(800);
    assert.equal(project('fresh-app')?.remote, null, 'none stays none');
    await chooseRemote('origin');
    assert.equal(project('fresh-app')?.remote, 'origin');

    // origin is still empty (spec §7.3): the workspace starts from the local
    // trunk, with a note; once trunk is pushed, the next starts from origin's.
    const newWorkspace = async (task: string) => {
      fs.rmSync(path.join(fx.root, 'claude-started.txt'), { force: true });
      await clickLabel(page, 'New workspace in fresh-app');
      await page.waitFor(`!!document.querySelector('dialog[open] #ws-task')`, 'New workspace');
      await typeInField(page, '#ws-task', task, false);
      await sleep(600);
      await submitDialog(page);
      await page.waitFor(`!document.querySelector('dialog[open]')`, 'the workspace');
      return (await waitForFile(path.join(fx.root, 'claude-started.txt'))).trim();
    };
    const head = (dir: string) => fx.git(dir, 'rev-parse', 'HEAD').trim();
    const notice = `(document.querySelector('[data-app-notice]')?.textContent ?? '')`;
    const localStart = await newWorkspace('NEW-2 Before the push');
    assert.equal(head(localStart), head(fresh), 'from the local trunk');
    await page.waitFor(
      `${notice}.includes("trunk isn't on origin yet; the workspace starts from your local trunk")`,
      'the note',
    );
    await screenshot(page, screenshotDir, 'repo-1b-empty-remote.png');
    fx.git(fresh, 'push', '-q', 'origin', 'trunk');
    const elsewhere = path.join(fx.root, 'fresh-elsewhere');
    fx.git(fx.root, 'clone', '-q', '-b', 'trunk', freshOrigin, elsewhere);
    fx.git(elsewhere, 'commit', '-q', '--allow-empty', '-m', 'Pushed from elsewhere');
    fx.git(elsewhere, 'push', '-q', 'origin', 'trunk');
    await page.eval(
      `document.querySelector('[data-app-notice] button[aria-label=Dismiss]')?.click()`,
    );
    const remoteStart = await newWorkspace('NEW-3 After the push');
    assert.equal(head(remoteStart), head(elsewhere), "from origin's trunk");
    await sleep(500);
    assert.equal(await page.eval<string>(notice), '', 'no note');

    // Clone from URL: the remembered parent, the name from the URL (editable),
    // git in a terminal in the dialog, then added with the remote's default branch.
    const { origin: libOrigin } = fx.cloneWithRemote('lib', 'develop');
    await openAddProject(page, 'clone');
    assert.equal(await page.eval(fieldValue('#clone-parent')), '~/code', 'the last parent used');
    await typeInField(page, '#clone-url', libOrigin, false);
    await page.waitFor(`${fieldValue('#clone-name')} === 'lib-origin'`, 'the name from the URL');
    await typeInField(page, '#clone-name', 'lib', false);
    await page.waitFor(
      `${textOf('[data-new-target]')}.includes(${JSON.stringify(path.join(code, 'lib'))})`,
      'the target',
    );
    await submitDialog(page);
    await page.waitFor(`!document.querySelector('dialog[open]')`, 'the clone to be added');
    await page.waitFor(`document.querySelector('h1')?.textContent === 'lib'`, 'its view');
    assert.deepEqual(
      (({ repoPath, remote, baseBranch }) => ({ repoPath, remote, baseBranch }))(
        project('lib') as NonNullable<ReturnType<typeof project>>,
      ),
      { repoPath: '~/code/lib', remote: 'origin', baseBranch: 'develop' },
    );

    // A failed clone shows git's output and adds nothing.
    await openAddProject(page, 'clone');
    await typeInField(page, '#clone-url', path.join(fx.root, 'missing.git'), false);
    await page.waitFor(`${fieldValue('#clone-name')} === 'missing'`, 'the name');
    await page.waitFor(`!!${shown('[data-new-target]')}`, 'the target');
    await submitDialog(page);
    await page.waitFor(
      `!!document.querySelector('dialog[open] [data-exit-code]:not([data-exit-code="0"]):not([data-exit-code=""])')`,
      'the clone to fail',
    );
    await page.waitFor(`${dialogText}.includes('nothing was added')`, 'the error');
    await page.waitFor(
      `(() => { const t = document.querySelector('dialog[open] [data-terminal]')?.xterm; if (!t) return false; const b = t.buffer.active; let s = ''; for (let y = 0; y < b.length; y++) s += b.getLine(y)?.translateToString(true); return /does not exist|not found|Could not read/i.test(s); })()`,
      "git's output in the terminal",
    );
    await screenshot(page, screenshotDir, 'repo-2-clone-failed.png');
    assert.equal(project('missing'), undefined);
    assert.equal(fs.existsSync(path.join(code, 'missing')), false);
    assert.equal(await page.eval(hasButton('Try again')), true);
    // The focus is back on the URL, also when git failed before its terminal connected.
    await page.waitFor(`document.activeElement?.id === 'clone-url'`, 'the focus on the URL');
    await sleep(300);
    assert.equal(await page.eval(`document.activeElement?.id`), 'clone-url', 'it stays there');
    await pressKey(page, 'Escape');
    await page.waitFor(`!document.querySelector('dialog[open]')`, 'the dialog to close');

    // The command line tool: --new and --clone (spec §7.5).
    const cli = path.join(configDir, 'bin', BRAND.cliCommand);
    const run = (...cliArgs: string[]) =>
      spawnSync(cli, ['add', ...cliArgs], { env: fx.env, cwd: code, encoding: 'utf8' });
    const created = run('--new', 'cli-new', '--no-gitignore', '--profile', 'work');
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /^Added cli-new to work: ~\/code\/cli-new \(base trunk\)/);
    assert.equal(fx.git(path.join(code, 'cli-new'), 'ls-files').trim(), 'README.md');
    assert.equal(project('cli-new')?.remote, null);
    const cloned = run('--clone', libOrigin, 'cli-clone', '--profile', 'work');
    assert.equal(cloned.status, 0, cloned.stderr);
    assert.match(cloned.stdout, /Added cli-clone to work: ~\/code\/cli-clone \(base develop\)/);
    const failed = run('--clone', path.join(fx.root, 'missing.git'), '--profile', 'work');
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /git clone failed \(exit \d+\); nothing was added/);
    assert.equal(project('missing'), undefined);

    console.log(`e2e repositories test passed (${devMode ? 'dev server' : 'production build'})`);
  } catch (error) {
    if (app) {
      await screenshot(app.page, screenshotDir, 'repositories-failure.png').catch(() => {});
      const dialog = await app.page
        .eval<string>(
          `(document.querySelector('dialog[open]')?.innerText ?? 'no open dialog').replace(/\\s+/g, ' ').slice(0, 600)`,
        )
        .catch((e) => `unreadable: ${e}`);
      console.error(`dialog: ${dialog}`);
      const term = await app.page
        .eval<string>(
          `(() => { const c = document.querySelector('dialog[open] [data-terminal]'); if (!c) return 'no terminal'; const t = c.xterm; if (!t) return 'no xterm, connected=' + c.dataset.connected; const b = t.buffer.active; let s = ''; for (let y = 0; y < b.length; y++) s += b.getLine(y)?.translateToString(true) + '|'; return 'connected=' + c.dataset.connected + ' ' + s.slice(0, 800); })()`,
        )
        .catch((e) => `unreadable: ${e}`);
      console.error(`terminal: ${term}`);
      if (app.page.errors.length > 0) {
        console.error(`renderer errors:\n  ${app.page.errors.join('\n  ')}`);
      }
    }
    throw error;
  } finally {
    await app?.stop();
    fx.cleanup();
  }
}

main().catch((error) => {
  console.error(`e2e repositories test failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
