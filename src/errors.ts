/** Stable, machine readable error codes. Match on these, never on `message`. */
export const KhaltiErrorCode = {
  /** The user closed the checkout before finishing. Not a failure. */
  Cancelled: 'E_CANCELLED',
  /** The device could not reach Khalti. */
  Network: 'E_NETWORK',
  /** The payment finished but its status could not be looked up. Verify on your server. */
  LookupFailed: 'E_LOOKUP_FAILED',
  /** The merchant return URL failed to load. */
  ReturnUrl: 'E_RETURN_URL',
  /** Another checkout is already open. */
  InProgress: 'E_IN_PROGRESS',
  /** There is no foreground activity / view controller to present from. */
  NoPresenter: 'E_NO_PRESENTER',
  /** A required option was missing or invalid. */
  InvalidArguments: 'E_INVALID_ARGUMENTS',
  /** The native module is not linked (rebuild the app after installing). */
  NotLinked: 'E_NOT_LINKED',
  Unknown: 'E_UNKNOWN',
} as const;

export type KhaltiErrorCodeValue = (typeof KhaltiErrorCode)[keyof typeof KhaltiErrorCode];

export class KhaltiError extends Error {
  readonly code: KhaltiErrorCodeValue;

  constructor(code: KhaltiErrorCodeValue, message: string) {
    super(message);
    this.name = 'KhaltiError';
    this.code = code;
  }

  /** True when the user simply closed the checkout. */
  get isCancelled(): boolean {
    return this.code === KhaltiErrorCode.Cancelled;
  }
}

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(KhaltiErrorCode));

/** Turns whatever the native layer rejected with into a `KhaltiError`. */
export function toKhaltiError(error: unknown): KhaltiError {
  if (error instanceof KhaltiError) return error;

  const candidate = error as { code?: unknown; message?: unknown } | null | undefined;
  const message = typeof candidate?.message === 'string' ? candidate.message : 'Khalti payment failed.';
  const code = typeof candidate?.code === 'string' && KNOWN_CODES.has(candidate.code) ? candidate.code : KhaltiErrorCode.Unknown;

  return new KhaltiError(code as KhaltiErrorCodeValue, message);
}
