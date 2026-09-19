import NativeKhalti from './NativeKhalti';
import { KhaltiError, KhaltiErrorCode, toKhaltiError } from './errors';
import type { KhaltiEnvironment, KhaltiPayOptions, KhaltiPaymentResult, RawKhaltiResult } from './types';

export { KhaltiError, KhaltiErrorCode } from './errors';
export type { KhaltiErrorCodeValue } from './errors';
export type { KhaltiEnvironment, KhaltiPayOptions, KhaltiPaymentResult, KhaltiPaymentStatus } from './types';

const DEFAULT_ENVIRONMENT: KhaltiEnvironment = 'test';

function requireNative() {
  if (!NativeKhalti) {
    throw new KhaltiError(
      KhaltiErrorCode.NotLinked,
      "@klixsoft/react-native-khalti is not linked. Rebuild the app (pod install on iOS, a Gradle build on Android) and make sure the New Architecture is enabled."
    );
  }
  return NativeKhalti;
}

function requireText(name: string, value: string | undefined): string {
  const text = value?.trim();
  if (!text) {
    throw new KhaltiError(KhaltiErrorCode.InvalidArguments, `\`${name}\` is required.`);
  }
  return text;
}

function normalize(raw: RawKhaltiResult): KhaltiPaymentResult {
  const status = raw.status ?? 'Unknown';
  return {
    status,
    isCompleted: status === 'Completed',
    message: raw.message ?? undefined,
    pidx: raw.pidx ?? undefined,
    totalAmount: raw.totalAmount ?? 0,
    transactionId: raw.transactionId ?? undefined,
    fee: raw.fee ?? 0,
    refunded: raw.refunded ?? false,
    purchaseOrderId: raw.purchaseOrderId ?? undefined,
    purchaseOrderName: raw.purchaseOrderName ?? undefined,
    extraMerchantParams: raw.extraMerchantParams ?? undefined,
  };
}

/**
 * Opens the official Khalti checkout for a payment your server has already initiated.
 *
 * Resolves when Khalti reports a result, which is not proof of payment: always confirm with your
 * server (Khalti's lookup API) before granting access. Rejects with a {@link KhaltiError}; when
 * `error.isCancelled` the user just closed the checkout.
 *
 * @example
 * const result = await pay({ publicKey, pidx, environment: 'production' });
 * if (result.isCompleted) await api.confirmOrder(orderId);
 */
export async function pay(options: KhaltiPayOptions): Promise<KhaltiPaymentResult> {
  const native = requireNative();
  const publicKey = requireText('publicKey', options.publicKey);
  const pidx = requireText('pidx', options.pidx);

  try {
    const raw = await native.pay(
      publicKey,
      pidx,
      options.paymentUrl?.trim() ?? '',
      options.environment ?? DEFAULT_ENVIRONMENT,
      options.openInKhalti ?? false
    );
    return normalize(raw as RawKhaltiResult);
  } catch (error) {
    throw toKhaltiError(error);
  }
}

/** Closes the checkout if it is open. The pending {@link pay} call rejects with `E_CANCELLED`. */
export function cancel(): void {
  NativeKhalti?.cancel();
}

/** True when the native module is linked into this build. */
export function isAvailable(): boolean {
  return NativeKhalti != null;
}

export default { pay, cancel, isAvailable };
