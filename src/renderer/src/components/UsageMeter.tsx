import { USAGE_STALE_MS, type UsageSnapshot, type UsageWindow } from '@shared/usage';
import { useNow } from '../ui/now';
import { ago } from '../ui/time';

/** "2h 11m" until a time; "now" once it passed. */
function until(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((at - now) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

const clock = (at: number) =>
  new Date(at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** The status bar's 44×4 bar (components.md, Plan usage), shared with Memory. */
export function MeterBar({
  percent,
  high,
  stale = false,
}: {
  percent: number;
  /** `st-permission` instead of `fg-muted`. */
  high: boolean;
  stale?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`relative h-1 w-11 shrink-0 overflow-hidden rounded-full bg-line ${stale ? 'opacity-60' : ''}`}
    >
      <span
        className={`absolute inset-y-0 left-0 rounded-full ${high ? 'bg-st-permission' : 'bg-fg-muted'} ${stale ? 'bg-[repeating-linear-gradient(45deg,currentColor_0_2px,transparent_2px_4px)]' : ''}`}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

function Meter({
  label,
  window,
  stale,
  now,
  showReset,
}: {
  label: string;
  window: UsageWindow | null;
  stale: boolean;
  now: number;
  showReset: boolean;
}) {
  const used = window ? Math.round(window.usedPercentage) : null;
  const high = used !== null && used >= 80;
  return (
    <span
      className="flex items-center gap-1.5"
      title={window?.resetsAt ? `Resets ${clock(window.resetsAt)}` : undefined}
    >
      <span className="text-fg-muted">{label}</span>
      <MeterBar percent={used ?? 0} high={high} stale={stale} />
      <span className={`font-mono text-xs ${high && !stale ? 'text-st-permission' : ''}`}>
        {used === null ? '—' : `${used}%`}
      </span>
      {showReset && window?.resetsAt ? (
        <span className="text-xs text-fg-subtle">resets {until(window.resetsAt, now)}</span>
      ) : null}
    </span>
  );
}

/**
 * Plan usage in the status bar (spec §11, components.md): the five-hour and
 * weekly windows from Claude Code's status line. Stale after 10 minutes
 * without an update; "Usage n/a" before any.
 */
export function UsageMeter({ usage }: { usage: UsageSnapshot | null }) {
  const now = useNow(true, 30_000);
  if (!usage) {
    return (
      <span
        data-usage="n/a"
        className="text-xs text-fg-subtle"
        title="Plan usage comes from Claude Code's status line. It shows once Claude runs in a workspace of this profile (not with an API key)."
      >
        Usage n/a
      </span>
    );
  }
  const stale = now - usage.updatedAt > USAGE_STALE_MS;
  return (
    <span
      data-usage={stale ? 'stale' : 'fresh'}
      className="flex items-center gap-3"
      title={`Updated ${new Date(usage.updatedAt).toLocaleTimeString()}`}
    >
      <Meter label="Session" window={usage.fiveHour} stale={stale} now={now} showReset />
      <Meter label="Week" window={usage.sevenDay} stale={stale} now={now} showReset={false} />
      {stale ? (
        <span className="flex items-center gap-1 text-xs text-fg-subtle">
          <span
            aria-hidden
            className="size-2.5 rounded-full border border-dashed border-fg-subtle"
          />
          Stale · {ago(new Date(usage.updatedAt).toISOString(), now)} ago
        </span>
      ) : null}
    </span>
  );
}
