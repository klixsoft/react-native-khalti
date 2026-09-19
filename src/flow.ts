/** What your server reports for a payment. Map your own API onto these three values. */
export type PaymentState = 'success' | 'failed' | 'pending';

/** How a payment flow ended. */
export type PaymentOutcome = 'success' | 'failed' | 'cancelled' | 'timeout';

/** Where a payment flow currently is. */
export type PaymentStatus = 'idle' | 'initiating' | 'presenting' | 'verifying' | PaymentOutcome;

/** Stable error codes raised by the generic flow. */
export const PaymentFlowErrorCode = {
  Timeout: 'E_TIMEOUT',
  Aborted: 'E_ABORTED',
  VerifyFailed: 'E_VERIFY_FAILED',
} as const;

export type PaymentFlowErrorCodeValue = (typeof PaymentFlowErrorCode)[keyof typeof PaymentFlowErrorCode];

/** Raised by `pollPaymentState` and `runPaymentFlow`. Match on `code`, never on `message`. */
export class PaymentFlowError extends Error {
  readonly code: PaymentFlowErrorCodeValue;

  constructor(code: PaymentFlowErrorCodeValue, message: string) {
    super(message);
    this.name = 'PaymentFlowError';
    this.code = code;
  }
}

/** Timing and abort controls shared by polling and the full flow. */
export interface PollOptions {
  /** Delay between checks. Defaults to 3000 ms. */
  intervalMs?: number;
  /** Give up after this long. Defaults to 120000 ms. */
  timeoutMs?: number;
  /** Set `aborted = true` to stop waiting, for example when the screen unmounts. */
  signal?: { aborted: boolean };
  /** Replaceable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Replaceable for tests. */
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calls `check` (which must ask **your server**) until the payment is final. Resolves `'success'`
 * or `'failed'`; rejects `E_TIMEOUT` when it stays `'pending'` and `E_ABORTED` when `signal.aborted`
 * turns true. Errors thrown by `check` propagate.
 */
export async function pollPaymentState(
  check: () => Promise<PaymentState>,
  options: PollOptions = {}
): Promise<Exclude<PaymentState, 'pending'>> {
  const intervalMs = options.intervalMs ?? 3000;
  const timeoutMs = options.timeoutMs ?? 120000;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const startedAt = now();

  for (;;) {
    if (options.signal?.aborted) {
      throw new PaymentFlowError(PaymentFlowErrorCode.Aborted, 'Waiting for the payment was aborted.');
    }

    const state = await check();
    if (state === 'success' || state === 'failed') return state;

    if (now() - startedAt + intervalMs > timeoutMs) {
      throw new PaymentFlowError(PaymentFlowErrorCode.Timeout, 'The payment did not reach a final state in time.');
    }
    await sleep(intervalMs);
  }
}

/** The three steps every payment provider needs, plus optional tuning. */
export interface PaymentFlowOptions<TInitiation> extends PollOptions {
  /** Step 1. Ask **your server** to create the payment and return what the gateway needs. */
  initiate: () => Promise<TInitiation>;
  /** Step 2. Hand the initiated payment to the gateway (open its SDK, app or page). */
  present: (initiation: TInitiation) => Promise<unknown>;
  /** Step 3. Ask **your server** whether the payment finished. It must consult the gateway. */
  verify: () => Promise<PaymentState>;
  /** Marks an error from `present` as "the user backed out" so the flow ends `cancelled`. */
  isCancelled?: (error: unknown) => boolean;
  /** Consecutive `verify` failures tolerated before giving up. Defaults to 3. */
  maxVerifyErrors?: number;
  /** Called on every step change. */
  onStatus?: (status: PaymentStatus) => void;
}

export interface PaymentFlowResult<TInitiation> {
  outcome: PaymentOutcome;
  /** What `initiate` returned, when it got that far. */
  initiation?: TInitiation;
}

/**
 * Runs initiate, present and verify in order and reports how it ended. A cancelled `present`
 * resolves `cancelled`; a payment that never settles resolves `timeout`; a server-reported failure
 * resolves `failed`. Other errors from `initiate` or `present` reject, and `verify` errors reject
 * only after `maxVerifyErrors` consecutive failures.
 */
export async function runPaymentFlow<TInitiation>(
  options: PaymentFlowOptions<TInitiation>
): Promise<PaymentFlowResult<TInitiation>> {
  const report = (status: PaymentStatus) => options.onStatus?.(status);
  const finish = (outcome: PaymentOutcome, initiation?: TInitiation): PaymentFlowResult<TInitiation> => {
    report(outcome);
    return { outcome, initiation };
  };

  report('initiating');
  const initiation = await options.initiate();

  report('presenting');
  try {
    await options.present(initiation);
  } catch (error) {
    if (options.isCancelled?.(error)) return finish('cancelled', initiation);
    throw error;
  }

  report('verifying');
  const limit = options.maxVerifyErrors ?? 3;
  let failures = 0;

  try {
    const state = await pollPaymentState(async () => {
      try {
        const next = await options.verify();
        failures = 0;
        return next;
      } catch (error) {
        failures += 1;
        if (failures >= limit) throw error;
        return 'pending';
      }
    }, options);
    return finish(state, initiation);
  } catch (error) {
    if (error instanceof PaymentFlowError) {
      return finish(error.code === PaymentFlowErrorCode.Timeout ? 'timeout' : 'cancelled', initiation);
    }
    throw error;
  }
}
