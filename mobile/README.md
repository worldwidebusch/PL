# ProLinker mobile scaffold

This folder contains an isolated Capacitor wrapper for the static web app in `../project`. Each copy or sync script first runs `scripts/prepare-web.mjs`, which creates the generated `www/project/` bundle and keeps `www/index.html` as Capacitor's entrypoint. The generated Android and iOS projects are committed in `android/` and `ios/` so they are ready for their platform toolchains.

## Prerequisites

- Node.js 22 or newer.
- Android: a supported Android Studio installation, Android SDK and the JDK version required by the installed Android tooling.
- iOS: macOS with a supported Xcode installation and CocoaPods or Swift Package Manager as required by the native dependencies. An iOS app cannot be built or submitted from Windows.
- A real HTTPS API endpoint for production. Keep secrets and privileged credentials on the server, not in the web bundle or Capacitor configuration.

## Install dependencies

From the repository root:

```bash
cd mobile
npm install
```

## Sync and run Android

Run these commands once the Android toolchain is installed:

```bash
npm run assets:android
npm run sync:android
npm run open:android
```

Build and run the app from Android Studio. Use `npm run sync:android` again after web files, native plugins or Capacitor dependencies change.

## Sync and run iOS

Run these commands on macOS with Xcode installed:

```bash
npm run assets:ios
npm run sync:ios
npm run open:ios
```

Build, sign and run the app from Xcode. Apple signing, bundle registration and App Store Connect setup require an Apple Developer account and are not performed by this project.

## Brand assets

`assets/logo.png` is the source for the native ProLinker launcher icons and light/dark splash screens. Regenerate both platforms with `npm run assets`, then run `npm run sync`. The generator is pinned through `@capacitor/assets` for repeatable output.

## Shared web app and API integration

`capacitor.config.json` points `webDir` at `www`. The npm scripts refresh `www/project/` from `../project` before `cap copy` or `cap sync`, excluding prototype-only screenshots, uploads, print exports and temporary files. After editing the web app, run:

```bash
cd mobile
npm run sync
```

The PWA service worker is intended for the HTTP/HTTPS website. The native Capacitor app loads the bundled files through its own secure local scheme and should call remote APIs over HTTPS. Before connecting authentication or production data, configure platform permissions, CORS, secure token storage, deep links and privacy declarations for the chosen backend and plugins.

Do not set Capacitor's `server.url` for a production build unless the app is deliberately designed and reviewed as a remotely hosted app. The default configuration packages a versioned copy of the web app inside each native release.
