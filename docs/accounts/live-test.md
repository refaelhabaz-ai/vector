# בדיקה על Supabase האמיתי: צעד אחר צעד

המטרה: לוודא על הפרויקט האמיתי ש-(1) התחברות Google וסנכרון עובדים, (2) משתמש לא יכול לקרוא או לכתוב נתונים של משתמש אחר, (3) `delete_my_account` באמת מוחקת את המשתמש מ-`auth.users` ואת כל שורותיו בשרשרת.
**אם משהו נכשל או נראה לא תקין, עוצרים ומדווחים לי (מה עשית, מה ראית, הטקסט המדויק של השגיאה). לא משנים כלום בסכמה או בהגדרות לפני כן.**

משתמשים: **חשבון א'** ו**חשבון ב'**, שני חשבונות Google שנמצאים ברשימת "Test users". מומלץ לעבוד בשני פרופילים נפרדים של Chrome (או חלון רגיל וחלון גלישה בסתר), כדי שיהיו שני "מכשירים" נפרדים.

## 0. הכנה (פעם אחת)

### 0.1 איך מריצים את האתר עם הקוד החדש
הקוד החדש נמצא בענף `accounts-v1` ועדיין לא ב-`main`, ולכן הוא לא עלה לאתר החי. מריצים אותו מקומית:

```bash
git fetch origin accounts-v1
git checkout accounts-v1
python3 -m http.server 8080
```

ופותחים `http://localhost:8080/`.
ב-Supabase: **Authentication > URL Configuration > Redirect URLs** > Add URL: `http://localhost:8080/**` > Save. (אפשר למחוק אותה בסוף הבדיקות.) בגוגל אין מה לשנות: ההפניה של גוגל היא לכתובת של Supabase.

### 0.2 לוודא שהסכמה בנויה נכון
ב-Supabase: **SQL Editor > New query**, מריצים:

```sql
-- א. לכל הטבלאות יש RLS (צריך 6 שורות, rowsecurity = true בכולן)
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;

-- ב. הפונקציות (delete_my_account: prosecdef = true; האחרות false)
select proname, prosecdef from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('delete_my_account','save_quiz','server_time') order by 1;

-- ג. מי רשאי להריץ אותן (anon_can חייב להיות false בכולן, auth_can true)
select proname, has_function_privilege('anon', oid, 'execute') as anon_can,
       has_function_privilege('authenticated', oid, 'execute') as auth_can
from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('delete_my_account','save_quiz','server_time') order by 1;

-- ד. ל-anon אין שום הרשאה על הטבלאות (צריך 0 שורות)
select table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon';
```

## 1. חשבון א': התחברות ופעולות

1. פותחים את האתר (`http://localhost:8080/`). לוחצים **"התחברות"** בראש הדף.
2. מסמנים את תיבת האישור, לוחצים **"התחברות עם Google"**, בוחרים את חשבון א'.
   **לבדוק:** חוזרים לאתר, ובראש הדף מופיע השם הפרטי. נפתח חלון "איך יקראו לי באתר?". לוחצים "שמירה". מופיעה הודעה "התחברת לחשבון".
3. ממלאים כמה דברים:
   - **הפרופיל:** כפתור "הפרופיל שלי": שלב (למשל כיתה י"ב), אזור, סוג תעודה. שומרים.
   - **עמוד המלגות:** עונים על "איך אני מתאר את המצב הכלכלי של המשפחה" (למשל "מתחת לממוצע") ועל "האם להורים יש תואר אקדמי" ועל שאלת השירות. (אלה השדות שאסור שיעלו לשרת.)
   - **תארים:** מוסיפים 3 תארים לרשימה (כפתור "הוספה לרשימה" בעמוד תואר).
   - **ציונים:** מכניסים ציון פסיכומטרי וממוצע בגרות.
   - **טקסט חופשי:** בעמוד "המסלול שלי" כותבים כמה משפטים בסיפור האישי. **לבדוק:** מתחת לתיבה מופיע "נשמר בחשבון שלך ומסונכרן בין המכשירים".
   - **השאלון:** עוברים ל-"מה הכיוון שלי?", עונים על 5 שאלות, ויוצאים (לא מסיימים). אחר כך חוזרים ומסיימים את השאלון, עד מסך התוצאות.
4. מחכים כמה שניות. פותחים את החשבון (השם בראש הדף) ורואים "הנתונים מסונכרנים".
5. **רושמים את המזהים של חשבון א'** ב-DevTools (F12) > Console:

   ```js
   SUPA.user.id                                   // A_ID
   (await SUPA.cli.from('quiz_sessions').select('id').limit(1)).data[0].id   // A_SESSION
   ```

6. **בדיקת הנתונים בשרת** (SQL Editor):

   ```sql
   -- מה הגיע. בעמודה has_local_only חייב להיות false בשורת prof
   select u.email, d.key, d.updated_at,
          (d.key = 'prof' and d.value ?| array['inc','first','svc','res','resAt']) as has_local_only
   from public.user_data d join auth.users u on u.id = d.user_id order by 1, 2;

   select * from public.profiles;

   select s.id, s.started_at, s.finished_at, s.n_questions, s.top_worlds, s.confidence,
          (select count(*) from public.quiz_answers a where a.session_id = s.id) as answers,
          (select count(*) from public.quiz_results r where r.session_id = s.id) as results
   from public.quiz_sessions s order by started_at;

   select u.email, c.kind, c.version, c.accepted_at
   from public.consents c join auth.users u on u.id = c.user_id;
   ```

   **ציפיות:** ב-`user_data` מפתחות `prof`, `scores`, `list`, `dir2`, `path` (ו-`sch` אם הוספת מלגה), `has_local_only = false`. שורה אחת ב-`profiles`. שתי ריצות שאלון: אחת עם `finished_at` ריק ושאלות מעטות (אם התחלת ריצה ויצאת) ואחת מסיימת עם `results = 13` או `12` (3 עולמות + 9 מקצועות + מפתיע, אם יש). שתי שורות ב-`consents` (`terms`, `privacy`).

## 2. חשבון א' בשני "מכשירים" (סנכרון)

1. בפרופיל השני של Chrome (או חלון בסתר) פותחים את האתר ומתחברים עם חשבון א'.
   **לבדוק:** אין שאלות (המכשיר ריק), והפרופיל, הרשימה והשאלון מופיעים. **המצב הכלכלי והשכלת ההורים לא מופיעים** (נשארו במכשיר הראשון).
2. במכשיר השני מוסיפים תואר לרשימה. מחכים 3 שניות.
3. חוזרים למכשיר הראשון, לוחצים על החשבון > "סנכרון עכשיו". **לבדוק:** התואר החדש מופיע.
4. (אופציונלי) מכשיר ראשון: DevTools > Network > Offline, מוסיפים תואר, חוזרים ל-Online. **לבדוק:** תוך כדקה התואר מגיע לשרת (הסטטוס בחשבון: "הנתונים מסונכרנים").

## 3. חשבון ב': התחברות ונתונים

1. בחלון נפרד (או פרופיל שלישי) מתחברים עם חשבון ב'. אותן פעולות כמו בסעיף 1.3, בקצרה: פרופיל, 2 תארים, והתחלת שאלון (5 שאלות, בלי לסיים).
2. רושמים: `SUPA.user.id` (**B_ID**) ואת מזהה הריצה (**B_SESSION**), כמו בסעיף 1.5.

## 4. בדיקת הרשאות: אף אחד לא נוגע בנתונים של האחר

**בחלון של חשבון ב'** (F12 > Console):

1. מגדירים את המזהים של חשבון א':

   ```js
   window.LIVE_OTHER = { user: 'A_ID', session: 'A_SESSION' }
   ```

2. פותחים את הקובץ [`live-check.js`](live-check.js), מעתיקים את כולו, מדביקים ב-Console ולוחצים Enter.
3. מופיעה טבלה, ובסופה "✅ כל הבדיקות עברו" או "❌ N בדיקות נכשלו". **מצופה: כולן PASS** (כ-29). הבדיקה קוראת וכותבת רק דרך ההרשאות של חשבון ב', ו**כל הכתיבות בה אמורות להיכשל**.
4. **לשלוח לי את הטבלה** (העתקה מה-Console), גם אם הכול עבר.
5. (מומלץ) אותה בדיקה בחלון של חשבון א', עם `LIVE_OTHER = { user: 'B_ID', session: 'B_SESSION' }`.

## 5. מחיקת חשבון ב' (הבדיקה החשובה)

1. **לפני המחיקה**, ב-SQL Editor, שומרים צילום של הספירות:

   ```sql
   select coalesce(u.email, '(אין משתמש ב-auth!)') as owner,
          (select count(*) from public.user_data   x where x.user_id = s.uid) as user_data,
          (select count(*) from public.profiles    x where x.user_id = s.uid) as profiles,
          (select count(*) from public.quiz_sessions x where x.user_id = s.uid) as sessions,
          (select count(*) from public.quiz_answers a join public.quiz_sessions z on z.id = a.session_id where z.user_id = s.uid) as answers,
          (select count(*) from public.consents    x where x.user_id = s.uid) as consents
   from (select user_id as uid from public.user_data union select user_id from public.profiles
         union select user_id from public.quiz_sessions union select user_id from public.consents) s
   left join auth.users u on u.id = s.uid order by 1;
   ```

2. בחלון של חשבון ב': החשבון > **"הורדת הנתונים שלי"**. **לבדוק:** יורד הקובץ `vector-my-data.json`, ובתוכו הפרופיל, הרשימה, ריצת השאלון עם התשובות, האישורים, ושדה `only_on_this_device` עם התשובות שנשארו במכשיר.
3. החשבון > **"מחיקת החשבון וכל הנתונים"**. מקלידים `מחיקה`, ולוחצים. (אפשר לסמן "למחוק גם את הנתונים מהמכשיר הזה".)
   **לבדוק:** הודעה "החשבון וכל הנתונים שלו נמחקו", הכפתור בראש הדף חזר ל-"התחברות".
   **אם מופיעה הודעת שגיאה** ("המחיקה לא הצליחה, ושום דבר לא נמחק"): **עוצרים, מצלמים את ההודעה, ופותחים ב-DevTools את לשונית Network, מחפשים את הבקשה `delete_my_account` ומעתיקים את התשובה שלה (Response)**. סביר שזו בעיית הרשאות (למשל `permission denied for table users`). לא משנים כלום, ומדווחים לי.
4. מריצים שוב את שאילתת הספירות מהסעיף 5.1 ובנוסף:

   ```sql
   select count(*) as b_in_auth from auth.users where id = 'B_ID';          -- צריך 0
   select count(*) as orphans from public.user_data d
     left join auth.users u on u.id = d.user_id where u.id is null;          -- צריך 0
   select count(*) as b_sessions from public.quiz_sessions where user_id = 'B_ID';   -- צריך 0
   select count(*) as b_answers from public.quiz_answers where session_id = 'B_SESSION';   -- צריך 0
   select count(*) as b_results from public.quiz_results where session_id = 'B_SESSION';   -- צריך 0
   ```

   **ציפיות:** שורת חשבון ב' נעלמה לגמרי מטבלת הספירות; כל הספירות למעלה 0; **חשבון א' ללא שינוי** (אותן ספירות כמו קודם). גם ב-**Authentication > Users** חשבון ב' כבר לא ברשימה.
5. בחלון של חשבון א': מרעננים ומוודאים שהכול עובד והנתונים במקומם.
6. **התחברות מחדש עם חשבון ב'** (אותו חשבון Google): **לבדוק:** נוצר חשבון חדש, ריק (מזהה משתמש שונה ב-`select id, email from auth.users;`), ונשאל שוב על אישור התקנון. שום דבר מהחשבון שנמחק לא חוזר.

## 6. מה לשלוח לי

- הטבלה מ-`live-check.js` (סעיף 4).
- התוצאות של שאילתות 0.2 (סעיף "הכנה"), ושל שאילתת ה-`has_local_only`.
- תוצאות הספירות לפני ואחרי המחיקה (סעיף 5).
- אם משהו לא עבד: צילום מסך, מה לחצת, ותוכן הבקשה והתשובה ב-Network.
- (אם יש לך הערות על הנוסח או העיצוב של המסכים שראית.)

## 7. אחרי הבדיקה

אפשר למחוק את `http://localhost:8080/**` מ-Redirect URLs. אל תמזג את ה-PR לפני שהבדיקות האלה עברו: האתר החי (`main`) עדיין לא כולל חשבונות, ובו מדיניות הפרטיות הישנה.
