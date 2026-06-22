#!/usr/bin/env bash
set -euo pipefail

repo="${SCREENPIPE_CONTEXT_REPO:-}"
if [ -z "$repo" ]; then
  for candidate in \
    "$HOME/Documents/Playground/screenpipe-context-pipes" \
    "$HOME/.screenpipe/context-pipes/screenpipe-context-pipes"; do
    if [ -f "$candidate/bin/screenpipe-context.js" ]; then
      repo="$candidate"
      break
    fi
  done
fi

if [ -z "$repo" ]; then
  repo="$HOME/.screenpipe/context-pipes/screenpipe-context-pipes"
  mkdir -p "$(dirname "$repo")"
  git clone --depth 1 https://github.com/Martin-Hausleitner/screenpipe-context-pipes.git "$repo"
fi

cd "$repo"

days="${SCREENPIPE_CONTEXT_DAYS:-1}"
format="${SCREENPIPE_CONTEXT_FORMAT:-markdown}"
args=(bin/screenpipe-context.js snapshot --days "$days" --format "$format")

if [ "${SCREENPIPE_CONTEXT_WRITE:-0}" = "1" ]; then
  if [ -z "${SCREENPIPE_API_KEY:-}" ]; then
    export SCREENPIPE_API_KEY
    SCREENPIPE_API_KEY="$(screenpipe auth token)"
  fi
  args+=(--write)
fi

node "${args[@]}"
