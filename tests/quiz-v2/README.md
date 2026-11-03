# Tests for the questionnaire v2

The site is a single `index.html`; the tests take the code out of it (between the `/*@@VQ-...@@*/` markers) or run the page in a browser (Playwright).

```bash
node tests/quiz-v2/run.js        # engine: the three personas, invariants, replay and back, simulation of 1,200 users
node tests/quiz-v2/results.js    # scores and results of the three personas, against the document (12.2)
node tests/quiz-v2/gx.js         # the double forms ("אוהב/ת"): every form, man / woman / not said
node tests/quiz-v2/site.js       # degrees and routes (needs the page)
node tests/quiz-v2/ui.js         # the screens: the personas answered through the page at 1280 and 360, keyboard, back, "3 more"; takes about 2 minutes
node tests/quiz-v2/ui.js --shots DIR   # the same, and a screenshot of the main screens in DIR
```
