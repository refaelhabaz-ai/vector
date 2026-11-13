# Vector redesign — prompt for Claude Code

You are redesigning the UI/UX of **Vector (וקטור)**, a Hebrew RTL website (repo `refaelhabaz-ai/vector`) that helps Israeli teens and young adults choose a degree, profession, or practical-engineering track. Users arrive confused and anxious ("what do I do with my life?"). The site must feel supportive, light, and fun to read — like a friendly guide, not a database.

The site's data, features, and sources are good. The problem is presentation. **Do not change data, scoring logic, sources, or Supabase/auth behavior** unless a step below explicitly asks for it.

## How to work

1. **Before writing any code**, read the codebase (start with `index.html`, `docs/`, `tools/`) and the audit summary below. Then reply with:
   - the files/components each phase will touch,
   - a design-token proposal (colors, 2 fonts, type scale, radii, spacing, shadows) as a short table,
   - anything in this prompt that conflicts with the code.
   Wait for my approval before Phase 1.
2. Work on a **new branch per phase** and open **one PR per phase**. Never commit to `main`.
3. **Take before/after screenshots** of every screen you change with Playwright at **1440×900** and **390×844**, and attach or describe them in the PR. Check: no element overlaps text or inputs, no horizontal scroll, no console errors.
4. **CSP:** `index.html` has a Content-Security-Policy with a hash of the inline script. After ANY edit to the script, run `node tools/csp-hash.js --write` (see `docs/accounts/README.md`), or the browser will block the site. Verify the site actually runs after each phase.
5. Keep everything Hebrew, `dir="rtl"`, and WCAG 2.1 AA (contrast, focus states, keyboard, `prefers-reduced-motion`).
6. **Never invent people, quotes, testimonials, statistics, or stories** and present them as real. Where new content is needed (e.g., stories feed), build the component with real data that already exists in the site, or with clearly marked placeholders (`TODO: תוכן אמיתי`) for me to fill.
7. Write UI copy in natural, warm Hebrew addressed to a 17-year-old. Short sentences. No jargon without an inline explanation.

## Keep (I like these — build on them, don't remove)

- The large colorful home-page cards (תארים / מקצועות וקריירה / הנדסאים וטכנאים / פורום וקטור).
- The strong orange and the big, bold buttons.
- Vekti (וקטי), the scarlet-macaw mascot — but in small moments, not long tours.
- The path map ("המסלול שלי") as a concept.
- "Question of the day" in the forum.

## Audit summary (what is wrong today)

Measured on the psychology degree page (`#deg-d31`) and other screens:

- **"AI look":** one page has ~70 rounded colored boxes, 15 different border-radius values (2–44px), 45 pill-shaped elements, 39 box-shadows, 22 background colors. Everything is soft, rounded, and shadowed, so nothing stands out.
- **No single visual language:** the primary CTA is red on home, blue in the questionnaire and degree page, orange on profession pages, yellow in the forum. 3 font families (Heebo, Rubik, Secular One) and ~13 font sizes per page.
- **Degree/profession pages open with numbers** (salary, employment %, regional salary chart, psychometric score, institutions, employers) before one sentence explaining what the field is.
- **Reading is hard:** a factual note sits in a red alarm box; "מה לומדים" is a ~500-character paragraph inside a purple quote box with giant quote marks, at ~100–120 characters per line; course names are comma-separated inside the paragraph; source lines and yellow "לא אומת, בדקו באתר" chips are scattered through the body; each tab (overview / salary / FAQ) uses a different visual style. The overview tab ends after two blocks with empty space.
- **Interruptions:** an automatic Vekti tour dims the home page on first visit (on mobile the parrot covers the headline); a "הפרופיל שלי" modal pops up when entering a degree page; on mobile the degree page has up to 6 fixed/floating elements (header, tabs, 3-button bottom bar, accessibility button, back-to-top, Vekti bubble); the Vekti bubble covers the home search input on mobile; on desktop the floating "שאלות ותשובות" pill overlaps the "שאלות נפוצות" tab.
- **Questionnaire:** three progress indicators on one screen ("עוד כ-10 שאלות", a 4-stage bar, a dotted parrot track + "יוצאים לדרך!"), pushing the question ~280px down on mobile; the selected answer turns solid red (reads as an error); mixed formats (single-choice auto-advances, "up to 2" needs a Continue button); in the "three work days" question, "בשום אופן לא" does nothing and there is no way out when nothing fits; the intro screen is a heading + button with empty space below.
- **Results feel generic:** all three profession cards say "התאמה גבוהה מאוד" with the identical reason text; the map has 11 nodes with tiny text beside a long list of requirements; content barely changes with the user's profile/stage.
- **Home ends quickly** (4 cards, 4 steps, footer); a scholarship banner above the hero competes with the main CTA.
- **Degrees list looks like a phone directory:** 567 text rows, blue underlined titles, no visuals, the same generic description repeated across dozens of teaching degrees.
- **Forum feels like a database:** a visible "מצב בדיקה" (test mode) notice; "hot questions" with 0 answers; the biggest category is "אחר" (194); categories shown as accordion rows with counts.
- **Small text:** several elements at 12px; header has 5 links + "מילוי פרופיל" + "התחברות" + "סיור עם וקטי" + "…".

## Phase 1 — Design system (foundation for everything else)

- **One action color:** the strong orange for every primary button and key link across the whole site. World colors (blue for degrees, green for technicians, etc.) only for tags, icons, and illustrations — never for buttons.
- **Semantic colors only:** red = error, yellow/amber = warning, green = success. Nothing else uses them.
- **Two fonts:** one for headings, one for body (pick two of the three already embedded; drop the third or keep it only for the logo). Remove unused `@font-face` data.
- **Type scale of 6 sizes**, body text 17–18px, line-height ~1.6, minimum 14px anywhere.
- **Two radii:** ~10px for cards/inputs, fully rounded only for buttons and small tags. Remove all other values.
- **Shadows:** none on content blocks; one subtle shadow only for elevated layers (modals, menus, sticky bars).
- **One page background** (white or a single warm off-white) — no pastel gradients that change per page.
- **Reading column:** long text at 560–640px max width (≈50–75 characters per line).
- Implement as CSS custom properties and replace hard-coded values. Add a short `docs/design-system.md`.

## Phase 2 — Remove interruptions

- No automatic tour. Vekti shows at most one small, dismissible tip per screen, once ever (stored in localStorage, wrapped in try/catch).
- No profile modal on entering a degree page. Ask profile questions only where they change the result (e.g., inside "המסלול שלי"), inline.
- Mobile: at most one fixed bottom bar + one floating button; nothing may cover an input or heading. Desktop: nothing floats over tabs or content.
- Header: 4 main links + one account/avatar button that holds the rest. Move the scholarship banner out of the hero.
- Hide the forum "מצב בדיקה" notice from users.

## Phase 3 — Degree & profession page template (one template for all 567 degrees and all professions)

Single scrolling page with a sticky in-page section nav (jump links), instead of tabs that hide content:

1. **Hero:** illustration, degree name, two plain sentences "מה זה בעצם", and 3 light tags (duration, number of institutions, "חם בשוק" if true). Primary actions: "זה היעד שלי", "הוספה להשוואה". No numbers block here.
2. **מה לומדים:** one opening sentence + courses grouped (by year or topic) as a short list. No quote box, no comma-separated walls. Hard terms get an inline tap-to-explain.
3. **איך מתקבלים / איך מגיעים לעבוד בזה:** steps as one simple horizontal (desktop) / vertical (mobile) timeline. Important caveats as a neutral "טוב לדעת" note — not a red box.
4. **שכר וקריירה:** the existing numbers, charts, and table, in the same visual language as the rest of the page.
5. **שאלות נפוצות:** same card style as the rest of the site; one shape per row, not four.
6. **Sources:** one "מאיפה המידע?" toggle at the bottom of the page that reveals all sources and "לא אומת" notes. Remove inline source lines and chips from the body.

Apply the same template to professions (`occ-*`) and practical-engineering tracks (`mh-*`).

## Phase 4 — Questionnaire

- Start directly on the first question (or a centered intro with Vekti + 3 bullets "מה תקבל בסוף").
- **One** progress indicator (Vekti moving along one thin bar). Remove the others.
- Selected answer = orange outline + check icon, not a red fill. Same interaction for every question (prefer single choice with auto-advance; if a question must be multi-select, all such questions behave identically).
- Every question has "אף אחד לא מתאים לי" that loads an alternative set or skips; fix "בשום אופן לא" in the work-days question so it has a visible effect.
- Every 3–4 questions, Vekti says one short line about what it learned so far (derived from the actual answers).
- Keyboard shortcuts stay.

## Phase 5 — Results & path map

- Open results with one personal sentence derived from the user's answers.
- Each recommended card shows **two different reasons** taken from different answers, and a real ranking ("הכי מתאים" / "שווה לבדוק") based on the existing score — not the same label on every card.
- Map: show the **next step** big and clear; collapse the other steps; requirement details move into that step's panel. Content must actually differ by the user's stage (grade 10–12 vs. during/after army service vs. other) using data the site already has. Keep a clear way back to the questionnaire and to "start over".

## Phase 6 — Content that makes people come back

- **Home:** below the cards, a feed of short cards: "תואר שלא הכרת", question of the day from the forum, scholarships (moved from the top banner), and a "סיפורים" slot with placeholders for real stories I will add. No invented content.
- **Degrees list:** a card grid grouped by world (like the home cards), each with the world illustration and a one-line description that is unique per degree (generate from existing data; where only the generic teaching text exists, group teaching degrees into one card with a subject picker).
- **Forum:** a feed with the best answer shown under each question and the answerer's role (e.g., "סטודנטית שנה ב'"); questions with 0 answers are excluded from "hot"; propose a split of "אחר" into real categories (show me the proposal before migrating data).

## Definition of done (check at the end of every phase)

- Count distinct values on the psychology page and the home page: ≤ 3 border-radius values, ≤ 7 font sizes, 2 font families, 1 primary-button color.
- No overlaps at 390px and 1440px; no console errors; CSP hash updated and the site loads.
- Lighthouse accessibility ≥ 95 on home, degree, and questionnaire.
- PR description: what changed, before/after screenshots, anything left for me.

---

## Decisions agreed in review (added after the first review, before Phase 1)

- **Header (Phase 2):** תארים · מקצועות · הנדסאים · פורום, and "המסלול שלי" becomes the orange CTA button in the header.
- **Degree "מה זה בעצם" / courses (Phase 3):** extracted mechanically from the official Avodata `f.desc`; no rewriting and no invented year split. Degrees with no matching field show a neutral "אין תיאור רשמי". Professions use `OC.d`, technician tracks use their own course list (`page.s`).
- **Glossary / tap-to-explain:** deferred (no verified glossary exists).
- **`sp-*` pages** (medical specialties) use the same Phase 3 template.
- **Mobile floating elements (Phase 2):** the accessibility button is the only floating element; Vekti moves into the bottom bar or the header.
- **World colors:** not decided. Phase 1 PR shows two versions of the home page (current world colors vs. a proposed palette) for the owner to pick.
- **Fonts:** not decided. Phase 1 PR shows the psychology page with Secular One headings and with Heebo 700 headings.
- **Forum (Phase 6 / Phase 2):** answers are shown as "צוות וקטור" (no invented answerer roles); the daily questions are excluded from "hot"; the local-only ("מצב בדיקה") note is shown only at the moment of posting, in a friendly tone.
- **Questionnaire (Phase 4):** "אף אחד לא מתאים" maps to the existing skip; "בשום אופן לא" gets clear visual feedback. No scoring changes.
- **Sources (Phase 3):** a short caveat stays next to approximate numbers (e.g. "הנתונים הם של תחום קרוב"); every other source moves to the "מאיפה המידע?" toggle.
- **Branches / PRs:** one branch per phase (`claude/vector-redesign-phase-N`), one PR per phase, and **no merge until the owner approves each phase** (this overrides the "squash-merge at the end of every task" line in `CLAUDE.md` for this redesign).
