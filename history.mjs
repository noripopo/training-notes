import {catalog,performed} from './core.mjs';
export const dateKey=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export const exerciseKeys=s=>Object.keys(s.exercises).filter(k=>performed(s.exercises[k]).length>0);
export function sessionNames(s){const done=exerciseKeys(s);const keys=done.length?done:s.endedAt?[]:Object.keys(s.exercises).filter(k=>{const e=s.exercises[k];return e.note||e.feedback||e.sets.some(r=>!r.cancelled&&(r.weight!==null||r.reps!==null));});return keys.map(k=>catalog[k].name).join('・')||(s.endedAt?'実施済みの種目なし':'種目はこれから記録');}
export function historyGroups(sessions,entries=[]){
 const ended=sessions.filter(s=>s.endedAt&&!s.deletedAt),special=['smith','fly','dip','ez'];
 // 本人が1回と指定した10/16夜の4分割記録だけを、表示・集計でまとめる。
 const evidence=new Map();for(const s of [...sessions,...entries.map(e=>e.snapshot)])if(s.version===2&&s.endedAt&&s.startedAt>='2026-10-16T10:00:00.000Z'&&s.startedAt<'2026-10-16T11:16:00.000Z'&&exerciseKeys(s).length===1&&special.includes(exerciseKeys(s)[0]))evidence.set(s.id,exerciseKeys(s)[0]);
 const grouped=evidence.size===4&&new Set(evidence.values()).size===4?new Set(evidence.keys()):new Set();
 const map=new Map();for(const s of ended){const id=grouped.has(s.id)?'workout-2026-10-16-evening':s.id;if(!map.has(id))map.set(id,[]);map.get(id).push(s);}
 return [...map].map(([id,list])=>{list.sort((a,b)=>a.startedAt.localeCompare(b.startedAt));return {id,sessions:list,date:dateKey(list[0].startedAt),startedAt:list[0].startedAt,endedAt:list.map(s=>s.endedAt).sort().at(-1),keys:[...new Set(list.flatMap(exerciseKeys))],count:list.reduce((n,s)=>n+Object.values(s.exercises).reduce((m,e)=>m+performed(e).length,0),0)};}).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
}
export function recentDays(now=new Date()){
 const today=dateKey(now),base=Date.parse(today+'T12:00:00+09:00');return Array.from({length:14},(_,i)=>dateKey(base-(13-i)*86400000));
}
