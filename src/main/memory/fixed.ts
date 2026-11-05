import { z } from 'zod';

const MB = 1024 * 1024;

/**
 * Fixed memory numbers for scripted runs (the Guide's screenshots), in MB:
 * the machine's total, the app's own, and per session label its Claude
 * process and what it started, by label. A running session whose label isn't
 * listed is left out.
 *
 *   {"total":16384,"app":460,"sessions":{"ABC-142":{"claude":330,"other":{"node dev server":1130}}}}
 */
const FixedMemorySchema = z.object({
  total: z.number().positive(),
  app: z.number().nonnegative(),
  sessions: z.record(
    z.string(),
    z.object({
      claude: z.number().nonnegative(),
      other: z.record(z.string(), z.number().nonnegative()).default({}),
    }),
  ),
});

export interface FixedMemory {
  total: number;
  app: number;
  sessions: Record<
    string,
    { claude: number; other: number; otherParts: { label: string; bytes: number }[] }
  >;
}

/** Parses the TEST_MEMORY value into bytes; null when it's unset or invalid. */
export function parseFixedMemory(value: string | undefined): FixedMemory | null {
  if (!value) return null;
  let parsed: z.infer<typeof FixedMemorySchema>;
  try {
    parsed = FixedMemorySchema.parse(JSON.parse(value));
  } catch (error) {
    console.error('TEST_MEMORY is not valid', error);
    return null;
  }
  return {
    total: parsed.total * MB,
    app: parsed.app * MB,
    sessions: Object.fromEntries(
      Object.entries(parsed.sessions).map(([label, s]) => {
        const otherParts = Object.entries(s.other)
          .map(([part, mb]) => ({ label: part, bytes: mb * MB }))
          .sort((a, b) => b.bytes - a.bytes || a.label.localeCompare(b.label));
        return [
          label,
          {
            claude: s.claude * MB,
            other: otherParts.reduce((sum, p) => sum + p.bytes, 0),
            otherParts,
          },
        ];
      }),
    ),
  };
}
