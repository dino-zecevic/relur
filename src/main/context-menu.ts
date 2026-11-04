import { type BrowserWindow, Menu } from 'electron';

export interface ContextMenuItem {
  id: string;
  label: string;
  enabled?: boolean;
  /** A checkbox item, ticked or not. */
  checked?: boolean;
}

/**
 * Shows a native context menu at the pointer and resolves with the id of the
 * chosen item, or null if it was dismissed.
 */
export function showContextMenu(
  win: BrowserWindow | null,
  items: ContextMenuItem[],
): Promise<string | null> {
  return new Promise((resolve) => {
    const menu = Menu.buildFromTemplate(
      items.map((item) => ({
        label: item.label,
        enabled: item.enabled ?? true,
        ...(item.checked === undefined ? {} : { type: 'checkbox' as const, checked: item.checked }),
        click: () => resolve(item.id),
      })),
    );
    // Electron runs the click handler before the close callback; resolving
    // twice is a no-op, so a dismissed menu resolves with null.
    menu.popup({
      ...(win ? { window: win } : {}),
      callback: () => setImmediate(() => resolve(null)),
    });
  });
}
