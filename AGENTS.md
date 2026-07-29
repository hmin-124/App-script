# App-script

Repository chứa các giải pháp tự động hóa Google Workspace (Google Sheets, AppSheet, Google Apps Script).

## Cursor Cloud specific instructions

This repo is a **Google Apps Script (GAS) monorepo**, not a web service. Key facts for developing here:

- The `main` branch is intentionally minimal (only this file + `README.md`). All product
  code lives in feature branches under `origin/cursor/*` (e.g. `admin-request-phieu`,
  `browser-message-tool`, `dig1-ads-dashboard`, `m8-tools-combined`, and the
  `setup-gas-solutions-architect` scaffold). Check out / diff the relevant branch to see code.
- There is **no `package.json`, no lockfile, no build step, and no linter** configured. Nothing
  to `npm install` on `main`. Node.js is pre-installed on the VM.
- **Applications cannot run locally.** Each product is a GAS project bound to a Google Sheet and
  executed by Google's cloud runtime. To actually deploy/run one you need a Google account plus
  the `clasp` CLI authenticated (`clasp login`) — these are external services that cannot be
  provisioned in this VM. See a branch's `README.md` / `COPY_TO_APPSCRIPT.md` for per-product
  deploy steps (copy files into Extensions → Apps Script, or `clasp push`).

### What can be run/verified locally

- **Unit tests** (only present on the `admin-request-phieu` branches) are dependency-free Node
  scripts that sandbox-load the `.gs` files via `vm` and run custom asserts. Run directly with
  `node`, no install needed. Because they only exist on feature branches, run them from a
  worktree so you don't have to leave your current branch, e.g.:

  ```bash
  git worktree add /tmp/t origin/cursor/fix-template-not-found-8857
  node /tmp/t/src/admin-request-phieu/tests/template-name-matching.test.js   # 14 assertions
  git worktree remove /tmp/t --force
  ```

  Other test files on sibling branches: `new-tool-request-sheet.test.js`
  (`new-tool-request-sheet-8857`), `new-tool-proposal-message.test.js`
  (`request-tool-moi-message-8857`). A non-zero exit / thrown assertion means failure.

- **`clasp` CLI**: run via `npx --yes @google/clasp <cmd>` (v3.x). Global `npm install -g` fails
  with EACCES on this VM's npm prefix, so prefer `npx`. `clasp` only does useful work after
  `clasp login` (Google OAuth), which is not available headless here.
