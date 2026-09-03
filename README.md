# Manifold

A lightweight desktop chat client for testing different AI models through
[OpenRouter](https://openrouter.ai).

- Streaming chat with markdown and syntax highlighting
- Pick any LLM model to chat with
- Thinking level control, driven by each model's advertised reasoning support
- Chat history with auto-generated titles, full-text search
- Attachments: drop, paste, or attach images, PDFs, and text/code files.
- Analytics: all-time and recent spend, stacked spend/tokens by model.
- API key stored in the macOS keychain

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
- API key: macOS keychain, service `manifold`
