import { BRAND } from '@shared/brand';
import { UPDATE_QUESTION } from '@shared/updates';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { type ReactNode, useState } from 'react';
import { type AppRouterOutputs, trpcClient, useTRPC } from '../trpc';
import { button, iconButton } from '../ui/controls';
import { CommandBlock } from './SetupCheck';

type UpdateAction = AppRouterOutputs['updates']['inTerminal'];
type UpdateState = AppRouterOutputs['updates']['state'];

const bar =
  'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2 text-md';

const MB = 1024 * 1024;
const mb = (bytes: number) => (bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0);

/** The download's bar (components.md, New versions): 160×4, `fg` on `line`. */
function ProgressBar({ received, total }: { received: number; total: number | null }) {
  const percent = total ? Math.min(100, Math.round((received / total) * 100)) : null;
  return (
    <div
      role="progressbar"
      data-update-progress={percent ?? ''}
      aria-label="Download"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      className="relative h-1 w-40 shrink-0 overflow-hidden rounded-full bg-line"
    >
      <span
        className={`absolute inset-y-0 left-0 rounded-full bg-fg ${percent === null ? 'w-1/3 animate-pulse' : ''}`}
        style={percent === null ? undefined : { width: `${percent}%` }}
      />
    </div>
  );
}

/**
 * New versions (spec §15.7), a bar under the tabs, never a dialog: the
 * first-start question, then "<app> 0.2.0 is available" with Update, Update
 * in terminal, Release notes and Skip this version. Update downloads the new
 * version with a progress bar and Cancel, then "<app> 0.2.0 is ready" with
 * Restart now and Later. Where the app can't replace itself, it says why.
 */
export function UpdateNotice() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const state = useQuery(trpc.updates.state.queryOptions());
  useSubscription(
    trpc.updates.changes.subscriptionOptions(undefined, {
      onData: () => void queryClient.invalidateQueries({ queryKey: trpc.updates.state.queryKey() }),
    }),
  );
  const [action, setAction] = useState<{ version: string; result: UpdateAction } | null>(null);
  const inTerminal = useMutation(trpc.updates.inTerminal.mutationOptions());
  const data = state.data;
  if (!data) return null;

  if (data.ask) {
    return (
      <div role="status" data-update-ask className={bar}>
        <span className="text-fg-subtle">↻</span>
        <span className="min-w-0 flex-1">{UPDATE_QUESTION}</span>
        <button
          type="button"
          className={button('secondary', 'sm')}
          onClick={() => void trpcClient.updates.answer.mutate({ check: true })}
        >
          Check for updates
        </button>
        <button
          type="button"
          className={button('ghost', 'sm')}
          onClick={() => void trpcClient.updates.answer.mutate({ check: false })}
        >
          No thanks
        </button>
      </div>
    );
  }

  const openTerminal = (version: string) =>
    inTerminal.mutate(undefined, {
      onSuccess: (result) => setAction({ version, result }),
    });
  const terminalOutcome = (version: string) => {
    const shown = action?.version === version ? action.result : null;
    return (
      <>
        {shown ? <TerminalAction shown={shown} version={version} /> : null}
        {inTerminal.error ? (
          <p role="alert" className="w-full text-sm text-st-error select-text">
            ✕ {inTerminal.error.message}
          </p>
        ) : null}
      </>
    );
  };
  const terminalButton = (version: string, variant: Parameters<typeof button>[0]) => (
    <button
      type="button"
      data-update-terminal
      className={button(variant, 'sm')}
      disabled={inTerminal.isPending}
      title="Opens a terminal with the install command; it asks before it quits the app"
      onClick={() => openTerminal(version)}
    >
      Update in terminal
    </button>
  );

  const install = data.install;
  if (install.phase !== 'idle') {
    return (
      <Installing
        data={data}
        install={install}
        terminal={
          <>
            {terminalButton(install.version, 'ghost')}
            {terminalOutcome(install.version)}
          </>
        }
      />
    );
  }

  if (data.failure) {
    const { version, reason } = data.failure;
    return (
      <div role="status" data-update-failed={version} className={bar}>
        <span className="text-st-error">✕</span>
        <span className="min-w-0 flex-1 select-text">
          Couldn't update to {version}: {reason}.{' '}
          <span className="text-fg-muted">
            {BRAND.displayName} {data.current} is still installed.
          </span>
        </span>
        {terminalButton(version, 'secondary')}
        <button
          type="button"
          className={iconButton}
          title="Hide"
          aria-label="Hide"
          onClick={() => void trpcClient.updates.dismissFailure.mutate()}
        >
          ×
        </button>
        {terminalOutcome(version)}
      </div>
    );
  }

  const release = data.available;
  if (!release) return null;
  const way = data.way;
  return (
    <div role="status" data-update-notice={release.version} className={bar}>
      <span className="text-fg-subtle">↑</span>
      <span className="min-w-0 flex-1">
        {BRAND.displayName} {release.version} is available
        <span className="ml-2 text-sm text-fg-subtle">you have {data.current}</span>
      </span>
      {way.kind === 'self' ? (
        <>
          <button
            type="button"
            data-update-install
            className={button('primary', 'sm')}
            title={`Downloads ${release.version}; it's installed when ${BRAND.displayName} restarts`}
            onClick={() => void trpcClient.updates.install.mutate()}
          >
            Update
          </button>
          {terminalButton(release.version, 'ghost')}
        </>
      ) : way.kind === 'deb' ? (
        <button
          type="button"
          data-update-terminal
          className={button('primary', 'sm')}
          disabled={inTerminal.isPending}
          onClick={() => openTerminal(release.version)}
        >
          Update
        </button>
      ) : way.kind === 'terminal' ? (
        terminalButton(release.version, 'primary')
      ) : null}
      <button
        type="button"
        data-release-notes
        className={button('ghost', 'sm')}
        onClick={() => void trpcClient.shell.openExternal.mutate({ url: release.url })}
      >
        Release notes
      </button>
      <button
        type="button"
        className={button('ghost', 'sm')}
        onClick={() => void trpcClient.updates.skip.mutate()}
      >
        Skip this version
      </button>
      <button
        type="button"
        className={iconButton}
        title="Hide until the next check"
        aria-label="Hide"
        onClick={() => void trpcClient.updates.dismiss.mutate()}
      >
        ×
      </button>
      {way.kind === 'source' ? (
        <p data-update-source className="w-full text-sm text-fg-muted">
          This build runs from source and can't update itself: pull and build it again.
        </p>
      ) : way.kind === 'terminal' && way.why ? (
        <p data-update-why className="w-full text-sm text-fg-muted">
          {way.why}
        </p>
      ) : null}
      {terminalOutcome(release.version)}
    </div>
  );
}

/** The download, the check, and the ready update (spec §15.7). */
function Installing({
  data,
  install,
  terminal,
}: {
  data: UpdateState;
  install: Exclude<UpdateState['install'], { phase: 'idle' }>;
  /** Update in terminal, after a failure. */
  terminal: ReactNode;
}) {
  const { version } = install;
  if (install.phase === 'downloading' || install.phase === 'checking') {
    return (
      <div role="status" data-update-installing={install.phase} className={bar}>
        <span className="text-fg-subtle">↓</span>
        <span className="min-w-0 flex-1">
          {install.phase === 'downloading'
            ? `Downloading ${BRAND.displayName} ${version}…`
            : `Checking ${BRAND.displayName} ${version}…`}
          {install.phase === 'downloading' && install.total ? (
            <span className="ml-2 text-sm text-fg-subtle tabular-nums">
              {mb(install.received)} of {mb(install.total)} MB
            </span>
          ) : null}
        </span>
        {install.phase === 'downloading' ? (
          <ProgressBar received={install.received} total={install.total} />
        ) : (
          <ProgressBar received={0} total={null} />
        )}
        <button
          type="button"
          className={button('ghost', 'sm')}
          onClick={() => void trpcClient.updates.cancel.mutate()}
        >
          Cancel
        </button>
      </div>
    );
  }
  if (install.phase === 'ready') {
    return (
      <div role="status" data-update-ready={version} className={bar}>
        <span className="text-fg-subtle">↑</span>
        <span className="min-w-0 flex-1">
          {BRAND.displayName} {version} is ready
          {install.later ? (
            <span className="ml-2 text-sm text-fg-subtle">
              it's installed when you quit {BRAND.displayName}
            </span>
          ) : (
            <span className="ml-2 text-sm text-fg-subtle">you have {data.current}</span>
          )}
        </span>
        <button
          type="button"
          className={button('primary', 'sm')}
          title={`Quits ${BRAND.displayName}, as ${BRAND.displayName} › Quit does, installs ${version} and opens it`}
          onClick={() => void trpcClient.updates.restart.mutate()}
        >
          Restart now
        </button>
        {install.later ? null : (
          <button
            type="button"
            className={button('ghost', 'sm')}
            title={`Installs ${version} when you quit ${BRAND.displayName}`}
            onClick={() => void trpcClient.updates.later.mutate()}
          >
            Later
          </button>
        )}
      </div>
    );
  }
  return (
    <div role="status" data-update-failed={version} className={bar}>
      <span className="text-st-error">✕</span>
      <span className="min-w-0 flex-1 select-text">
        Couldn't update to {version}: {install.reason}
      </span>
      <button
        type="button"
        className={button('secondary', 'sm')}
        onClick={() => void trpcClient.updates.install.mutate()}
      >
        Try again
      </button>
      {terminal}
      <button
        type="button"
        className={iconButton}
        title="Hide"
        aria-label="Hide"
        onClick={() => void trpcClient.updates.dismissFailure.mutate()}
      >
        ×
      </button>
    </div>
  );
}

/** After Update in terminal: a terminal opened, or the command with Copy. */
function TerminalAction({ shown, version }: { shown: UpdateAction; version: string }) {
  return (
    <div data-update-action={shown.kind} className="w-full">
      {shown.kind === 'terminal' ? (
        <p className="text-sm text-fg-muted">
          A terminal opened with the install command. It asks before it quits {BRAND.displayName},
          installs {version} and offers to open it again.
        </p>
      ) : (
        <>
          <p className="mb-1.5 text-sm text-fg-muted">
            {shown.why}
            {shown.link ? (
              <>
                {' '}
                <button
                  type="button"
                  className="underline hover:text-fg"
                  onClick={() =>
                    void trpcClient.shell.openExternal.mutate({ url: shown.link ?? '' })
                  }
                >
                  Download the .deb
                </button>
              </>
            ) : null}
          </p>
          <CommandBlock command={shown.command} />
        </>
      )}
    </div>
  );
}
