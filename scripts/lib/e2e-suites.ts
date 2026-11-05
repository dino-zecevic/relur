/**
 * The e2e suites, from scripts/e2e-suites.json: suite `x` is
 * scripts/e2e-x.ts. scripts/e2e.ts runs them; scripts/e2e.test.ts fails
 * `npm run check` when a scripts/e2e-*.ts file isn't listed (spec §15.6).
 */
import suites from '../e2e-suites.json';

export const E2E_SUITES: readonly string[] = suites;

export const suiteFile = (suite: string) => `scripts/e2e-${suite}.ts`;
