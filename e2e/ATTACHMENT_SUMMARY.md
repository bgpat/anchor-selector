# E2E screenshots in Actions job summary (attach API)

## Conclusion (verified on branch `experiment/ci-summary-attach`)

| Step | `GITHUB_TOKEN` in Actions | User PAT / `gh auth token` |
|------|----------------------------|----------------------------|
| `POST uploads.github.com/user-attachments/assets` | **404 Not Found** (run [38123937909](https://github.com/bgpat/anchor-selector/actions/runs/38123937909)) | **201** (local probe) |
| `![…](https://github.com/user-attachments/assets/…)` in `$GITHUB_STEP_SUMMARY` | Would render if upload succeeded | Same |
| `![…](data:image/png;base64,…)` | **Stripped** (does not display) | N/A |

**Job summary with CI e2e PNGs via the attach / user-attachments upload API is not available with `secrets.GITHUB_TOKEN` alone.** Add a repository secret (for example `ATTACHMENT_UPLOAD_PAT`, classic PAT with `repo` scope) and pass it to the upload step instead of `GITHUB_TOKEN`.

`gh pr comment --attach` uses the same upload endpoint; it works locally with gh 2.102.0 but is not a substitute for writing `$GITHUB_STEP_SUMMARY`.

## Implementation in this branch

- `e2e/append-job-summary.ts` — upload PNGs from `e2e/ci-screenshots/`, append Markdown to `$GITHUB_STEP_SUMMARY`.
- Request body must use `Content-Type: image/png` (not `application/json`); otherwise HTTP 400.

## Browser check

Open the **E2E (firefox)** or **E2E (chrome)** job → **Summary** panel on a run of this branch. On failed uploads you should see the error block written by the script. After wiring a PAT, successful runs should show inline images.
