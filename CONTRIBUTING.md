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

## Releasing

Releases are cut by maintainers and published to npm automatically from a git tag.

1. Make sure `main` is green and `CHANGELOG.md` has the release notes under the new version heading.
2. Bump the version. This edits `package.json`, commits and creates the tag `vX.Y.Z`:

   ```sh
   npm version patch   # or minor / major, or e.g. 0.2.0-beta.1 for a pre-release
   ```

3. Push the commit and the tag:

   ```sh
   git push --follow-tags
   ```

4. The **Release** workflow checks that the tag matches `package.json`, runs typecheck and tests,
   publishes to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements) and
   creates the GitHub release. Versions with a suffix (for example `-beta.1`) are published under the
   `next` dist-tag and marked as pre-releases; everything else goes to `latest`.

Repository setup (once): add an npm automation token as the `NPM_TOKEN` Actions secret, and make sure
the `@klixsoft` scope exists on npm and the token can publish to it.

### Versioning

[Semantic Versioning](https://semver.org): patch for fixes, minor for backwards compatible features,
major for breaking changes. While the version is `0.x`, minor releases may include breaking changes.
