import {
  getKhaltiError,
  isKhaltiError,
  processKhaltiPayment,
  type KhaltiInitiateResult,
  type PaymentFlowError,
} from '../src';

const initiate = async (): Promise<KhaltiInitiateResult> => ({ publicKey: 'p', pidx: 'x', environment: 'test' });

export async function narrowing(): Promise<string> {
  const result = await processKhaltiPayment({ initiate, verify: async () => 'success' });

  if (result.outcome === 'success') return result.initiation.pidx;
  if (result.outcome === 'failed' || result.outcome === 'timeout') return result.error.code;

  // @ts-expect-error a cancelled result has no `error`
  return result.error;
}

export function errors(error: PaymentFlowError): string {
  const khalti = getKhaltiError(error);
  if (khalti?.isCancelled) return khalti.code;
  return isKhaltiError(error.cause) ? error.cause.code : error.step ?? '';
}

processKhaltiPayment({
  initiate,
  onSuccess: (initiation) => initiation.pidx,
  onError: (error) => error.code,
});

// @ts-expect-error `initiate` is required
processKhaltiPayment({ verify: async () => 'success' });

// @ts-expect-error `verify` must return a PaymentState
processKhaltiPayment({ initiate, verify: async () => 'paid' });
