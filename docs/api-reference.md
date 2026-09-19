# API reference

## `processKhaltiPayment(options)` / `useKhaltiPayment(options)` / `createKhaltiFlow(options)`

The standard entry points: `initiate` returns a `KhaltiPayOptions` (`publicKey`, `pidx`, `paymentUrl?`, `environment?`, `openInKhalti?`), the official Khalti checkout is opened, then `verify` is polled. Accepts every generic option below except `present` and `isCancelled`. `processKhaltiPayment` resolves `{ outcome, initiation }`, `useKhaltiPayment` returns the hook result, and `createKhaltiFlow` returns the options object for `runPaymentFlow` / `usePaymentFlow`.

## Generic payment flow

Exported by every Klixsoft payment package with identical behaviour.

```ts
type PaymentState = 'success' | 'failed' | 'pending';
type PaymentOutcome = 'success' | 'failed' | 'cancelled' | 'timeout';
type PaymentStatus = 'idle' | 'initiating' | 'presenting' | 'verifying' | PaymentOutcome;
```

### `runPaymentFlow(options): Promise<{ outcome, initiation? }>`

| Option | Type | Notes |
| --- | --- | --- |
| `initiate` | `() => Promise<T>` | Ask your server to create the payment. |
| `present` | `(initiation: T) => Promise<unknown>` | Hand it to the gateway. |
| `verify` | `() => Promise<PaymentState>` | Ask your server for the real state. Optional: without it the flow uses the `PaymentState` returned by `present`, and raises `E_NO_VERIFY` if there is none. |
| `isCancelled` | `(error) => boolean` | Marks a `present` error as "user backed out" so the flow ends `cancelled`. |
| `intervalMs` | `number` | Poll delay. Default 3000. |
| `timeoutMs` | `number` | Give up waiting after this long. Default 120000. |
| `maxVerifyErrors` | `number` | Consecutive `verify` failures before the flow rejects. Default 3. |
| `signal` | `{ aborted: boolean }` | Set `aborted = true` to stop; the flow ends `cancelled`. |
| `onStatus` | `(status) => void` | Called on every step change. |
| `onSuccess` | `(initiation) => void` | Called once when the payment succeeded. |
| `onCancel` | `(initiation?) => void` | Called once when the user backed out or stopped waiting. |
| `onError` | `(error, initiation?) => void` | Called once on failure or timeout (a `PaymentFlowError`) or when a step threw. When set, thrown errors resolve `failed` with `result.error` instead of rejecting. |

Errors from `initiate` and non-cancel errors from `present` reject. A server `failed` resolves `failed`; a payment still pending at `timeoutMs` resolves `timeout`.

### `usePaymentFlow(options)`

The same as a hook. Returns `{ start, cancel, reset, status, isProcessing, error }`. `start()` resolves with the result, or `undefined` if it failed (see `error`). The latest options are always used and a running flow is aborted on unmount.

### `pollPaymentState(check, options?)`

Calls `check` every `intervalMs` until it returns `success` or `failed`. Rejects `PaymentFlowError` `E_TIMEOUT` or `E_ABORTED`; errors from `check` propagate.

### Result types

`PaymentFlowResult<T>` is `PaymentSucceeded<T>` (`outcome: 'success'`, `initiation: T`) | `PaymentCancelled<T>` (`'cancelled'`) | `PaymentFailed<T>` (`'failed'`, `error`) | `PaymentTimedOut<T>` (`'timeout'`, `error`). `initiation` is optional except on success, because a flow can end before `initiate` returns; `error` is always present on `failed` and `timeout`.

### `PaymentFlowError`

`code` is `E_INITIATE_FAILED`, `E_PRESENT_FAILED`, `E_VERIFY_FAILED`, `E_PAYMENT_FAILED`, `E_TIMEOUT`, `E_ABORTED` or `E_NO_VERIFY`. `step` is `'initiate' | 'present' | 'verify' | null` and `cause` is the original error. Also exported: `isPaymentFlowError(value)` and `toPaymentFlowError(error, code, step?)`.

```ts
import KhaltiDefault, { pay, cancel, isAvailable, KhaltiError, KhaltiErrorCode } from '@klixsoft/react-native-khalti';
```

The default export is `{ pay, cancel, isAvailable }`.

## `pay(options): Promise<KhaltiPaymentResult>`

Opens the official Khalti checkout for a payment your server already initiated.

### `KhaltiPayOptions`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `publicKey` | `string` | yes | Khalti **public** key (live or test, matching `environment`). |
| `pidx` | `string` | yes | Payment id from the server's `epayment/initiate` call. |
| `paymentUrl` | `string` | no | `payment_url` from the same call. Recommended. |
| `environment` | `'test' \| 'production'` | no | Defaults to `'test'`. |
| `openInKhalti` | `boolean` | no | Android only: open in the Khalti app when installed. Ignored on iOS. |

### `KhaltiPaymentResult`

| Field | Type | Description |
| --- | --- | --- |
| `status` | `KhaltiPaymentStatus` | Gateway status. Only `'Completed'` means paid. |
| `isCompleted` | `boolean` | `status === 'Completed'`. **Still verify on your server.** |
| `message` | `string?` | Message from the SDK, when supplied. |
| `pidx` | `string?` | The payment id. |
| `totalAmount` | `number` | Amount in paisa. |
| `transactionId` | `string?` | Khalti transaction id. |
| `fee` | `number` | Fee in paisa. |
| `refunded` | `boolean` | Whether it was refunded. |
| `purchaseOrderId` | `string?` | Your order id from the initiate call. |
| `purchaseOrderName` | `string?` | Your order name. |
| `extraMerchantParams` | `Record<string, unknown>?` | Extra parameters echoed back by Khalti. |

### Behaviour

- Resolves when Khalti reports a **result**. That is not proof of payment.
- If the SDK reports that the outcome needs confirming, the library asks the SDK to verify **once**
  automatically, then resolves with the final result or rejects.
- Rejects with `KhaltiError` for everything else, including the user closing the checkout.

## `cancel(): void`

Closes the checkout if it is open. The pending `pay()` rejects with `E_CANCELLED`.

## `isAvailable(): boolean`

`true` when the native module is linked into this build. Useful to hide the option in builds that
were not rebuilt after installing.

## `KhaltiError`

`extends Error` with:

- `code: KhaltiErrorCodeValue`
- `isCancelled: boolean` (`code === 'E_CANCELLED'`)

### Error codes

| Code | Meaning | Suggested handling |
| --- | --- | --- |
| `E_CANCELLED` | The user closed the checkout | Do nothing |
| `E_NETWORK` | No connection to Khalti | Offer retry |
| `E_LOOKUP_FAILED` | Finished, but status lookup failed | Verify on your server; do not retry blindly |
| `E_RETURN_URL` | The merchant return URL failed to load | Verify on your server |
| `E_IN_PROGRESS` | Another checkout is open | Ignore or wait |
| `E_NO_PRESENTER` | No foreground activity / view controller | Call again when the app is active |
| `E_INVALID_ARGUMENTS` | Missing `publicKey` or `pidx` | Fix the call |
| `E_NOT_LINKED` | Native module missing | Rebuild the app |
| `E_UNKNOWN` | Anything else | Verify on your server, then report |

Match on `code`, never on `message`.
