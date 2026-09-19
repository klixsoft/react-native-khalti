# Contributing

Thanks for helping improve `@klixsoft/react-native-khalti`.

## Ground rules

- This library wraps the **official Khalti SDKs**. It must not implement its own checkout, WebView,
  or payment logic, and it must never sign or hold secret keys.
- The public API is `src/index.tsx`. Anything else is internal.
- Keep Android in **Java** so consumers are not forced to apply the Kotlin Gradle plugin (which
  breaks under AGP 9's built-in Kotlin).

## Development

```sh
pnpm install
pnpm typecheck
```

The native code is built by the app that consumes it. To try a change, link the package into an
app (a workspace link or `pnpm link`) and rebuild:

- Android: a normal Gradle build (`./gradlew :app:assembleDebug`).
- iOS: `pod install`, then build in Xcode.

## Pull requests

- Describe the change and how you tested it on each platform you touched.
- Update `docs/` and `CHANGELOG.md` when behaviour or the API changes.
- Keep the diff focused; unrelated refactors belong in a separate PR.

## Reporting security issues

Do not open a public issue for a security problem. Email the maintainers privately through the
contact on the GitHub organisation page.
