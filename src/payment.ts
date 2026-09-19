import { KhaltiError } from './errors';
import { pay } from './khalti';
import { runPaymentFlow } from './flow';
import type { PaymentFlowOptions, PaymentFlowResult, PaymentState, PaymentStatus, PollOptions } from './flow';
import type { KhaltiPayOptions } from './types';
import { usePaymentFlow } from './usePaymentFlow';
import type { UsePaymentFlowResult } from './usePaymentFlow';

/** What your server returns from `initiate`: the Khalti payment it created (`pidx`) and the public key. */
export type KhaltiInitiateResult = KhaltiPayOptions;

export interface KhaltiPaymentOptions extends PollOptions {
  /** Step 1. Ask your server to call Khalti's `epayment/initiate` and return its result. */
  initiate: () => Promise<KhaltiInitiateResult>;
  /** Step 3. Ask your server to call Khalti's `epayment/lookup` and report the state. */
  verify: () => Promise<PaymentState>;
  maxVerifyErrors?: number;
  onStatus?: (status: PaymentStatus) => void;
}

/**
 * Builds the generic flow for Khalti: `initiate`, open the official Khalti checkout, then `verify`.
 * Use it directly with `runPaymentFlow` / `usePaymentFlow`, or through the two helpers below.
 */
export function createKhaltiFlow(options: KhaltiPaymentOptions): PaymentFlowOptions<KhaltiInitiateResult> {
  return {
    ...options,
    present: (initiation) => pay(initiation),
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
