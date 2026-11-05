import type { DefaultedProfile } from '../config/store';
import { markShown, wasShown } from '../notices';

/**
 * The one-time notice after the update that turned suspension on by default
 * (spec §9.8): shown when the start gave profiles the default, never on a
 * new install, and never again once recorded in `notices.json`. Recorded as
 * soon as it is due, so a quit before it is answered doesn't bring it back.
 */
export class SuspendDefaultNotice {
  private pending: DefaultedProfile[] | null = null;

  constructor(
    configDir: string,
    start: { created: boolean; defaulted: readonly DefaultedProfile[] },
  ) {
    if (wasShown(configDir, 'suspend-default')) return;
    // A new install's profiles get the default when created: nothing changed for the user.
    if (start.created) {
      markShown(configDir, 'suspend-default');
      return;
    }
    if (start.defaulted.length === 0) return;
    markShown(configDir, 'suspend-default');
    this.pending = [...start.defaulted];
  }

  /** The profiles it names, or null when there is no notice to show. */
  get(): DefaultedProfile[] | null {
    return this.pending;
  }

  /** Settings or OK: the notice goes, in every window. */
  dismiss(): void {
    this.pending = null;
  }
}
