#!/usr/bin/env bash
set -euo pipefail

if [ -z "${ATTACHMENT_OAUTH_REFRESH_TOKEN:-}" ]; then
  echo "ATTACHMENT_OAUTH_REFRESH_TOKEN not set; skipping OAuth mint."
  exit 0
fi

: "${ATTACHMENT_OAUTH_CLIENT_ID:?ATTACHMENT_OAUTH_CLIENT_ID is required}"
: "${ATTACHMENT_OAUTH_CLIENT_SECRET:?ATTACHMENT_OAUTH_CLIENT_SECRET is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

resp=$(curl -sS -X POST https://github.com/login/oauth/access_token \
  -H "Accept: application/json" \
  -d "client_id=${ATTACHMENT_OAUTH_CLIENT_ID}" \
  -d "client_secret=${ATTACHMENT_OAUTH_CLIENT_SECRET}" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=${ATTACHMENT_OAUTH_REFRESH_TOKEN}")

token=$(echo "$resp" | jq -r '.access_token // empty')
if [ -z "$token" ]; then
  echo "OAuth refresh failed: $resp" >&2
  exit 1
fi

echo "::add-mask::$token"
echo "access_token=$token" >> "$GITHUB_OUTPUT"

new_refresh=$(echo "$resp" | jq -r '.refresh_token // empty')
if [ -n "$new_refresh" ] && [ "$new_refresh" != "$ATTACHMENT_OAUTH_REFRESH_TOKEN" ]; then
  echo "::warning title=Update ATTACHMENT_OAUTH_REFRESH_TOKEN secret::GitHub rotated the OAuth refresh token. Copy the new value from this step log (new_refresh_token output) into the repository secret."
  echo "new_refresh_token=$new_refresh" >> "$GITHUB_OUTPUT"
fi
