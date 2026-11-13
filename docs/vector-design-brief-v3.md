# Vector — Design Brief v3 ("white, premium, alive")

This brief **replaces** the visual direction in `docs/vector-redesign-prompt-v2.md` (in the repo the earlier brief is saved as `docs/vector-redesign-prompt.md`). Working rules from the original brief still apply: one PR per phase, before/after screenshots at 1440 and 390, CSP hash after JS edits, Hebrew RTL, WCAG AA, never invent people/quotes/stories/stats, don't change data or scoring, don't merge until I approve.

## 0. Install design skills first

Before designing, install these as **project skills** (so they are committed in `.claude/skills/` and every future session uses them):

1. Anthropic's official **frontend-design** skill (`npx -y skills add anthropics/claude-plugins-official --skill frontend-design --agent claude-code`)
2. A **Refactoring UI** skill (`npx -y skills add wondelai/skills --skill refactoring-ui --agent claude-code`)

If installation fails, tell me and continue using the rules in this brief. Read both skills fully before Step 1. Where a skill conflicts with this brief, **this brief wins** (e.g. the skill may push for dark themes or unusual layouts; Vector stays white and clear).

## 1. The feeling

Vector is for anxious 16–22-year-olds deciding their future. The site must feel:

- **Clear and premium**, like the best university and product sites: calm white space, confident type, nothing cluttered.
- **Warm and fun**, like the best consumer apps: color, a mascot with personality, small delightful moments.

Test: in 5 seconds a visitor should know what to do next AND want to stay.

## 2. What I love (keep and build around)

- **The macaw palette** — the colors of Vekti the scarlet macaw, which already appear in the home "worlds" cards: blue (degrees), orange-red (professions), green (technicians), yellow (forum). These four colors are Vector's identity.
- **The home world cards**: light tinted card, strong colored icon tile, bold title, colored count line, and a solid colored bottom edge. Keep this card design and make it the signature component.
- **Vekti** the macaw.
- **Clarity** from the explorations: one idea per section, thin dividers, degree page that reads like an article with short chapters and a sticky chapter nav.

## 3. What I hate (never do)

- **Cream / beige / yellowish page backgrounds** and any colored wash over the whole page. They look dirty.
- Everything inside rounded boxes with shadows (the "AI look").
- Gradient washes, glows, purple, emoji icons, left-border accent cards.
- Walls of numbers at the top of a page.
- Things that pop up, cover content, or take over the screen.

## 4. Design rules

### Color: "white canvas, macaw accents"
- Page background: pure `#FFFFFF`. Surfaces that need separation: `#F7F8FA` (cool neutral), max 1–2 bands per page.
- Ratio ~ **70% white, 20% navy text/neutrals, 10% macaw colors**. Color comes from content (world cards, illustrations, photos, Vekti, highlights), never from page backgrounds.
- Macaw palette, each as a 50–900 shade scale built in HSL (Refactoring UI method): blue `#1D4FC4`, orange-red `#C2410C`, green `#0B7F41`, yellow `#F2B91F`. Tints (50–100) are allowed only inside world cards, tags and small highlights.
- Primary action = orange-red. Links/secondary emphasis = blue. Text = navy `#1B2142` with tinted navy-greys for secondary text (never pure grey, never pure black).
- Each world keeps its color across the site (tags, icons, section headers of that world), so color also means "where am I".
- Signature motif: the 4 macaw colors together, used sparingly (e.g. the thin 4-color line under the header, a progress bar, the results celebration).
- AA contrast for every text/background pair. Yellow is never used for text on white.

### Typography
- Avoid generic AI defaults (Arial, Inter, Roboto, system fonts). Hebrew pairing: a friendly, bold display face for headlines + a highly readable body face. Prototype 2 pairings (e.g. Rubik 700–800 + Heebo, and Secular One + Heebo) and let me pick.
- Type scale (6–7 steps), body 18px / 1.6, text column ≤ 65 characters (~576px).
- Hierarchy through weight and color first, size second. A highlighted word in a headline may be orange or blue.

### Layout and spacing
- 8px spacing scale (4, 8, 12, 16, 24, 32, 48, 64, 96, 128). Start with too much space, then remove.
- One idea per section. Group related things tightly, separate groups generously.
- Boxes/cards only for things you click (world cards, degree cards, answers). Static content sits on white with thin dividers.
- Radii: 12px for cards, fully rounded for buttons and tags. No other values.
- Shadows: none on static content; one soft shadow for hover lift and floating layers.
- Design in grayscale first; if the hierarchy doesn't work in grayscale, fix spacing/weight, not color.

### Imagery and illustration
- Real photography in heroes (free-license, credit in a code comment) or clearly marked placeholders for me. No invented people.
- The site's existing world icons and illustrations, plus Vekti, give the playful layer. Keep illustration style consistent.

### Vekti (the mascot)
- Appears at meaningful moments only: home hero greeting, questionnaire (a short reaction every 3–4 questions, derived from real answers), results celebration, empty states, errors.
- Small, friendly, never covers content, never a long tour.

### Motion
- One well-orchestrated page load with staggered reveals is better than many scattered effects.
- Hover: world/degree cards lift 2–4px; buttons have a satisfying press (translateY 1px).
- Scroll: sections fade/slide in gently (once).
- Questionnaire: smooth progress fill; results: a short macaw-colors celebration.
- 150–300ms, ease-out. CSS-first, no heavy libraries. Everything off under `prefers-reduced-motion`.

### Copy
- Warm, short Hebrew for a 17-year-old ("יאללה", "לא בטוח? זה בסדר"). Playful in headings and microcopy, never on top of facts.

## 5. Quality checklist (score each 0–10 before showing me; fix anything under 8)

1. **5-second test**: is the main action obvious?
2. **Squint test**: does the hierarchy hold when blurred?
3. **Grayscale test**: does it still work without color?
4. **Logo test**: remove the logo — is it still recognizably Vector (macaw colors, world cards, Vekti)?
5. **White test**: no colored or cream page backgrounds anywhere.
6. **Box test**: only clickable things are boxed.
7. **Delight test**: each page has at least one moment of charm (Vekti, motion, color, copy).
8. **Mobile test** at 390px: nothing covers content, tap targets ≥ 44px.
9. Accessibility: AA contrast, focus states, keyboard, reduced motion.

Include the scores table in your reply.

## 6. Step 1 — prototypes (do not touch `index.html`)

In `docs/redesign-directions/v3/`, build standalone HTML prototypes with real Vector content:

1. Home page (hero with Vekti + questionnaire CTA + search, the world cards, "how it works", a feed: question of the day, scholarships, stories placeholders)
2. Psychology degree page (hero, sticky chapter nav, chapters: what it is → what you learn → path to psychologist → admission → salary & work → questions → "מאיפה המידע?")
3. One questionnaire question + the results screen

Make **2 variations** of this same direction: **A** = calmer (color concentrated in world cards, Vekti and highlights), **B** = more playful (color bands per world, bigger Vekti moments, more motion). Same structure, different energy.

Send me screenshots of every screen at 1440 and 390, the checklist scores for each variation, and a short description of the motion. Then wait for my choice.

## 7. Step 2 — after I choose

Update `docs/design-system.md` and the Phase 1 tokens accordingly, then build the chosen variation phase by phase (interruptions → degree/profession template → questionnaire → results & map → home, lists, forum). One PR per phase, don't merge until I approve.
