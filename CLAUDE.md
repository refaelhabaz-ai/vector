# Vector (וקטור)

A guidance site for studies and careers in Israel. The whole site is one file, `index.html` (Hebrew, RTL, no build step, no server). Its data is embedded in it, and what a student enters stays in their own browser.

## Main is the live site

GitHub Pages serves `main` at https://refaelhabaz-ai.github.io/vector/. Work that is not on `main` is not on the site.

The owner wants `main` to follow finished work by itself, after every task:

- When a task is done, commit it, push the branch, and run `node tools/publish-main.mjs`. It fast-forwards `main` to the work, and only when it is safe: everything is committed, `main` did not move on, the script of `index.html` parses, `node tools/audit-data.mjs` has no errors, and the tests pass.
- A Stop hook in `.claude/settings.json` runs the same script at the end of every task, so running it yourself as well is harmless. If a Claude Code session started before the hook was there, it does not run in that session: run the script yourself.
- When the script refuses, it says why. Fix that (commit what is uncommitted, merge `origin/main` into the branch, repair the failing check) and run it again. Never force-push `main`, and never skip a check to get past it.
- `VECTOR_AUTOPUBLISH=off` turns it off. Do not open a pull request unless asked.

## Working on the code

- `index.html` has CRLF line endings. Keep them: edit with tools that keep CRLF, and check that no lone LF or CR was added.
- Checks: `node --test tools/test/*.test.mjs` (about 80 seconds; the browser tests are skipped without Playwright) and `node tools/audit-data.mjs`. `tools/README.md` describes the tools.
- The voice of the site is a warm mentor's, at eye level, and gender-neutral: impersonal forms (כדאי, אפשר), "we" (נתחיל, נסגור), and the past tense. Numbers and dates come from the data and the official tables; nothing is invented, and a score is never turned into a chance of admission.
- The map on the road (`journeyHTML` and the `.tr` / `.jn` styles) is loved and stays as it is.
- A test that needs a stored student writes it to storage from a first `file:` page and then opens the site. An init script that touches `localStorage` can land on another storage area when the page is reloaded.
