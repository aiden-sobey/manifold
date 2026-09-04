#!/usr/bin/env bash
# Source this before any `pnpm android:*` command:   source scripts/android-env.sh
# Works when sourced from bash or zsh. Points the Tauri CLI at Android Studio's bundled
# JDK 17 and the SDK/NDK it installed.
# Gradle 8.x needs JDK 17–21; Android Studio's bundled JBR is newer than that, so prefer a
# Homebrew JDK 17 (`brew install openjdk@17`) when present.
if [ -z "${JAVA_HOME:-}" ]; then
  if [ -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]; then
    JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
  else
    JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  fi
fi
export JAVA_HOME
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ -z "${NDK_HOME:-}" ] && [ -d "$ANDROID_HOME/ndk" ]; then
  NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 "$ANDROID_HOME/ndk" | sort -V | tail -1)"
  export NDK_HOME
fi
# SDK platform-tools first so `adb` matches the SDK (Homebrew's adb can version-clash).
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

[ -d "$JAVA_HOME" ]    || echo "[android-env] warning: JAVA_HOME=$JAVA_HOME does not exist" >&2
[ -d "$ANDROID_HOME" ] || echo "[android-env] warning: ANDROID_HOME=$ANDROID_HOME does not exist" >&2
[ -d "${NDK_HOME:-}" ] || echo "[android-env] warning: NDK_HOME=${NDK_HOME:-<unset>} does not exist" >&2
