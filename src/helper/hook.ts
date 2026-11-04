import { envVar } from '../shared/brand';
import { bridgeFromEnv, post } from './bridge';

/**
 * `hook <event>` (spec §10.1): forwards the hook payload, tagged with the
 * workspace and profile, with a 1 s timeout. Always exits 0, so it can never
 * block Claude. It prints nothing, except at SessionStart the note the app
 * answers with (spec §21.9), as the hook's additional context.
 */
export async function runHook(
  event: string,
  input: string,
  env: NodeJS.ProcessEnv,
  write: (text: string) => void = (t) => process.stdout.write(t),
): Promise<number> {
  const bridge = bridgeFromEnv(env);
  if (!bridge || !event) return 0;
  let payload: unknown = null;
  try {
    payload = JSON.parse(input);
  } catch {
    // forwarded as null
  }
  const response = await post(
    bridge,
    '/hook',
    {
      event,
      workspaceId: env[envVar('WORKSPACE_ID')] ?? null,
      profileId: env[envVar('PROFILE')] ?? null,
      // The app's terminal session of this Claude (spec §9.2), for a main checkout's.
      sessionId: env[envVar('TERMINAL_SESSION')] ?? null,
      payload,
    },
    1000,
  );
  if (event !== 'SessionStart' || !response?.ok) return 0;
  const answer = (await response.json().catch(() => null)) as {
    additionalContext?: unknown;
  } | null;
  if (typeof answer?.additionalContext === 'string' && answer.additionalContext) {
    write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: answer.additionalContext,
        },
      }),
    );
  }
  return 0;
}
