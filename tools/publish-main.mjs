#!/usr/bin/env node
// node tools/publish-main.mjs [--hook] [--dry-run] [--any-branch]
// Publishes finished work: fast-forwards `main` on GitHub to the commit this checkout is on. The live site (GitHub Pages) is served from main, so this is what "the site is updated" means.
// It acts only when that is safe, and says why when it does not:
//   - the checkout is on a `claude/…` branch (or on main itself, or --any-branch) and everything tracked is committed;
//   - origin/main is an ancestor of HEAD: a fast-forward, never a merge and never a force;
//   - the checks pass: the script of index.html parses, the data audit has no errors, and the tests pass (when index.html, tools/, data/ or questions/ changed).
// --hook is the form for the Claude Code "Stop" hook (.claude/settings.json). The outcome goes out as JSON for the person to see, and a problem that can be fixed (a failing check, a main that moved on)
// exits 2, which hands it back to Claude to fix. It does that once: when the hook already sent Claude back, it only reports.
// Nothing here writes to the working tree. To turn it off: VECTOR_AUTOPUBLISH=off, or remove the hook.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const args = new Set(process.argv.slice(2));
const HOOK = args.has('--hook'), DRY = args.has('--dry-run'), ANY = args.has('--any-branch');
const FIX = HOOK ? 2 : 1; // the exit code of a problem that somebody can fix

// what the Stop hook was told: has it already sent Claude back once for this?
let again = false;
if (HOOK && !process.stdin.isTTY) { try { again = !!JSON.parse(readFileSync(0, 'utf8') || '{}').stop_hook_active; } catch { /* no input */ } }

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (cwd, ...a) => { try { return { ok: true, out: git(cwd, ...a) }; } catch (e) { return { ok: false, out: String(e.stderr || e.message).trim() }; } };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; // a test run inside a test run must report as its own

// the way out: what to say, who is told, and the exit code
function done(code, text, quiet = false) {
  if (HOOK) {
    if (code === FIX && !again) { console.error(text); process.exit(2); }       // back to Claude, once
    if (text && !quiet) console.log(JSON.stringify({ systemMessage: text }));
    process.exit(0);
  }
  if (text && !quiet) console.log(text);
  process.exit(code === FIX ? 1 : code);
}

if (/^(off|0|no|false)$/i.test(process.env.VECTOR_AUTOPUBLISH || '')) done(0, 'Publishing to main is turned off (VECTOR_AUTOPUBLISH).', true);

let root;
try { root = git(process.env.CLAUDE_PROJECT_DIR || process.cwd(), 'rev-parse', '--show-toplevel'); } catch { done(0, 'Not a git checkout: nothing to publish.', true); }

const branch = tryGit(root, 'branch', '--show-current').out;
if (!branch) done(0, 'Not publishing: HEAD is detached.', true);
if (branch !== 'main' && !/^claude\//.test(branch) && !ANY) done(0, `Not publishing "${branch}": only claude/… branches go to main by themselves (--any-branch overrides).`, true);

// what main is now
let fetched = false;
for (let i = 0, wait = 2000; i < 5 && !fetched; i++, wait *= 2) { fetched = tryGit(root, 'fetch', 'origin', 'main').ok; if (!fetched && i < 4) sleep(wait); }
if (!fetched) done(0, 'Not publishing: could not reach origin to see where main is.');

const ahead = Number(tryGit(root, 'rev-list', '--count', 'origin/main..HEAD').out);
if (!ahead) done(0, 'main already has everything.', true); // nothing to publish: quiet, whatever the tree looks like

if (tryGit(root, 'status', '--porcelain', '--untracked-files=no').out) done(0, `Not publishing ${ahead} commit(s) of "${branch}": there are uncommitted changes. Commit them first, then main follows.`);
if (!tryGit(root, 'merge-base', '--is-ancestor', 'origin/main', 'HEAD').ok) {
  const behind = tryGit(root, 'rev-list', '--count', 'HEAD..origin/main').out;
  done(FIX, `Not publishing: main has ${behind} commit(s) that "${branch}" does not have, so this is not a fast-forward. Merge origin/main into the branch (git merge origin/main), check the result, and commit.`);
}

// the checks, for what is about to go live
const changed = tryGit(root, 'diff', '--name-only', 'origin/main', 'HEAD').out.split('\n').filter(Boolean);
const touches = (re) => changed.some((f) => re.test(f));
const run = (cmd, a) => { const r = spawnSync(cmd, a, { cwd: root, env, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 10 * 60 * 1000 }); return { ok: r.status === 0, tail: (r.stdout + '\n' + r.stderr).trim().split('\n').slice(-40).join('\n') }; };
function parsePage() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  let n = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/type\s*=\s*["']?(?!text\/javascript|module)/i.test(m[1])) continue; // JSON and the like
    n++;
    try { new vm.Script(m[2], { filename: `index.html, script ${n}` }); } catch (e) { return { ok: false, tail: `${e.name}: ${e.message}` }; }
  }
  return { ok: true };
}
const tests = existsSync(join(root, 'tools/test')) ? readdirSync(join(root, 'tools/test')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => 'tools/test/' + f) : [];
const checks = [
  existsSync(join(root, 'index.html')) && touches(/^index\.html$/) && ['the script of index.html parses', parsePage],
  existsSync(join(root, 'tools/audit-data.mjs')) && touches(/^(index\.html|data\/|tools\/audit-data)/) && ['node tools/audit-data.mjs', () => run('node', ['tools/audit-data.mjs'])],
  tests.length && touches(/^(index\.html|tools\/|data\/|questions\/)/) && [`node --test (${tests.length} files)`, () => run('node', ['--test', ...tests])],
].filter(Boolean);
for (const [name, check] of checks) {
  const r = check();
  if (!r.ok) done(FIX, `Not publishing: "${name}" failed, so main stays as it is.\n${r.tail || ''}`);
}

const short = tryGit(root, 'rev-parse', '--short', 'HEAD').out, sha = tryGit(root, 'rev-parse', 'HEAD').out;
if (DRY) done(0, `Dry run: ${ahead} commit(s) of "${branch}" would go to main (${short}). ${checks.length} check(s) passed.`);

// the push: a fast-forward only. Asking again helps against a network that blinks, not against a refusal
let pushed = false, why = '';
for (let i = 0, wait = 2000; i < 5 && !pushed; i++, wait *= 2) {
  const r = tryGit(root, 'push', 'origin', 'HEAD:refs/heads/main');
  pushed = r.ok; why = r.out;
  if (!pushed) { if (/rejected|protected|denied|forbidden|403|non-fast-forward/i.test(why)) break; if (i < 4) sleep(wait); }
}
if (!pushed) done(FIX, `main was not updated: ${why.split('\n').slice(-3).join(' ')}`);

const now = tryGit(root, 'ls-remote', 'origin', 'refs/heads/main').out.split(/\s+/)[0];
if (now !== sha) done(FIX, `The push went through, but main on GitHub is ${now.slice(0, 7)}, not ${short}. Look at it before the next task.`);
const origin = (tryGit(root, 'remote', 'get-url', 'origin').out.match(/github\.com[:/]([^/]+)\/([^/.]+)/) || []);
done(0, `main is now ${short}: ${ahead} commit(s) from "${branch}"${checks.length ? `, ${checks.length} check(s) passed` : ''}.${origin[1] ? ` The site updates in a minute or two: https://${origin[1]}.github.io/${origin[2]}/` : ''}`);
