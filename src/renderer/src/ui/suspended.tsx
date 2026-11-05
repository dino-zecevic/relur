import { createContext, type ReactNode, useContext } from 'react';
import { LaunchingContext } from './launching';

/** A suspended Claude session as the memory panel lists it (spec §6.14, §9.8). */
export interface SuspendedSession {
  id: string;
  /** The workspace's title, or "<project> (main checkout)". */
  name: string;
  /** Its project, and its profile when that isn't the shown one; may be empty. */
  where: string;
}

/** Ids of the workspaces whose Claude is suspended to save memory (spec §9.8). */
export const SuspendedContext = createContext<ReadonlySet<string>>(new Set());

export const useSuspended = () => useContext(SuspendedContext);

/** The workspaces whose Claude is launching (spec §6.3) or suspended (§9.8), for rows and tables. */
export function SessionMarks({
  launching,
  suspended,
  children,
}: {
  launching: ReadonlySet<string>;
  suspended: ReadonlySet<string>;
  children: ReactNode;
}) {
  return (
    <LaunchingContext value={launching}>
      <SuspendedContext value={suspended}>{children}</SuspendedContext>
    </LaunchingContext>
  );
}
