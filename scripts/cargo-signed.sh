#!/usr/bin/env bash
# Cargo wrapper used by `tauri dev` (see build.runner in src-tauri/tauri.conf.json).
#
# `tauri dev` invokes `cargo run ...`. Debug binaries are only ad-hoc signed, so their
# identity changes every rebuild and macOS re-prompts for keychain access each time.
# This wrapper builds, codesigns the binary with a stable self-signed identity, then runs it.
# Any other cargo subcommand is passed straight through.
set -euo pipefail

IDENTITY="${MANIFOLD_SIGN_IDENTITY:-Manifold Dev}"

if [[ "${1:-}" != "run" || "$(uname)" != "Darwin" ]]; then
  exec cargo "$@"
fi
shift

# Split cargo args from binary args at `--`.
cargo_args=()
bin_args=()
seen_sep=0
for a in "$@"; do
  if [[ $seen_sep -eq 1 ]]; then bin_args+=("$a")
  elif [[ "$a" == "--" ]]; then seen_sep=1
  else cargo_args+=("$a")
  fi
done

cargo build ${cargo_args[@]+"${cargo_args[@]}"}

# Locate the built binary via cargo metadata (respects CARGO_TARGET_DIR).
target_dir="$(cargo metadata --format-version 1 --no-deps | python3 -c 'import json,sys;print(json.load(sys.stdin)["target_directory"])')"
profile=debug
for a in ${cargo_args[@]+"${cargo_args[@]}"}; do
  [[ "$a" == "--release" ]] && profile=release
done
bin="$target_dir/$profile/manifold"

if security find-identity -v -p codesigning 2>/dev/null | grep -q "\"$IDENTITY\""; then
  codesign --force --sign "$IDENTITY" "$bin" 2>/dev/null \
    || echo "[cargo-signed] codesign failed; running ad-hoc signed binary" >&2
else
  echo "[cargo-signed] no '$IDENTITY' identity found; running ad-hoc signed binary (keychain will re-prompt after rebuilds)" >&2
fi

exec "$bin" ${bin_args[@]+"${bin_args[@]}"}
