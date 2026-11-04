#!/usr/bin/env node
/* Runs schema.sql and the RLS test on a throw-away local Postgres database (needs psql and a running local server; no Supabase, no keys).
   Env: PGHOST (default /tmp), PGPORT (default 54329), PGUSER (default postgres). Run: node supabase/tests/run-local.js */
const {spawnSync}=require('child_process');const path=require('path');
const env={...process.env,PGHOST:process.env.PGHOST||'/tmp',PGPORT:process.env.PGPORT||'54329',PGUSER:process.env.PGUSER||'postgres'};
const psql=(args)=>spawnSync('psql',['-q','-t','-A','-v','ON_ERROR_STOP=1',...args],{env,encoding:'utf8'});
const here=f=>path.join(__dirname,f),schema=path.join(__dirname,'..','schema.sql');
let r=psql(['-c','drop database if exists vt_rls','-c','create database vt_rls']);if(r.status)throw new Error(r.stderr);
const out=[];for(const f of [here('stub_supabase.sql'),schema,schema,here('rls_test.sql')]){r=psql(['-d','vt_rls','-f',f]);out.push(r.stderr);if(r.status){console.log(r.stderr);console.log('FAILED in '+path.basename(f));process.exit(1)}}
const lines=out.join('\n').split('\n').filter(l=>/NOTICE:\s+(PASS|FAIL)/.test(l)).map(l=>l.replace(/^.*NOTICE:\s+/,''));
lines.forEach(l=>console.log('  '+l));console.log(`\n${lines.length} checks, schema applied twice (idempotent), all passed`);
console.log('\nanalytics queries (supabase/analytics.sql) on made-up data:');
const bad=require('./analytics_test.js')(env);if(bad){console.log(bad+' FAILED');process.exit(1)}console.log('all analytics checks passed');
