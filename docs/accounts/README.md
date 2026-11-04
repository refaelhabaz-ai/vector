# חשבונות משתמש (Supabase)

מדריך קצר למנהל: איך לראות את הנתונים, שאילתות ניתוח מוכנות, איך מריצים את הבדיקות, ואיפה כל דבר.
מבנה, החלטות וסיכונים: [`PLAN.md`](PLAN.md). בדיקה על Supabase האמיתי, צעד אחר צעד: [`live-test.md`](live-test.md). טיוטת מדיניות פרטיות: [`privacy-policy-draft.md`](privacy-policy-draft.md).

## איך רואים את הנתונים ב-Supabase

1. נכנסים ל-[supabase.com/dashboard](https://supabase.com/dashboard) ובוחרים את הפרויקט.
2. **Table Editor** (תפריט שמאל): טבלאות `user_data`, `profiles`, `quiz_sessions`, `quiz_answers`, `quiz_results`, `consents`. אתה רואה את כל השורות של כולם (לוח הבקרה רץ כמנהל ועוקף את הגבלת השורות).
3. **Authentication > Users:** רשימת המשתמשים (דוא"ל, מתי נכנסו). **הדוא"ל נמצא רק שם**, לא בטבלאות שלנו; בטבלאות יש מזהה משתמש (`user_id`). כדי לראות מי זה, מצלבים: `select id, email from auth.users;`.
4. **SQL Editor:** מריצים שאילתות (למטה). כל שאילתה בנפרד: מסמנים אותה ולוחצים Run.

המשמעות של הטבלאות:

| טבלה | מה בה |
|---|---|
| `user_data` | העתק של מה שהאתר שומר בדפדפן: `prof`, `scores`, `dir2` (השאלון), `path`, `list`, `sch`, `calcRows`, `calcAr`, `uni`, `dir`. שורה לכל מפתח לכל משתמש. |
| `profiles` | שלב, אזור, תעודה, פסיכומטרי, יחידות מתמטיקה, מין. שורה למשתמש. **בלי** שם, תאריך לידה, טלפון. |
| `quiz_sessions` | ריצה של השאלון. `finished_at` ריק = נזנחה באמצע. |
| `quiz_answers` | התשובות לפי סדר (`idx`). `picks` ריק = דולגה. ב-`G` ו-`HB`, `meta.w` הוא העולם ששאלו עליו. |
| `quiz_results` | מה הוצג: `world` (1-3, `score` = הסתברות), `occupation` (1-9, `score` = S), `wildcard`. |
| `consents` | אישור התקנון והפרטיות: גרסה ומועד. |

**מה לא נמצא בשרת בכלל** (נשאר במכשיר, והשרת דוחה אותו): מצב כלכלי במשפחה, השכלת ההורים, שירות ומילואים. כך גם הפורום והכינוי.

קודי העולמות: tech=טכנולוגיה, תוכנה ודאטה · eng=הנדסה ותכנון · hands=מקצועות טכניים ומעשיים · science=מדע ומחקר · health=רפואה ובריאות · care=טיפול, רווחה וקהילה · edu=חינוך, הוראה והדרכה · biz=עסקים, כספים וניהול · law=משפט, ציבור וחברה · create=עיצוב, אמנות, מדיה ותוכן · nature=טבע, סביבה ובעלי חיים · field=שטח, ביטחון, אירוח ושירות.

## שאילתות ניתוח מוכנות

הקובץ [`supabase/analytics.sql`](../../supabase/analytics.sql) כולל אותן (ועוד אחת). הן נבדקות אוטומטית על נתוני דמה (`node supabase/tests/run-local.js`).
הערה: ריצה נשמרת רק אחרי שנענתה לפחות שאלה אחת, ורק למשתמש מחובר.

### 1. כמה התחילו וכמה סיימו שאלון, בכל שבוע

```sql
select date_trunc('week', started_at)::date                                           as week,
       count(*)                                                                         as started,
       count(*) filter (where finished_at is not null)                                  as finished,
       round(100.0 * count(*) filter (where finished_at is not null) / count(*), 1)     as finished_pct
from public.quiz_sessions
group by 1
order by 1 desc;
```

### 2. באיזו שאלה נוטשים הכי הרבה (השאלה האחרונה שנענתה בריצות שלא הסתיימו)

```sql
with last_answer as (
  select s.id, a.question_id, a.idx
  from public.quiz_sessions s
  join lateral (select question_id, idx from public.quiz_answers
                where session_id = s.id order by idx desc limit 1) a on true
  where s.finished_at is null
)
select question_id                                                    as last_question_answered,
       count(*)                                                       as abandoned_after_it,
       round(100.0 * count(*) / sum(count(*)) over (), 1)             as pct_of_abandoned,
       round(avg(idx + 1), 1)                                         as avg_answers_so_far
from last_answer
group by 1
order by 2 desc, 1;
```

### 3. התפלגות העולם המוביל (בריצה האחרונה שהסתיימה של כל משתמש)

```sql
with latest as (
  select distinct on (s.user_id) s.id
  from public.quiz_sessions s
  where s.finished_at is not null
  order by s.user_id, s.finished_at desc
)
select r.code                                                        as leading_world,
       count(*)                                                      as users,
       round(100.0 * count(*) / sum(count(*)) over (), 1)            as pct
from latest l
join public.quiz_results r on r.session_id = l.id and r.kind = 'world' and r.rank = 1
group by 1
order by 2 desc;
```

### 4. לפי אזור ושלב: כמה התחילו, כמה סיימו, והעולם המוביל הנפוץ ביותר

```sql
select coalesce(p.reg, '(לא ידוע)')                                                      as region,
       coalesce(p.stage, '(לא ידוע)')                                                    as stage,
       count(distinct s.user_id)                                                          as users_started,
       count(distinct s.user_id) filter (where s.finished_at is not null)                 as users_finished,
       mode() within group (order by r.code)                                              as most_common_leading_world
from public.quiz_sessions s
left join public.profiles p on p.user_id = s.user_id
left join public.quiz_results r on r.session_id = s.id and r.kind = 'world' and r.rank = 1
group by 1, 2
order by 3 desc, 1, 2;
```

### 5. שיעור "בול" בניחוש הביניים (שאלה G), לפי העולם ששאלו עליו. השורה האחרונה (world_asked ריק) היא הסך הכול

```sql
select meta ->> 'w'                                                                       as world_asked,
       count(*)                                                                            as guesses,
       count(*) filter (where picks[1] = 'G_1')                                            as bullseye,
       round(100.0 * count(*) filter (where picks[1] = 'G_1') / count(*), 1)               as bullseye_pct,
       round(100.0 * count(*) filter (where picks[1] in ('G_1', 'G_2')) / count(*), 1)      as warm_or_better_pct
from public.quiz_answers
where question_id = 'G' and cardinality(picks) = 1
group by rollup (meta ->> 'w')
order by (meta ->> 'w') is null, 2 desc;
```

### בונוס: 6. כמה זמן לוקח לענות על כל שאלה: חציון בשניות, לפי הפרש בין תשובות עוקבות באותה ריצה

```sql
select question_id,
       count(*)                                                            as answers,
       round((percentile_cont(0.5) within group (order by secs))::numeric, 1) as median_seconds
from (
  select question_id,
         extract(epoch from answered_at - lag(answered_at) over (partition by session_id order by idx)) as secs
  from public.quiz_answers
) t
where secs between 0 and 600
group by 1
order by 3 desc;
```

## הרצת הבדיקות

```bash
node tests/quiz-v2/all.js            # כל הסוויטה, ברצף (כ-8 דקות). קוד יציאה 0 רק אם הכול עבר
node tests/accounts/stage1.js        # התחברות (Google, קוד במייל כשהדגל דלוק)
node tests/accounts/stage2.js        # סנכרון בין מכשירים, מיזוג, חשבונות ישנים, שעון השרת
node tests/accounts/stage3.js        # השאלון בחשבון
node tests/security/csp.js           # CSP, מה הוא חוסם, ושמירה מפני frame
node tests/security/xss-fuzz.js      # מטענים בכל מקום שטקסט משתמש נשמר
node tools/csp-hash.js --check       # ה-hash של ה-CSP מעודכן
node tests/accounts/stage4.js        # הורדה, מחיקה, טקסטים, וסקריפט הבדיקה החי (מול שרת מדומה)
node supabase/tests/run-local.js     # הסכמה, RLS ושאילתות הניתוח, על Postgres מקומי (דורש psql ושרת Postgres)
node tests/accounts/screens.js && node tests/accounts/screens-sync.js   # צילומי מסך (docs/accounts/screens/)
```

**איך זה עובד בלי חשבון אמיתי:** הבדיקות מריצות את `supabase-js` האמיתי (מ-`vendor/`) בדפדפן אמיתי, מול שרת **מדומה** (`tests/accounts/mock.js`) שמדמה את ההתחברות, הטבלאות, `save_quiz`, `server_time` ו-`delete_my_account`, ומשותף לכמה "מכשירים" (הקשרי דפדפן נפרדים). אין שום רשת, חשבון או מפתח. הבדיקות של הסכמה רצות על Postgres מקומי עם תחליף ל-`auth`.

**מה דורש חשבון אמיתי ולא אפשר לאוטומט:** כניסה עם Google, קוד חד-פעמי במייל, ובדיקת ההרשאות והמחיקה על Supabase עצמו. אלה ב-[`live-test.md`](live-test.md), עם סקריפט הדבקה לדפדפן ([`live-check.js`](live-check.js)). **אל תכניס סיסמאות או מפתחות לריפו.** המפתח הציבורי (`sb_publishable_...`) נמצא בקוד בכוונה, והוא בטוח כל עוד ההרשאות בשרת נכונות (זה מה שנבדק). מפתח סודי (`service_role`, `sb_secret_...`) אסור שיופיע באתר או בריפו.

## אבטחה: מדיניות Content-Security-Policy

ב-`index.html` יש מדיניות CSP שמתירה את הסקריפט היחיד של האתר לפי ה-hash שלו, ולכן כל עריכה בסקריפט משנה את ה-hash.
**אם האתר נחסם (מסך ריק) אחרי עריכה: מריצים `node tools/csp-hash.js --write` ועושים commit ל-`index.html`.** (`node tools/csp-hash.js --check` בודק בלי לשנות.)

הגנה כפולה: הבדיקה הזאת רצה ב-`all.js`, וב-GitHub Action (`.github/workflows/csp-check.yml`) על כל push ל-`main` ועל כל pull request אליו. ה-Action מסמן את ה-commit באדום, אבל **לא עוצר את הפריסה של GitHub Pages** (זו עבודה נפרדת); כדי לחסום פריסה צריך להעביר את Pages לפריסה דרך Actions. בנוסף: האתר מסרב להיפתח בתוך frame של אתר אחר (חוץ מ-claude.ai), ובדיקת `tests/security/xss-fuzz.js` ב-`all.js` מזריקה מטענים לכל מקום שטקסט משתמש נשמר.

## איפה כל דבר

| מה | איפה |
|---|---|
| קוד ההתחברות, הסנכרון, השאלון בחשבון, הורדה ומחיקה | `index.html`, אזורים `ACCOUNTS (Supabase)` ו-`SYNC` |
| הספרייה (נעולה לגרסה, SRI) | `vendor/supabase-js-2.118.0.min.js`, ו-[`vendor/README.md`](../../vendor/README.md) (איך לעדכן) |
| הסכמה | [`supabase/schema.sql`](../../supabase/schema.sql): לשמור על האילוצים תואמים לאתר (רשימת המפתחות, השדות שנשארים במכשיר) |
| דגל קוד במייל | `SUPA_CFG.emailOtp` ב-`index.html` (כבוי; הוראות הפעלה ב-`PLAN.md` סעיף 10) |
| טיוטת המדיניות באתר | `lgSections()` ב-`index.html`, מסומנת "טיוטה לבדיקת עורך דין" |

## כשמוסיפים משהו

- **מפתח חדש שמסונכרן (`SYNC_KEYS`):** להוסיף גם ל-`user_data_key_ok` ב-`schema.sql` ולהריץ שוב אותו.
- **שדה פרופיל רגיש חדש שאסור שיעלה:** להוסיף ל-`SYNC_LOCAL_ONLY` ב-`index.html` ול-`user_data_prof_local_only` בסכמה.
- **טבלה חדשה עם `user_id`:** חייבת `references auth.users on delete cascade` (אחרת מחיקת חשבון לא תמחק אותה) ו-RLS.
- **גרסה חדשה של הנוסח המשפטי:** לעדכן `LEGAL_UPDATED`; כל משתמש מחובר יתבקש לאשר מחדש בכניסה הבאה.
- **אישור נוסף בהרשמה (גיל / הורה):** פריט ב-`AUTH_CONSENTS`.
