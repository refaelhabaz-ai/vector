// Reads the Avodata pages that the data of the site was taken from, in the browser of whoever runs this, and saves them in one file (avodata-dump-<date>.zip)
// for tools/verify-avodata.mjs. The cloud machine that maintains the site cannot reach Avodata (its servers refuse it); a person's browser can.
//
//   1. open https://avodata.labor.gov.il in Chrome, Edge or Firefox on a computer, and leave that tab in front
//   2. open the console (F12, then the Console tab), type  allow pasting  and press Enter
//   3. paste this whole file and press Enter. A box on the page shows the progress; it takes about 20 minutes
//   4. when the box says it is done, a file is saved in the downloads folder. Nothing is sent anywhere
//
// For each page of TARGETS it opens the page in a hidden frame of the same site, waits until the page stops changing, saves what a person sees on it (the text, the tables, the links, the labels
// and the data of charts) and the answers the page received from the site's own servers, and closes the frame. Two pages at a time, a pause between pages, a longer pause when the site
// answers "blocked", and it stops by itself after a few blocks in a row. It never changes anything on the site. A run that was cut resumes when this file is run again in the same browser.
//
// TARGETS is the list of pages that index.html points at. `node tools/verify-avodata.mjs --stamp` rewrites it and the test checks that it is in step.
// window.__AVODATA_CONFIG__ = {...} before pasting changes the settings below (the tests use it); window.__avodata holds the run: stop(), download(), clear().
(async () => {
  'use strict';
  const TARGETS = /*targets*/{"Academic":["1","2","3","10","11","12","20","21","40","92","93","100","102","111","120","122","123","128","129","156","170","171","200","204","205","210","248","300","301","302","305","310","311","320","323","329","341","342","343","345","346","347","348","349","370","400","408","410","411","413","420","421","430","438","440","450","453","480","491","493","494","497","500","512","520","530","536","540","580","590","591","592","600","700","710","800","810","820","830","834","840","850","860","870","880","892","894","900","901","920","921","922","930","931","933","935","1000","1005","1020","1022","1053","1100","1103","1160","1181","1191","1195","1197","1201","1204","1205","1206","1209","1300","1301","1304","1306","1310","1320","1321","1322","1323","1325","1326","1330","1340","1342","1350","1351","1356","1361","1364","1382","1386","1393","1401","1500","1550","1600","1650","1710"],"isco_group":["1114","1120","1211","1212","1213","1219","1221","1222","1223","1311","1321","1323","1324","1330","1341","1342","1343","1344","1345","1346","1349","1412","1420","1431","1439","2111","2113","2120","2131","2132","2141","2142","2143","2144","2145","2149","2151","2152","2153","2161","2162","2163","2164","2165","2166","2211","2212","2213","2221","2222","2230","2250","2261","2262","2263","2264","2265","2266","2267","2268","2269","2312","2313","2314","2316","2317","2322","2330","2341","2342","2351","2352","2353","2354","2355","2356","2359","2411","2412","2413","2414","2421","2422","2423","2424","2431","2432","2433","2434","2511","2512","2513","2514","2519","2521","2522","2529","2611","2622","2631","2632","2634","2635","2641","2642","2643","2651","2652","2654","2655","2659","3111","3112","3113","3114","3115","3118","3119","3122","3123","3211","3212","3214","3221","3251","3255","3257","3258","3311","3312","3313","3315","3321","3322","3323","3324","3325","3331","3332","3333","3334","3339","3341","3342","3343","3344","3351","3352","3353","3354","3355","3411","3412","3413","3422","3423","3431","3432","3434","3435","3512","3513","3514","3521","4110","4120","4211","4214","4221","4222","4223","4224","4225","4226","4227","4311","4312","4313","4321","4323","4412","4415","4416","4419","5113","5120","5131","5132","5141","5142","5151","5153","5164","5165","5221","5222","5223","5230","5244","5245","5246","5249","5311","5312","5321","5322","5323","5329","5411","5412","5413","5414","5419","6111","6113","6121","6122","7110","7111","7112","7115","7119","7120","7121","7122","7123","7126","7127","7131","7132","7210","7212","7213","7214","7223","7225","7230","7231","7232","7233","7313","7320","7322","7410","7411","7412","7413","7414","7421","7422","7511","7512","7522","7531","8123","8131","8141","8142","8143","8157","8160","8183","8211","8212","8219","8321","8322","8331","8332","8340","8341","8342","8343","8344","9111","9112","9211","9312","9313","9321","9329","9333","9334","9412","9611","9613","9621","9629"],"MahatEducation":["11","12","21","22","31","32","41","42","43","44","51","61","62","63","64","71","81","82"]}/*end*/;
  const INDEX = [['home', '/'], ['Academic', '/Academic'], ['isco_group', '/isco_group'], ['MahatEducation', '/MahatEducation']];
  const CFG = Object.assign({
    origin: 'https://avodata.labor.gov.il',
    workers: 2,            // pages read at the same time
    pollMs: 250,           // how often a page is looked at while it loads
    settleMs: 1500,        // a page counts as loaded when it did not change for this long
    maxWaitMs: 25000,      // the longest wait for one page
    pauseMs: 700,          // a pause after each page (and up to as much again, at random)
    backoffMs: 90000,      // the pause after the site answered "blocked"
    maxBlocks: 4,          // blocks in a row after which the run stops and saves what it has
    bodyCap: 200000,       // the longest answer of the site that is kept whole
    pageBodies: 600000,    // the answers kept whole per page
    replays: 20,           // the calls of a page that are asked for again, at most
    textCap: 400000,
    only: null,            // ['Academic/1322', ...]: read just these
  }, window.__AVODATA_CONFIG__);

  if (location.origin !== CFG.origin) { alert('סקריפט האיסוף צריך לרוץ בעמוד של עבודאטה.\nפתחו את ' + CFG.origin + ' והדביקו אותו שם.'); return; }
  if (window.__avodata && window.__avodata.running) { alert('האיסוף כבר רץ בלשונית הזאת.'); return; }

  // ---------- small helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const T = (s) => String(s == null ? '' : s).replace(/[ \t\f\v ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const cap = (s, n) => (s.length > n ? s.slice(0, n) : s);
  const rel = (href, base) => { try { const u = new URL(href, base); return u.origin === CFG.origin ? u.pathname + u.search + u.hash : u.href; } catch (e) { return String(href); } };
  const abs = (href, base) => { try { return new URL(href, base).href; } catch (e) { return String(href); } };
  /** a value reduced to plain data (no nodes, no functions, no cycles): the data of a chart, the state of the page */
  const plain = (v, depth, seen) => {
    if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') return cap(v, 500);
    if (typeof v !== 'object' || depth > 4 || seen.has(v) || v.nodeType) return undefined;
    seen.add(v);
    if (Array.isArray(v)) return v.slice(0, 300).map((x) => { const p = plain(x, depth + 1, seen); return p === undefined ? null : p; });
    const o = {}; let n = 0;
    for (const k of Object.keys(v)) { if (++n > 60) break; if (k[0] === '_' && k !== '__data__') continue; const p = plain(v[k], depth + 1, seen); if (p !== undefined) o[k] = p; }
    return o;
  };
  const el = (tag, css, text, parent) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };

  // ---------- the box on the page (built with the DOM, never with HTML strings: the site may forbid both) ----------
  const box = el('div', 'position:fixed;z-index:2147483647;top:12px;left:12px;width:350px;max-height:80vh;overflow:auto;padding:12px 14px;background:#fff;color:#111;border:2px solid #0a7;border-radius:10px;font:14px/1.5 system-ui,Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.3);direction:rtl;text-align:right');
  box.setAttribute('dir', 'rtl');
  el('b', 'display:block;margin-bottom:4px', 'איסוף נתונים מעבודאטה', box);
  const msg = el('div', '', 'מתחילים…', box);
  const bar = el('progress', 'width:100%;height:12px;margin:6px 0', null, box); bar.max = 1; bar.value = 0;
  const sub = el('div', 'font-size:12px;color:#444;word-break:break-word', '', box);
  el('div', 'font-size:12px;color:#444;margin-top:6px', 'משאירים את הלשונית הזאת פתוחה ובחזית עד הסוף.', box);
  const row = el('div', 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap', '', box);
  const button = (label, fn) => { const b = el('button', 'padding:4px 10px;border:1px solid #888;border-radius:6px;background:#f4f4f4;color:#111;cursor:pointer;font:inherit', label, row); b.addEventListener('click', fn); return b; };
  document.documentElement.appendChild(box);

  // ---------- the browser's storage: a run that was cut resumes from the pages that were saved ----------
  const store = (() => {
    let db = null;
    const open = () => new Promise((res) => { try { const r = indexedDB.open('avodata-collector', 1); r.onupgradeneeded = () => r.result.createObjectStore('pages'); r.onsuccess = () => { db = r.result; res(true); }; r.onerror = r.onblocked = () => res(false); } catch (e) { res(false); } });
    const tx = (mode, fn) => new Promise((res) => { if (!db) return res(null); try { const t = db.transaction('pages', mode), out = fn(t.objectStore('pages')); t.oncomplete = () => res(out ? out.result : true); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } });
    return { open, all: () => tx('readonly', (s) => s.getAll()), put: (k, v) => tx('readwrite', (s) => { s.put(v, k); }), clear: () => tx('readwrite', (s) => { s.clear(); }) };
  })();

  // ---------- the pages: the home page and the lists first, then one page of each kind (to see that what is read is not empty), then the rest ----------
  const jobs = INDEX.map(([id, path]) => ({ key: 'Index/' + id, kind: 'Index', id, path }));
  for (const k of Object.keys(TARGETS)) for (const id of TARGETS[k]) jobs.push({ key: k + '/' + id, kind: k, id: String(id), path: '/' + k + '/' + id });
  const prefer = { Academic: '1322', isco_group: '2512', MahatEducation: '21' };
  const sample = Object.keys(TARGETS).map((k) => jobs.find((x) => x.kind === k && x.id === prefer[k]) || jobs.find((x) => x.kind === k)).filter(Boolean);
  const first = [jobs[0]].concat(sample);
  const ordered = first.concat(jobs.filter((j) => !first.includes(j)));
  const wanted = CFG.only ? ordered.filter((j) => CFG.only.includes(j.key)) : ordered;

  const run = window.__avodata = { running: true, stopped: false, results: new Map(), jobs: wanted, blocks: 0, mode: 'frame', popup: null, started: new Date().toISOString() };
  run.stop = () => { run.stopped = true; };

  // ---------- reading one page ----------
  const BLOCK = /access denied|request blocked|the request could not be satisfied|error 403|403 forbidden|too many requests|error 429|גישה נדחתה|הגישה נחסמה|הבקשה נחסמה/i;
  const BUSY = '[aria-busy="true"],.spinner,.loading,.loader,mat-spinner,mat-progress-spinner,.mat-progress-spinner,.mat-mdc-progress-spinner,.MuiCircularProgress-root,.ant-spin-spinning';
  const SKIP = /\.(js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|eot|mp4|webm|pdf)(\?|$)/i;

  /** a hook on what the page asks its servers for: the request (method, body) and the answer, as the page received it */
  function hook(w, log, st) {
    if (!w || w.__avHooked) return;
    try {
      w.__avHooked = true;
      try { w.performance.setResourceTimingBufferSize(3000); } catch (e) { /* the default holds 250 */ }
      try { w.alert = () => {}; w.confirm = () => false; w.prompt = () => null; w.open = () => null; } catch (e) { /* a dialog of the page would stop this script */ }
      const note = (u, m, b, s, t) => {
        if (log.length >= 150) return;
        const whole = st.bytes + t.length <= CFG.pageBodies;
        if (whole) st.bytes += t.length;
        log.push({ u: abs(u, w.location.href), m, b: b ? cap(b, 4000) : undefined, s, n: t.length, r: whole ? cap(t, CFG.bodyCap) : cap(t, 1500) });
      };
      const of = w.fetch;
      if (typeof of === 'function') {
        w.fetch = function (input, init) {
          const p = of.apply(this, arguments);
          st.pending++; p.then(() => { st.pending--; }, () => { st.pending--; });
          try {
            const u = typeof input === 'string' ? input : (input && input.url) || String(input);
            const m = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
            const b = init && typeof init.body === 'string' ? init.body : undefined;
            p.then((r) => r.clone().text().then((t) => note(u, m, b, r.status, t))).catch(() => {});
          } catch (e) { /* the page must not feel it */ }
          return p;
        };
      }
      const P = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
      if (P) {
        const open = P.open, send = P.send;
        P.open = function (m, u) { this.__av = { m: String(m).toUpperCase(), u: String(u) }; return open.apply(this, arguments); };
        P.send = function (body) {
          const meta = this.__av;
          if (meta) st.pending++;
          if (meta) this.addEventListener('loadend', () => {
            st.pending--;
            try {
              const t = this.responseType === '' || this.responseType === 'text' ? this.responseText : JSON.stringify(this.response);
              note(meta.u, meta.m, typeof body === 'string' ? body : undefined, this.status, typeof t === 'string' ? t : '');
            } catch (e) { /* binary answers are not kept */ }
          });
          return send.apply(this, arguments);
        };
      }
    } catch (e) { w.__avHooked = false; }
  }

  let popupBusy = false;
  /** opens the page in a hidden frame of this site (or, where the site does not allow frames, in the work window that the person opened) */
  async function open(url, log, st) {
    if (run.mode === 'popup') {
      while (popupBusy) await sleep(50);
      popupBusy = true;
      const w = run.popup;
      try {
        if (!w || w.closed) { const e = new Error('popup'); e.frame = true; throw e; }
        const old = w.document;
        w.location.replace(url);
        for (let i = 0; i < 3000 && !run.stopped; i++) { try { if (w.document !== old) { hook(w, log, st); break; } } catch (e) { /* still navigating */ } await sleep(5); }
        return { win: w, doc: w.document, close() { popupBusy = false; } };
      } catch (e) { popupBusy = false; throw e; }
    }
    const fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
    fr.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:1000px;border:0;opacity:.01;pointer-events:none;z-index:-1';
    let loaded = false; fr.addEventListener('load', () => { loaded = true; });
    fr.src = url; document.body.appendChild(fr);
    const t0 = Date.now();
    while (!run.stopped && Date.now() - t0 < 15000) {                       // hook as early as the window allows, before the scripts of the page ask for anything
      try { hook(fr.contentWindow, log, st); const d = fr.contentDocument; if ((loaded || (d && d.readyState !== 'loading')) && d && fr.contentWindow.location.href !== 'about:blank') break; } catch (e) { if (loaded) break; }
      await sleep(3);
    }
    let doc = null; try { doc = fr.contentDocument; if (doc) void doc.body; } catch (e) { doc = null; }
    if (!doc) { fr.remove(); const e = new Error('frame'); e.frame = true; throw e; }
    return { win: fr.contentWindow, doc, close() { fr.remove(); } };
  }

  /** waits until the page stopped changing (its text, its pictures and links) and asks for nothing more of the site's servers */
  async function settle(win, doc, deadline, st) {
    let last = '', since = Date.now(), len = 0;
    const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && win.getComputedStyle(e).visibility !== 'hidden'; };
    while (Date.now() < deadline && !run.stopped) {
      await sleep(CFG.pollMs);
      let sig, busy;
      try {
        len = doc.body ? doc.body.innerText.length : 0;
        sig = [len, doc.querySelectorAll('svg,canvas,img,table,a[href]').length, doc.readyState].join('|');
        busy = st.pending > 0 || Array.from(doc.querySelectorAll(BUSY)).some(shown);
      } catch (e) { return 'unreadable'; }
      if (sig !== last) { last = sig; since = Date.now(); continue; }
      const quiet = Date.now() - since;
      const parsed = doc.readyState === 'complete' || (doc.readyState === 'interactive' && quiet >= CFG.settleMs * 2);       // a file that hangs must not hold the page
      if (parsed && len >= 80 && ((quiet >= CFG.settleMs && !busy) || quiet >= CFG.settleMs * 3)) return 'ok';
    }
    if (run.stopped) return 'stopped';                                         // a page that was cut short is not a page that was read
    return len >= 80 ? 'late' : 'empty';
  }

  /** opens what is folded (accordions, "show more"), a few rounds, so that the text holds what a person who clicked would read */
  async function expand(doc) {
    const clicked = new Set(); let n = 0;
    const MORE = /^(הצג|הצגת|ראו|ראה|טען|טענו|הרחב)\s+(עוד|הכל|הכול|את כל\S*)(\s\S+)?$|^עוד$|^(show|see|load) (more|all)$/i;
    for (let round = 0; round < 5 && n < 30; round++) {
      const before = doc.body.innerText.length, found = [];
      for (const e of doc.querySelectorAll('button,[role="button"],summary,[aria-expanded="false"]')) {
        if (clicked.has(e) || e.disabled || e.closest('a[href],nav,header,footer,[role="navigation"],[role="menu"],[role="listbox"]')) continue;
        const pop = e.getAttribute('aria-haspopup');
        const folded = e.getAttribute('aria-expanded') === 'false' && e.hasAttribute('aria-controls') && (!pop || pop === 'false');
        const closed = e.tagName === 'SUMMARY' && e.parentElement && e.parentElement.tagName === 'DETAILS' && !e.parentElement.open;
        if (folded || closed || MORE.test(T(e.innerText || e.getAttribute('aria-label') || ''))) found.push(e);
      }
      if (!found.length) break;
      for (const e of found.slice(0, 30 - n)) { clicked.add(e); n++; try { e.click(); } catch (x) { /* a thing that cannot be opened */ } await sleep(40); }
      await sleep(300);
      if (doc.body.innerText.length === before && round > 0) break;
    }
    return n;
  }

  /** everything on the page that can hold a figure */
  function capture(win, doc) {
    const q = (s, r) => Array.from((r || doc).querySelectorAll(s));
    const base = doc.baseURI || win.location.href;
    const o = { title: T(doc.title), final: rel(win.location.href, base), text: cap(T(doc.body ? doc.body.innerText : ''), CFG.textCap) };
    const all = q('*');
    const sh = []; for (const e of all) { const r = e.shadowRoot; if (r) { const t = T(Array.from(r.children).map((c) => c.innerText || '').join('\n')); if (t) sh.push(t); } }
    if (sh.length) o.shadow = sh.slice(0, 50);
    o.tables = q('table').slice(0, 40).map((t) => q('tr', t).slice(0, 300).map((r) => q('th,td', r).map((c) => T(c.innerText))));
    o.grids = q('[role="table"],[role="grid"],[role="treegrid"]').slice(0, 40).map((g) => q('[role="row"]', g).slice(0, 300).map((r) => q('[role="columnheader"],[role="rowheader"],[role="cell"],[role="gridcell"]', r).map((c) => T(c.innerText))));
    const seen = new Set(); o.links = [];
    for (const a of q('a[href]')) {
      const h = a.getAttribute('href') || ''; if (!h || /^(#|javascript:|mailto:|tel:)/i.test(h)) continue;
      const k = rel(h, base), t = T(a.innerText || a.getAttribute('aria-label') || ''), key = k + '\u0000' + t;
      if (!seen.has(key) && o.links.length < 800) { seen.add(key); o.links.push([k, t]); }
    }
    const ar = new Set(); o.aria = [];
    for (const e of q('[aria-label],[aria-valuetext],[aria-description]')) for (const k of ['aria-label', 'aria-valuetext', 'aria-description']) {
      const v = e.getAttribute(k); if (!v) continue;
      const key = e.tagName + '|' + k + '|' + v;
      if (!ar.has(key) && o.aria.length < 800) { ar.add(key); o.aria.push([e.tagName.toLowerCase(), k.slice(5), T(cap(v, 400))]); }
    }
    o.meters = q('[role="progressbar"],[role="meter"],[role="slider"],progress,meter').slice(0, 100).map((e) => ({ tag: e.tagName.toLowerCase(), now: e.getAttribute('aria-valuenow') || e.getAttribute('value') || e.value, min: e.getAttribute('aria-valuemin'), max: e.getAttribute('aria-valuemax') || e.getAttribute('max'), text: e.getAttribute('aria-valuetext'), label: e.getAttribute('aria-label'), near: T(cap((e.parentElement ? e.parentElement.innerText : '') || '', 160)) }));
    o.titles = q('[title]').slice(0, 400).map((e) => [e.tagName.toLowerCase(), T(cap(e.getAttribute('title') || '', 200))]).filter((x) => x[1]);
    o.svg = q('svg text,svg title,svg desc').slice(0, 1500).map((e) => T(e.textContent)).filter(Boolean);
    const d3 = [], d3seen = new Set();
    for (const e of q('svg *')) { if (d3.length >= 600) break; let d; try { d = e.__data__; } catch (x) { d = undefined; } if (d === undefined || d === null) continue; const p = plain(d, 0, new Set()); if (p === undefined) continue; const s = JSON.stringify(p); if (!d3seen.has(s)) { d3seen.add(s); d3.push(p); } }
    if (d3.length) o.d3 = d3;
    const ch = [];
    try { if (win.Highcharts && win.Highcharts.charts) for (const c of win.Highcharts.charts) if (c) ch.push({ lib: 'highcharts', title: c.title && c.title.textStr, cats: plain(c.xAxis && c.xAxis[0] && c.xAxis[0].categories, 0, new Set()), series: (c.series || []).map((s) => ({ name: s.name, type: s.type, data: plain(s.options && s.options.data, 0, new Set()), points: (s.points || []).slice(0, 200).map((p) => ({ name: p.name, x: p.x, y: p.y, category: p.category })) })) }); } catch (e) { /* not this library */ }
    try { if (win.Chart && win.Chart.instances) for (const c of Object.values(win.Chart.instances)) ch.push({ lib: 'chartjs', type: c.config && c.config.type, labels: plain(c.data && c.data.labels, 0, new Set()), sets: ((c.data && c.data.datasets) || []).map((d) => ({ label: d.label, data: plain(d.data, 0, new Set()) })) }); } catch (e) { /* not this library */ }
    try { if (win.echarts) for (const e of q('[_echarts_instance_]')) { const i = win.echarts.getInstanceByDom(e); if (i) ch.push({ lib: 'echarts', option: plain(i.getOption(), 0, new Set()) }); } } catch (e) { /* not this library */ }
    try { for (const e of q('.js-plotly-plot')) ch.push({ lib: 'plotly', data: plain(e.data, 0, new Set()), layout: plain(e.layout && e.layout.title, 0, new Set()) }); } catch (e) { /* not this library */ }
    try { if (win.Apex && win.Apex._chartInstances) for (const c of win.Apex._chartInstances) ch.push({ lib: 'apexcharts', series: plain(c.chart.w.config.series, 0, new Set()), labels: plain(c.chart.w.globals.labels, 0, new Set()) }); } catch (e) { /* not this library */ }
    if (ch.length) o.charts = ch;
    const state = {};
    for (const k of ['__NEXT_DATA__', '__NUXT__', '__INITIAL_STATE__', '__PRELOADED_STATE__', '__APOLLO_STATE__', '__REDUX_STATE__', 'APP_DATA', 'initialData', 'pageData']) { try { if (win[k] !== undefined) state[k] = plain(win[k], 0, new Set()); } catch (e) { /* not readable */ } }
    if (Object.keys(state).length) o.state = state;
    const sc = q('script[type="application/json"],script[type="application/ld+json"]').map((s) => cap(s.textContent || '', 200000)).filter(Boolean);
    if (sc.length) o.scripts = sc.slice(0, 20);
    o.controls = q('[role="tab"],[role="radio"],[role="switch"],button[aria-pressed],select').slice(0, 80).map((e) => e.tagName === 'SELECT' ? { tag: 'select', label: e.getAttribute('aria-label') || '', options: Array.from(e.options).slice(0, 100).map((x) => [x.value, T(x.text)]) } : { tag: e.getAttribute('role') || e.tagName.toLowerCase(), text: T(cap(e.innerText || e.getAttribute('aria-label') || '', 80)), on: e.getAttribute('aria-selected') || e.getAttribute('aria-checked') || e.getAttribute('aria-pressed') });
    o.elements = all.length;
    o.res = [];
    try { for (const e of win.performance.getEntriesByType('resource')) if (/^(fetch|xmlhttprequest)$/.test(e.initiatorType) && o.res.length < 150) o.res.push({ u: e.name, t: e.initiatorType, s: e.responseStatus, b: e.encodedBodySize }); } catch (e) { /* no timing */ }
    return o;
  }

  /** asks again, from here, for the calls of the page that the hook did not see (only plain GET calls can be repeated) */
  async function replay(rec, log, st) {
    const seen = new Set(log.map((x) => x.u)); let n = 0;
    for (const r of rec.res) {
      if (n >= CFG.replays || seen.has(r.u) || SKIP.test(r.u)) continue; seen.add(r.u);
      let u; try { u = new URL(r.u); } catch (e) { continue; }
      if (u.origin !== CFG.origin) continue;
      n++;
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
        const resp = await fetch(r.u, { credentials: 'include', signal: ctl.signal }); clearTimeout(t);
        const text = await resp.text(), whole = st.bytes + text.length <= CFG.pageBodies; if (whole) st.bytes += text.length;
        log.push({ u: r.u, m: 'GET', s: resp.status, n: text.length, r: whole ? cap(text, CFG.bodyCap) : cap(text, 1500), replay: true });
      } catch (e) { log.push({ u: r.u, m: 'GET', s: 0, err: String(e), replay: true }); }
    }
  }

  async function readPage(job) {
    const url = CFG.origin + job.path, t0 = Date.now(), log = [], st = { bytes: 0, pending: 0 };
    const rec = { key: job.key, kind: job.kind, id: job.id, url, at: new Date().toISOString() };
    let h;
    try { h = await open(url, log, st); } catch (e) { if (e.frame) throw e; return Object.assign(rec, { status: 'error', err: String(e), ms: Date.now() - t0 }); }
    try {
      let status = await settle(h.win, h.doc, Date.now() + CFG.maxWaitMs, st);
      if (status === 'unreadable' || status === 'stopped') return Object.assign(rec, { status, ms: Date.now() - t0 });
      const folded = await expand(h.doc);
      if (folded) await settle(h.win, h.doc, Date.now() + 8000, st);
      const H = Math.min(h.doc.documentElement.scrollHeight || 0, 12000);       // down the page and back: what loads when it comes into view
      for (let y = 0; y < H; y += 800) { h.win.scrollTo(0, y); await sleep(80); }
      h.win.scrollTo(0, 0); await sleep(CFG.pollMs);
      Object.assign(rec, capture(h.win, h.doc));
      await replay(rec, log, st);
      rec.net = log; rec.folded = folded;
      if ((rec.text.length < 1500 && BLOCK.test(rec.text)) || /^(403|429)\b/.test(rec.title)) status = 'blocked';
      else if (rec.text.length < 80) status = 'empty';
      return Object.assign(rec, { status, ms: Date.now() - t0 });
    } catch (e) {
      return Object.assign(rec, { status: 'error', err: String((e && e.message) || e), ms: Date.now() - t0 });
    } finally { h.close(); }
  }

  // ---------- the file ----------
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function deflateRaw(bytes) { const cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter(); w.write(bytes); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
  /** a zip file of [name, text] pairs (deflated where the browser can, otherwise stored) */
  async function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [], now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    let off = 0;
    for (const [name, text] of files) {
      const nm = enc.encode(name), raw = enc.encode(text), crc = crc32(raw);
      let data = raw, method = 0;
      if (typeof CompressionStream === 'function') { try { const d = await deflateRaw(raw); if (d.length < raw.length) { data = d; method = 8; } } catch (e) { /* stored */ } }
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(lh.buffer), nm, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + data.length;
    }
    const size = central.reduce((n, p) => n + p.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }
  /** the run as files: one per page, the answers that several pages share kept once, and a summary */
  async function pack() {
    const shared = new Map(), files = [], status = {};
    for (const r of run.results.values()) {
      status[r.status] = (status[r.status] || 0) + 1;
      const copy = Object.assign({}, r);
      if (r.net) copy.net = r.net.map((x) => {
        if (typeof x.r !== 'string' || x.r.length < 3000) return x;
        const k = x.m + ' ' + x.u + '\u0000' + x.r; if (!shared.has(k)) shared.set(k, { id: shared.size + 1, u: x.u, m: x.m, s: x.s, r: x.r });
        return Object.assign({}, x, { r: undefined, ref: shared.get(k).id });
      });
      files.push(['pages/' + r.kind + '-' + r.id + '.json', JSON.stringify(copy)]);
    }
    files.push(['shared.json', JSON.stringify(Array.from(shared.values()))]);
    files.unshift(['meta.json', JSON.stringify({ collector: 'avodata-collect.console.js', origin: CFG.origin, started: run.started, finished: new Date().toISOString(), agent: navigator.userAgent, config: CFG, status, pages: run.results.size, planned: wanted.length, stopped: run.stopped, why: run.why || null, mode: run.mode })]);
    return zip(files);
  }
  let blob = null, name = '';
  const stamp = () => 'avodata-dump-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.zip';
  function save() {
    if (!blob) return;
    const a = el('a', 'display:none', null, document.body); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 120000);
  }
  run.download = save;
  run.clear = async () => { await store.clear(); box.remove(); };

  // ---------- the run ----------
  const done = () => wanted.filter((j) => run.results.has(j.key) && run.results.get(j.key).status !== 'blocked').length;
  const show = (m, s) => { if (m != null) msg.textContent = m; if (s != null) sub.textContent = s; bar.value = wanted.length ? done() / wanted.length : 0; };
  window.addEventListener('beforeunload', (e) => { if (run.running) { e.preventDefault(); e.returnValue = ''; } });
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* the screen may sleep */ }

  if (await store.open()) { for (const r of (await store.all()) || []) if (r && r.key && wanted.some((j) => j.key === r.key) && ['ok', 'late'].includes(r.status)) run.results.set(r.key, r); }
  const resumed = run.results.size, started = Date.now();
  const queue = wanted.filter((j) => !run.results.has(j.key));
  const tries = new Map();
  let paused = 0, inFlight = 0, sampled = false;
  show(resumed ? 'ממשיכים מהריצה הקודמת: ' + resumed + ' דפים כבר נשמרו' : 'מתחילים…', 'דפים לקריאה: ' + queue.length);
  button('עצירה ושמירה', () => { run.stop(); show('עוצרים ושומרים את מה שנאסף…'); });

  async function needWindow() {
    run.mode = 'wait';
    show('הדפדפן לא מאפשר לקרוא את הדפים בתוך חלון מוסתר', 'לחצו על הכפתור כדי לפתוח חלון עבודה. אל תסגרו אותו עד הסוף.');
    await new Promise((res) => {
      const b = button('פתיחת חלון עבודה', () => {
        run.popup = window.open(CFG.origin + '/', 'avodata_collector', 'popup,width=1200,height=900,left=0,top=0');
        if (run.popup) { run.mode = 'popup'; b.remove(); res(); } else show('הדפדפן חסם את החלון', 'אשרו חלונות קופצים לאתר הזה ולחצו שוב.');
      });
    });
  }

  /** the first pages must not all be empty or the same page: then the long run would only collect nothing */
  function sampleOk() {
    const got = (j) => run.results.get(j.key);
    const home = got(first[0]);
    const real = sample.filter((j) => got(j) && ['ok', 'late'].includes(got(j).status) && (got(j).text || '').length >= 200 && (!home || got(j).text !== home.text));
    return real.length > 0;
  }

  async function worker() {
    while (!run.stopped) {
      if (run.mode === 'wait' || Date.now() < paused) { await sleep(500); continue; }
      const job = queue.shift();
      if (!job) { if (inFlight === 0) return; await sleep(300); continue; }
      inFlight++;
      let rec;
      try { rec = await readPage(job); } catch (e) {
        inFlight--;
        if (e.frame) { queue.unshift(job); if (run.mode !== 'wait') await needWindow(); } else run.results.set(job.key, { key: job.key, kind: job.kind, id: job.id, status: 'error', err: String(e) });
        continue;
      }
      inFlight--;
      if (rec.status === 'stopped') return;
      if (rec.status === 'blocked') {
        run.blocks++; tries.set(job.key, (tries.get(job.key) || 0) + 1);
        if (run.blocks >= CFG.maxBlocks) { run.stopped = true; run.why = 'blocked'; return; }
        if (tries.get(job.key) < 3) queue.push(job); else run.results.set(job.key, rec);
        paused = Date.now() + CFG.backoffMs;
        for (let s = Math.ceil(CFG.backoffMs / 1000); s > 0 && !run.stopped; s--) { show('האתר ביקש להאט. ממתינים ' + s + ' שניות', 'חסימות ברצף: ' + run.blocks + ' מתוך ' + CFG.maxBlocks); await sleep(1000); }
        continue;
      }
      run.blocks = 0;
      run.results.set(job.key, rec);
      await store.put(job.key, rec);
      const n = run.results.size - resumed, left = Math.max(0, Math.round(((Date.now() - started) / Math.max(1, n)) * queue.length / 60000));
      show('נאספו ' + done() + ' מתוך ' + wanted.length + ' דפים', 'הדף האחרון: ' + job.key + ' (' + rec.status + ', ' + (rec.text ? rec.text.length : 0) + ' תווים). זמן משוער לסיום: ' + left + ' דקות');
      if (!sampled && first.every((j) => run.results.has(j.key))) {
        sampled = true;
        if (!sampleOk() && sample.length) { run.stopped = true; run.why = 'empty'; return; }
      }
      await sleep(CFG.pauseMs * (1 + Math.random()));
    }
  }

  const pool = []; for (let i = 0; i < CFG.workers; i++) pool.push(worker());
  await Promise.all(pool);
  // a page that did not come out whole gets one more try, alone
  if (!run.stopped) for (const j of wanted) {
    const r = run.results.get(j.key);
    if (r && !['ok', 'late', 'blocked'].includes(r.status)) {
      show('קוראים שוב: ' + j.key);
      const again = await readPage(j).catch(() => null);
      if (again && ['ok', 'late'].includes(again.status)) { run.results.set(j.key, again); await store.put(j.key, again); }
      await sleep(CFG.pauseMs);
    }
  }

  run.running = false;
  const counts = {}; for (const r of run.results.values()) counts[r.status] = (counts[r.status] || 0) + 1;
  const missing = wanted.filter((j) => !run.results.has(j.key)).length;
  blob = await pack(); name = stamp();
  save();
  const why = run.why === 'blocked' ? 'האתר חסם כמה פעמים ברצף, ולכן עצרנו. מה שנאסף נשמר.' : run.why === 'empty' ? 'הדפים הראשונים חזרו ריקים, ולכן עצרנו. הקובץ מכיל אותם לבדיקה.' : run.stopped ? 'עצרנו לפי בקשה.' : 'הסתיים.';
  show(why + ' נשמר הקובץ ' + name, 'דפים: ' + run.results.size + ' מתוך ' + wanted.length + (missing ? ' (' + missing + ' לא נקראו)' : '') + ' · ' + Object.keys(counts).map((k) => k + ' ' + counts[k]).join(', ') + '. הקובץ בתיקיית ההורדות.');
  while (row.firstChild) row.removeChild(row.firstChild);
  button('הורדה חוזרת', save);
  button('ניקוי וסגירה', () => run.clear());
  console.log('avodata collector:', why, name, counts);
})();
