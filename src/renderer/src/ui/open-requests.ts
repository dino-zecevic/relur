/**
 * What a workspace should show once it opens, asked for by Home's Overview
 * (spec §6.7): the spec view (Review at a gate) or the commit box in its
 * Changes panel (Commit…). The workspace view takes each request once.
 */
type Request = 'spec' | 'commit';

const pending = new Map<string, { what: Request; at: number }>();

/** Requests older than this are stale: the view never opened. */
const FRESH_MS = 10_000;

export function requestOnOpen(workspaceId: string, what: Request): void {
  pending.set(workspaceId, { what, at: Date.now() });
}

/** Whether `what` was asked for this workspace; the request is used up. */
export function takeRequest(workspaceId: string, what: Request): boolean {
  const request = pending.get(workspaceId);
  if (!request || request.what !== what) return false;
  pending.delete(workspaceId);
  return Date.now() - request.at < FRESH_MS;
}
