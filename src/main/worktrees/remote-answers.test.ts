import { describe, expect, it } from 'vitest';
import { RemoteAnswers } from './remote-answers';

describe('RemoteAnswers (spec §7.3)', () => {
  it('reuses an answer while it runs and for 30 s after it came', async () => {
    let now = 0;
    const answers = new RemoteAnswers(() => now);
    let runs = 0;
    const ask = () => answers.get('k', async () => ++runs);
    const first = ask();
    expect(first.reused).toBe(false);
    expect(ask().reused).toBe(true);
    expect(await first.answer).toBe(1);
    now = 30_000;
    expect(await ask().answer).toBe(1);
    now = 30_001;
    const again = ask();
    expect(again.reused).toBe(false);
    expect(await again.answer).toBe(2);
    // Other keys are asked on their own.
    expect(answers.get('other', async () => 'x').reused).toBe(false);
  });

  it('is used up by the call that takes it', async () => {
    const answers = new RemoteAnswers(() => 0);
    let runs = 0;
    const run = async () => ++runs;
    answers.get('k', run);
    expect(answers.get('k', run, { take: true }).reused).toBe(true);
    expect(answers.get('k', run, { take: true }).reused).toBe(false);
    expect(answers.get('k', run).reused).toBe(false);
    expect(runs).toBe(3);
  });
});
