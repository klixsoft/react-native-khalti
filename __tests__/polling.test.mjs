import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pollPaymentState } from '../src/flow.ts';

function clock() {
  let time = 0;
  return { now: () => time, sleep: async (ms) => void (time += ms) };
}

test('resolves as soon as the state is final', async () => {
  const states = ['pending', 'pending', 'success'];
  let calls = 0;
  const result = await pollPaymentState(async () => states[calls++], { ...clock(), intervalMs: 10 });
  assert.equal(result, 'success');
  assert.equal(calls, 3);
});

test('resolves failed', async () => {
  assert.equal(await pollPaymentState(async () => 'failed', clock()), 'failed');
});

test('times out while the payment stays pending', async () => {
  await assert.rejects(
    pollPaymentState(async () => 'pending', { ...clock(), intervalMs: 1000, timeoutMs: 3000 }),
    { code: 'E_TIMEOUT' }
  );
});

test('aborts when the signal is set', async () => {
  const signal = { aborted: false };
  const c = clock();
  await assert.rejects(
    pollPaymentState(async () => 'pending', {
      ...c,
      signal,
      sleep: async (ms) => {
        signal.aborted = true;
        await c.sleep(ms);
      },
    }),
    { code: 'E_ABORTED' }
  );
});

test('propagates errors from the check', async () => {
  await assert.rejects(
    pollPaymentState(async () => {
      throw new Error('network');
    }, clock()),
    /network/
  );
});
