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

test('errors are PaymentFlowError with a step and the original cause', async () => {
  const original = new Error('server down');
  const initiate = await runPaymentFlow(
    base({ initiate: async () => Promise.reject(original) }).options
  ).catch((e) => e);
  assert.equal(initiate.name, 'PaymentFlowError');
  assert.equal(initiate.code, 'E_INITIATE_FAILED');
  assert.equal(initiate.step, 'initiate');
  assert.equal(initiate.cause, original);
  assert.equal(initiate.message, 'server down');

  const present = await runPaymentFlow(
    base({ present: async () => Promise.reject(original) }).options
  ).catch((e) => e);
  assert.equal(present.code, 'E_PRESENT_FAILED');
  assert.equal(present.step, 'present');

  const verify = await runPaymentFlow(
    base({ verify: async () => Promise.reject(original), maxVerifyErrors: 1 }).options
  ).catch((e) => e);
  assert.equal(verify.code, 'E_VERIFY_FAILED');
  assert.equal(verify.step, 'verify');
  assert.equal(verify.cause, original);
});

test('failed and timeout results always carry an error', async () => {
  const failed = await runPaymentFlow(base({ verify: async () => 'failed' }).options);
  assert.equal(failed.outcome, 'failed');
  assert.equal(failed.error.code, 'E_PAYMENT_FAILED');

  const timeout = await runPaymentFlow(base({ verify: async () => 'pending' }).options);
  assert.equal(timeout.outcome, 'timeout');
  assert.equal(timeout.error.code, 'E_TIMEOUT');

  const ok = await runPaymentFlow(base().options);
  assert.equal('error' in ok, false);
});

test('an abort is reported through isCancelled', async () => {
  const { PaymentFlowError } = await import('../src/flow.ts');
  assert.equal(new PaymentFlowError('E_ABORTED', 'x').isCancelled, true);
  assert.equal(new PaymentFlowError('E_TIMEOUT', 'x').isCancelled, false);
});
