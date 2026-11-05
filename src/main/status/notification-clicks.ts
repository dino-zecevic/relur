/** What the click handling needs of a notification: Electron's, or a stand-in in tests. */
export interface ShownNotification {
  on(event: 'click' | 'close' | 'failed', listener: () => void): unknown;
  show(): void;
}

/**
 * Notifications that stay referenced. Electron drops the click handler of a
 * notification that was garbage collected, and a click then only brings the
 * app to the front; macOS may not say when one leaves Notification Center,
 * so the oldest are let go past this many.
 */
export const KEPT_NOTIFICATIONS = 200;

/**
 * How long a click waits for a window to take it: one clicked while no
 * window was open (macOS keeps running without one, spec §5) opens the
 * workspace once the new window's page takes it.
 */
export const PENDING_CLICK_MS = 30_000;

/**
 * Clicks on notifications (spec §10.3): the window comes to the front and
 * opens the workspace's Claude tab. Every shown notification is kept until
 * it is clicked, closed or fails.
 */
export class NotificationClicks {
  private readonly shown = new Set<ShownNotification>();
  private readonly clickedListeners = new Set<() => void>();
  private readonly openers = new Set<(workspaceId: string) => void>();
  private pending: { workspaceId: string; at: number } | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  /** Shows the notification, kept until it is clicked, closed or fails. */
  show(notification: ShownNotification, workspaceId: string): void {
    const forget = () => this.shown.delete(notification);
    notification.on('click', () => {
      forget();
      this.click(workspaceId);
    });
    notification.on('close', forget);
    notification.on('failed', forget);
    this.shown.add(notification);
    for (const oldest of this.shown) {
      if (this.shown.size <= KEPT_NOTIFICATIONS) break;
      this.shown.delete(oldest);
    }
    notification.show();
  }

  /** How many notifications are kept. */
  get kept(): number {
    return this.shown.size;
  }

  /**
   * A notification of the workspace was clicked: the window comes forward
   * (or opens), and a page that listens opens the workspace; with none
   * listening yet, the click waits for a page to take it.
   */
  click(workspaceId: string): void {
    for (const listener of this.clickedListeners) listener();
    if (this.openers.size === 0) {
      this.pending = { workspaceId, at: this.now() };
      return;
    }
    this.pending = null;
    for (const open of this.openers) open(workspaceId);
  }

  /** Any click, before the workspace opens: brings the window forward. */
  onClicked(listener: () => void): () => void {
    this.clickedListeners.add(listener);
    return () => this.clickedListeners.delete(listener);
  }

  /** A listening page opens the clicked workspace. */
  onOpen(listener: (workspaceId: string) => void): () => void {
    this.openers.add(listener);
    return () => this.openers.delete(listener);
  }

  /**
   * The workspace of a click that waited for a page, taken once. A page asks
   * when it starts, by request and answer: a subscription may be dropped
   * before it delivers (a reload, React's development remount).
   */
  take(): string | null {
    const waiting = this.pending;
    this.pending = null;
    return waiting && this.now() - waiting.at <= PENDING_CLICK_MS ? waiting.workspaceId : null;
  }
}
