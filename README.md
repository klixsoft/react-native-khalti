# @klixsoft/react-native-khalti

Accept [Khalti](https://khalti.com) payments in React Native with the **official Khalti Checkout
SDKs**, not a home-made WebView.

Khalti ships native SDKs for Android and iOS but no React Native package. This library is a thin,
typed bridge over those SDKs:

| Platform | Wraps | Distribution |
| --- | --- | --- |
| Android | [`com.khalti:checkout-android`](https://github.com/khalti/checkout-sdk-android) (BSD-3-Clause) | Maven Central, resolved by Gradle |
| iOS | [`KhaltiCheckout`](https://github.com/khalti/checkout-sdk-ios) (MIT) | CocoaPods |

Nothing proprietary is bundled: your build downloads Khalti's own artifacts.

- Promise based `pay()` with a fully typed result
- Stable error codes, including a clear "user cancelled" case
- Automatic payment confirmation when the SDK asks for it
- Works with the React Native **New Architecture** (TurboModule + codegen)
- Android module written in Java, so it never fights your Kotlin / AGP setup

> **Security in one line:** the app only *opens* the checkout. Your **server** creates the payment
> (`pidx`) with the secret key and must **verify the result with Khalti's lookup API** before
> granting anything. See [docs/security.md](docs/security.md).

## Requirements

- React Native **0.76+** with the New Architecture enabled
- Android `minSdk` 24 (Khalti's SDK needs 21), AndroidX
- iOS 13+ (Khalti's SDK needs 12; React Native raises this), Swift 5, Xcode 15+

## Installation

```sh
pnpm add @klixsoft/react-native-khalti     # or npm / yarn
cd ios && pod install
```

Android needs no manual step: Gradle pulls `com.khalti:checkout-android` from Maven Central.
Rebuild the native app after installing.

## How a payment works

```
 App                         Your server                    Khalti
  |  1. "buy this"  --------->  |                              |
  |                             | 2. POST /epayment/initiate   |
  |                             | ---------------------------> |
  |                             | <--- pidx, payment_url ----- |
  |  <---- pidx, publicKey ---- |                              |
  |  3. pay({ pidx, ... })  (official Khalti checkout) -------> |
  |  <------------------- result ----------------------------- |
  |  4. "I paid" ------------>  | 5. POST /epayment/lookup     |
  |                             | ---------------------------> |
  |                             | <--- status: Completed ----- |
  |  <---- access granted ----- |                              |
```

Step 5 is what makes the payment real. The result in step 3 comes from the device and must not be
trusted on its own.

## Usage

```tsx
import { pay, KhaltiError, KhaltiErrorCode } from '@klixsoft/react-native-khalti';

async function checkout(orderId: string) {
  // 1. Ask YOUR server to initiate the payment. It returns the pidx (and the public key).
  const { pidx, paymentUrl, publicKey } = await api.startKhaltiPayment(orderId);

  try {
    // 2. Open the official Khalti checkout.
    const result = await pay({
      publicKey,
      pidx,
      paymentUrl,
      environment: __DEV__ ? 'test' : 'production',
    });

    // 3. Let YOUR server confirm with Khalti before unlocking anything.
    if (result.isCompleted) {
      await api.confirmKhaltiPayment(orderId, pidx);
    }
  } catch (error) {
    if (error instanceof KhaltiError && error.isCancelled) return; // user closed it
    if (error instanceof KhaltiError && error.code === KhaltiErrorCode.LookupFailed) {
      // The payment may have gone through: ask your server to verify before retrying.
      await api.confirmKhaltiPayment(orderId, pidx);
      return;
    }
    throw error;
  }
}
```

Your server side (initiate + lookup) is covered in
[docs/backend-integration.md](docs/backend-integration.md), with Node and Python examples.

## API

Full reference: [docs/api-reference.md](docs/api-reference.md).

| Export | Description |
| --- | --- |
| `pay(options)` | Opens the checkout and resolves with a `KhaltiPaymentResult`. |
| `cancel()` | Closes the checkout. The pending `pay` rejects with `E_CANCELLED`. |
| `isAvailable()` | `true` when the native module is linked. |
| `KhaltiError`, `KhaltiErrorCode` | Typed errors with stable codes. |

`environment` defaults to `'test'`, so forgetting to set it can never charge real money.

## Platform notes

- **Android `openInKhalti`:** set `openInKhalti: true` to hand the payment to the Khalti app when it
  is installed. The library declares the `<queries>` entry it needs. Ignored on iOS.
- **iOS presentation:** the SDK is presented full-screen from the top-most view controller.
- Only one checkout can be open at a time (`E_IN_PROGRESS` otherwise).

## Troubleshooting

See [docs/troubleshooting.md](docs/troubleshooting.md): "not linked", duplicate Kotlin / Compose
versions, CocoaPods resolution, and sandbox testing.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

MIT. Khalti's SDKs keep their own licences (BSD-3-Clause on Android, MIT on iOS). This project is
independent and is not affiliated with or endorsed by Khalti.
