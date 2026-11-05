import type { ConfigInput } from '@shared/schemas';

/**
 * Two profiles, Work in `~/.claude` and Personal in `~/.claude-personal`: the
 * config M0 seeded on first launch, kept as a fixture for scripted tests. New
 * installs start without profiles (spec §3.4). Suspending idle sessions is
 * explicitly off (spec §9.8), so the tests that don't test it see no suspends
 * and no notice; a test sets its own delay.
 */
export const SEED_CONFIG: ConfigInput = {
  version: 1,
  profiles: [
    {
      id: 'work',
      name: 'Work',
      color: 'blue',
      claude: { command: 'claude', args: [] },
      env: {},
      defaults: { baseBranch: 'main' },
      suspendIdleMin: 0,
    },
    {
      id: 'personal',
      name: 'Personal',
      color: 'green',
      claude: { command: 'claude', args: [] },
      env: { CLAUDE_CONFIG_DIR: '~/.claude-personal' },
      defaults: { baseBranch: 'main' },
      suspendIdleMin: 0,
    },
  ],
  projects: [],
};
