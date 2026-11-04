# בדיקה על Supabase האמיתי: צעד אחר צעד

המטרה: לוודא על הפרויקט האמיתי ש-(1) התחברות Google וסנכרון עובדים, (2) משתמש לא יכול לקרוא או לכתוב נתונים של משתמש אחר, (3) `delete_my_account` באמת מוחקת את המשתמש מ-`auth.users` ואת כל שורותיו בשרשרת.
**אם משהו נכשל או נראה לא תקין, עוצרים ומדווחים לי (מה עשית, מה ראית, הטקסט המדויק של השגיאה). לא משנים כלום בסכמה או בהגדרות לפני כן.**

משתמשים: **חשבון א'** ו**חשבון ב'**, שני חשבונות Google שנמצאים ברשימת "Test users". מומלץ לעבוד בשני פרופילים נפרדים של Chrome (או חלון רגיל וחלון גלישה בסתר), כדי שיהיו שני "מכשירים" נפרדים.

## 0. הכנה (פעם אחת)

### 0.1 כתובת תצוגה מקדימה זמנית של הענף (בלי לגעת באתר החי)
הקוד החדש נמצא בענף `accounts-v1` ועדיין לא ב-`main`, ולכן הוא לא באתר החי. הדרך הפשוטה ביותר, בלי להתקין כלום במחשב: **GitHub Codespaces**, מחשב קטן בענן שנפתח בדפדפן, ומגיש את הענף בכתובת זמנית. (יש מכסה חינמית חודשית לחשבון GitHub אישי, שמספיקה בהרבה לבדיקה כזאת.)

**א. יצירה ואתחול (כ-3 דקות):**
1. נכנסים ל-GitHub עם החשבון שלך ופותחים: `https://github.com/refaelhabaz-ai/vector/tree/accounts-v1` (חשוב: עמוד הענף, לא העמוד הראשי).
2. לוחצים על הכפתור הירוק **Code** > לשונית **Codespaces** > **Create codespace on accounts-v1**. נפתח חלון בדפדפן שנראה כמו VS Code. ממתינים כדקה עד שהוא נטען.
3. בחלק התחתון יש **Terminal** (אם לא רואים: תפריט **Terminal** > **New Terminal**). מקלידים את השורה הבאה ולוחצים Enter:

   ```bash
   python3 -m http.server 8080
   ```

   אם מופיע חלון קופץ "Your application running on port 8080 is available", לא חייבים ללחוץ עליו.
4. פותחים את הלשונית **Ports** (ליד Terminal). בשורה של פורט **8080**: לוחצים קליק ימני > **Port Visibility** > **Public**. (כך אפשר להיכנס מכל דפדפן, גם בחשבון השני, בלי להתחבר ל-GitHub.)
5. בשורה הזאת, בעמודה **Forwarded Address**, יש כתובת בצורה `https://משהו-8080.app.github.dev`. **מעתיקים אותה** (אייקון ההעתקה לידה). זו **כתובת הבדיקה** שלך. בכל מקום בהמשך שכתוב "האתר", פותחים את הכתובת הזאת בדפדפן.
   בפעם הראשונה GitHub מציג עמוד אזהרה עם כפתור **Continue**: לוחצים עליו.
6. **משאירים את חלון ה-Codespace פתוח** כל זמן הבדיקה. אם הוא נסגר או "נרדם" (אחרי כחצי שעה בלי פעילות), נכנסים ל-`https://github.com/codespaces`, פותחים אותו שוב, ומריצים שוב את שורת ה-`python3` ואת שלב 4 (הכתובת נשארת זהה).

**ב. מה להגדיר ב-Supabase (פעם אחת):**
1. **Authentication** > **URL Configuration** > בחלק **Redirect URLs** לוחצים **Add URL**.
2. מדביקים את כתובת הבדיקה, עם `/**` בסופה, למשל: `https://משהו-8080.app.github.dev/**` > **Save**.
3. **Site URL** נשאר ככתובת האתר החי. לא משנים אותו.

**ג. מה להגדיר בגוגל: כלום.** ההפניה של גוגל היא לכתובת של Supabase (`https://wgarkvjbwzmpdvvrsrni.supabase.co/auth/v1/callback`), ולא לכתובת הבדיקה, ולכן אין מה להוסיף. מספיק ששני החשבונות ברשימת Test users.

**ד. לבדוק שזה עובד:** פותחים את כתובת הבדיקה: האתר מופיע, ובראש הדף יש "התחברות".

**ה. אחרי הבדיקה (ניקיון):**
1. ב-Supabase: **Authentication** > **URL Configuration**: מוחקים את כתובת הבדיקה מ-Redirect URLs (אייקון הפח לידה) > Save.
2. ב-GitHub: `https://github.com/codespaces` > ליד ה-Codespace לוחצים על שלוש הנקודות > **Delete**.
3. האתר החי לא שונה בשום שלב. אם תרצה להתחבר גם באתר החי, הוא כבר מוגדר (כתובתו ברשימה).

> אם Codespaces לא זמין לך (למשל חסם בחשבון), יש דרך חלופית במחשב Windows בסוף המסמך ("נספח: הרצה מקומית ב-Windows").

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

1. פותחים את האתר (כתובת הבדיקה מסעיף 0.1). לוחצים **"התחברות"** בראש הדף.
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

מנקים לפי סעיף 0.1 ה (מוחקים את כתובת הבדיקה מ-Supabase ואת ה-Codespace). **אל תמזג את ה-PR לפני שהבדיקות האלה עברו:** האתר החי (`main`) עדיין בלי חשבונות, ובו מדיניות הפרטיות הישנה.

## נספח: הרצה מקומית ב-Windows (רק אם Codespaces לא עובד)

1. **התקנת Python:** פותחים את **Microsoft Store**, מחפשים "Python 3.12", לוחצים **Get/קבל** ומחכים לסיום. (או מ-`https://www.python.org/downloads/`, ומסמנים בהתקנה **Add python.exe to PATH**.)
2. **הורדת הקוד:** בדפדפן נכנסים ל-`https://github.com/refaelhabaz-ai/vector/archive/refs/heads/accounts-v1.zip`. יורד קובץ ZIP. קליק ימני עליו > **Extract All** (חילוץ הכול) > Extract.
3. **פתיחת חלון פקודה בתיקייה:** נכנסים לתיקייה שנוצרה (`vector-accounts-v1`, שבתוכה רואים את הקובץ `index.html`). לוחצים על שורת הכתובת למעלה, מקלידים `cmd` ו-Enter. נפתח חלון שחור.
4. **הרצת השרת:** מקלידים `python -m http.server 8080` ו-Enter. (אם כתוב ש-python לא נמצא: `py -m http.server 8080`.) משאירים את החלון פתוח.
5. **האתר:** פותחים בדפדפן `http://localhost:8080/`.
6. **Supabase:** ב-Authentication > URL Configuration > Redirect URLs > Add URL: `http://localhost:8080/**` > Save. (גוגל: כלום.)
7. **סיום:** בחלון השחור לוחצים Ctrl+C. מוחקים את הכתובת מ-Supabase, ואת התיקייה והקובץ ה-ZIP.
**הערה:** שני "מכשירים" = שני פרופילים של Chrome (או חלון רגיל וחלון בסתר), שניהם על אותה כתובת.
