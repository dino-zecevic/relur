/** How long a remote's answer is reused after it came (spec §7.3). */
export const REMOTE_ANSWER_TTL_MS = 30_000;

/**
 * What Create asks a remote (spec §7.3), `git ls-remote` and `git fetch`,
 * started when New workspace opens and reused by Create: while it still runs,
 * and for 30 s after it came. A Create uses it up, so the next one asks
 * again. `run` never rejects; its failure is its answer.
 */
export class RemoteAnswers {
  private readonly answers = new Map<
    string,
    { promise: Promise<unknown>; settledAt: number | null }
  >();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = REMOTE_ANSWER_TTL_MS,
  ) {}

  /**
   * The answer for `key`: the one asked earlier when it is still fresh, else
   * `run` again. With `take`, it is used up: the next call asks again.
   */
  get<T>(
    key: string,
    run: () => Promise<T>,
    { take = false }: { take?: boolean } = {},
  ): { answer: Promise<T>; reused: boolean } {
    const known = this.answers.get(key);
    if (known && (known.settledAt === null || this.now() - known.settledAt <= this.ttlMs)) {
      if (take) this.answers.delete(key);
      return { answer: known.promise as Promise<T>, reused: true };
    }
    const entry: { promise: Promise<T>; settledAt: number | null } = {
      promise: run().finally(() => {
        entry.settledAt = this.now();
      }),
      settledAt: null,
    };
    if (take) this.answers.delete(key);
    else this.answers.set(key, entry);
    return { answer: entry.promise, reused: false };
  }
}
