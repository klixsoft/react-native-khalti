import { useCallback, useEffect, useRef, useState } from 'react';

import { runPaymentFlow } from './flow';
import type { PaymentFlowOptions, PaymentFlowResult, PaymentStatus } from './flow';

export interface UsePaymentFlowResult<TInitiation> {
  /** Runs the flow. Resolves with the result, or `undefined` when it failed (see `error`). */
  start: () => Promise<PaymentFlowResult<TInitiation> | undefined>;
  /** Stops waiting for the payment. The flow ends `cancelled`. */
  cancel: () => void;
  /** Returns to `idle` and clears `error`. */
  reset: () => void;
  status: PaymentStatus;
  /** True while a flow is running. */
  isProcessing: boolean;
  /** The error that ended the flow, if any. */
  error: unknown;
}

/**
 * React state around `runPaymentFlow`. The latest `options` are always used, so inline callbacks
 * are fine, and a running flow is aborted when the component unmounts.
 */
export function usePaymentFlow<TInitiation>(
  options: PaymentFlowOptions<TInitiation>
): UsePaymentFlowResult<TInitiation> {
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [error, setError] = useState<unknown>(null);
  const latest = useRef(options);
  const signal = useRef<{ aborted: boolean } | null>(null);
  const mounted = useRef(true);
  const running = useRef(false);

  latest.current = options;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (signal.current) signal.current.aborted = true;
    };
  }, []);

  const start = useCallback(async () => {
    if (running.current) return undefined;
    running.current = true;
    const current = { aborted: false };
    signal.current = current;
    setError(null);

    try {
      const result = await runPaymentFlow({
        ...latest.current,
        signal: current,
        onStatus: (next) => {
          if (mounted.current) setStatus(next);
          latest.current.onStatus?.(next);
        },
      });
      if (result.error && mounted.current) setError(result.error);
      return result;
    } catch (caught) {
      if (mounted.current) {
        setError(caught);
        setStatus('failed');
      }
      return undefined;
    } finally {
      running.current = false;
    }
  }, []);

  const cancel = useCallback(() => {
    if (signal.current) signal.current.aborted = true;
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  const isProcessing = status === 'initiating' || status === 'presenting' || status === 'verifying';

  return { start, cancel, reset, status, isProcessing, error };
}
