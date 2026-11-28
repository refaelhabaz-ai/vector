/* WCAG contrast audit of the questionnaire, measured on what the browser really draws (computed styles + screenshot pixels), not on the CSS source.
   Used by contrast-audit.js (the full report) and contrast.js (the regression test in all.js).

   What is swept: every screen type (intro, cards, choice, scale, multi, chips, guess, trans, day) x the whole colour journey
   (the six stops of QS_PAL, and with full:true the five midpoints between them) x the three accents (data-qg) x the states.
   How: the real UI is driven to each screen; the page's own --qb1/--qb2 and data-qg are then set to each point, and for each state the text is made transparent, the
   shadows and outlines are switched off, and the page is photographed. The colour of every text node comes from getComputedStyle, the colour behind it from the pixels
   of the photograph (the worst pixel under the text counts: gradients, decorations and cards are all in the picture).
   Rules: 4.5:1 for normal text, 3:1 for large text (>=24px, or >=18.66px bold) and for icons; 3:1 for the boundary of a component (fill, border or ring, whichever is best),
   for the focus ring (against the page and against the control) and for the primary button against the gradient. A disabled control is exempt in WCAG; here it must still
   reach 3:1 for its text ("visibly disabled but readable"). */
const zlib = require('zlib');

/* ---------- PNG -> pixels (8-bit, non-interlaced, what Chromium writes) ---------- */
function decodePng(buf) {
  let p = 8, w, h, ct, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12] !== 0) throw new Error('unsupported png'); }
    else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!bpp) throw new Error('unsupported png colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride), q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++];
    for (let x = 0; x < stride; x++) {
      const v = raw[q++], a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let r;
      if (f === 0) r = v; else if (f === 1) r = v + a; else if (f === 2) r = v + b; else if (f === 3) r = v + ((a + b) >> 1);
      else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[x] = r & 255;
    }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2]; out[o + 3] = 255; }
    [prev, cur] = [cur, prev];
  }
  return { w, h, d: out };
}

/* ---------- WCAG maths ---------- */
const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
const lum = c => .2126 * lin(c[0]) + .7152 * lin(c[1]) + .0722 * lin(c[2]);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const over = (fg, a, bg) => [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a));            /* fg with alpha a over an opaque bg */
const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/* pixels of a rectangle (clipped to the picture), sampled on a grid so that a big rectangle stays cheap */
function pixels(img, r, step) {
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y)), x1 = Math.min(img.w - 1, Math.ceil(r.x + r.w) - 1), y1 = Math.min(img.h - 1, Math.ceil(r.y + r.h) - 1), out = [];
  step = step || Math.max(1, Math.round(Math.sqrt(Math.max(1, (x1 - x0) * (y1 - y0)) / 400)));
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) { const o = (y * img.w + x) * 4; out.push([img.d[o], img.d[o + 1], img.d[o + 2]]); }
  return out;
}
/* the strip of page just outside a control (3 to 6 px away): what the control's edge touches */
function outer(img, r) {
  const a = 3, b = 6, out = [];
  const add = rr => out.push(...pixels(img, rr, 3));
  add({ x: r.x - b, y: r.y - b, w: r.w + 2 * b, h: b - a }); add({ x: r.x - b, y: r.y + r.h + a, w: r.w + 2 * b, h: b - a });
  add({ x: r.x - b, y: r.y, w: b - a, h: r.h }); add({ x: r.x + r.w + a, y: r.y, w: b - a, h: r.h });
  return out;
}

/* ---------- in the page: what is on the screen ---------- */
const PAGE_COLLECT = () => {
  const num = s => (s.match(/-?[\d.]+/g) || []).map(Number);
  const rgba = s => { const n = num(s); return n.length < 3 ? null : { c: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 }; };
  const visible = e => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { if (n.classList && n.classList.contains('vb-tip')) return false; const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; } return true; };
  const alphaChain = e => { let a = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) a *= +getComputedStyle(n).opacity; return a; };
  const desc = e => { const c = (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3).map(x => '.' + x).join(''); return e.tagName.toLowerCase() + c; };
  const where = e => e.closest('.vq-opts') ? 'options' : e.closest('.vq-gocc,.vq-g') ? 'guess' : e.closest('.vq-day') ? 'day' : e.closest('.vq-qband') ? 'question' : e.closest('.vq-top,.vq-bar,.jr-o,.vq-steps') ? 'progress' : e.closest('.vq-foot') ? 'footer' : e.closest('.qi') ? 'intro' : e.closest('#app') ? 'app' : 'site chrome';
  const R = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const texts = [], comps = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t; (t = walker.nextNode());) {
    const e = t.parentElement, s = t.nodeValue.replace(/\s+/g, ' ').trim();
    if (!s || !e || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(e.tagName) || !visible(e)) continue;
    const rg = document.createRange(); rg.selectNodeContents(t); const rs = [...rg.getClientRects()].filter(r => r.width > 1 && r.height > 1);
    if (!rs.length) continue;
    const cs = getComputedStyle(e), col = rgba(cs.color); if (!col) continue;
    /* skip text that is off the page (a closed panel, a scrolled-away area) */
    const rr = rs[0]; if (rr.right < 0 || rr.bottom < 0 || rr.left > innerWidth || rr.top > document.documentElement.scrollHeight) continue;
    texts.push({ kind: 'text', text: s.slice(0, 28), el: desc(e), where: where(e), rects: rs.map(r => ({ x: r.x, y: r.y, w: r.width, h: r.height })), color: col.c, alpha: col.a * alphaChain(e),
      size: parseFloat(cs.fontSize), weight: +cs.fontWeight || 400, disabled: !!e.closest('[disabled]') });
  }
  /* icons are not judged: each one sits beside the text that says the same thing (decoration); the tick that marks a selection is information and is judged below */
  /* the pseudo-element tick on a selected card: its own colour on its own badge */
  document.querySelectorAll('.vq-sel').forEach(e => {
    const a = getComputedStyle(e, '::after'); if (a.content === 'none' || a.content === 'normal') return;
    const fg = rgba(a.color), bg = rgba(a.backgroundColor); if (!fg) return;
    comps.push({ kind: 'tick', el: desc(e) + '::after', where: where(e), fg: fg.c, bg: bg && bg.a > .5 ? bg.c : null, rect: R(e), w: parseFloat(a.width) || 0 });
  });
  /* controls: option cards, day cards, buttons, back, progress */
  document.querySelectorAll('.vq-o,.vq-day,.btn,.linkbtn,.back,.vq-pg,.vq-pg i,.jr-d,.vq-go,.qi-go,.qi-alt,.chip,.vq-reg').forEach(e => {
    if (!visible(e)) return; const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return;
    const cs = getComputedStyle(e), bg = rgba(cs.backgroundColor), bd = rgba(cs.borderTopColor), ol = rgba(cs.outlineColor);
    const sh = []; (cs.boxShadow || '').replace(/(rgba?\([^)]+\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?/g, (m, c, x, y, b, sp) => { if (+b === 0 && +sp > 0) sh.push({ c: rgba(c), w: +sp }); });
    const bgImg = cs.backgroundImage !== 'none';
    comps.push({ kind: 'control', el: desc(e), where: where(e), text: (e.textContent || '').trim().slice(0, 20), rect: R(e), fill: bg && bg.a > 0 ? bg : null, fillImage: bgImg, border: bd && parseFloat(cs.borderTopWidth) > 0 && bd.a > 0 ? { c: bd.c, a: bd.a, w: parseFloat(cs.borderTopWidth) } : null,
      ring: sh[0] ? { c: sh[0].c.c, a: sh[0].c.a, w: sh[0].w } : null, outline: ol && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? { c: ol.c, w: parseFloat(cs.outlineWidth), off: parseFloat(cs.outlineOffset) || 0 } : null,
      disabled: e.disabled === true || e.getAttribute('aria-disabled') === 'true', sel: e.classList.contains('vq-sel'), focused: document.activeElement === e && e.matches(':focus-visible'), weight: +cs.fontWeight || 400,
      tick: (() => { const a = getComputedStyle(e, '::after'); return a.content !== 'none' && a.content !== 'normal'; })() });
  });
  /* fixed things that can sit on top of the content: the helper bubble, the floating buttons */
  const fixed = [];
  document.querySelectorAll('body *').forEach(e => { const cs = getComputedStyle(e); if (cs.position !== 'fixed' || cs.pointerEvents === 'none' || !visible(e)) return; const r = e.getBoundingClientRect(); if (r.width < 20 || r.height < 20) return;
    if (e.parentElement && getComputedStyle(e.parentElement).position === 'fixed') return; fixed.push({ el: desc(e) + (e.id ? '#' + e.id : ''), rect: R(e) }); });
  const blockers = [...document.querySelectorAll('.vq-o,.vq-go,.vq-day,.vq-qband,.vq-foot,.dq-keys,.qi-go,.qi-alt,[data-vqcont]')].filter(visible).map(e => ({ el: desc(e), rect: R(e) }));
  return { texts, comps, fixed, blockers, doc: { h: document.documentElement.scrollHeight, w: document.documentElement.clientWidth } };
};

/* ---------- judging one photograph ---------- */
function judge(img, data, ctx) {
  const V = [], push = (o) => V.push({ ...ctx, ...o });
  for (const t of data.texts) {
    let worst = 99, wbg = null;
    for (const r of t.rects) for (const px of pixels(img, r, 1)) { const fg = over(t.color, t.alpha, px), c = ratio(fg, px); if (c < worst) { worst = c; wbg = px; } }
    if (!wbg) continue;
    const large = t.kind === 'icon' || t.size >= 24 || (t.size >= 18.66 && t.weight >= 700), need = large ? 3 : 4.5;
    /* disabled text is exempt from WCAG, but must stay readable here (3:1) */
    const req = t.disabled ? 3 : need;
    if (worst < req) push({ type: t.kind === 'icon' ? 'icon' : t.disabled ? 'disabled-text' : 'text', where: t.where, el: t.el, text: t.text, ratio: +worst.toFixed(2), need: req, fg: hex(over(t.color, t.alpha, wbg)), bg: hex(wbg), size: Math.round(t.size) });
  }
  for (const c of data.comps) {
    if (c.kind === 'tick') {
      if (c.bg) { const k = ratio(c.fg, c.bg); if (k < 3) push({ type: 'tick', where: c.where, el: c.el, ratio: +k.toFixed(2), need: 3, fg: hex(c.fg), bg: hex(c.bg) }); }
      continue;
    }
    const r = c.rect, out = outer(img, r); if (!out.length) continue;
    /* boundary: the best of fill, border, ring; judged against the worst pixel of the strip outside */
    const inside = pixels(img, { x: r.x + r.w * .1, y: r.y + r.h * .1, w: r.w * .8, h: r.h * .8 }, 4);
    const cand = [];
    const best = f => { let w = 99; for (const px of out) { const k = ratio(f(px), px); if (k < w) w = k; } return w; };
    if (c.fill) cand.push(['fill', best(px => over(c.fill.c, c.fill.a, px))]);
    if (c.border) cand.push(['border', best(px => over(c.border.c, c.border.a, px))]);
    if (c.ring) cand.push(['ring', best(px => over(c.ring.c, c.ring.a, px))]);
    const boundary = cand.length ? cand.reduce((a, b) => b[1] > a[1] ? b : a) : ['none', 1];
    const isPrimary = /vq-go|qi-go|btn primary|\bbtn\b.*\bxl\b/.test(c.el) || /primary/.test(c.el);
    const cls = /vq-pg$|vq-pg i/.test(c.el) ? 'progress' : /jr-d/.test(c.el) ? 'step' : /\.vq-o|vq-day|chip/.test(c.el) ? 'option' : /vq-reg/.test(c.el) ? 'panel' : /linkbtn|\bback\b/.test(c.el) ? 'link' : 'button';
    /* a plain link has no boundary; a panel is a container, not a control; the track of the progress bar is judged by its fill (below) */
    if (cls !== 'link' && cls !== 'panel' && !(cls === 'progress' && /vq-pg$/.test(c.el))) {
      const need = 3;
      if (boundary[1] < need && !(c.disabled)) push({ type: 'boundary', where: c.where, el: c.el, text: c.text, ratio: +boundary[1].toFixed(2), need, how: boundary[0], primary: isPrimary });
      if (c.disabled && boundary[1] < 1.5) push({ type: 'disabled-invisible', where: c.where, el: c.el, text: c.text, ratio: +boundary[1].toFixed(2), need: 1.5, how: boundary[0] });
    }
    /* the focus ring: against the page it sits on and against the control it surrounds */
    if (c.focused && (c.outline || c.ring)) {
      /* the outermost layer must stand out from the page, the innermost from the control; a one-layer ring has to do both */
      const outerC = c.outline ? c.outline.c : c.ring.c, innerC = c.ring && c.outline ? c.ring.c : (c.outline ? c.outline.c : c.ring.c);
      const ob = best(() => outerC);
      let ki = 99; if (c.fill) for (const px of inside.slice(0, 40)) { const f = over(c.fill.c, c.fill.a, px); ki = Math.min(ki, ratio(innerC, f)); }
      if (ob < 3) push({ type: 'focus-ring-vs-page', where: c.where, el: c.el, text: c.text, ratio: +ob.toFixed(2), need: 3 });
      if (c.fill && ki < 3) push({ type: 'focus-ring-vs-control', where: c.where, el: c.el, text: c.text, ratio: +ki.toFixed(2), need: 3 });
    } else if (c.focused) push({ type: 'focus-ring-missing', where: c.where, el: c.el, text: c.text, ratio: 0, need: 3 });
    /* the fill of the progress bar against its track */
    if (cls === 'progress' && !/vq-pg$/.test(c.el)) { const tr = data.comps.find(x => /vq-pg$/.test(x.el)); if (tr && c.fill && tr.fill) { const k = ratio(c.fill.c, over(tr.fill.c, tr.fill.a, out[0])); if (k < 3) push({ type: 'progress-fill-vs-track', where: c.where, el: c.el, ratio: +k.toFixed(2), need: 3 }); } }
  }
  return V;
}

/* ---------- driving the page ---------- */
/* the photograph is taken with the text, shadows and outlines switched off. The selector is made heavier than any class-based rule of the page (three :not(#id) count as three ids), so that even an !important rule of the page cannot bring them back */
const H = 'html:not(#_a):not(#_b):not(#_c)';
const AUDIT_CSS = `${H} .vb-tip{display:none!important}${H} *,${H} *::before,${H} *::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important;box-shadow:none!important;outline:none!important;transition:none!important;animation:none!important}${H} svg *{stroke:transparent!important}`;
const COLLECT_CSS = '*,*::before,*::after{transition:none!important;animation:none!important}';
const GROUPS = ['a', 'b', 'c'];
const STOPS = [0, .22, .45, .7, .88, 1], MIDS = [.11, .335, .575, .79, .94];

async function sweepScreen(page, screen, o, report) {
  const T0 = Date.now(); if (process.env.CONTRAST_DEBUG) console.log('  sweeping', screen, page.viewportSize().width);
  const pts = o.full ? [...STOPS, ...MIDS].sort((a, b) => a - b) : STOPS;
  const vp = page.viewportSize(), baseH = vp.height;
  await page.addStyleTag({ content: COLLECT_CSS }).catch(() => {});
  const docH = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: vp.width, height: Math.min(4000, Math.max(baseH, docH)) });
  await page.waitForTimeout(150);
  const has = sel => page.evaluate(s => !!document.querySelector(s), sel);
  const primary = '.vq-go,.qi-go,[data-vqcont],[data-vqstart],[data-vqnext],[data-vqres]', first = screen === 'day' ? '.vq-day' : '.vq-o', alt = '.qi-alt';
  const hasOpt = await has(first), hasGo = await has(primary), hasAlt = await has(alt), goDisabledNow = hasGo && await page.evaluate(s => !!document.querySelector(s).disabled, primary);
  /* every state is a function that puts the page in it and returns a label; the same list for every point/accent */
  const states = [['default', async () => {}]];
  if (hasOpt) states.push(['hover-option', async () => { await page.hover(first, { force: true }); await page.waitForTimeout(40); }],
    ['focus-option', async () => { await page.keyboard.press('Shift'); await page.evaluate(s => document.querySelector(s).focus(), first); }],
    ['selected', async () => { await page.evaluate(s => document.querySelectorAll(s).forEach((e, i) => { if (i < 2) { e.classList.add('vq-sel'); e.setAttribute('aria-checked', 'true'); } }), first); }],
    ['selected-focus', async () => { await page.evaluate(s => { const l = document.querySelectorAll(s); l.forEach((e, i) => { if (i < 2) { e.classList.add('vq-sel'); e.setAttribute('aria-checked', 'true'); } }); }, first); await page.keyboard.press('Shift'); await page.evaluate(s => document.querySelector(s).focus(), first); }],
    ['selected-hover', async () => { await page.evaluate(s => document.querySelector(s).classList.add('vq-sel'), first); await page.hover(first, { force: true }); await page.waitForTimeout(40); }]);
  if (hasGo) {
    states.push(['button-enabled', async () => { await page.evaluate(s => document.querySelector(s).removeAttribute('disabled'), primary); }],
      ['button-hover', async () => { await page.evaluate(s => document.querySelector(s).removeAttribute('disabled'), primary); await page.hover(primary, { force: true }); await page.waitForTimeout(40); }],
      ['button-focus', async () => { await page.evaluate(s => document.querySelector(s).removeAttribute('disabled'), primary); await page.keyboard.press('Shift'); await page.evaluate(s => document.querySelector(s).focus(), primary); }],
      ['button-disabled', async () => { await page.evaluate(s => document.querySelector(s).setAttribute('disabled', ''), primary); }]);
  }
  if (hasAlt) states.push(['alt-hover', async () => { await page.hover(alt, { force: true }); await page.waitForTimeout(40); }], ['alt-focus', async () => { await page.keyboard.press('Shift'); await page.evaluate(s => document.querySelector(s).focus(), alt); }]);
  const intro = screen === 'intro';
  for (const g of intro ? ['i'] : GROUPS) for (const p of intro ? [0] : pts) for (const [label, setup] of states) {
    /* selected states are the only ones that read the accent: the other states are measured once per point, on accent a */
    if (!intro && g !== 'a' && !/selected|default/.test(label)) continue;
    /* reset: keyboard focus, hover, classes, disabled flags */
    await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); document.querySelectorAll('.vq-sel').forEach(e => { e.classList.remove('vq-sel'); e.setAttribute('aria-checked', 'false'); }); });
    await page.mouse.move(2, 2);
    await page.evaluate(([g, p, intro, dis, pr]) => { const de = document.documentElement; if (!intro) { de.dataset.qg = g; de.style.setProperty('--qb1', qsCol(p)); de.style.setProperty('--qb2', qsCol(Math.min(1, p + .2))); }
      const b = document.querySelector(pr); if (b) { if (dis) b.setAttribute('disabled', ''); else b.removeAttribute('disabled'); } }, [g, p, intro, goDisabledNow, primary]);
    await setup();
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const data = await page.evaluate(PAGE_COLLECT);
    await page.addStyleTag({ content: AUDIT_CSS }).then(h => h.evaluate(n => n.id = 'aud-css'));
    const png = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
    await page.evaluate(() => { const s = document.getElementById('aud-css'); s && s.remove(); });
    const img = decodePng(png);
    const ctx = { screen, w: vp.width, group: g, point: +p.toFixed(3), state: label };
    report.shots++;
    report.violations.push(...judge(img, data, ctx));
  }
  await page.evaluate(([dis, pr]) => { const b = document.querySelector(pr); if (b) { if (dis) b.setAttribute('disabled', ''); else b.removeAttribute('disabled'); } }, [goDisabledNow, primary]);
  /* clipping by fixed things (the helper bubble, the floating buttons), measured at the real viewport and scrolled to the top and to the bottom */
  await page.setViewportSize(vp); await page.waitForTimeout(250);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
  if (o.tipWait !== 0) await page.waitForSelector('.vb-tip.show', { timeout: o.tipWait == null ? 4000 : o.tipWait }).catch(() => {});   /* the helper's speech bubble opens a second or two after the page */
  for (const at of ['top', 'bottom']) {
    await page.evaluate(a => window.scrollTo(0, a === 'top' ? 0 : document.documentElement.scrollHeight), at); await page.waitForTimeout(120);
    const d = await page.evaluate(PAGE_COLLECT);
    for (const f of d.fixed) for (const b of d.blockers) {
      const ix = Math.min(f.rect.x + f.rect.w, b.rect.x + b.rect.w) - Math.max(f.rect.x, b.rect.x), iy = Math.min(f.rect.y + f.rect.h, b.rect.y + b.rect.h) - Math.max(f.rect.y, b.rect.y);
      if (ix > 4 && iy > 4 && b.rect.y < baseH && b.rect.y + b.rect.h > 0) report.violations.push({ screen, w: vp.width, group: '-', point: '-', state: 'scroll-' + at, type: 'covered-by-fixed', where: 'overlay', el: f.el + ' over ' + b.el, ratio: 0, need: 0, overlapPx: Math.round(ix) + 'x' + Math.round(iy) });
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.CONTRAST_DEBUG) console.log('  done', screen, ((Date.now() - T0) / 1000).toFixed(1) + 's', 'photos so far', report.shots);
}

/* walk the questionnaire with the real UI and sweep each new screen type once */
async function run(browser, o) {
  o = o || {}; const URL = o.url, report = { violations: [], shots: 0, screens: [] };
  for (const w of o.widths || [390, 1280]) {
    const cx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 }), page = await cx.newPage();
    page.setDefaultTimeout(8000); page.errs = []; page.on('pageerror', e => page.errs.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('kivun3.jrn', JSON.stringify({ p: 1 })); localStorage.setItem('kivun3.seenProf', 'true'); localStorage.setItem('kivun3.jnTip', '1'); localStorage.setItem('kivun3.prof', JSON.stringify({ bag: 'full', psy: 'has', heb: 'he', reg: 'c', stage: 'g12' })); localStorage.setItem('kivun3.scores', JSON.stringify({ b: 92, p: 640 })); } catch (e) {} });
    await page.goto(URL + '#dir'); await page.waitForTimeout(800);
    if (o.pal || o.css) await page.evaluate(([pal, css]) => { if (pal) { QS_PAL.length = 0; pal.forEach(x => QS_PAL.push(x)); } if (css) { const st = document.createElement('style'); st.id = 'proto'; st.textContent = css; document.head.appendChild(st); } }, [o.pal || null, o.css || null]);
    const seen = new Set(), want = o.only || null;
    for (let i = 0; i < 70; i++) {
      const info = await page.evaluate(() => { const de = document.documentElement; const o = document.querySelector('.vq-opts'); return { qs: de.dataset.qs, fmt: o ? (o.className.split(/\s+/)[1] || '') : '', done: !!document.querySelector('.vq-res,.dres-hero') }; });
      const screen = info.qs === 'intro' ? 'intro' : info.qs === 'trans' ? 'trans' : info.qs === 'day' ? 'day' : info.qs === 'guess' ? 'guess' : info.fmt;
      if (screen && info.qs && !seen.has(screen) && (!want || want.includes(screen))) { seen.add(screen); report.screens.push(w + ':' + screen); await sweepScreen(page, screen, o, report); }
      if (info.done || !info.qs) break;
      const adv = await page.evaluate(() => { const c = document.querySelector('[data-vqstart],[data-vqcont],[data-vqresume]'); if (c) { c.click(); return 'c'; }
        const x = document.querySelector('.vq-o:not(.vq-sel),.vq-day'); if (x) x.click(); const nx = document.querySelector('[data-vqnext]:not([disabled]),[data-vqres]'); if (nx) { nx.click(); return 'n'; } return x ? 'o' : '-'; });
      await page.waitForTimeout(adv === '-' ? 100 : 420);
      if (adv === '-' && i > 60) break;
    }
    if (page.errs.length) report.violations.push({ screen: '-', w, type: 'page-error', el: page.errs[0].slice(0, 120), ratio: 0, need: 0 });
    await cx.close();
  }
  return report;
}
module.exports = { run, judge, decodePng, ratio, STOPS, MIDS };
