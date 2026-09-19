# API reference

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
