/* בדיקת הרשאות על Supabase האמיתי, מתוך הדפדפן.
   איך מריצים: ב-DevTools (F12) > Console, באתר החי, כשמחוברים. מדביקים את כל הקובץ הזה ולוחצים Enter.
   אופציונלי, לבדיקת "משתמש לא יכול לגעת בנתונים של משתמש אחר": קודם מגדירים (עם הערכים מהחשבון השני, ראו live-test.md):
       window.LIVE_OTHER = { user: '<המזהה של החשבון השני>', session: '<מזהה ריצת שאלון של החשבון השני>' }
   הבדיקה משתמשת בלקוח של האתר (SUPA) ובמפתח הציבורי בלבד. אין בה שום מפתח סודי.
   כל הכתיבות כאן אמורות להיכשל (זה מה שבודקים). אם אחת מהן מצליחה, זו תקלת אבטחה: הבדיקה תכתוב FAIL.
   היא לא מוחקת חשבון ולא נוגעת בנתונים אמיתיים. */
(async () => {
  const out = [], add = (name, ok, detail) => out.push({ בדיקה: name, תוצאה: ok === null ? 'דולגה' : ok ? 'PASS' : 'FAIL', פירוט: detail || '' });
  const err = (r) => (r && r.error) ? ((r.error.code || '') + ' ' + (r.error.message || '')).trim().slice(0, 90) : '';
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0').slice(-12));
  if (typeof SUPA === 'undefined' || !SUPA.user) { console.log('FAIL: צריך להיות מחוברים באתר החי (ללחוץ "התחברות").'); return; }
  const c = SUPA.cli || await supaClient(), me = SUPA.user.id, O = window.LIVE_OTHER || {};
  if (!c) { console.log('FAIL: ספריית ההתחברות לא נטענה.'); return; }
  console.log('מחוברים כ:', SUPA.user.email, '| מזהה:', me);

  /* 1. מה אני רואה: רק שורות שלי */
  const mine = {};
  for (const t of ['user_data', 'profiles', 'quiz_sessions', 'quiz_answers', 'quiz_results', 'consents']) {
    const r = await c.from(t).select('*').limit(1000); mine[t] = r.data || [];
    add('קריאה: ' + t, !r.error, r.error ? err(r) : mine[t].length + ' שורות');
  }
  const own = (t) => mine[t].every(x => x.user_id === undefined || x.user_id === me);
  const sess = new Set(mine.quiz_sessions.map(x => x.id));
  add('כל השורות שרואים שייכות לי', ['user_data', 'profiles', 'quiz_sessions', 'consents'].every(own) &&
    mine.quiz_answers.every(x => sess.has(x.session_id)) && mine.quiz_results.every(x => sess.has(x.session_id)),
    'user_data/profiles/quiz_sessions/consents לפי user_id, ותשובות ותוצאות לפי הריצות שלי');

  /* 2. משתמש אחר */
  if (O.user) {
    for (const t of ['user_data', 'profiles', 'quiz_sessions', 'consents']) {
      const r = await c.from(t).select('*').eq('user_id', O.user);
      add('קריאת שורות של משתמש אחר: ' + t, !r.error && (r.data || []).length === 0, r.error ? err(r) : (r.data || []).length + ' שורות (צריך 0)');
    }
    let r = await c.from('user_data').insert({ user_id: O.user, key: 'list', value: [] });
    add('כתיבה בשם משתמש אחר: user_data', !!r.error, err(r) || 'הצליח (!)');
    r = await c.from('profiles').upsert({ user_id: O.user, stage: 'x' });
    add('כתיבה בשם משתמש אחר: profiles', !!r.error, err(r) || 'הצליח (!)');
    r = await c.from('consents').insert({ user_id: O.user, kind: 'terms', version: 'live-check' });
    add('כתיבה בשם משתמש אחר: consents', !!r.error, err(r) || 'הצליח (!)');
    r = await c.from('quiz_sessions').insert({ id: uuid(), user_id: O.user, quiz_version: '2.0' });
    add('כתיבה בשם משתמש אחר: quiz_sessions', !!r.error, err(r) || 'הצליח (!)');
    r = await c.from('user_data').update({ value: [] }).eq('user_id', O.user).select();
    add('עדכון שורות של משתמש אחר', (r.error && true) || (r.data || []).length === 0, err(r) || (r.data || []).length + ' שורות עודכנו (צריך 0)');
    r = await c.from('user_data').delete().eq('user_id', O.user).select();
    add('מחיקת שורות של משתמש אחר', (r.error && true) || (r.data || []).length === 0, err(r) || (r.data || []).length + ' שורות נמחקו (צריך 0)');
    if (O.session) {
      r = await c.rpc('save_quiz', { p_session: { id: O.session, quiz_version: '2.0', n_questions: 0 }, p_answers: [], p_results: [] });
      add('save_quiz על ריצה של משתמש אחר', !!r.error, err(r) || 'הצליח (!)');
      r = await c.from('quiz_answers').insert({ session_id: O.session, idx: 99, question_id: 'A1' });
      add('הוספת תשובה לריצה של משתמש אחר', !!r.error, err(r) || 'הצליח (!)');
    } else add('הגנה על ריצות של משתמש אחר', null, 'לא הוגדר LIVE_OTHER.session');
  } else add('בדיקות מול משתמש אחר', null, 'לא הוגדר LIVE_OTHER (ראו live-test.md)');

  /* 3. משתמש לא מחובר */
  const anon = window.supabase.createClient(SUPA_CFG.url, SUPA_CFG.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'live-check-anon' } });
  for (const t of ['user_data', 'quiz_sessions', 'consents']) {
    const r = await anon.from(t).select('*').limit(5);
    add('בלי התחברות לא קוראים: ' + t, !!r.error || (r.data || []).length === 0, err(r) || (r.data || []).length + ' שורות');
  }
  let r = await anon.rpc('delete_my_account');
  add('בלי התחברות לא מוחקים חשבון', !!r.error, err(r) || 'הצליח (!)');

  /* 4. כללי השרת */
  r = await c.from('user_data').upsert({ user_id: me, key: 'prof', value: { stage: 'g12', inc: 'low' } }, { onConflict: 'user_id,key' });
  add('השרת דוחה שדה שנשאר רק במכשיר (inc)', !!r.error && /23514|local_only|check/i.test(err(r)), err(r) || 'הצליח (!)');
  r = await c.from('user_data').upsert({ user_id: me, key: 'not-a-key', value: {} }, { onConflict: 'user_id,key' });
  add('השרת דוחה מפתח לא מוכר', !!r.error, err(r) || 'הצליח (!)');
  const probe = uuid();
  r = await c.rpc('save_quiz', { p_session: { id: probe, quiz_version: '2.0', n_questions: 1, started_at: new Date().toISOString() }, p_answers: [{ q: 'G', picks: ['G_1'], meta: { w: 'x'.repeat(3000) } }], p_results: [] });
  add('השרת דוחה meta גדול מ-2KB', !!r.error, err(r) || 'הצליח (!)');
  const chk = await c.from('quiz_sessions').select('id').eq('id', probe);
  add('ושום דבר לא נשאר מהניסיון (פעולה אטומית)', !chk.error && (chk.data || []).length === 0, (chk.data || []).length + ' שורות');
  if ((chk.data || []).length) await c.from('quiz_sessions').delete().eq('id', probe);
  r = await c.from('consents').update({ version: 'live-check' }).eq('user_id', me).select();
  add('אישור (consents) אי אפשר לעדכן', (r.error && true) || (r.data || []).length === 0, err(r) || (r.data || []).length + ' שורות עודכנו (צריך 0)');
  r = await c.rpc('server_time');
  add('server_time עובד', !r.error && Math.abs(Date.parse(r.data) - Date.now()) < 5 * 60 * 1000, err(r) || String(r.data));

  const fails = out.filter(x => x.תוצאה === 'FAIL').length;
  console.table(out);
  console.log(fails ? '❌ ' + fails + ' בדיקות נכשלו. לא לפתוח לציבור, ולשלוח לי את הטבלה.' : '✅ כל הבדיקות עברו (' + out.filter(x => x.תוצאה === 'PASS').length + '), ' + out.filter(x => x.תוצאה === 'דולגה').length + ' דולגו.');
  return out;
})();
