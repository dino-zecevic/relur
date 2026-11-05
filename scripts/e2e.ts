/**
 * Runs the e2e suites listed in scripts/e2e-suites.json, the only list of
 * them: `npm run e2e`, scripts/linux-check-run.sh and CI's e2e job all run
 * this (spec §15.6). Each suite runs on the production build in out/ and then
 * on the dev server; the first failure stops the run with its exit code. A
 * summary of each run's time is printed at the end.
 *
 *   tsx scripts/e2e.ts [--xvfb] [--mode prod|dev] [suite…]
 *
 * --xvfb runs each suite under its own `xvfb-run -a` (Linux without a display);
 * --mode runs one of the two only; named suites run alone, in the list's order.
 * Builds nothing: `npm run build` first.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { E2E_SUITES, suiteFile } from './lib/e2e-suites';

const root = path.resolve(import.meta.dirname, '..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { xvfb: { type: 'boolean' }, mode: { type: 'string' } },
});
const unknown = positionals.filter((name) => !E2E_SUITES.includes(name));
if (unknown.length > 0 || (values.mode && !['prod', 'dev'].includes(values.mode))) {
  console.error(
    `usage: tsx scripts/e2e.ts [--xvfb] [--mode prod|dev] [suite…]\nsuites: ${E2E_SUITES.join(' ')}`,
  );
  process.exit(2);
}
const suites =
  positionals.length > 0 ? E2E_SUITES.filter((s) => positionals.includes(s)) : E2E_SUITES;
const modes = values.mode ? [values.mode] : ['prod', 'dev'];

const tsx = path.join(root, 'node_modules', '.bin', 'tsx');
const times: string[] = [];
const started = Date.now();
const minutes = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
};

for (const mode of modes) {
  for (const suite of suites) {
    const args = [
      '--tsconfig',
      'tsconfig.node.json',
      suiteFile(suite),
      ...(mode === 'dev' ? ['--dev'] : []),
    ];
    const [command, commandArgs] = values.xvfb ? ['xvfb-run', ['-a', tsx, ...args]] : [tsx, args];
    const label = `${suite}${mode === 'dev' ? ' --dev' : ''}`;
    console.log(`\n=== e2e ${label}`);
    const start = Date.now();
    const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit' });
    times.push(`${label.padEnd(24)}${minutes(Date.now() - start)}`);
    if (result.status !== 0) {
      console.error(
        `\n=== e2e ${label} failed (${result.error?.message ?? result.signal ?? `exit ${result.status}`})`,
      );
      console.error(times.join('\n'));
      process.exit(result.status || 1);
    }
  }
}
console.log(
  `\n=== e2e passed\n${times.join('\n')}\n${'total'.padEnd(24)}${minutes(Date.now() - started)}`,
);
