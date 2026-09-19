import { KhaltiError } from './errors';
import { pay } from './khalti';
import { runPaymentFlow } from './flow';
import type { PaymentFlowOptions, PaymentFlowResult, PaymentState, PollOptions } from './flow';
import type { KhaltiPayOptions, KhaltiPaymentResult } from './types';
import { usePaymentFlow } from './usePaymentFlow';
import type { UsePaymentFlowResult } from './usePaymentFlow';

/** What your server returns from `initiate`: the Khalti payment it created (`pidx`) and the public key. */
export type KhaltiInitiateResult = KhaltiPayOptions;

export interface KhaltiPaymentOptions
  extends PollOptions,
    Partial<
      Pick<
        PaymentFlowOptions<KhaltiInitiateResult>,
        'onSuccess' | 'onCancel' | 'onError' | 'onStatus' | 'maxVerifyErrors'
      >
    > {
  /** Step 1. Ask your server to call Khalti's `epayment/initiate` and return its result. */
  initiate: () => Promise<KhaltiInitiateResult>;
  /**
   * Step 3. Ask your server to call Khalti's `epayment/lookup` and report the state. Recommended.
   * When omitted, the result reported by the Khalti SDK itself is used, which is not confirmed by
   * your server.
   */
  verify?: () => Promise<PaymentState>;
}

const toPaymentState = (result: KhaltiPaymentResult): PaymentState => {
  if (result.isCompleted) return 'success';
  return result.status === 'Pending' || result.status === 'Initiated' ? 'pending' : 'failed';
};

/**
 * Builds the generic flow for Khalti: `initiate`, open the official Khalti checkout, then `verify`.
 * Use it directly with `runPaymentFlow` / `usePaymentFlow`, or through the two helpers below.
 */
export function createKhaltiFlow(options: KhaltiPaymentOptions): PaymentFlowOptions<KhaltiInitiateResult> {
  return {
    ...options,
    present: async (initiation) => toPaymentState(await pay(initiation)),
    isCancelled: (error) => error instanceof KhaltiError && error.isCancelled,
  };
}

/**
 * Runs a complete Khalti payment: `initiate`, the Khalti checkout, then poll `verify` until it
 * settles. Resolves with how it ended (`success`, `failed`, `cancelled` or `timeout`).
 */
export function processKhaltiPayment(options: KhaltiPaymentOptions): Promise<PaymentFlowResult<KhaltiInitiateResult>> {
  return runPaymentFlow(createKhaltiFlow(options));
}

/** React hook for a complete Khalti payment. `start()` runs the flow; `status` tracks it. */
export function useKhaltiPayment(options: KhaltiPaymentOptions): UsePaymentFlowResult<KhaltiInitiateResult> {
  return usePaymentFlow(createKhaltiFlow(options));
}
