# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

### Added
- `processKhaltiPayment`, `useKhaltiPayment` and `createKhaltiFlow`: `initiate`, open the Khalti checkout, `verify`.
- `onSuccess`, `onCancel` and `onError` callbacks on every flow; `verify` is optional where the gateway SDK reports a trustworthy result.
- Standard payment lifecycle shared by all Klixsoft payment packages: `runPaymentFlow`,
  `usePaymentFlow`, `pollPaymentState` and the `PaymentState` / `PaymentOutcome` / `PaymentStatus` types.
- `pay()` opens the official Khalti Checkout (KPG-2) for a payment initiated on your server and
  resolves with a typed result.
- `cancel()` and `isAvailable()`.
- `KhaltiError` with stable `KhaltiErrorCode` values.
- Android: Java TurboModule over `com.khalti:checkout-android` (Maven Central).
- iOS: Swift bridge over the `KhaltiCheckout` pod with an Objective-C++ TurboModule.
- New Architecture only (React Native 0.76+).
