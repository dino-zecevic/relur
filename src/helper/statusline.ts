import { spawn } from 'node:child_process';
import { envVar } from '../shared/brand';
import { bridgeFromEnv, post } from './bridge';

/** Runs the profile's own status line command with the same input; resolves with its output. */
function runOwn(command: string, input: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', command], { stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
    });
    child.on('error', () => resolve(''));
    child.on('close', () => {
      clearTimeout(timer);
      resolve(out);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

const modelId = (model: unknown): string | null => {
  const id = model && typeof model === 'object' ? (model as { id?: unknown }).id : null;
  return typeof id === 'string' && id ? id : null;
};

/**
 * `statusline` (spec §9.3, §11): forwards `rate_limits` to the bridge with the
 * profile id, and prints the output of the profile's own status line command
 * (`claude.statusLine`, passed in by the app), so nothing visible is lost.
 */
export async function runStatusLine(
  input: string,
  env: NodeJS.ProcessEnv,
  write: (text: string) => void = (text) => process.stdout.write(text),
): Promise<number> {
  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(input);
  } catch {
    // nothing to forward
  }
  const bridge = bridgeFromEnv(env);
  const own = env[envVar('STATUSLINE_COMMAND')];
  const [, output] = await Promise.all([
    bridge && payload
      ? post(
          bridge,
          '/statusline',
          {
            profileId: env[envVar('PROFILE')] ?? null,
            workspaceId: env[envVar('WORKSPACE_ID')] ?? null,
            sessionId: env[envVar('TERMINAL_SESSION')] ?? null,
            rateLimits: payload.rate_limits ?? null,
            // The session's model, so a resume keeps it (spec §9.8).
            model: modelId(payload.model),
          },
          500,
        )
      : null,
    own ? runOwn(own, input) : Promise.resolve(''),
  ]);
  write(output);
  return 0;
}
