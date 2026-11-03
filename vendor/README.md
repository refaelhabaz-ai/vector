# vendor/

קבצי צד שלישי שמוטמעים בריפו (לא נטענים משירות חיצוני).

## supabase-js-2.118.0.min.js

- חבילה: `@supabase/supabase-js@2.118.0` (רישיון MIT), הקובץ `dist/umd/supabase.js` מחבילת npm הרשמית, ללא שינוי.
- sha256: `ee3be8de192b97cb1d73d1e95d6b82bb1f6b658c0f97c4ef757fc331996ed3d3`
- SRI (בשימוש ב-`SUPA_CFG.sri` ב-`index.html`): `sha384-TcHRA3zBbn+Lexh5n+Oil4guNPOS3rjNDpGRAN46u/s/mB2IZ50ceC6TYDU2yvgK`
- נטען בעצלנות, רק כשיש חיבור שמור או כשלוחצים "התחברות" (`supaLoad` ב-`index.html`).

### לבדוק שהקובץ זהה לחבילה הרשמית

```bash
cd "$(mktemp -d)" && npm pack @supabase/supabase-js@2.118.0 >/dev/null && tar xzf supabase-supabase-js-2.118.0.tgz \
  && sha256sum package/dist/umd/supabase.js /path/to/repo/vendor/supabase-js-2.118.0.min.js
```

### לעדכן גרסה

1. להוריד גרסה חדשה (עדיפות לגרסה שפורסמה לפחות שבועיים לפני) ולשמור כ-`supabase-js-<גרסה>.min.js`.
2. לחשב SRI: `openssl dgst -sha384 -binary <קובץ> | openssl base64 -A` ולהחליף את `lib` ואת `sri` ב-`SUPA_CFG`.
3. להריץ `node tests/accounts/run.js` ואת `node tests/quiz-v2/all.js`.
