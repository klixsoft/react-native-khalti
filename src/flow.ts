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
  PaymentFailed: 'E_PAYMENT_FAILED',
  NoVerify: 'E_NO_VERIFY',
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

const isPaymentState = (value: unknown): value is PaymentState =>
  value === 'success' || value === 'failed' || value === 'pending';

/** The three steps every payment provider needs, the callbacks, and optional tuning. */
export interface PaymentFlowOptions<TInitiation> extends PollOptions {
  /** Step 1. Ask **your server** to create the payment and return what the gateway needs. */
  initiate: () => Promise<TInitiation>;
  /**
   * Step 2. Hand the initiated payment to the gateway (open its SDK, app or page). It may return a
   * `PaymentState` when the gateway reports the result itself; that is used only if `verify` is not given.
   */
  present: (initiation: TInitiation) => Promise<unknown>;
  /**
   * Step 3. Ask **your server** whether the payment finished; it must consult the gateway. Leave it
   * out only when the gateway's own SDK reports a trustworthy result (the flow then uses what
   * `present` returned and raises `E_NO_VERIFY` if that was not a `PaymentState`).
   */
  verify?: () => Promise<PaymentState>;
  /** Marks an error from `present` as "the user backed out" so the flow ends `cancelled`. */
  isCancelled?: (error: unknown) => boolean;
  /** Consecutive `verify` failures tolerated before giving up. Defaults to 3. */
  maxVerifyErrors?: number;
  /** Called on every step change. */
  onStatus?: (status: PaymentStatus) => void;
  /** Called once when the payment succeeded. */
  onSuccess?: (initiation: TInitiation) => void;
  /** Called once when the user backed out or stopped waiting. */
  onCancel?: (initiation?: TInitiation) => void;
  /**
   * Called once when the payment failed or timed out (with a `PaymentFlowError`), or when a step
   * threw (with that error). When it is given, thrown errors no longer reject: the flow resolves
   * `failed` with the error in `result.error`.
   */
  onError?: (error: unknown, initiation?: TInitiation) => void;
}

export interface PaymentFlowResult<TInitiation> {
  outcome: PaymentOutcome;
  /** What `initiate` returned, when it got that far. */
  initiation?: TInitiation;
  /** The error behind a `failed` or `timeout` outcome, when there is one. */
  error?: unknown;
}

/**
 * Runs initiate, present and verify in order and reports how it ended, calling `onSuccess`,
 * `onCancel` or `onError` exactly once. A cancelled `present` resolves `cancelled`; a payment that
 * never settles resolves `timeout`; a server-reported failure resolves `failed`. Errors thrown by a
 * step reject, unless `onError` is given. `verify` errors count only after `maxVerifyErrors`
 * consecutive failures.
 */
export async function runPaymentFlow<TInitiation>(
  options: PaymentFlowOptions<TInitiation>
): Promise<PaymentFlowResult<TInitiation>> {
  const report = (status: PaymentStatus) => options.onStatus?.(status);
  let initiation: TInitiation | undefined;

  const execute = async (): Promise<PaymentFlowResult<TInitiation>> => {
    report('initiating');
    initiation = await options.initiate();

    report('presenting');
    let presented: unknown;
    try {
      presented = await options.present(initiation);
    } catch (error) {
      if (options.isCancelled?.(error)) return { outcome: 'cancelled', initiation };
      throw error;
    }

    if (!options.verify) {
      if (!isPaymentState(presented)) {
        throw new PaymentFlowError(
          PaymentFlowErrorCode.NoVerify,
          'No `verify` was given and the gateway did not report a result.'
        );
      }
      return { outcome: presented === 'pending' ? 'timeout' : presented, initiation };
    }

    report('verifying');
    const verify = options.verify;
    const limit = options.maxVerifyErrors ?? 3;
    let failures = 0;

    try {
      const state = await pollPaymentState(async () => {
        try {
          const next = await verify();
          failures = 0;
          return next;
        } catch (error) {
          failures += 1;
          if (failures >= limit) throw error;
          return 'pending';
        }
      }, options);
      return { outcome: state, initiation };
    } catch (error) {
      if (error instanceof PaymentFlowError) {
        return { outcome: error.code === PaymentFlowErrorCode.Timeout ? 'timeout' : 'cancelled', initiation };
      }
      throw error;
    }
  };

  let result: PaymentFlowResult<TInitiation>;
  try {
    result = await execute();
  } catch (error) {
    if (!options.onError) throw error;
    result = { outcome: 'failed', initiation, error };
  }

  report(result.outcome);
  if (result.outcome === 'success') {
    options.onSuccess?.(result.initiation as TInitiation);
  } else if (result.outcome === 'cancelled') {
    options.onCancel?.(result.initiation);
  } else if (options.onError) {
    const error =
      result.error ??
      new PaymentFlowError(
        result.outcome === 'timeout' ? PaymentFlowErrorCode.Timeout : PaymentFlowErrorCode.PaymentFailed,
        result.outcome === 'timeout' ? 'The payment did not settle in time.' : 'The payment failed.'
      );
    options.onError(error, result.initiation);
    return { ...result, error };
  }
  return result;
}
