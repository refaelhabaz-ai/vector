-- ============================================================================
-- שאילתות ניתוח לאתר וקטור. להריץ ב-Supabase: SQL Editor (עם התפקיד postgres, שרואה את כל הנתונים).
-- כל שאילתה מופרדת בשורת "-- ===". אפשר להריץ כל אחת בנפרד (לסמן אותה ולהריץ את הבחירה).
-- הערה: ריצה נשמרת רק אחרי שנענתה לפחות שאלה אחת. מי שנכנס לשאלון ויצא לפני התשובה הראשונה לא מופיע כאן.
-- בכל השאילתות מי שלא מחובר לא נספר (הנתונים נשמרים רק לחשבונות).
-- ============================================================================

-- === 1. כמה התחילו וכמה סיימו שאלון, בכל שבוע
select date_trunc('week', started_at)::date                                           as week,
       count(*)                                                                         as started,
       count(*) filter (where finished_at is not null)                                  as finished,
       round(100.0 * count(*) filter (where finished_at is not null) / count(*), 1)     as finished_pct
from public.quiz_sessions
group by 1
order by 1 desc;

-- === 2. באיזו שאלה נוטשים הכי הרבה (השאלה האחרונה שנענתה בריצות שלא הסתיימו)
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

-- === 3. התפלגות העולם המוביל (בריצה האחרונה שהסתיימה של כל משתמש)
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

-- === 4. לפי אזור ושלב: כמה התחילו, כמה סיימו, והעולם המוביל הנפוץ ביותר
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

-- === 5. שיעור "בול" בניחוש הביניים (שאלה G), לפי העולם ששאלו עליו. השורה האחרונה (world_asked ריק) היא הסך הכול
select meta ->> 'w'                                                                       as world_asked,
       count(*)                                                                            as guesses,
       count(*) filter (where picks[1] = 'G_1')                                            as bullseye,
       round(100.0 * count(*) filter (where picks[1] = 'G_1') / count(*), 1)               as bullseye_pct,
       round(100.0 * count(*) filter (where picks[1] in ('G_1', 'G_2')) / count(*), 1)      as warm_or_better_pct
from public.quiz_answers
where question_id = 'G' and cardinality(picks) = 1
group by rollup (meta ->> 'w')
order by (meta ->> 'w') is null, 2 desc;

-- === 6. (בונוס) כמה זמן לוקח לענות על כל שאלה: חציון בשניות, לפי הפרש בין תשובות עוקבות באותה ריצה
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
