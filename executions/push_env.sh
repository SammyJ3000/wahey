#!/bin/bash
# Run this yourself after filling in .env. It copies each filled-in key to the Vercel project's
# production settings without ever printing the values. Needs the Vercel CLI, logged in and linked.
#   bash executions/push_env.sh
set -euo pipefail
cd "$(dirname "$0")/.."
VERCEL="${VERCEL:-vercel}"
[ -f .env ] || { echo "No .env file here."; exit 1; }

while IFS='=' read -r name value; do
  [[ "$name" =~ ^[A-Z0-9_]+$ ]] || continue
  [ "$name" = "BLOB_READ_WRITE_TOKEN" ] && continue          # Vercel adds this one itself when the store is connected
  value="${value%\"}"; value="${value#\"}"
  if [ -z "$value" ]; then echo "skip  $name (empty)"; continue; fi
  "$VERCEL" env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | "$VERCEL" env add "$name" production >/dev/null 2>&1 && echo "set   $name" || echo "FAIL  $name"
done < .env

echo "Done. Redeploy so the live app picks the keys up."
