/* Vekti v2: the same scarlet macaw, upright and alert, a big open eye, a proper beak. Same class hooks as before (vf-pose, vf-head, vf-jaw, vf-lid, vf-w, vf-tail...). */
function vfWing2(near){
  const c=near?{r:'#E02424',y:'#FBBF24',b:'#1D6FE0',s:'#1650B8',h:'#F05252'}:{r:'#B71C1C',y:'#D99A06',b:'#1650B8',s:'#103F8F',h:'#C62828'};
  const X=112,Y=88,rot=8,fe=(a,ry,rx,fill,st)=>`<ellipse cx="${X}" cy="${Y-6-ry}" rx="${rx}" ry="${ry}" transform="rotate(${a+rot} ${X} ${Y})" fill="${fill}"${st?` stroke="${st}" stroke-width="1.2"`:''}/>`;
  let h='';
  [[-30,36],[-15,44],[0,48],[15,44],[30,36]].forEach(([a,l])=>h+=fe(a,l,7,c.b,c.s));
  [[-17,25],[0,30],[17,25]].forEach(([a,l])=>h+=fe(a,l,8,c.y));
  [[-10,19],[10,19]].forEach(([a,l])=>h+=fe(a,l,9.5,c.r));
  h+=`<ellipse cx="${X}" cy="${Y-12}" rx="14" ry="17" fill="${c.r}"/>`;
  if(near)h+=`<path d="M${X-7} ${Y-26}C${X-1} ${Y-30} ${X+6} ${Y-26} ${X+8} ${Y-18}" stroke="${c.h}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return `<g class="vf-w ${near?'wn':'wf'}">${h}</g>`;
}
function vfSVG2({perch=false,flip=false,cls='',decor=false,pose=''}={}){
  const a11y=decor?'aria-hidden="true" focusable="false"':'role="img" aria-label="וקטי, תוכי ארה אדום" focusable="false"';
  const bird=`<g class="vf-feet"><path d="M99 128V150M121 130V150" stroke="#6B7280" stroke-width="6" stroke-linecap="round"/><path d="M87 152H109M111 152H133" stroke="#4B5563" stroke-width="6.5" stroke-linecap="round"/></g>
  <g class="vf-pose">
    <g class="vf-tail">
      <ellipse cx="136" cy="166" rx="8" ry="40" transform="rotate(-24 118 122)" fill="#1D6FE0"/>
      <ellipse cx="124" cy="170" rx="8.5" ry="44" transform="rotate(-8 118 122)" fill="#FBBF24"/>
      <ellipse cx="116" cy="172" rx="10" ry="50" transform="rotate(8 118 122)" fill="#E02424"/>
      <path d="M118 128L128 178" stroke="#B71C1C" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
    </g>
    <g transform="translate(-6 -3)">${vfWing2(false)}</g>
    <g class="vf-body">
      <ellipse cx="103" cy="92" rx="30" ry="46" transform="rotate(-12 103 92)" fill="#E02424"/>
      <path d="M78 76C74 96 80 116 94 128" stroke="#F36B6B" stroke-width="7" fill="none" stroke-linecap="round" opacity=".75"/>
      <path d="M88 62C98 70 112 70 120 62" stroke="#C81E1E" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>
    </g>
    <g class="vf-head">
      <g class="vf-crest"><ellipse cx="80" cy="6" rx="6" ry="15" fill="#E02424" transform="rotate(-20 80 6)"/><ellipse cx="92" cy="2" rx="6" ry="17" fill="#FBBF24"/><ellipse cx="104" cy="8" rx="6" ry="15" fill="#1D6FE0" transform="rotate(22 104 8)"/></g>
      <circle cx="84" cy="42" r="29" fill="#E02424"/>
      <path d="M62 26Q80 14 102 22" stroke="#F36B6B" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/>
      <path d="M92 28C80 22 60 28 54 42C50 54 56 66 70 68C84 70 96 58 98 46C99 38 96 32 92 28Z" fill="#fff"/>
      <path d="M62 60Q74 66 88 60M64 66Q74 71 84 66" stroke="#E2E8F0" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <g class="vf-eye-calm"><circle cx="72" cy="42" r="10.5" fill="#FDE68A"/><circle cx="72" cy="42" r="6.6" fill="#111827"/><circle cx="69.4" cy="39.2" r="2.7" fill="#fff"/><circle cx="75" cy="45.2" r="1.2" fill="#fff" opacity=".9"/></g>
      <g class="vf-eye-happy"><path d="M61 46Q72 32 83 46" stroke="#111827" stroke-width="4" fill="none" stroke-linecap="round"/></g>
      <ellipse class="vf-lid" cx="72" cy="42" rx="12" ry="12.5" fill="#fff"/>
      <g class="vf-jaw"><path d="M58 56C53 56 48 59 46 64C45 69 48 72 54 72C59 72 63 68 63 62Z" fill="#4B5563"/><ellipse class="vf-tongue" cx="54" cy="66" rx="5" ry="3.4" fill="#F472B6"/></g>
      <path d="M62 24C42 20 22 34 24 54C25 63 30 70 37 72C35 63 38 57 46 55L62 55Z" fill="#F4E9CF"/>
      <path d="M40 30C32 36 28 46 30 56" stroke="#DCCDA6" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="42" cy="38" r="1.7" fill="#8A7B55"/>
      <path d="M62 56q5 4 10 0" stroke="#7C2D2D" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>
    </g>
    ${vfWing2(true)}
  </g>`;
  const arrow=perch?`<g class="vf-bar"><rect x="48" y="152" width="198" height="15" rx="7.5" fill="#1D4FC4"/><path d="M52 143L22 159.5L52 176Z" fill="#1D4FC4"/></g>`:'';
  return `<svg class="vf vf2 ${pose?'vf-p-'+pose:''} ${cls}" viewBox="-20 -30 290 215" xmlns="http://www.w3.org/2000/svg" ${a11y}>${arrow}${flip?`<g transform="matrix(-1 0 0 1 230 0)">${bird}</g>`:bird}</svg>`;
}
