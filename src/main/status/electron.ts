import { EventEmitter } from 'node:events';
import os from 'node:os';
import { BRAND } from '@shared/brand';
import { app, BrowserWindow, Notification, webContents } from 'electron';
import type { ConfigStore } from '../config/store';
import { linuxIconPath, testWindows } from '../window';
import { LauncherBadge, sessionBusPath } from './launcher-entry';
import type { Alert, StatusPlatform } from './service';

/** The window title with the count in front on Linux: `(2) Work — <name>` (spec §15.5). */
export const titleWithCount = (title: string, count: number) =>
  count > 0 ? `(${count}) ${title}` : title;

/** What a window shows, as its renderer reports it. */
interface Visible {
  workspaceId: string | null;
  claudeTab: boolean;
  /** The terminal session its view shows, for a main checkout's Claude tab (spec §9.8). */
  sessionId?: string | null;
}

/**
 * The status service's Electron side: which Claude tab each window shows,
 * notifications (spec §10.3) and the Dock badge (§5). Scripted test runs
 * (background test windows) record notifications instead of showing them.
 */
export class ElectronStatusPlatform implements StatusPlatform {
  private readonly visible = new Map<number, Visible>();
  private readonly events = new EventEmitter();
  /** Notifications a scripted test reads (`globalThis.__notifications`); none are shown then. */
  private readonly recorded: Alert[] = [];
  private readonly testRun = testWindows();
  /** Linux: the launcher badge over the session bus, where the dock shows one. */
  private readonly launcher =
    process.platform === 'linux'
      ? new LauncherBadge(
          `application://${BRAND.linuxExecutable}.desktop`,
          sessionBusPath(process.env, os.userInfo().uid),
          os.userInfo().uid,
        )
      : null;
  private count = 0;
  /** Linux: windows whose title gets the count. */
  private readonly tracked = new WeakSet<BrowserWindow>();

  constructor(private readonly config: ConfigStore) {
    if (this.testRun) (globalThis as { __notifications?: Alert[] }).__notifications = this.recorded;
  }

  setVisible(webContentsId: number, visible: Visible): void {
    this.visible.set(webContentsId, visible);
    this.events.emit('shown');
  }

  /**
   * What windows that are visible and not minimized show (spec §9.8): their
   * workspaces, and the terminal sessions of their shown tabs.
   */
  shown(): { workspaces: Set<string>; sessions: Set<string> } {
    const workspaces = new Set<string>();
    const sessions = new Set<string>();
    for (const [id, shown] of this.visible) {
      const contents = webContents.fromId(id);
      const win = contents ? BrowserWindow.fromWebContents(contents) : null;
      if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) continue;
      if (shown.workspaceId) workspaces.add(shown.workspaceId);
      if (shown.sessionId) sessions.add(shown.sessionId);
    }
    return { workspaces, sessions };
  }

  /** A window reported what it shows. */
  onShown(listener: () => void): () => void {
    this.events.on('shown', listener);
    return () => this.events.off('shown', listener);
  }

  claudeTabInFocus(workspaceId: string): boolean {
    for (const [id, shown] of this.visible) {
      const contents = webContents.fromId(id);
      const win = contents ? BrowserWindow.fromWebContents(contents) : null;
      if (win?.isFocused() && shown.claudeTab && shown.workspaceId === workspaceId) return true;
    }
    return false;
  }

  quiet(profileId: string): boolean {
    return this.profile(profileId)?.alerts.doNotDisturb ?? false;
  }

  profileName(profileId: string): string {
    return this.profile(profileId)?.name ?? profileId;
  }

  notify(alert: Alert): void {
    if (this.testRun) {
      this.recorded.push(alert);
      return;
    }
    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: alert.title,
      body: alert.body,
      silent: true,
      // Linux: the app's icon; packaged builds also name their desktop entry.
      ...(process.platform === 'linux' ? { icon: linuxIconPath() } : {}),
    });
    notification.on('click', () => this.events.emit('open', alert.workspaceId));
    notification.show();
  }

  /** A notification was clicked: open that workspace's Claude tab. */
  onOpen(listener: (workspaceId: string) => void): () => void {
    this.events.on('open', listener);
    return () => this.events.off('open', listener);
  }

  setBadge(count: number): void {
    this.count = count;
    if (process.platform === 'darwin') app.setBadgeCount(count);
    // TODO(M7): an overlay icon on Windows.
    if (!this.launcher) return;
    // Linux: the dock's badge where it has one, and the count in every window's
    // title, which taskbars and Alt-Tab show where there's no badge.
    if (!this.testRun) this.launcher.set(count);
    for (const win of BrowserWindow.getAllWindows()) {
      this.track(win);
      win.setTitle(titleWithCount(win.webContents.getTitle(), count));
    }
  }

  /** Linux: keeps the count in front of the title the page sets (`page-title-updated`). */
  track(win: BrowserWindow): void {
    if (!this.launcher || this.tracked.has(win)) return;
    this.tracked.add(win);
    win.on('page-title-updated', (event, title) => {
      event.preventDefault();
      win.setTitle(titleWithCount(title, this.count));
    });
  }

  private profile(profileId: string) {
    return this.config.get().config?.profiles.find((p) => p.id === profileId);
  }
}
