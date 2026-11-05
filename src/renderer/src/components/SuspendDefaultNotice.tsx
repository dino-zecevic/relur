import { suspendDefaultNotice } from '@shared/suspend';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { button } from '../ui/controls';

/**
 * The one-time notice that suspending idle sessions is now on by default
 * (spec §9.8): a bar under the tabs, as the update notice, with Settings
 * (Edit profile › General of the shown profile) and OK. Either ends it.
 */
export function SuspendDefaultNotice({ onSettings }: { onSettings: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const notice = useQuery(trpc.app.suspendNotice.queryOptions());
  const dismiss = useMutation(
    trpc.app.dismissSuspendNotice.mutationOptions({
      onSettled: () =>
        void queryClient.invalidateQueries({ queryKey: trpc.app.suspendNotice.queryKey() }),
    }),
  );
  const profiles = notice.data;
  if (!profiles || profiles.length === 0 || dismiss.isPending || dismiss.isSuccess) return null;
  return (
    <div
      role="status"
      data-suspend-notice
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2 text-md"
    >
      <span className="text-fg-subtle">◐</span>
      <span className="min-w-0 flex-1">{suspendDefaultNotice(profiles.map((p) => p.name))}</span>
      <button
        type="button"
        className={button('secondary', 'sm')}
        onClick={() => {
          dismiss.mutate();
          onSettings();
        }}
      >
        Settings
      </button>
      <button type="button" className={button('ghost', 'sm')} onClick={() => dismiss.mutate()}>
        OK
      </button>
    </div>
  );
}
