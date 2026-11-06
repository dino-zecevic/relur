import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND, CHECKSUMS_FILE } from '@shared/brand';
import type { Release } from '@shared/updates';
import type { UpdatePlan, UpdateResult } from '../../helper/apply-update';
import { checkDigest, parseChecksums, sha256File } from './checksum';
import { downloadFile, downloadText } from './download';
import type { UpdateWay } from './install';
import { readStaged, type Staged, stageDownload, updateRoot } from './stage';

/** Where Update is (spec §15.7), shown in the notice. */
export type InstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; version: string; received: number; total: number | null }
  | { phase: 'checking'; version: string }
  /** Restart now or Later; after Later it is applied at the next quit. */
  | { phase: 'ready'; version: string; later: boolean }
  | { phase: 'failed'; version: string; reason: string };

/** What the window shows of updating in the app. */
export interface InstallView {
  /** How this installation updates; `terminal` with the reason it can't itself. */
  way: { kind: UpdateWay['kind']; why?: string };
  install: InstallState;
  /** The last replacement failed (written by the helper; shown at the next start). */
  failure: { version: string; reason: string } | null;
}

export interface InstallerDeps {
  /** The app config dir: the staging folders go in `update/` there. */
  dataDir: string;
  version: string;
  way: UpdateWay;
  /** The helper executable, which replaces the app after it quit. */
  helper: string | null;
  /** The fake release endpoint of the tests is plain http. */
  allowHttp: boolean;
  /** Quits the normal way: the quit question, unfinished work marked (spec §5, §9.7). */
  quit(): void;
  /** The environment the started app gets: the user's login environment. */
  launchEnv(): Promise<Record<string, string>>;
  /** `open` on macOS; `exec` for an AppImage and the tests' dummy app. */
  launch: 'open' | 'exec';
  /** The app's process id. */
  pid: number;
}

const RESULT_FILE = 'result.json';
const PLAN_FILE = 'plan.json';

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Updating inside the app (spec §15.7): Update downloads this platform's
 * package from the release, checks it against `SHA256SUMS`, unpacks and
 * checks it in `<data dir>/update/<version>`; Restart now quits the normal way
 * and Later waits for the next quit; at that quit the helper is started
 * detached, and replaces the app once it has exited.
 */
export class UpdateInstaller {
  private readonly events = new EventEmitter();
  private state: InstallState = { phase: 'idle' };
  private staged: Staged | null = null;
  private failure: { version: string; reason: string } | null = null;
  private abort: AbortController | null = null;
  private relaunch = false;
  private env: Record<string, string> | null = null;

  constructor(private readonly deps: InstallerDeps) {
    this.restore();
  }

  view(): InstallView {
    const { way } = this.deps;
    return {
      way: way.kind === 'terminal' ? { kind: way.kind, why: way.why } : { kind: way.kind },
      install: this.state,
      failure: this.failure,
    };
  }

  onChange(listener: () => void): () => void {
    this.events.on('change', listener);
    return () => this.events.off('change', listener);
  }

  /** Update: download, check and stage `release`; ready afterwards. */
  async install(release: Release): Promise<void> {
    const way = this.deps.way;
    if (way.kind !== 'self') throw new Error(`${BRAND.displayName} can't update itself here`);
    if (this.state.phase === 'downloading' || this.state.phase === 'checking') return;
    const version = release.version;
    this.failure = null;
    this.clearResult();
    const abort = new AbortController();
    this.abort = abort;
    const dir = path.join(updateRoot(this.deps.dataDir), version);
    this.set({ phase: 'downloading', version, received: 0, total: null });
    try {
      const assetUrl = release.assets[way.asset];
      const sumsUrl = release.assets[CHECKSUMS_FILE];
      if (!assetUrl) throw new Error(`The release has no ${way.asset}`);
      if (!sumsUrl) throw new Error(`The release has no ${CHECKSUMS_FILE}`);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const options = {
        userAgent: `${BRAND.displayName}/${this.deps.version}`,
        signal: abort.signal,
        allowHttp: this.deps.allowHttp,
      };
      const sums = parseChecksums(await downloadText(sumsUrl, options));
      const file = path.join(dir, way.asset);
      let shown = 0;
      await downloadFile(assetUrl, file, {
        ...options,
        onProgress: ({ received, total }) => {
          // At most every 1 %, so the window isn't flooded.
          if (total && received !== total && received - shown < total / 100) return;
          shown = received;
          this.set({ phase: 'downloading', version, received, total });
        },
      });
      this.set({ phase: 'checking', version });
      checkDigest(sums, way.asset, await sha256File(file));
      if (abort.signal.aborted) throw new Error('cancelled');
      this.staged = await stageDownload(way.app, file, dir, version);
      if (abort.signal.aborted) throw new Error('cancelled');
      this.env = await this.deps.launchEnv().catch(() => null);
      this.set({ phase: 'ready', version, later: false });
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true });
      this.staged = null;
      if (abort.signal.aborted) this.set({ phase: 'idle' });
      else this.set({ phase: 'failed', version, reason: reason(error) });
    } finally {
      if (this.abort === abort) this.abort = null;
    }
  }

  /** Cancel: stops the download or the check; nothing is kept. */
  cancel(): void {
    this.abort?.abort();
  }

  /** Later: stays ready, applied at the next quit. */
  later(): void {
    if (this.state.phase === 'ready') this.set({ ...this.state, later: true });
  }

  /** Restart now: quits the normal way; the app starts again after the replacement. */
  restart(): void {
    if (this.state.phase !== 'ready') return;
    this.relaunch = true;
    this.deps.quit();
  }

  /** The quit question was answered Cancel: no restart at the next quit. */
  quitCancelled(): void {
    this.relaunch = false;
  }

  /** × on a failure: forgotten. */
  dismissFailure(): void {
    this.failure = null;
    this.clearResult();
    if (this.state.phase === 'failed') this.state = { phase: 'idle' };
    this.changed();
  }

  /**
   * The app's last moment, after the sessions stopped (spec §15.7): with an
   * update ready, writes the plan and starts the helper detached, to replace
   * the app once this process has exited. A quit by a signal or at logout
   * leaves it for the next one. Returns whether the helper started.
   */
  applyAtQuit({ normalQuit }: { normalQuit: boolean }): boolean {
    const way = this.deps.way;
    const staged = this.staged;
    if (!normalQuit || this.state.phase !== 'ready' || !staged || way.kind !== 'self') return false;
    if (!this.deps.helper) return false;
    const root = updateRoot(this.deps.dataDir);
    try {
      // The helper runs from a copy: the one in the app is being replaced.
      const helper = path.join(root, BRAND.helperCommand);
      fs.copyFileSync(this.deps.helper, helper);
      fs.chmodSync(helper, 0o755);
      const plan: UpdatePlan = {
        pid: this.deps.pid,
        kind: staged.kind,
        target: way.target,
        staged: staged.app,
        version: staged.version,
        stagingDir: staged.dir,
        resultFile: path.join(root, RESULT_FILE),
        relaunch: this.relaunch,
        launch: this.deps.launch,
        env: this.env ?? (process.env as Record<string, string>),
      };
      const planFile = path.join(root, PLAN_FILE);
      // It holds the user's environment: readable by the user only.
      fs.writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
      const child = spawn(helper, ['apply-update', planFile], {
        detached: true,
        stdio: 'ignore',
        env: plan.env,
      });
      child.on('error', () => {});
      child.unref();
      return true;
    } catch (error) {
      console.warn(`Couldn't start the update: ${reason(error)}`);
      return false;
    }
  }

  /** At start: a staged update is ready again; a failed replacement is shown. */
  private restore(): void {
    const root = updateRoot(this.deps.dataDir);
    fs.rmSync(path.join(root, PLAN_FILE), { force: true });
    fs.rmSync(path.join(root, BRAND.helperCommand), { force: true });
    try {
      const result = JSON.parse(
        fs.readFileSync(path.join(root, RESULT_FILE), 'utf8'),
      ) as UpdateResult;
      if (result.ok || result.version === this.deps.version) this.clearResult();
      else this.failure = { version: result.version, reason: result.error ?? 'unknown' };
    } catch {
      // nothing to show
    }
    if (this.deps.way.kind !== 'self') return;
    this.staged = readStaged(this.deps.dataDir, this.deps.version);
    if (this.staged) {
      this.state = { phase: 'ready', version: this.staged.version, later: true };
      void this.deps
        .launchEnv()
        .then((env) => {
          this.env = env;
        })
        .catch(() => {});
    }
  }

  private clearResult(): void {
    fs.rmSync(path.join(updateRoot(this.deps.dataDir), RESULT_FILE), { force: true });
  }

  private set(state: InstallState): void {
    this.state = state;
    this.changed();
  }

  private changed(): void {
    this.events.emit('change');
  }
}
