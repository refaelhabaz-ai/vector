/* Runs the queries of supabase/analytics.sql on a local Postgres with a small made-up data set, and checks the numbers.
   Part of: node supabase/tests/run-local.js */
const {spawnSync}=require('child_process');const fs=require('fs'),path=require('path');
module.exports=function(env){
  const psql=(args,input)=>spawnSync('psql',['-q','-t','-A','-F','|','-v','ON_ERROR_STOP=1','-d','vt_rls',...args],{env,encoding:'utf8',input});
  const U=i=>`aaaaaaaa-0000-0000-0000-00000000000${i}`,S=i=>`bbbbbbbb-0000-0000-0000-00000000000${i}`;
  let seed=`delete from auth.users;insert into auth.users(id) values ${[1,2,3,4,5,6].map(i=>`('${U(i)}')`).join(',')};
    insert into profiles(user_id,stage,reg) values ('${U(1)}','g12','c'),('${U(2)}','g12','c'),('${U(3)}','g11','n'),('${U(4)}','g12','c'),('${U(5)}',null,null);`;
  /* sessions: 1 finished (eng), 2 abandoned after X3, 3 abandoned after X3, 4 finished (eng), 5 finished (care) a week later, 6: user 6 abandoned after A2 */
  const ses=[[1,'2026-10-05 10:00',1,'2026-10-05 10:10'],[2,'2026-10-06 10:00',2,null],[3,'2026-10-07 10:00',3,null],[4,'2026-10-08 10:00',4,'2026-10-08 10:12'],[5,'2026-10-14 10:00',5,'2026-10-14 10:09'],[6,'2026-10-15 10:00',6,null]];
  for(const [i,st,u,fin] of ses)seed+=`insert into quiz_sessions(id,user_id,started_at,finished_at,quiz_version,n_questions) values ('${S(i)}','${U(u)}','${st}',${fin?`'${fin}'`:'null'},'2.0',3);`;
  const ans=(i,list)=>list.forEach(([q,pk,meta,sec],k)=>{seed+=`insert into quiz_answers(session_id,idx,question_id,picks,meta,answered_at) values ('${S(i)}',${k},'${q}','{${pk}}',${meta?`'${meta}'`:'null'},timestamp '2026-10-01 10:00' + interval '${sec} seconds');`});
  ans(1,[['A1','A1_1',null,0],['G','G_1','{"w":"eng"}',20],['X3','X3_1',null,50]]);
  ans(2,[['A1','A1_2',null,0],['A2','A2_1',null,10],['X3','X3_2',null,40]]);
  ans(3,[['A1','A1_1',null,0],['A2','A2_1',null,10],['X3','X3_1',null,20]]);
  ans(4,[['A1','A1_1',null,0],['G','G_2','{"w":"eng"}',30]]);
  ans(5,[['A1','A1_3',null,0],['G','G_4','{"w":"care"}',10],['G','G_1','{"w":"care"}',20]]);
  ans(6,[['A1','A1_1',null,0],['A2','A2_2',null,60]]);
  for(const [i,w] of [[1,'eng'],[4,'eng'],[5,'care']])seed+=`insert into quiz_results(session_id,rank,kind,code,score) values ('${S(i)}',1,'world','${w}',0.5);`;
  let r=psql([],seed);if(r.status){console.log(r.stderr);process.exit(1)}
  const qs=fs.readFileSync(path.join(__dirname,'..','analytics.sql'),'utf8').split(/^-- === /m).slice(1);
  const run=i=>{const q=qs[i].replace(/^[^\n]*\n/,'');const x=psql(['-c',q]);if(x.status){console.log('query '+(i+1)+' failed:\n'+x.stderr);process.exit(1)}return x.stdout.trim().split('\n')};
  let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+m)};
  const q1=run(0);ok(q1.length===2&&q1[0]==='2026-10-12|2|1|50.0'&&q1[1]==='2026-10-05|4|2|50.0','analytics 1: started/finished per week: '+q1.join(' ; '));
  const q2=run(1);ok(q2[0].startsWith('X3|2|66.7|3.0')&&q2[1].startsWith('A2|1|33.3|2.0'),'analytics 2: drop-off question: '+q2.join(' ; '));
  const q3=run(2);ok(q3[0]==='eng|2|66.7'&&q3[1]==='care|1|33.3','analytics 3: leading world: '+q3.join(' ; '));
  const q4=run(3);ok(q4[0]==='c|g12|3|2|eng'&&q4.includes('n|g11|1|0|')&&q4.includes('(לא ידוע)|(לא ידוע)|2|1|care'),'analytics 4: by region and stage: '+q4.join(' ; '));
  const q5=run(4);ok(q5.includes('eng|2|1|50.0|100.0')&&q5.includes('care|2|1|50.0|50.0')&&q5[q5.length-1]==='|4|2|50.0|75.0','analytics 5: bullseye rate: '+q5.join(' ; '));
  const q6=run(5);ok(q6.length>=3&&q6.every(l=>/^[A-Z0-9]+\|\d+\|[\d.]+$/.test(l)),'analytics 6: time per question: '+q6.join(' ; '));
  return fails};
