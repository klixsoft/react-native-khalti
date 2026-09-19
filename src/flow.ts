/** What your server reports for a payment. Map your own API onto these three values. */
export type PaymentState = 'success' | 'failed' | 'pending';

/** How a payment flow ended. */
export type PaymentOutcome = 'success' | 'failed' | 'cancelled' | 'timeout';

/** Where a payment flow currently is. */
export type PaymentStatus = 'idle' | 'initiating' | 'presenting' | 'verifying' | PaymentOutcome;

/** The step of the flow an error came from. */
export type PaymentStep = 'initiate' | 'present' | 'verify';

/** Stable error codes raised by the generic flow. */
export const PaymentFlowErrorCode = {
  /** `initiate` threw: your server could not create the payment. */
  InitiateFailed: 'E_INITIATE_FAILED',
  /** The gateway could not be opened or reported an error. */
  PresentFailed: 'E_PRESENT_FAILED',
  /** `verify` failed repeatedly, so the result could not be confirmed. */
  VerifyFailed: 'E_VERIFY_FAILED',
  /** Your server reported that the payment failed. */
  PaymentFailed: 'E_PAYMENT_FAILED',
  /** The payment was still pending when the time limit ended. */
  Timeout: 'E_TIMEOUT',
  /** The wait was aborted through `signal`. */
  Aborted: 'E_ABORTED',
  /** No `verify` was given and the gateway did not report a result. */
  NoVerify: 'E_NO_VERIFY',
} as const;

export type PaymentFlowErrorCodeValue = (typeof PaymentFlowErrorCode)[keyof typeof PaymentFlowErrorCode];

/** Extra detail attached to a {@link PaymentFlowError}. */
export interface PaymentFlowErrorDetails {
  /** The step that failed. */
  step?: PaymentStep;
  /** The original error, for example a gateway error thrown by `present`. */
  cause?: unknown;
}

/**
 * The single error type of the payment flow. Match on `code`, never on `message`; `step` tells
 * you where it happened and `cause` holds the original error (for example a `KhaltiError`).
 */
export class PaymentFlowError extends Error {
  override readonly name = 'PaymentFlowError';
  readonly code: PaymentFlowErrorCodeValue;
  readonly step: PaymentStep | null;
  override readonly cause: unknown;

  constructor(code: PaymentFlowErrorCodeValue, message: string, details: PaymentFlowErrorDetails = {}) {
    super(message);
    this.code = code;
    this.step = details.step ?? null;
    this.cause = details.cause;
  }

  /** True when the wait was aborted through `signal`. */
  get isCancelled(): boolean {
    return this.code === PaymentFlowErrorCode.Aborted;
  }
}

/** Type guard for {@link PaymentFlowError}. */
export function isPaymentFlowError(error: unknown): error is PaymentFlowError {
  return error instanceof PaymentFlowError;
}

/**
 * Returns `error` unchanged when it already is a {@link PaymentFlowError}, otherwise wraps it with
 * the given `code` and `step`, keeping the original as `cause` and reusing its message.
 */
export function toPaymentFlowError(
  error: unknown,
  code: PaymentFlowErrorCodeValue,
  step?: PaymentStep
): PaymentFlowError {
  if (error instanceof PaymentFlowError) return error;
  const message = error instanceof Error && error.message ? error.message : 'The payment step failed.';
  return new PaymentFlowError(code, message, { step, cause: error });
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
 * turns true. Errors thrown by `check` propagate unchanged.
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
      throw new PaymentFlowError(PaymentFlowErrorCode.Timeout, 'The payment did not reach a final state in time.', {
        step: 'verify',
      });
    }
    await sleep(intervalMs);
  }
}

const isPaymentState = (value: unknown): value is PaymentState =>
  value === 'success' || value === 'failed' || value === 'pending';

/** Callbacks for the end of a payment. Each is called at most once. */
export interface PaymentFlowCallbacks<TInitiation> {
  /** Called when the payment succeeded, with what `initiate` returned. */
  onSuccess?: (initiation: TInitiation) => void;
  /** Called when the user backed out or stopped waiting. */
  onCancel?: (initiation?: TInitiation) => void;
  /**
   * Called when the payment failed or timed out, or when a step threw. When it is given, errors no
   * longer reject: the flow resolves `failed` with the same error in `result.error`.
   */
  onError?: (error: PaymentFlowError, initiation?: TInitiation) => void;
  /** Called on every step change. */
  onStatus?: (status: PaymentStatus) => void;
}

/** The three steps every payment provider needs, the callbacks, and optional tuning. */
export interface PaymentFlowOptions<TInitiation> extends PollOptions, PaymentFlowCallbacks<TInitiation> {
  /** Step 1. Ask **your server** to create the payment and return what the gateway needs. */
  initiate: () => Promise<TInitiation>;
  /**
   * Step 2. Hand the initiated payment to the gateway (open its SDK, app or page). It may return a
   * `PaymentState` when the gateway reports the result itself; that is used only if `verify` is not given.
   */
  present: (initiation: TInitiation) => Promise<PaymentState | void>;
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
}

/** The payment succeeded. */
export interface PaymentSucceeded<TInitiation> {
  outcome: 'success';
  initiation: TInitiation;
}

/** The user backed out or stopped waiting. */
export interface PaymentCancelled<TInitiation> {
  outcome: 'cancelled';
  initiation?: TInitiation;
}

/** The payment failed, or a step threw. `error.code` says which. */
export interface PaymentFailed<TInitiation> {
  outcome: 'failed';
  initiation?: TInitiation;
  error: PaymentFlowError;
}

/** The payment was still pending when the time limit ended. */
export interface PaymentTimedOut<TInitiation> {
  outcome: 'timeout';
  initiation?: TInitiation;
  error: PaymentFlowError;
}

/** How a flow ended. Narrow on `outcome` to get `initiation` or `error` with the right types. */
export type PaymentFlowResult<TInitiation> =
  | PaymentSucceeded<TInitiation>
  | PaymentCancelled<TInitiation>
  | PaymentFailed<TInitiation>
  | PaymentTimedOut<TInitiation>;

/**
 * Runs initiate, present and verify in order and reports how it ended, calling `onSuccess`,
 * `onCancel` or `onError` exactly once. A cancelled `present` resolves `cancelled`; a payment that
 * never settles resolves `timeout`; a server-reported failure resolves `failed`. A step that throws
 * rejects with a `PaymentFlowError` (`step` and `cause` set), unless `onError` is given, in which
 * case it resolves `failed`. `verify` errors count only after `maxVerifyErrors` consecutive failures.
 */
export async function runPaymentFlow<TInitiation>(
  options: PaymentFlowOptions<TInitiation>
): Promise<PaymentFlowResult<TInitiation>> {
  const report = (status: PaymentStatus) => options.onStatus?.(status);
  let initiation: TInitiation | undefined;

  const execute = async (): Promise<PaymentFlowResult<TInitiation>> => {
    report('initiating');
    try {
      initiation = await options.initiate();
    } catch (error) {
      throw toPaymentFlowError(error, PaymentFlowErrorCode.InitiateFailed, 'initiate');
    }
    const initiated = initiation;

    report('presenting');
    let presented: PaymentState | void;
    try {
      presented = await options.present(initiated);
    } catch (error) {
      if (options.isCancelled?.(error)) return { outcome: 'cancelled', initiation: initiated };
      throw toPaymentFlowError(error, PaymentFlowErrorCode.PresentFailed, 'present');
    }

    const verify = options.verify;
    if (!verify) {
      if (!isPaymentState(presented)) {
        throw new PaymentFlowError(
          PaymentFlowErrorCode.NoVerify,
          'No `verify` was given and the gateway did not report a result.',
          { step: 'verify' }
        );
      }
      if (presented === 'success') return { outcome: 'success', initiation: initiated };
      return presented === 'failed'
        ? { outcome: 'failed', initiation: initiated, error: failure(PaymentFlowErrorCode.PaymentFailed) }
        : { outcome: 'timeout', initiation: initiated, error: failure(PaymentFlowErrorCode.Timeout) };
    }

    report('verifying');
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
          if (failures >= limit) throw toPaymentFlowError(error, PaymentFlowErrorCode.VerifyFailed, 'verify');
          return 'pending';
        }
      }, options);

      return state === 'success'
        ? { outcome: 'success', initiation: initiated }
        : { outcome: 'failed', initiation: initiated, error: failure(PaymentFlowErrorCode.PaymentFailed) };
    } catch (error) {
      if (isPaymentFlowError(error) && error.code === PaymentFlowErrorCode.Aborted) {
        return { outcome: 'cancelled', initiation: initiated };
      }
      if (isPaymentFlowError(error) && error.code === PaymentFlowErrorCode.Timeout) {
        return { outcome: 'timeout', initiation: initiated, error };
      }
      throw error;
    }
  };

  let result: PaymentFlowResult<TInitiation>;
  try {
    result = await execute();
  } catch (error) {
    const flowError = toPaymentFlowError(error, PaymentFlowErrorCode.PresentFailed);
    if (!options.onError) throw flowError;
    result = { outcome: 'failed', initiation, error: flowError };
  }

  report(result.outcome);
  if (result.outcome === 'success') options.onSuccess?.(result.initiation);
  else if (result.outcome === 'cancelled') options.onCancel?.(result.initiation);
  else options.onError?.(result.error, result.initiation);
  return result;
}

function failure(code: 'E_PAYMENT_FAILED' | 'E_TIMEOUT'): PaymentFlowError {
  return code === PaymentFlowErrorCode.Timeout
    ? new PaymentFlowError(code, 'The payment did not settle in time.', { step: 'verify' })
    : new PaymentFlowError(code, 'The payment failed.', { step: 'verify' });
}
