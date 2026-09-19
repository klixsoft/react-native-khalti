# Troubleshooting

## `E_NOT_LINKED` / "is not linked"

The app was not rebuilt after installing.

- iOS: `cd ios && pod install`, then rebuild.
- Android: rebuild with Gradle (a Metro reload is not enough).
- Confirm the **New Architecture** is on (`newArchEnabled=true` on Android; `RCT_NEW_ARCH_ENABLED=1`
  on iOS). The library uses TurboModules.

## Android: duplicate class / Kotlin or Compose version conflicts

Khalti's Android SDK is built with Kotlin 1.9 and Jetpack Compose. Gradle normally aligns versions
with your app. If you see duplicate classes, force one version in `android/build.gradle`:

```groovy
configurations.all {
  resolutionStrategy.force "org.jetbrains.kotlin:kotlin-stdlib:<your version>"
}
```

## Android: "Plugin with id 'kotlin-android' not found" / built-in Kotlin errors

This library is plain Java and applies no Kotlin plugin, so those errors come from another library
or from your app's Gradle setup, not from here.

## iOS: `KhaltiCheckout` not found

- Run `pod repo update`, then `pod install`.
- The pod is published on CocoaPods trunk (`pod trunk info KhaltiCheckout`).
- If you use `use_frameworks!`, keep your linkage consistent for all pods.

## The checkout opens but immediately closes

- Wrong `environment` for the key (a test key with `production`, or the reverse).
- The `pidx` was created with a different merchant / environment than the public key.
- The `pidx` already completed or expired. Initiate a new payment.

## The result is `Pending`

Khalti has not settled it yet. Do not fulfil. Look the payment up on your server again after a few
seconds.

## Testing in the sandbox

Use your **sandbox** public and secret keys, `environment: 'test'`, and the sandbox base URL on your
server (`https://dev.khalti.com/api/v2/`). Khalti publishes sandbox wallet numbers, MPIN and OTP in
its documentation: <https://docs.khalti.com/>.
