#!/usr/bin/env bash
# Local stand-in for the GitHub Action. Run from this app. The agent code is
# fetched from GitHub, not from a checkout beside this repo. TARGET_REPO is
# this checkout, the same role the Action's checkout plays.
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="https://github.com/jmorgan415/remediation-platform.git"
COMMAND="${1:-plan}"

if [[ -n "${REMEDIATION_PLATFORM:-}" ]]; then
  PLATFORM="$REMEDIATION_PLATFORM"
  if [[ ! -f "$PLATFORM/package.json" ]]; then
    echo "Platform repo not found at $PLATFORM." >&2
    exit 1
  fi
else
  PLATFORM="${XDG_CACHE_HOME:-$HOME/.cache}/remediation-platform"
  mkdir -p "$(dirname "$PLATFORM")"
  if [[ ! -d "$PLATFORM/.git" ]]; then
    git clone --branch main "$REMOTE" "$PLATFORM"
  else
    git -C "$PLATFORM" fetch origin main
    git -C "$PLATFORM" checkout -B main origin/main
  fi
fi

if [[ ! -d "$PLATFORM/node_modules" || "$PLATFORM/package-lock.json" -nt "$PLATFORM/node_modules" ]]; then
  npm --prefix "$PLATFORM" ci
fi

export TARGET_REPO="$APP_ROOT"
npm --prefix "$PLATFORM" run "$COMMAND"
