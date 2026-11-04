-- ============================================================================
-- וקטור: חשבונות משתמש (accounts-v1)
-- להרצה ב-Supabase: SQL Editor > New query > הדבקה > Run. אפשר להריץ שוב בלי נזק (idempotent).
-- אין כאן מפתחות ואין סיסמאות. הסכמה כולה ב-schema "public"; המשתמשים עצמם ב-auth.users (Supabase מנהל).
--
-- עקרונות:
--   1. כל טבלה מוגנת ב-Row Level Security: משתמש מחובר רואה וכותב רק שורות של עצמו (user_id = auth.uid()).
--      משתמש לא מחובר (anon) לא מקבל גישה לשום טבלה, גם לא בקריאה.
--   2. אין בטבלאות שם, תאריך לידה, טלפון או אימייל. האימייל נשאר ב-auth.users בלבד.
--   3. מחיקת משתמש מ-auth.users מוחקת בשרשרת (on delete cascade) את כל השורות שלו.
--   4. כמנהל, אתה מריץ שאילתות ב-SQL Editor עם התפקיד postgres, שעוקף RLS: אתה רואה הכול.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- עזר: עדכון updated_at אוטומטי
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. user_data: סנכרון המפתחות של האתר (SYNC_KEYS) בין מכשירים
--    value הוא ה-JSON של המפתח כפי שהוא ב-localStorage (למשל prof, scores, dir2, path, list...).
-- ----------------------------------------------------------------------------
create table if not exists public.user_data (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  -- רק המפתחות שהאתר מסנכרן. מפתח חדש באתר דורש להוסיף אותו כאן.
  constraint user_data_key_ok  check (key in ('prof','scores','dir','dir2','path','list','calcRows','calcAr','uni','sch')),
  -- הגבלת גודל (256KB לערך): מונע שימוש לרעה כאחסון כללי
  constraint user_data_size_ok check (octet_length(value::text) <= 262144),
  -- שדות רגישים שנשארים רק במכשיר ולעולם לא עולים לשרת (החלטת הבעלים): הכנסה/מצב כלכלי במשפחה ושאלות המלגות
  -- שתלויות בהם. האתר לא שולח אותם; זו הגנה שנייה: גם אם יהיה באג באתר, השרת ידחה. הרשימה: docs/accounts/PLAN.md
  constraint user_data_prof_local_only check (key <> 'prof' or not (value ?| array['inc','first','svc','res','resAt']))
);

-- ----------------------------------------------------------------------------
-- 2. profiles: שדות הפרופיל כעמודות נפרדות (לניתוח). שורה אחת למשתמש.
--    בלי שם, תאריך לידה, טלפון או אימייל. שאר שדות הפרופיל (למשל שירות, הכנסה) לא כאן, רק ב-user_data.prof.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  stage      text        check (char_length(stage) <= 32),      -- שלב: g10 / g11 / g12 / svc / after / other
  reg        text        check (char_length(reg) <= 32),        -- אזור מגורים
  bag        text        check (char_length(bag) <= 32),        -- סוג תעודה: full / handesai / mechina / foreign ...
  psy_status text        check (char_length(psy_status) <= 32), -- פסיכומטרי: has / plan / ...
  math       smallint    check (math between 1 and 5),          -- יחידות מתמטיקה
  sex        text        check (char_length(sex) <= 8),         -- m / f (אופציונלי)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. quiz_sessions: ריצה אחת של שאלון "מה הכיוון שלי?". finished_at ריק = נזנח באמצע.
--    ה-id נוצר באתר (crypto.randomUUID) כדי שאפשר יהיה לכתוב בלי רשת ולנסות שוב בלי כפילויות.
-- ----------------------------------------------------------------------------
create table if not exists public.quiz_sessions (
  id           uuid        primary key,
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  n_questions  smallint    not null default 0 check (n_questions between 0 and 40), -- כמה שאלות נשאלו עד עכשיו
  quiz_version text        not null check (char_length(quiz_version) <= 16),         -- למשל '2.0'
  top_worlds   text[]      not null default '{}',                                    -- שלושת העולמות (הכיוונים) לפי הסדר
  confidence   text        check (confidence in ('clear','direction','open')),
  constraint quiz_sessions_dates_ok check (finished_at is null or finished_at >= started_at)
);

-- ----------------------------------------------------------------------------
-- 4. quiz_answers: התשובות. picks ריק = השאלה דולגה.
--    meta (תוספת לאישור): נתון נלווה, בעיקר העולם שעליו שאלו ב-G ו-HB ({"w":"eng"}) והמקצוע שנבחר ב-DAY.
--    בלעדיו אי אפשר לחשב "שיעור בול בניחוש" לפי עולם.
-- ----------------------------------------------------------------------------
create table if not exists public.quiz_answers (
  session_id  uuid        not null references public.quiz_sessions (id) on delete cascade,
  idx         smallint    not null check (idx between 0 and 60),  -- סדר השאלה בריצה, מ-0
  question_id text        not null check (char_length(question_id) <= 16),
  picks       text[]      not null default '{}',
  meta        jsonb,
  answered_at timestamptz not null default now(),
  primary key (session_id, idx),
  -- meta הוא נתון נלווה קטן (עולם, מקצוע); לא מקום לאחסון חופשי
  constraint quiz_answers_meta_size_ok check (meta is null or octet_length(meta::text) <= 2048)
);

-- ----------------------------------------------------------------------------
-- 5. quiz_results: מה הוצג בסוף.
--    kind='world': code = מזהה עולם (למשל 'eng'), rank 1-3, score = ההסתברות של העולם (0-1).
--    kind='occupation': code = קוד המקצוע (ISCO, למשל '2263'), rank 1-9 לפי סדר ההצגה, score = S(o).
--    kind='wildcard': המקצוע המפתיע (אם יש), rank 1, score = S(o).
-- ----------------------------------------------------------------------------
create table if not exists public.quiz_results (
  session_id uuid     not null references public.quiz_sessions (id) on delete cascade,
  rank       smallint not null check (rank between 1 and 30),
  kind       text     not null check (kind in ('world','occupation','wildcard')),
  code       text     not null check (char_length(code) <= 32),
  score      numeric(7,4),
  primary key (session_id, kind, rank)
);

-- ----------------------------------------------------------------------------
-- 6. consents: אישור תנאי השימוש ומדיניות הפרטיות (גרסה + זמן)
-- ----------------------------------------------------------------------------
create table if not exists public.consents (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  -- terms, privacy: אישור בהרשמה. age, parental: שמורים לעתיד (גיל מינימום / אישור הורה, לפי עורך הדין), בלי צורך לשנות סכמה
  kind        text        not null,
  version     text        not null check (char_length(version) <= 32),  -- למשל תאריך עדכון התקנון
  accepted_at timestamptz not null default now(),
  primary key (user_id, kind, version)
);

-- אילוצים שנוספו אחרי היצירה הראשונה: עדכון בטוח גם אם הטבלאות כבר קיימות (drop + add, ללא איבוד נתונים)
alter table public.user_data drop constraint if exists user_data_prof_local_only;
alter table public.user_data add  constraint user_data_prof_local_only
  check (key <> 'prof' or not (value ?| array['inc','first','svc','res','resAt']));
alter table public.quiz_answers drop constraint if exists quiz_answers_meta_size_ok;
alter table public.quiz_answers add  constraint quiz_answers_meta_size_ok
  check (meta is null or octet_length(meta::text) <= 2048);
alter table public.consents  drop constraint if exists consents_kind_check;
alter table public.consents  add  constraint consents_kind_check check (kind in ('terms','privacy','age','parental'));

-- ----------------------------------------------------------------------------
-- טריגרים של updated_at
-- ----------------------------------------------------------------------------
drop trigger if exists trg_user_data_updated on public.user_data;
create trigger trg_user_data_updated before update on public.user_data
  for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- אינדקסים (לניתוח; ה-PK כבר מכסה חיפוש לפי משתמש/ריצה)
-- ----------------------------------------------------------------------------
create index if not exists quiz_sessions_started_idx   on public.quiz_sessions (started_at);
create index if not exists quiz_sessions_user_idx      on public.quiz_sessions (user_id, started_at desc);
create index if not exists quiz_sessions_finished_idx  on public.quiz_sessions (finished_at) where finished_at is not null;
create index if not exists quiz_answers_question_idx   on public.quiz_answers (question_id);
create index if not exists quiz_answers_picks_idx      on public.quiz_answers using gin (picks);
create index if not exists quiz_results_code_idx       on public.quiz_results (kind, code);
create index if not exists profiles_reg_stage_idx      on public.profiles (reg, stage);
create index if not exists user_data_key_idx           on public.user_data (key);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.user_data     enable row level security;
alter table public.profiles      enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.quiz_answers  enable row level security;
alter table public.quiz_results  enable row level security;
alter table public.consents      enable row level security;

-- הגנה כפולה: משתמש לא מחובר (anon) לא מקבל שום הרשאה על הטבלאות, לא רק "אין מדיניות"
revoke all on public.user_data, public.profiles, public.quiz_sessions, public.quiz_answers,
              public.quiz_results, public.consents from anon;
grant select, insert, update, delete on public.user_data, public.profiles, public.quiz_sessions,
              public.quiz_answers, public.quiz_results to authenticated;
grant select, insert, delete on public.consents to authenticated;   -- אין עדכון: אישור הוא רשומה, לא שדה

-- "(select auth.uid())" ולא "auth.uid()" ישירות: מחושב פעם אחת לשאילתה (ביצועים)
drop policy if exists user_data_own on public.user_data;
create policy user_data_own on public.user_data
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists quiz_sessions_own on public.quiz_sessions;
create policy quiz_sessions_own on public.quiz_sessions
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- תשובות ותוצאות שייכות לריצה, והריצה שייכת למשתמש
drop policy if exists quiz_answers_own on public.quiz_answers;
create policy quiz_answers_own on public.quiz_answers
  for all to authenticated
  using      (exists (select 1 from public.quiz_sessions s where s.id = session_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.quiz_sessions s where s.id = session_id and s.user_id = (select auth.uid())));

drop policy if exists quiz_results_own on public.quiz_results;
create policy quiz_results_own on public.quiz_results
  for all to authenticated
  using      (exists (select 1 from public.quiz_sessions s where s.id = session_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.quiz_sessions s where s.id = session_id and s.user_id = (select auth.uid())));

drop policy if exists consents_select_own on public.consents;
create policy consents_select_own on public.consents
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists consents_insert_own on public.consents;
create policy consents_insert_own on public.consents
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists consents_delete_own on public.consents;
create policy consents_delete_own on public.consents
  for delete to authenticated using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- save_quiz: שמירה אטומית של ריצת שאלון (ריצה + תשובות + תוצאות) בקריאה אחת.
-- security INVOKER: רצה עם ההרשאות של המשתמש, כלומר RLS חל עליה כרגיל. היא לא עוקפת שום הגנה.
-- התשובות והתוצאות מוחלפות בכל קריאה (חזרה אחורה, "עוד 3 שאלות" ו"התחל מחדש" משנים את הרשימה).
-- p_session: {id, started_at, finished_at, n_questions, quiz_version, top_worlds[], confidence}
-- p_answers: [{q, picks[], meta, at}, ...] לפי הסדר     p_results: [{kind, rank, code, score}, ...]
-- ----------------------------------------------------------------------------
create or replace function public.save_quiz(p_session jsonb, p_answers jsonb, p_results jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sid uuid := (p_session ->> 'id')::uuid;
begin
  insert into public.quiz_sessions (id, started_at, finished_at, n_questions, quiz_version, top_worlds, confidence)
  values (
    sid,
    coalesce((p_session ->> 'started_at')::timestamptz, now()),
    nullif(p_session ->> 'finished_at', '')::timestamptz,
    coalesce((p_session ->> 'n_questions')::int, 0),
    p_session ->> 'quiz_version',
    coalesce(array(select jsonb_array_elements_text(p_session -> 'top_worlds')), '{}'),
    nullif(p_session ->> 'confidence', '')
  )
  on conflict (id) do update set
    finished_at  = excluded.finished_at,
    n_questions  = excluded.n_questions,
    top_worlds   = excluded.top_worlds,
    confidence   = excluded.confidence;

  delete from public.quiz_answers where session_id = sid;
  insert into public.quiz_answers (session_id, idx, question_id, picks, meta, answered_at)
  select sid,
         (e.ord - 1)::int,
         e.v ->> 'q',
         coalesce(array(select jsonb_array_elements_text(e.v -> 'picks')), '{}'),
         e.v -> 'meta',
         coalesce((e.v ->> 'at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) with ordinality as e (v, ord);

  delete from public.quiz_results where session_id = sid;
  insert into public.quiz_results (session_id, rank, kind, code, score)
  select sid, (r ->> 'rank')::int, r ->> 'kind', r ->> 'code', (r ->> 'score')::numeric
  from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) as r;
end;
$$;

revoke all on function public.save_quiz(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_quiz(jsonb, jsonb, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- delete_my_account: מחיקת המשתמש מ-Auth. כל שאר הנתונים נמחקים בשרשרת (on delete cascade).
-- security DEFINER: רצה עם הרשאות הבעלים (postgres), כי רק הוא רשאי למחוק מ-auth.users.
-- הסיכונים והאמצעים מפורטים ב-docs/accounts/PLAN.md. בקצרה: היא מוחקת רק את auth.uid(), לא מקבלת פרמטרים,
-- search_path ריק, והרשאת ההרצה רק ל-authenticated.
-- ----------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
