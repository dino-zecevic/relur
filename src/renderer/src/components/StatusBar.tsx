import type { MemorySnapshot } from '@shared/memory';
import type { Profile } from '@shared/schemas';
import { needsYou } from '@shared/status';
import type { UsageSnapshot } from '@shared/usage';
import type { Workspace } from '@shared/workspaces';
import { useQuery } from '@tanstack/react-query';
import { GuideLink } from '../guide/link';
import { useTRPC } from '../trpc';
import { ProfileDot } from '../ui/profile-color';
import { StatusGlyph } from '../ui/StatusGlyph';
import { MemoryStatus } from './MemoryStatus';
import { UsageMeter } from './UsageMeter';

const triangle = (
  <span className="inline-block h-[9px] w-[10px] shrink-0 bg-st-permission [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
);

/**
 * Profile, where you are, the setup check's warning and environment warnings,
 * the counts of working and needs-you workspaces (spec §6.5), the memory of
 * Claude sessions (§6.14), and plan usage (§11), hidden until signed in.
 */
export function StatusBar({
  profile,
  location,
  setupWarning,
  onOpenSetup,
  usage,
  notice,
  workspaces,
  memory,
}: {
  profile: Profile | null;
  location: string;
  /** "claude not found", "not signed in" or "wrong config folder" (spec §6.5). */
  setupWarning: string | null;
  onOpenSetup: () => void;
  /** Plan usage (spec §11); hidden until the profile is signed in. */
  usage: { snapshot: UsageSnapshot | null; show: boolean };
  /** A short-lived note, such as why a workspace key had nowhere to go. */
  notice: string | null;
  /** The profile's workspaces, for the counts. */
  workspaces: Workspace[];
  /** Memory of every Claude session and the app (spec §6.14); null before the first measurement. */
  memory: MemorySnapshot | null;
}) {
  const trpc = useTRPC();
  const diagnostics = useQuery(trpc.env.diagnostics.queryOptions());
  const info = useQuery(trpc.app.info.queryOptions());
  const data = diagnostics.data;

  const warnings: { text: string; title?: string }[] = [];
  if (data && !data.git) warnings.push({ text: 'git not found on PATH' });
  if (data?.source === 'fallback') {
    warnings.push({
      text: "Couldn't read your login shell's environment",
      title: data.error ?? undefined,
    });
  }
  if (info.error) warnings.push({ text: `Main process unreachable: ${info.error.message}` });
  // Spec §6.5: Working, and Needs you (permission, input or approval); each only when not 0.
  const working = workspaces.filter((w) => w.state === 'working').length;
  const waiting = workspaces.filter((w) => needsYou(w.state)).length;

  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-3 border-t border-line bg-chrome px-3 text-sm">
      {profile ? (
        <span className="flex items-center gap-1.5">
          <ProfileDot color={profile.color} size={6} />
          {profile.name}
        </span>
      ) : null}
      <span className="min-w-0 truncate font-mono text-xs text-fg-muted">{location}</span>
      <span className="ml-auto flex min-w-0 items-center gap-3">
        {notice ? (
          <span role="status" data-key-notice className="truncate text-fg-muted">
            {notice}
          </span>
        ) : null}
        {warnings.map((w) => (
          <span key={w.text} title={w.title} className="flex items-center gap-1.5 truncate">
            {triangle}
            {w.text}
          </span>
        ))}
        {profile && setupWarning ? (
          <button
            type="button"
            title="Open the setup check"
            data-setup-warning
            onClick={onOpenSetup}
            className="flex h-5 items-center gap-1.5 rounded-sm px-2 font-medium text-st-permission hover:bg-raised"
          >
            {triangle}
            {setupWarning}
            <span className="font-normal text-fg-muted underline underline-offset-2">Set up</span>
          </button>
        ) : null}
        {working > 0 ? (
          <span
            data-count-working
            title={`Claude is working in ${working} ${working === 1 ? 'workspace' : 'workspaces'}`}
            className="flex items-center gap-1.5 text-fg-muted"
          >
            <StatusGlyph glyph="working" title="" />
            {working} working
          </span>
        ) : null}
        {waiting > 0 ? (
          <span
            data-count-needs
            title={`${waiting} ${waiting === 1 ? 'workspace needs' : 'workspaces need'} you: permission, input or approval`}
            className="flex items-center gap-1.5 font-medium text-st-input"
          >
            <StatusGlyph glyph="input" title="" />
            {waiting} needs you
          </span>
        ) : null}
        {memory ? <MemoryStatus memory={memory} /> : null}
        {profile && usage.show ? (
          <>
            <UsageMeter usage={usage.snapshot} />
            <GuideLink to="plan-usage#session-and-week" label="Plan usage" />
          </>
        ) : null}
      </span>
    </footer>
  );
}
