// node --test tools/test/publish.test.mjs
// tools/publish-main.mjs, which moves main to the finished work: when it acts, when it stays out, and that it never overwrites anything.
// Every test builds a small world of its own in a temporary folder: a bare "GitHub", a working copy, and sometimes a second working copy that pushes to main first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../publish-main.mjs', import.meta.url));
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
delete ENV.CLAUDE_PROJECT_DIR; delete ENV.VECTOR_AUTOPUBLISH; delete ENV.NODE_TEST_CONTEXT; // the script must look at the world of the test, not at the checkout this test runs in

const g = (cwd, ...a) => execFileSync('git', a, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (dir, file, text) => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); };
const commit = (dir, file, text, msg = 'work') => { put(dir, file, text); g(dir, 'add', '-A'); g(dir, 'commit', '-q', '-m', msg); };
const PAGE = (n) => `<!doctype html><title>x</title><script>const a = ${n};</script>`;

function world() {
  const dir = mkdtempSync(join(tmpdir(), 'publish-')), origin = join(dir, 'origin.git'), work = join(dir, 'work');
  g(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  g(dir, 'clone', '-q', origin, work);
  g(work, 'checkout', '-q', '-b', 'main');
  commit(work, 'index.html', PAGE(1), 'first');
  g(work, 'push', '-q', '-u', 'origin', 'main');
  g(work, 'checkout', '-q', '-b', 'claude/some-work');
  const other = () => { const o = join(dir, 'other'); g(dir, 'clone', '-q', origin, o); return o; };
  return { dir, origin, work, other, main: () => g(origin, 'rev-parse', 'main'), head: () => g(work, 'rev-parse', 'HEAD'), done: () => rmSync(dir, { recursive: true, force: true }) };
}
const run = (w, args = [], input = '', env = {}) => { const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: w.work, env: { ...ENV, ...env }, encoding: 'utf8', input }); return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() }; };
const inWorld = (name, fn) => test(name, async () => { const w = world(); try { await fn(w); } finally { w.done(); } });

inWorld('a clean claude/ branch that is ahead of main is fast-forwarded into main', (w) => {
  commit(w.work, 'index.html', PAGE(2));
  const r = run(w);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /main is now [0-9a-f]{7}: 1 commit\(s\) from "claude\/some-work"/);
  assert.equal(w.main(), w.head());
});

inWorld('it says nothing when main already has everything', (w) => {
  const r = run(w);
  assert.equal(r.code, 0); assert.equal(r.out, ''); assert.equal(r.err, '');
});

inWorld('commits that are not committed yet are not published, and main stays where it was', (w) => {
  const before = w.main();
  commit(w.work, 'index.html', PAGE(2));
  put(w.work, 'index.html', PAGE(3)); // changed, not committed
  const r = run(w);
  assert.equal(r.code, 0); assert.match(r.out, /uncommitted changes/);
  assert.equal(w.main(), before);
});

inWorld('a file that git does not track does not stop it', (w) => {
  commit(w.work, 'index.html', PAGE(2));
  put(w.work, 'scratch.txt', 'notes');
  assert.equal(run(w).code, 0);
  assert.equal(w.main(), w.head());
});

inWorld('a branch that is not a claude/ branch is left alone, unless --any-branch says otherwise', (w) => {
  g(w.work, 'checkout', '-q', '-b', 'feature/x');
  commit(w.work, 'index.html', PAGE(2));
  const before = w.main();
  assert.equal(run(w).out, ''); assert.equal(w.main(), before);
  assert.match(run(w, ['--any-branch']).out, /main is now/);
  assert.equal(w.main(), w.head());
});

inWorld('commits made on main itself are pushed as they are', (w) => {
  g(w.work, 'checkout', '-q', 'main');
  commit(w.work, 'index.html', PAGE(2));
  assert.match(run(w).out, /main is now/);
  assert.equal(w.main(), w.head());
});

inWorld('a main that moved on is never overwritten: it asks for a merge instead', (w) => {
  const o = w.other(); commit(o, 'other.txt', 'someone else', 'theirs'); g(o, 'push', '-q', 'origin', 'main');
  commit(w.work, 'index.html', PAGE(2));
  const theirs = w.main();
  const r = run(w);
  assert.equal(r.code, 1); assert.match(r.out, /not a fast-forward/);
  assert.equal(w.main(), theirs);
});

inWorld('as a hook, a problem that can be fixed goes back to Claude once, and after that it only reports', (w) => {
  const o = w.other(); commit(o, 'other.txt', 'someone else', 'theirs'); g(o, 'push', '-q', 'origin', 'main');
  commit(w.work, 'index.html', PAGE(2));
  const first = run(w, ['--hook'], '{"stop_hook_active":false}');
  assert.equal(first.code, 2); assert.match(first.err, /not a fast-forward/); assert.equal(first.out, '');
  const second = run(w, ['--hook'], '{"stop_hook_active":true}');
  assert.equal(second.code, 0); assert.match(JSON.parse(second.out).systemMessage, /not a fast-forward/);
});

inWorld('as a hook, a publish is reported as a message for the person', (w) => {
  commit(w.work, 'index.html', PAGE(2));
  const r = run(w, ['--hook'], '{}');
  assert.equal(r.code, 0);
  assert.match(JSON.parse(r.out).systemMessage, /^main is now/);
  assert.equal(w.main(), w.head());
});

inWorld('a page whose script does not parse is not published', (w) => {
  const before = w.main();
  commit(w.work, 'index.html', '<!doctype html><script>const a = ;</script>');
  const r = run(w);
  assert.equal(r.code, 1); assert.match(r.out, /the script of index\.html parses/);
  assert.equal(w.main(), before);
});

inWorld('a failing test is not published, and a passing one is run and published', (w) => {
  const before = w.main();
  commit(w.work, 'tools/test/bad.test.mjs', "import test from 'node:test'; import assert from 'node:assert/strict'; test('x', () => assert.equal(1, 2));");
  const bad = run(w);
  assert.equal(bad.code, 1); assert.match(bad.out, /node --test/); assert.equal(w.main(), before);
  commit(w.work, 'tools/test/bad.test.mjs', "import test from 'node:test'; test('x', () => {});", 'fixed');
  const good = run(w);
  assert.equal(good.code, 0, good.out); assert.match(good.out, /1 check\(s\) passed/);
  assert.equal(w.main(), w.head());
});

inWorld('a change that no check looks at (a note) is published without running the tests', (w) => {
  commit(w.work, 'tools/test/bad.test.mjs', "import test from 'node:test'; import assert from 'node:assert/strict'; test('x', () => assert.equal(1, 2));");
  g(w.work, 'push', '-q', 'origin', 'HEAD:refs/heads/main'); // main already has the failing test: only the note is new
  commit(w.work, 'NOTES.md', 'a note');
  const r = run(w);
  assert.equal(r.code, 0, r.out); assert.equal(w.main(), w.head());
});

inWorld('--dry-run checks everything and changes nothing', (w) => {
  const before = w.main();
  commit(w.work, 'index.html', PAGE(2));
  const r = run(w, ['--dry-run']);
  assert.equal(r.code, 0); assert.match(r.out, /^Dry run: 1 commit\(s\) .* would go to main/);
  assert.equal(w.main(), before);
});

inWorld('VECTOR_AUTOPUBLISH=off turns it off', (w) => {
  const before = w.main();
  commit(w.work, 'index.html', PAGE(2));
  const r = run(w, [], '', { VECTOR_AUTOPUBLISH: 'off' });
  assert.equal(r.code, 0); assert.equal(r.out, ''); assert.equal(w.main(), before);
});
