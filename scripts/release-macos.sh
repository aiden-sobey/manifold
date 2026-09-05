#!/usr/bin/env bash
# Build, sign, notarize, and staple a distributable macOS DMG.
#
# Prerequisites (one-time, see README):
#   - "Developer ID Application" certificate + private key in the login keychain,
#     matching bundle.macOS.signingIdentity in src-tauri/tauri.conf.json.
#   - App Store Connect API key (.p8) with the Developer role.
#
# Usage:
#   APPLE_API_ISSUER=<issuer-uuid> APPLE_API_KEY=<key-id> \
#   APPLE_API_KEY_PATH=~/.private_keys/AuthKey_<key-id>.p8 \
#   scripts/release-macos.sh [--target universal-apple-darwin|aarch64-apple-darwin]
#
# Tauri signs and notarizes the .app. This script additionally notarizes and
# staples the outer DMG so Gatekeeper accepts the disk image itself, not just
# the app inside it.
set -euo pipefail

: "${APPLE_API_ISSUER:?set APPLE_API_ISSUER}"
: "${APPLE_API_KEY:?set APPLE_API_KEY}"
: "${APPLE_API_KEY_PATH:?set APPLE_API_KEY_PATH}"

TARGET="universal-apple-darwin"
if [[ "${1:-}" == "--target" ]]; then TARGET="$2"; fi

cd "$(dirname "$0")/.."

pnpm tauri build --target "$TARGET"

dmg_dir="src-tauri/target/$TARGET/release/bundle/dmg"
dmg="$(ls -t "$dmg_dir"/*.dmg | head -1)"

echo "==> Notarizing DMG: $dmg"
xcrun notarytool submit "$dmg" --wait \
  --key-id "$APPLE_API_KEY" --key "$APPLE_API_KEY_PATH" --issuer "$APPLE_API_ISSUER"
xcrun stapler staple "$dmg"

echo "==> Gatekeeper verification"
spctl -a -vv -t open --context context:primary-signature "$dmg"

echo
echo "Release artifact: $dmg"
