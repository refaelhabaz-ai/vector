-- Row Level Security test on a local Postgres (stub_supabase.sql + schema.sql loaded). Prints PASS/FAIL per check, fails the script on any FAIL.
-- Run: node supabase/tests/run-local.js   (or psql -v ON_ERROR_STOP=1 -f this file)
\set ON_ERROR_STOP on
create or replace function pg_temp.check(name text, ok boolean) returns void language plpgsql as $$
begin if ok then raise notice 'PASS  %', name; else raise exception 'FAIL  %', name; end if; end $$;
delete from auth.users;
insert into auth.users (id,email) values ('aaaaaaaa-0000-0000-0000-000000000001','a@test'),('bbbbbbbb-0000-0000-0000-000000000002','b@test');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;

-- user A writes
set role authenticated; select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into user_data(user_id,key,value) values (auth.uid(),'prof','{"stage":"g12"}');
insert into profiles(user_id,stage,reg,bag,psy_status,math,sex) values (auth.uid(),'g12','c','full','plan',5,'f');
select save_quiz('{"id":"11111111-1111-1111-1111-111111111111","quiz_version":"2.0","n_questions":2,"top_worlds":["eng","tech"],"confidence":"clear","finished_at":""}',
  '[{"q":"A1","picks":["A1_1","A1_2"]},{"q":"G","picks":["G_1"],"meta":{"w":"eng"}},{"q":"X1","picks":[]}]',
  '[{"kind":"world","rank":1,"code":"eng","score":0.4},{"kind":"occupation","rank":1,"code":"2263","score":0.5}]');
insert into consents(kind,version) values ('terms','2026-11-03'),('privacy','2026-11-03');
select pg_temp.check('A sees own rows', (select count(*) from user_data)=1 and (select count(*) from quiz_answers)=3 and (select count(*) from quiz_results)=2 and (select count(*) from consents)=2);
select pg_temp.check('save_quiz: skipped answer has empty picks, meta kept', (select picks='{}' from quiz_answers where question_id='X1') and (select meta->>'w' from quiz_answers where question_id='G')='eng');
select pg_temp.check('save_quiz: unfinished session has finished_at null', (select finished_at is null from quiz_sessions));
-- replacing (going back) shrinks the list
select save_quiz('{"id":"11111111-1111-1111-1111-111111111111","quiz_version":"2.0","n_questions":1,"top_worlds":["eng"]}','[{"q":"A1","picks":["A1_1"]}]','[]');
select pg_temp.check('save_quiz replaces answers and results', (select count(*) from quiz_answers)=1 and (select count(*) from quiz_results)=0);

-- user B cannot see or touch A's rows
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check('B reads nothing of A', (select count(*) from user_data)+(select count(*) from profiles)+(select count(*) from quiz_sessions)+(select count(*) from quiz_answers)+(select count(*) from quiz_results)+(select count(*) from consents)=0);
do $$ declare n int; begin update user_data set value='{}'; get diagnostics n = row_count; if n<>0 then raise exception 'FAIL  B updated % of A rows', n; end if; raise notice 'PASS  B cannot update A rows'; end $$;
do $$ declare n int; begin delete from quiz_sessions; get diagnostics n = row_count; if n<>0 then raise exception 'FAIL  B deleted % of A sessions', n; end if; raise notice 'PASS  B cannot delete A rows'; end $$;
do $$ begin begin insert into user_data(user_id,key,value) values ('aaaaaaaa-0000-0000-0000-000000000001','prof','{}'); raise exception 'FAIL  B inserted as A'; exception when insufficient_privilege then raise notice 'PASS  B cannot insert rows as A (user_data)'; end; end $$;
do $$ begin begin insert into quiz_answers(session_id,idx,question_id) values ('11111111-1111-1111-1111-111111111111',9,'A1'); raise exception 'FAIL  B added answers to A session'; exception when insufficient_privilege then raise notice 'PASS  B cannot add answers to A session'; end; end $$;
do $$ begin begin perform save_quiz('{"id":"11111111-1111-1111-1111-111111111111","quiz_version":"2.0"}','[]','[]'); raise exception 'FAIL  B hijacked A session through save_quiz'; exception when insufficient_privilege then raise notice 'PASS  B cannot overwrite A session through save_quiz'; end; end $$;
do $$ begin begin insert into consents(user_id,kind,version) values ('aaaaaaaa-0000-0000-0000-000000000001','terms','x'); raise exception 'FAIL  B wrote consent as A'; exception when insufficient_privilege then raise notice 'PASS  B cannot write consents as A'; end; end $$;
do $$ begin begin update consents set version='y'; raise exception 'FAIL  consents update allowed'; exception when insufficient_privilege then raise notice 'PASS  consents cannot be updated by users'; end; end $$;
do $$ begin begin insert into user_data(user_id,key,value) values (auth.uid(),'anything','{}'); raise exception 'FAIL  free-form key accepted'; exception when check_violation then raise notice 'PASS  user_data accepts only the known keys'; end; end $$;

-- anonymous: nothing at all
reset role; set role anon; select pg_temp.as_user('');
do $$ begin begin perform count(*) from user_data; raise exception 'FAIL  anon can read user_data'; exception when insufficient_privilege then raise notice 'PASS  anon cannot read user_data'; end; end $$;
do $$ begin begin perform count(*) from quiz_results; raise exception 'FAIL  anon can read quiz_results'; exception when insufficient_privilege then raise notice 'PASS  anon cannot read quiz_results'; end; end $$;
do $$ begin begin perform delete_my_account(); raise exception 'FAIL  anon can run delete_my_account'; exception when insufficient_privilege then raise notice 'PASS  anon cannot run delete_my_account'; end; end $$;

-- delete_my_account: deletes only the caller, everything of the caller goes (cascade)
reset role; set role authenticated; select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select delete_my_account();
reset role;
select pg_temp.check('delete_my_account removed A and all of A rows', (select count(*) from auth.users where id='aaaaaaaa-0000-0000-0000-000000000001')=0
  and (select count(*) from user_data)+(select count(*) from profiles)+(select count(*) from quiz_sessions)+(select count(*) from quiz_answers)+(select count(*) from consents)=0);
select pg_temp.check('delete_my_account left B untouched', (select count(*) from auth.users where id='bbbbbbbb-0000-0000-0000-000000000002')=1);
set role authenticated; select pg_temp.as_user('');
do $$ begin begin perform delete_my_account(); raise exception 'FAIL  no-uid call allowed'; exception when sqlstate '28000' then raise notice 'PASS  delete_my_account refuses a call without a user'; end; end $$;
reset role;
