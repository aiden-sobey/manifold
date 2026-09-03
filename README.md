# Chat Harness

A lightweight desktop chat client for testing different AI models through
[OpenRouter](https://openrouter.ai). Tauri v2 + React + TypeScript.

- Streaming chat with markdown and syntax highlighting
- Pick any OpenRouter model per chat; switch mid-chat and regenerate to compare
- Thinking level control, driven by each model's advertised reasoning support
- Collapsible reasoning ("thought process") block
- Chat history with auto-generated titles, full-text search (SQLite FTS5)
- Analytics: all-time and recent spend, stacked spend/tokens by model per day, week or month, per-model table, CSV export. Spend comes from OpenRouter's charged cost on each reply. Deleting a chat removes its replies and therefore its spend from analytics.
- API key stored in the macOS keychain, history in a local SQLite database

## Requirements

- Node 22+, pnpm 11+
- Rust toolchain (`rustup`), Xcode command line tools
- An OpenRouter API key: https://openrouter.ai/settings/keys

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
pnpm check        # typecheck + lint + format check + tests
pnpm test:watch
```

A pre-commit hook runs eslint/prettier on staged files.

## Build

```sh
pnpm tauri build
```

Produces `src-tauri/target/release/bundle/macos/Chat Harness.app` and a `.dmg`.
The app is unsigned, so on another Mac use right-click → Open the first time.

## Shortcuts

| Keys  | Action                        |
| ----- | ----------------------------- |
| ⌘N    | New chat                      |
| ⌘K    | Focus search                  |
| ⌘B    | Toggle sidebar                |
| ⌘,    | Settings                      |
| Enter | Send (configurable to ⌘Enter) |

## Data locations

- Database: `~/Library/Application Support/com.aiden.chat-harness/chat_harness.db`
- Settings and model cache: same directory, `settings.json` / `models-cache.json`
- API key: macOS keychain, service `chat_harness`

## Keychain prompts in development

Debug binaries are ad-hoc signed, so macOS treats every rebuild as a new app and
asks for keychain access again. `scripts/cargo-signed.sh` (wired in as Tauri's
`build.runner`) signs the debug binary with a stable self-signed identity so you
are asked once and can click "Always Allow". Create the identity once:

```sh
cd /tmp && openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -nodes \
  -subj "/CN=Chat Harness Dev" -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" -addext "basicConstraints=critical,CA:false"
openssl pkcs12 -export -inkey key.pem -in cert.pem -out dev.p12 -passout pass:dev -legacy
security import dev.p12 -k ~/Library/Keychains/login.keychain-db -P dev -T /usr/bin/codesign
security add-trusted-cert -r trustRoot -p codeSign -k ~/Library/Keychains/login.keychain-db cert.pem
rm key.pem cert.pem dev.p12
```

Verify with `security find-identity -v -p codesigning`. To sign release bundles
with it too, run `APPLE_SIGNING_IDENTITY="Chat Harness Dev" pnpm tauri build`. Without the identity the
script falls back to the unsigned binary and just prints a note. Override the
name with `CHAT_HARNESS_SIGN_IDENTITY`.
