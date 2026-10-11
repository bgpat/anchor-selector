# E2E screenshots in Actions job summary (attach API)

## Conclusion

| Credential | `uploads.github.com/user-attachments/assets` |
|------------|-----------------------------------------------|
| `GITHUB_TOKEN` | **404** — not supported ([run 38123937909](https://github.com/bgpat/anchor-selector/actions/runs/38123937909)) |
| OAuth access token (`gho_`) / user PAT | **201** |
| `data:image/png;base64` in summary | **Stripped** by GitHub |

Use **OAuth refresh → short-lived access token** in CI (preferred here) or a static `ATTACHMENT_UPLOAD_PAT` secret.

## OAuth setup (recommended)

### 1. Create an OAuth App

https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**

- Enable **expiring user tokens** (or request `offline_access` when authorizing).
- Scopes: **`repo`** (private repo) or **`public_repo`**.

Save **Client ID** and **Client secret**.

### 2. One-time authorization (device flow)

```bash
curl -sX POST https://github.com/login/device/code \
  -H "Accept: application/json" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "scope=repo offline_access"
```

Open `verification_uri`, enter `user_code`, approve as a user with write access to this repo.

```bash
curl -sX POST https://github.com/login/oauth/access_token \
  -H "Accept: application/json" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "device_code=DEVICE_CODE" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code"
```

Store the **`refresh_token`** (`ghr_...`).

### 3. Repository configuration

| Name | Kind | Value |
|------|------|--------|
| `ATTACHMENT_OAUTH_CLIENT_ID` | **Variable** | OAuth App client ID |
| `ATTACHMENT_OAUTH_CLIENT_SECRET` | Secret | OAuth App client secret |
| `ATTACHMENT_OAUTH_REFRESH_TOKEN` | Secret | `ghr_...` from step 2 |

Optional fallback: `ATTACHMENT_UPLOAD_PAT` (static bearer token).

### 4. CI behavior

On each E2E job, `e2e/mint-attachment-oauth-token.sh` exchanges the refresh token for an **`gho_` access token**, then `e2e/append-job-summary.ts` uploads PNGs and writes `![…](https://github.com/user-attachments/assets/…)` to `$GITHUB_STEP_SUMMARY`.

If GitHub **rotates the refresh token**, the mint job updates `ATTACHMENT_OAUTH_REFRESH_TOKEN` via the Actions API (`secrets: write`). **Never** write refresh tokens to job summaries or logs.

### If a refresh token was exposed (e.g. in an old workflow Summary)

1. **Revoke** the OAuth App authorization: GitHub → Settings → Applications → Authorized OAuth Apps → your app → Revoke.
2. **Regenerate** the OAuth App client secret (optional but recommended).
3. Run **device flow** again and set new `ATTACHMENT_OAUTH_CLIENT_SECRET` / `ATTACHMENT_OAUTH_REFRESH_TOKEN`.
4. Treat any token that appeared in a public Actions log as **compromised** even after deletion of the run (assume it was copied).

## Files

- `e2e/mint-attachment-oauth-token.sh` — refresh → access token
- `e2e/append-job-summary.ts` — upload + job summary markdown

## Browser check

Open **E2E (chrome|firefox)** job → **Summary** on a green run after secrets are configured.
