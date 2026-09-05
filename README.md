# Manifold

A lightweight desktop and Android chat client for testing different AI models through
[OpenRouter](https://openrouter.ai).

- Streaming chat with markdown and syntax highlighting
- Pick any LLM model to chat with
- Thinking level control, driven by each model's advertised reasoning support
- Chat history with auto-generated titles, full-text search
- Attachments: drop, paste, or attach images, PDFs, and text/code files.
- Comparison mode: send one prompt to two models side by side, see a detailed comparison.
- Analytics: all-time and recent spend, stacked spend/tokens by model.
- API key stored in the macOS keychain (app-private storage on Android)

## Requirements

- Node 22+, pnpm 11+
- Rust toolchain (`rustup`), Xcode command line tools
- An [OpenRouter API key](https://openrouter.ai/settings/keys)

## Develop

```sh
pnpm install
pnpm tauri dev
```

Opens a native window with hot reload. `pnpm dev` alone starts Vite, but the app
needs the Tauri runtime for the database and keychain, so use `pnpm tauri dev`.

During development macOS may prompt for keychain access after each rebuild,
because the debug binary's signature changes.

## Quality checks

```sh
pnpm check        # typecheck + lint + format check
pnpm test:watch
```

A pre-commit hook runs eslint/prettier on staged files.

## Build

```sh
pnpm tauri build
```

Produces `src-tauri/target/release/bundle/macos/Manifold.app` and a `.dmg`.
The app is unsigned, so on another Mac use right-click → Open the first time.

## Android

The same React tree and Rust crate ship as an Android app; only packaging and a thin
platform layer (`src/lib/platform.ts`, `src-tauri/capabilities/desktop.json`) differ.

### One-off setup

1. Install [Android Studio](https://developer.android.com/studio). In **SDK Manager → SDK
   Tools** tick: Android SDK Build-Tools, Platform-Tools, Command-line Tools,
   **NDK (Side by side)**, Android Emulator. In **SDK Platforms** tick the latest API.
2. **Device Manager → Create device**: any Pixel with an **arm64-v8a** system image. Note the
   AVD name (`emulator -list-avds` shows it; the current one is `Pixel_9_Pro`).
3. `rustup target add aarch64-linux-android` and `brew install openjdk@17` (Gradle needs JDK 17–21;
   Android Studio's bundled JDK is too new).
4. `brew uninstall android-platform-tools` if installed, so `adb` comes from the SDK.
5. `source scripts/android-env.sh` (sets `JAVA_HOME`, `ANDROID_HOME`, `NDK_HOME`, `PATH`).
   Add that line to `~/.zshrc` if you like. `pnpm tauri info` should now list the SDK/NDK.
6. First time only: `pnpm tauri android init`, then `pnpm tauri icon src-tauri/icons/source-icon.png`
   to (re)generate the launcher icons. Commit `src-tauri/gen/android`.

### Develop

```sh
source scripts/android-env.sh
emulator -avd Pixel_9_Pro &  # or plug in a phone with USB debugging enabled
pnpm android:dev
```

Frontend edits hot-reload; Rust edits rebuild and reinstall. Inspect the webview from
Chrome at `chrome://inspect`. Rust/plugin logs: `pnpm android:logs`.

If a physical phone can't reach the dev server (multi-interface Macs sometimes pick the
wrong IP), go USB-only:

```sh
adb reverse tcp:1420 tcp:1420 && adb reverse tcp:1421 tcp:1421
TAURI_DEV_HOST=localhost pnpm android:dev
```

If a reinstall fails after a Rust change: `adb uninstall com.aiden.manifold` and rerun.

### Release APK

Create a keystore once and keep it out of git:

```sh
keytool -genkey -v -keystore ~/manifold-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Write `src-tauri/gen/android/keystore.properties` (gitignored) with `storeFile`,
`storePassword`, `keyAlias`, `keyPassword`, and wire it into
`src-tauri/gen/android/app/build.gradle.kts` as described in
[Tauri's Android signing guide](https://v2.tauri.app/distribute/sign/android/). Then:

```sh
pnpm android:build
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

### Mobile differences

- Enter inserts a newline; the arrow button sends.
- Attachments come from the system file picker (no drag-drop or paste).
- Comparison mode shows one lane at a time with a switcher.
- CSV export is desktop-only.

## Shortcuts

| Keys  | Action                        |
| ----- | ----------------------------- |
| ⌘N    | New chat                      |
| ⌘K    | Focus search                  |
| ⌘B    | Toggle sidebar                |
| ⌘,    | Settings                      |
| Enter | Send (configurable to ⌘Enter) |

## Data locations

- Database: `~/Library/Application Support/com.aiden.manifold/manifold.db`
- Settings and model cache: same directory, `settings.json` / `models-cache.json`
- API key: macOS keychain, service `chat_harness`
- Android: everything lives in the app sandbox `/data/data/com.aiden.manifold/` (`manifold.db`,
  `settings.json`, `secrets.json`, `attachments/`). Inspect with
  `adb shell run-as com.aiden.manifold ls`.
