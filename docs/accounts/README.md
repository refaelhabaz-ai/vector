# חשבונות משתמש (Supabase)

> מסמך זה יושלם בשלב 4 (איך לראות את הנתונים ב-Supabase, ו-5 שאילתות ניתוח). עד אז: מה כבר יש.

מבנה, החלטות וסיכונים: [`PLAN.md`](PLAN.md). הסכמה: [`../../supabase/schema.sql`](../../supabase/schema.sql).

## בדיקות

```bash
node tests/quiz-v2/all.js          # כל הסוויטה, כולל tests/accounts/stage1.js
node tests/accounts/stage1.js      # רק ההתחברות
node tests/accounts/screens.js     # צילומי מסך של מסכי החשבון (docs/accounts/screens/)
node supabase/tests/run-local.js   # סכמה + RLS על Postgres מקומי (דורש psql ושרת Postgres מקומי; אין בו שום מפתח)
```

הבדיקות האוטומטיות מריצות את `supabase-js` האמיתי מול Supabase **מדומה** (`tests/accounts/mock.js`): בלי רשת, בלי חשבון, בלי מפתחות.

## בדיקה ידנית של Google (אי אפשר לאוטומט)

דורשת חשבון Google שמופיע ברשימת "Test users" באפליקציה בגוגל (כל עוד היא במצב בדיקה).

1. לפתוח את האתר ב-GitHub Pages, ללחוץ "התחברות" בראש הדף.
2. לסמן את תיבת האישור, ללחוץ "התחברות עם Google", לבחור חשבון.
3. לחזור לאתר באותו עמוד, עם שם הפרטי בכותרת. לאשר או לשנות את השם.
4. ב-Supabase: Table Editor > `consents`: שתי שורות (`terms`, `privacy`) למשתמש הזה, עם גרסה.
5. התנתקות והתחברות שוב: לא נוספות שורות, ולא נשאלים שוב.
6. חשבון Google שאינו ברשימת Test users: אמור לקבל "גישה חסומה" מגוגל.
