import type { SessionInfo } from '@shared/terminal-protocol';
import { useState } from 'react';
import { iconButton } from '../ui/controls';

/**
 * A Claude session's note on how it started, above its terminal, until
 * dismissed or Claude starts again: a new conversation where none was saved
 * to resume (spec §9.8). Shown in either renderer, as Claude's full-screen
 * mode would hide a line in the terminal.
 */
export function SessionNote({
  session,
  className,
}: {
  session: SessionInfo | null;
  /** Its side padding, as the view's other bars. */
  className: string;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const start = session ? `${session.id}:${session.generation}` : null;
  if (session?.kind !== 'claude' || !session.note || dismissed === start) return null;
  return (
    <div
      role="status"
      data-session-note
      className={`flex items-center gap-3 border-b border-line bg-surface py-2 text-md text-fg-muted ${className}`}
    >
      <span className="min-w-0 flex-1 select-text">{session.note}</span>
      <button
        type="button"
        className={iconButton}
        title="Dismiss"
        aria-label="Dismiss"
        onClick={() => setDismissed(start)}
      >
        ×
      </button>
    </div>
  );
}
