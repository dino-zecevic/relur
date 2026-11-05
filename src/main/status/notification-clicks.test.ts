import { describe, expect, it, vi } from 'vitest';
import {
  KEPT_NOTIFICATIONS,
  NotificationClicks,
  PENDING_CLICK_MS,
  type ShownNotification,
} from './notification-clicks';

/** A stand-in for Electron's Notification: its handlers, fired by hand. */
function fake() {
  const handlers = new Map<string, () => void>();
  const notification: ShownNotification & { fire(event: string): void; shown: boolean } = {
    shown: false,
    on(event, listener) {
      handlers.set(event, listener);
      return notification;
    },
    show() {
      notification.shown = true;
    },
    fire(event) {
      handlers.get(event)?.();
    },
  };
  return notification;
}

describe('NotificationClicks', () => {
  it('keeps a shown notification until it is clicked, closed or fails', () => {
    const clicks = new NotificationClicks();
    const [a, b, c] = [fake(), fake(), fake()];
    clicks.show(a, 'w1');
    clicks.show(b, 'w2');
    clicks.show(c, 'w3');
    expect(a.shown && b.shown && c.shown).toBe(true);
    expect(clicks.kept).toBe(3);
    a.fire('click');
    b.fire('close');
    c.fire('failed');
    expect(clicks.kept).toBe(0);
  });

  it('lets the oldest go past the limit', () => {
    const clicks = new NotificationClicks();
    const first = fake();
    clicks.show(first, 'w0');
    for (let i = 1; i <= KEPT_NOTIFICATIONS; i++) clicks.show(fake(), `w${i}`);
    expect(clicks.kept).toBe(KEPT_NOTIFICATIONS);
  });

  it('brings the window forward and opens the workspace in a listening page', () => {
    const clicks = new NotificationClicks();
    const forward = vi.fn();
    const open = vi.fn();
    clicks.onClicked(forward);
    clicks.onOpen(open);
    const notification = fake();
    clicks.show(notification, 'w1');
    notification.fire('click');
    expect(forward).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('w1');
  });

  it('brings the window forward before the workspace opens', () => {
    const clicks = new NotificationClicks();
    const order: string[] = [];
    clicks.onOpen(() => order.push('open'));
    clicks.onClicked(() => order.push('forward'));
    clicks.click('w1');
    expect(order).toEqual(['forward', 'open']);
  });

  it('holds a click while no page listens, for the new page to take once', () => {
    let now = 1000;
    const clicks = new NotificationClicks(() => now);
    const forward = vi.fn();
    clicks.onClicked(forward);
    clicks.click('w1');
    expect(forward).toHaveBeenCalledTimes(1);
    now += 2000;
    // A page that starts listening isn't pushed it: its subscription may be dropped.
    const open = vi.fn();
    clicks.onOpen(open);
    expect(open).not.toHaveBeenCalled();
    expect(clicks.take()).toBe('w1');
    expect(clicks.take()).toBeNull();
  });

  it('keeps only the latest click that waits', () => {
    const clicks = new NotificationClicks();
    clicks.click('w1');
    clicks.click('w2');
    expect(clicks.take()).toBe('w2');
  });

  it('drops a waiting click that is too old', () => {
    let now = 0;
    const clicks = new NotificationClicks(() => now);
    clicks.click('w1');
    now = PENDING_CLICK_MS + 1;
    expect(clicks.take()).toBeNull();
  });

  it('stops delivering to a page that stopped listening, and holds the click again', () => {
    const clicks = new NotificationClicks();
    const gone = vi.fn();
    const stop = clicks.onOpen(gone);
    stop();
    clicks.click('w1');
    expect(gone).not.toHaveBeenCalled();
    expect(clicks.take()).toBe('w1');
  });

  it('a click while a page listens opens it at once, with nothing left waiting', () => {
    const clicks = new NotificationClicks();
    const open = vi.fn();
    clicks.onOpen(open);
    clicks.click('w1');
    expect(open.mock.calls).toEqual([['w1']]);
    expect(clicks.take()).toBeNull();
  });
});
