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
token_prefix=${token:0:4}
echo "Minted OAuth access token prefix: ${token_prefix}..."

if [ -n "${ATTACHMENT_OAUTH_TOKEN_FILE:-}" ]; then
  printf '%s' "$token" > "$ATTACHMENT_OAUTH_TOKEN_FILE"
fi

new_refresh=$(echo "$resp" | jq -r '.refresh_token // empty')
if [ -n "$new_refresh" ] && [ "$new_refresh" != "$ATTACHMENT_OAUTH_REFRESH_TOKEN" ]; then
  echo "::add-mask::$new_refresh"
  if [ -n "${GITHUB_REPOSITORY:-}" ] && command -v gh >/dev/null 2>&1; then
    printf '%s' "$new_refresh" | gh secret set ATTACHMENT_OAUTH_REFRESH_TOKEN --repo "$GITHUB_REPOSITORY"
    echo "::notice title=OAuth refresh token rotated::Updated repository secret ATTACHMENT_OAUTH_REFRESH_TOKEN (never log the token)."
  else
    echo "::error title=OAuth refresh token rotated::GitHub issued a new refresh token but it could not be saved. Re-run device flow and update ATTACHMENT_OAUTH_REFRESH_TOKEN locally. Do not print tokens in CI logs." >&2
    exit 1
  fi
fi
