import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runPaymentFlow } from '../src/flow.ts';

const fast = () => {
  let time = 0;
  return { now: () => time, sleep: async (ms) => void (time += ms), intervalMs: 10, timeoutMs: 100 };
};

function base(overrides = {}) {
  const calls = [];
  return {
    calls,
    options: {
      initiate: async () => (calls.push('initiate'), { id: 1 }),
      present: async (init) => void calls.push(`present:${init.id}`),
      verify: async () => (calls.push('verify'), 'success'),
      onStatus: (status) => calls.push(`status:${status}`),
      ...fast(),
      ...overrides,
    },
  };
}

test('runs initiate, present and verify in order', async () => {
  const { calls, options } = base();
  const result = await runPaymentFlow(options);
  assert.deepEqual(result, { outcome: 'success', initiation: { id: 1 } });
  assert.deepEqual(calls, [
    'status:initiating', 'initiate', 'status:presenting', 'present:1', 'status:verifying', 'verify', 'status:success',
  ]);
});

test('a server "failed" resolves failed', async () => {
  const { options } = base({ verify: async () => 'failed' });
  assert.equal((await runPaymentFlow(options)).outcome, 'failed');
});

test('a cancelled present resolves cancelled and never verifies', async () => {
  const { calls, options } = base({
    present: async () => {
      throw new Error('closed');
    },
    isCancelled: (error) => error.message === 'closed',
  });
  assert.equal((await runPaymentFlow(options)).outcome, 'cancelled');
  assert.ok(!calls.includes('verify'));
});

test('other present errors reject', async () => {
  const { options } = base({
    present: async () => {
      throw new Error('boom');
    },
  });
  await assert.rejects(runPaymentFlow(options), /boom/);
});

test('initiate errors reject before anything is presented', async () => {
  const { calls, options } = base({
    initiate: async () => {
      throw new Error('server down');
    },
  });
  await assert.rejects(runPaymentFlow(options), /server down/);
  assert.ok(!calls.some((c) => c.startsWith('present')));
});

test('a payment that stays pending resolves timeout', async () => {
  const { options } = base({ verify: async () => 'pending' });
  assert.equal((await runPaymentFlow(options)).outcome, 'timeout');
});

test('transient verify errors are retried, repeated ones reject', async () => {
  let n = 0;
  const flaky = base({ verify: async () => (++n < 3 ? Promise.reject(new Error('net')) : 'success') });
  assert.equal((await runPaymentFlow(flaky.options)).outcome, 'success');

  const dead = base({ verify: async () => Promise.reject(new Error('net')), maxVerifyErrors: 2 });
  await assert.rejects(runPaymentFlow(dead.options), /net/);
});

test('an aborted signal resolves cancelled', async () => {
  const signal = { aborted: true };
  const { options } = base({ signal });
  assert.equal((await runPaymentFlow(options)).outcome, 'cancelled');
});

test('callbacks: onSuccess once with the initiation, onCancel and onError for the other outcomes', async () => {
  const seen = [];
  const handlers = {
    onSuccess: (init) => seen.push(['success', init.id]),
    onCancel: () => seen.push(['cancel']),
    onError: (error) => seen.push(['error', error.code ?? error.message]),
  };

  await runPaymentFlow(base(handlers).options);
  await runPaymentFlow(base({ ...handlers, verify: async () => 'failed' }).options);
  await runPaymentFlow(base({ ...handlers, verify: async () => 'pending' }).options);
  await runPaymentFlow(
    base({ ...handlers, present: async () => Promise.reject(new Error('x')), isCancelled: () => true }).options
  );

  assert.deepEqual(seen, [
    ['success', 1],
    ['error', 'E_PAYMENT_FAILED'],
    ['error', 'E_TIMEOUT'],
    ['cancel'],
  ]);
});

test('with onError, thrown errors resolve failed instead of rejecting', async () => {
  const errors = [];
  const { options } = base({
    initiate: async () => Promise.reject(new Error('server down')),
    onError: (error) => errors.push(error.message),
  });
  const result = await runPaymentFlow(options);
  assert.equal(result.outcome, 'failed');
  assert.equal(result.error.message, 'server down');
  assert.deepEqual(errors, ['server down']);
});

test('verify is optional when present reports the result', async () => {
  const ok = base({ verify: undefined, present: async () => 'success' });
  assert.equal((await runPaymentFlow(ok.options)).outcome, 'success');
  assert.ok(!ok.calls.includes('verify'));

  const pending = base({ verify: undefined, present: async () => 'pending' });
  assert.equal((await runPaymentFlow(pending.options)).outcome, 'timeout');
});

test('without verify and without a reported result it raises E_NO_VERIFY', async () => {
  const { options } = base({ verify: undefined, present: async () => undefined });
  await assert.rejects(runPaymentFlow(options), { code: 'E_NO_VERIFY' });
});
