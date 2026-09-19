/** Khalti environment. `test` uses the sandbox, `production` uses live payments. */
export type KhaltiEnvironment = 'test' | 'production';

export interface KhaltiPayOptions {
  /** Your Khalti *public* key (live or test, matching `environment`). Never the secret key. */
  publicKey: string;
  /** Payment identifier (`pidx`) returned by your server's Khalti `epayment/initiate` call. */
  pidx: string;
  /** `payment_url` returned by the initiate call. Optional but recommended. */
  paymentUrl?: string;
  /** Defaults to `test` so a missing value can never charge real money. */
  environment?: KhaltiEnvironment;
  /**
   * Android only: open the payment in the Khalti app when it is installed instead of the
   * in-SDK checkout. Ignored on iOS.
   */
  openInKhalti?: boolean;
}

/**
 * Khalti payment status. Only `Completed` means the money was received. The list is not
 * exhaustive because Khalti may add statuses, so the type stays open.
 */
export type KhaltiPaymentStatus =
  | 'Completed'
  | 'Pending'
  | 'Initiated'
  | 'Refunded'
  | 'Partially Refunded'
  | 'Expired'
  | 'User canceled'
  | (string & {});

export interface KhaltiPaymentResult {
  /** The gateway status for this payment. */
  status: KhaltiPaymentStatus;
  /** True only when `status` is `Completed`. Verify on your server before granting anything. */
  isCompleted: boolean;
  /** Human readable message from the SDK, when it supplies one. */
  message?: string;
  pidx?: string;
  /** Total amount in paisa. */
  totalAmount: number;
  transactionId?: string;
  /** Fee in paisa. */
  fee: number;
  refunded: boolean;
  purchaseOrderId?: string;
  purchaseOrderName?: string;
  extraMerchantParams?: Record<string, unknown>;
}

/** The unprocessed object the native module resolves with. Not part of the public API. */
export interface RawKhaltiResult {
  status?: string | null;
  message?: string | null;
  pidx?: string | null;
  totalAmount?: number | null;
  transactionId?: string | null;
  fee?: number | null;
  refunded?: boolean | null;
  purchaseOrderId?: string | null;
  purchaseOrderName?: string | null;
  extraMerchantParams?: Record<string, unknown> | null;
}
